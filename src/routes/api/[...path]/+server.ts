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
import { LocalCMS } from "../cms";
import type { DatabaseId } from "@src/content/types";
import { getSegments } from "./handlers/base";

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
  metrics: { handler: "system", fn: "handleSystemRoutes" },
  telemetry: { handler: "system", fn: "handleTelemetryRoutes" },
  theme: { handler: "system", fn: "handleThemeRoutes" },
  "system-preferences": { handler: "system", fn: "handlePreferenceRoutes" },
  health: { handler: "system", fn: "handleHealthRoutes" },
  token: { handler: "tokens", fn: "handleTokenRoutes" },
  "website-tokens": { handler: "tokens", fn: "handleTokenRoutes" },
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
};

let cachedDbVersion: string | null = null;

/**
 * Main API Dispatcher - Exported for internal testing only
 */
export const _handler = async (event: RequestEvent) => {
  const { request, url, params, locals, cookies } = event;
  const { path } = params;
  const { tenantId } = locals;
  const segments = getSegments(path as string);
  const namespace = segments[0];

  if (!namespace) {
    return new Response("Not Found", { status: 404 });
  }

  // --- Health Check ---
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
      const v = await dbAdapter.getVersion();
      if (v.success) cachedDbVersion = v.data;
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
  const cms = new LocalCMS(dbAdapter!);

  const config = NAMESPACE_CONFIG[namespace] || { handler: "system", fn: "handleSystemRoutes" };

  if (process.env.DEBUG === "true") {
    console.log(
      `[Dispatcher] path="${path}" namespace="${namespace}" handler="${config.handler}" fn="${config.fn}"`,
    );
  }

  const handlerModule = await HANDLERS[config.handler]();
  const fn = handlerModule[config.fn];

  if (typeof fn !== "function") {
    throw new AppError(`Handler function ${config.fn} not found in ${config.handler}`, 500);
  }

  return await fn(event, cms, tenantId as DatabaseId, segments);
};

export const GET = apiHandler(_handler);
export const POST = apiHandler(_handler);
export const PUT = apiHandler(_handler);
export const PATCH = apiHandler(_handler);
export const DELETE = apiHandler(_handler);
export const OPTIONS = apiHandler(_handler);
