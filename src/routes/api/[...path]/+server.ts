/**
 * @file src/routes/api/[...path]/+server.ts
 * @description
 * Optimized API Gatekeeper using dynamic chunked dispatching.
 */

import { json, type RequestEvent } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { validateCsrfForRequest } from "@utils/security/csrf-utils";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { dbAdapter, getDbInitPromise } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { getSegments } from "./handlers/base";
import { isPublicRoute } from "@src/utils/hook-utils";

// Dynamic handlers map for build-time tree-shaking
const HANDLERS: Record<string, () => Promise<any>> = {
  auth: () => import("./handlers/auth"),
  collections: () => import("./handlers/collections"),
  content: () => import("./handlers/content"),
  dashboard: () => import("./handlers/dashboard"),
  media: () => import("./handlers/media"),
  scim: () => import("./handlers/scim"),
  system: () => import("./handlers/system"),
  testing: () => import("./handlers/testing"),
  tokens: () => import("./handlers/tokens"),
  utility: () => import("./handlers/utility"),
  setup: () => import("./handlers/setup"),
};

// Map domain namespaces to the correct handler module
const NAMESPACE_CONFIG: Record<string, { handler: string; fn: string }> = {
  auth: { handler: "auth", fn: "handleAuthUserRoutes" },
  user: { handler: "auth", fn: "handleAuthUserRoutes" },
  permission: { handler: "auth", fn: "handlePermissionRoutes" },
  collections: { handler: "collections", fn: "handleCollectionsRoutes" },
  content: { handler: "content", fn: "handleContentRoutes" },
  "content-structure": { handler: "content", fn: "handleContentRoutes" },
  widgets: { handler: "system", fn: "handleSystemRoutes" },
  dashboard: { handler: "dashboard", fn: "handleDashboardRoutes" },
  media: { handler: "media", fn: "handleMediaRoutes" },
  scim: { handler: "scim", fn: "handleScimRoutes" },
  search: { handler: "content", fn: "handleContentRoutes" },
  events: { handler: "content", fn: "handleContentRoutes" },
  system: { handler: "system", fn: "handleSystemRoutes" },
  settings: { handler: "system", fn: "handleSettingsRoutes" },
  "system-settings": { handler: "system", fn: "handleSettingsRoutes" },
  importer: { handler: "system", fn: "handleImporterRoutes" },
  "import-data": { handler: "system", fn: "handleImporterRoutes" },
  ai: { handler: "system", fn: "handleAiRoutes" },
  automations: { handler: "system", fn: "handleAutomationRoutes" },
  setup: { handler: "setup", fn: "handleSetupRoutes" },
  export: { handler: "system", fn: "handleExportRoutes" },
  import: { handler: "system", fn: "handleImportRoutes" },
  metrics: { handler: "system", fn: "handleSystemRoutes" },
  telemetry: { handler: "system", fn: "handleSystemRoutes" },
  security: { handler: "system", fn: "handleSystemRoutes" },
  theme: { handler: "system", fn: "handleThemeRoutes" },
  "system-preferences": { handler: "system", fn: "handlePreferenceRoutes" },
  health: { handler: "system", fn: "handleHealthRoutes" },
  token: { handler: "tokens", fn: "handleTokenRoutes" },
  "website-tokens": { handler: "tokens", fn: "handleTokenRoutes" },
  "get-tokens-provided": { handler: "auth", fn: "handleAuthUserRoutes" },
  testing: { handler: "testing", fn: "handleTestingRoutes" },
  reset: { handler: "testing", fn: "handleTestingRoutes" },
  seed: { handler: "testing", fn: "handleTestingRoutes" },
  reinitialize: { handler: "testing", fn: "handleTestingRoutes" },
  cache: { handler: "utility", fn: "handleUtilityRoutes" },
  marketplace: { handler: "utility", fn: "handleUtilityRoutes" },
  "version-check": { handler: "utility", fn: "handleUtilityRoutes" },
  config_sync: { handler: "utility", fn: "handleUtilityRoutes" },
  "send-mail": { handler: "utility", fn: "handleUtilityRoutes" },
  trash: { handler: "utility", fn: "handleUtilityRoutes" },
  debug: { handler: "utility", fn: "handleUtilityRoutes" },
  "openapi.json": { handler: "utility", fn: "handleUtilityRoutes" },
  webhooks: { handler: "system", fn: "handleWebhookRoutes" },
  "system-webhooks": { handler: "system", fn: "handleWebhookRoutes" },
  graphql: { handler: "content", fn: "handleGraphqlRoutes" },
};

let cachedDbVersion: string | null = null;

/**
 * Main API Dispatcher - Exported for internal testing only
 */
export const _handler = async (event: RequestEvent) => {
  const { request, url, params, locals, cookies } = event;
  const { path } = params;
  const { user } = locals;
  let tenantId = (locals.tenantId as string) || null;

  // 🚀 PERFORMANCE: L1 Synchronous Cache Hit (Bypass everything for hot GET requests)
  if (request.method === "GET") {
    try {
      const { cacheService } = await import("@src/databases/cache/cache-service");
      const cached = cacheService.getSync?.(url.pathname + url.search, tenantId);
      if (cached) {
        return json(cached, {
          headers: {
            "X-Cache": "HIT-L1",
            "Content-Type": "application/json",
          },
        });
      }
    } catch {
      /* ignore sync cache errors */
    }
  }

  if (process.env.BENCHMARK_DEBUG === "true") {
    console.log(`[_handler] Processing ${event.request.method} ${event.url.pathname}`);
  }

  // Support tenantId override for super-admins
  if (url.searchParams.has("tenantId")) {
    if (user?.role === "super-admin") {
      tenantId = url.searchParams.get("tenantId")!;
    } else {
      throw new AppError(
        "Forbidden: Tenant override only allowed for super-admins",
        403,
        "FORBIDDEN",
      );
    }
  }
  const segments = getSegments(path as string);
  const namespace = segments[0];

  if (!namespace) {
    return new Response("Not Found", { status: 404 });
  }

  // --- Health Check ---
  if (namespace === "system" && segments[1] === "health") {
    // Force GC if requested in test mode to measure baseline memory correctly
    if (url.searchParams.get("gc") === "true" && process.env.TEST_MODE === "true") {
      if (globalThis.gc) {
        globalThis.gc();
      } else if ((globalThis as any).Bun?.gc) {
        (globalThis as any).Bun.gc(true);
      }
    }

    const health = {
      status: dbAdapter ? "healthy" : "initializing",
      overallStatus: dbAdapter ? "READY" : "SETUP",
      database: !!dbAdapter,
      uptime: process.uptime(),
      timestamp: Date.now(),
      dbType: process.env.DB_TYPE || "unknown",
      dbVersion: cachedDbVersion || "unknown",
      memory: process.memoryUsage(),
    };
    if (dbAdapter && !cachedDbVersion) {
      try {
        const v = await dbAdapter.getVersion();
        if (v.success) cachedDbVersion = v.data;
      } catch {
        /* ignore version check errors during warmup */
      }
    }
    return json(health);
  }

  // --- CSRF Protection ---
  const isSecure = url.protocol === "https:" || (!dev && url.hostname !== "localhost");
  if (
    process.env.TEST_MODE !== "true" &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(request.method)
  ) {
    const csrfResult = validateCsrfForRequest(cookies, request, isSecure);
    if (!csrfResult.isValid)
      throw new AppError(`Security violation: ${csrfResult.error}`, 403, "CSRF_VIOLATION");
  }

  // --- Init & Auth ---
  await getDbInitPromise();

  let adapter = locals.dbAdapter as any;
  if (!adapter) {
    const { getDb } = await import("@src/databases/db");
    adapter = getDb();
  }

  if (!adapter) {
    const { getPrivateEnv } = await import("@src/databases/config-state");
    const env = getPrivateEnv();
    const details = `DB_TYPE=${env?.DB_TYPE}, TEST_MODE=${process.env.TEST_MODE}, NODE_ENV=${process.env.NODE_ENV}`;
    throw new AppError(`Database unavailable: Adapter not initialized (${details})`, 503);
  }

  const cms = new LocalCMS(adapter);

  // Fail-closed authentication check for non-public routes
  const isPublic = isPublicRoute(url.pathname, process.env.TEST_MODE === "true");
  if (!user && !isPublic) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }

  if (!NAMESPACE_CONFIG[namespace]) {
    throw new AppError(`API Namespace "/api/${namespace}" not found`, 404, "NAMESPACE_NOT_FOUND");
  }
  const config = NAMESPACE_CONFIG[namespace];

  const handlerModule = await HANDLERS[config.handler]();
  const fn = handlerModule[config.fn];

  if (typeof fn !== "function") {
    throw new AppError(`Handler function ${config.fn} not found in ${config.handler}`, 500);
  }

  const response = await fn(event, cms, tenantId as DatabaseId, segments);

  if (!(response instanceof Response)) {
    throw new AppError(
      `API Error: Handler for "${path}" did not return a valid Response.`,
      500,
      "INVALID_HANDLER_RESPONSE",
    );
  }

  return response;
};

export const GET = apiHandler(_handler);
export const POST = apiHandler(_handler);
export const PUT = apiHandler(_handler);
export const PATCH = apiHandler(_handler);
export const DELETE = apiHandler(_handler);
export const OPTIONS = apiHandler(_handler);
