/**
 * @file src/routes/api/[...path]/+server.ts
 * @description
 * Unified HTTP API Gatekeeper for SveltyCMS.
 * Dispatches all external API requests to domain-specific logic handlers.
 *
 * ### Refactored v3
 * - Modular dispatcher delegating to specialized handlers.
 * - Unified permission checks via @src/databases/auth/api-permissions.
 * - Robust multi-tenant validation.
 * - Fast health check with stabilization retry.
 */

import { json } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { validateCsrfForRequest } from "@utils/security/csrf-utils";
import type { RequestEvent } from "@sveltejs/kit";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { logger } from "@utils/logger.server";
import { dbAdapter, getDbInitPromise } from "@src/databases/db";
import { LocalCMS } from "../cms";
import { getPrivateSettingSync } from "@src/services/settings-service";
import type { DatabaseId } from "@src/content/types";
import { hasApiPermission } from "@src/databases/auth/api-permissions";

// Import Handlers
import { successResponse, rawResponse, getSegments } from "./handlers/base";
import { handleAuthUserRoutes } from "./handlers/auth";
import { handleCollectionsRoutes } from "./handlers/collections";
import { handleMediaRoutes } from "./handlers/media";
import { handleSystemRoutes } from "./handlers/system";
import { handleTokenRoutes } from "./handlers/tokens";
import { handleContentRoutes } from "./handlers/content";

// Global Cache for Health Check
let cachedDbVersion: string | null = null;

// ──────────────────────────────────────────────────────────────
// PERMISSION & SECURITY
// ──────────────────────────────────────────────────────────────

/** Endpoints that bypass authentication entirely */
const PUBLIC_ENDPOINTS = new Set([
  "auth/login",
  "auth/saml/acs",
  "auth/saml/login",
  "auth/saml/config",
  "system/health",
  "settings/public",
]);

function isPublicEndpoint(namespace: string, subPath: string, method: string): boolean {
  const fullPath = `${namespace}${subPath ? `/${subPath}` : ""}`;
  if (PUBLIC_ENDPOINTS.has(fullPath)) return true;

  // Registration flow token validation
  if (method === "GET" && namespace === "token" && subPath.length > 0) return true;

  return false;
}

async function checkAuthorization(
  event: RequestEvent,
  namespace: string,
  subPath: string,
): Promise<void> {
  const { user } = event.locals;

  // 1. Bypass for Public Endpoints
  if (isPublicEndpoint(namespace, subPath, event.request.method)) return;

  // 2. Bypass for Test Mode
  if (process.env.TEST_MODE === "true" || process.env.VITE_TEST_MODE === "true") return;

  // 3. Authentication Required
  if (!user) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }

  // 4. Global Admin Bypass
  if (user.isAdmin) return;

  // 5. Unified Permission Check
  // Note: hasApiPermission handles the granular role/permission mapping logic internally
  if (!hasApiPermission(user.role, namespace, false)) {
    logger.warn(
      `Permission denied: ${event.request.method} /api/${namespace}/${subPath} for role ${user.role}`,
    );
    throw new AppError(
      `Forbidden: Your role (${user.role}) does not have permission to access the ${namespace} API.`,
      403,
      "FORBIDDEN",
    );
  }
}

// ──────────────────────────────────────────────────────────────
// MAIN DISPATCHER
// ──────────────────────────────────────────────────────────────

const dispatch = async (event: RequestEvent) => {
  const { request, url, params, locals, cookies } = event;
  const { path } = params;
  const { user, tenantId } = locals;

  // --- 1. CSRF Protection (State-changing methods) ---
  const isSecure = url.protocol === "https:" || (!dev && url.hostname !== "localhost");
  const isStateChanging = ["POST", "PUT", "PATCH", "DELETE"].includes(request.method);

  if (
    process.env.TEST_MODE !== "true" &&
    isStateChanging &&
    !path.includes("/auth/login") &&
    !path.includes("/auth/saml/acs")
  ) {
    const csrfResult = validateCsrfForRequest(cookies, request, isSecure);
    if (!csrfResult.isValid) {
      logger.warn(`CSRF validation failed for ${request.method} ${path}: ${csrfResult.error}`);
      throw new AppError(`Security violation: ${csrfResult.error}`, 403, "CSRF_VIOLATION");
    }
  }

  const segments = getSegments(path as string);
  const namespace = segments[0];
  const subPath = segments.slice(1).join("/");

  // --- 2. Multi-Tenant Validation ---
  const MULTI_TENANT = getPrivateSettingSync("MULTI_TENANT");
  const exemptFromTenant = ["auth", "setup", "system", "health", "metrics"].includes(namespace);

  if (MULTI_TENANT && !tenantId && !exemptFromTenant) {
    throw new AppError("Tenant ID required for this endpoint", 400, "TENANT_MISSING");
  }

  // --- 3. Immediate Health Check (Pre-init) ---
  if (namespace === "system" && segments[1] === "health") {
    const health = {
      status: dbAdapter ? "healthy" : "initializing",
      overallStatus: dbAdapter ? "READY" : "SETUP",
      database: !!dbAdapter,
      uptime: process.uptime(),
      timestamp: Date.now(),
      dbType: process.env.DB_TYPE || "unknown",
      dbVersion: cachedDbVersion || "unknown",
    };

    if (dbAdapter && !cachedDbVersion) {
      try {
        const versionRes = await dbAdapter.getVersion();
        if (versionRes.success) {
          cachedDbVersion = versionRes.data;
          health.dbVersion = cachedDbVersion;
        }
      } catch {
        /* stabilize */
      }
    }
    return json(health);
  }

  // --- 4. Initialization & Authorization ---
  await getDbInitPromise();

  // Auth logic after DB init to ensure roles/permissions are available
  await checkAuthorization(event, namespace, subPath);

  // --- 5. Domain Dispatching ---
  const cms = new LocalCMS(dbAdapter!);

  try {
    // ── Root-level / Namespace special logic ──
    if (namespace === "search" && request.method === "GET") {
      const query = url.searchParams.get("q") || "";
      const collections = url.searchParams
        .get("collections")
        ?.split(",")
        .map((c) => c.trim());
      const result = await cms.collections.search(query, {
        collections,
        tenantId: tenantId as any,
        user,
      });
      return url.searchParams.get("raw") === "true" ? rawResponse(result) : successResponse(result);
    }

    if (namespace === "get-tokens-provided" && request.method === "GET") {
      return rawResponse({
        google: Boolean(getPrivateSettingSync("GOOGLE_API_KEY", tenantId!)),
        twitch: Boolean(getPrivateSettingSync("TWITCH_TOKEN", tenantId!)),
        tiktok: Boolean(getPrivateSettingSync("TIKTOK_TOKEN", tenantId!)),
      });
    }

    // ── Delegate to domain handlers ──
    switch (namespace) {
      case "auth":
      case "user":
        return await handleAuthUserRoutes(event, cms, tenantId as DatabaseId, namespace, segments);

      case "collections":
        return await handleCollectionsRoutes(event, cms, tenantId as DatabaseId, segments);

      case "media":
        return await handleMediaRoutes(event, cms, tenantId as DatabaseId, segments);

      case "widgets":
      case "system":
      case "settings":
      case "system-settings":
      case "importer":
      case "import-data":
      case "ai":
      case "automations":
      case "metrics":
      case "telemetry":
        return await handleSystemRoutes(event, cms, tenantId as string, namespace, segments);

      case "token":
      case "website-tokens":
        return await handleTokenRoutes(event, cms, tenantId as DatabaseId, namespace, segments);

      case "events":
      case "content":
        return await handleContentRoutes(event, namespace, segments);

      default:
        throw new AppError(`Endpoint /api/${path} not implemented`, 404);
    }
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    logger.error(`API Refactored Dispatcher Error: ${err.message}`, {
      path,
      method: request.method,
    });
    throw new AppError(err.message || "Internal Server Error", err.status || 500);
  }
};

/** @internal Export dispatcher logic for unit testing */
export const _handler = dispatch;

/** API endpoint verbs mapping */
export const GET = apiHandler(dispatch);
export const POST = apiHandler(dispatch);
export const PUT = apiHandler(dispatch);
export const PATCH = apiHandler(dispatch);
export const DELETE = apiHandler(dispatch);
export const OPTIONS = apiHandler(dispatch);
