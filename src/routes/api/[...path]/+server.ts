/**
 * @file src/routes/api/[...path]/+server.ts
 * @description
 * Optimized API Gatekeeper using dynamic chunked dispatching and fail-closed endpoint authorization.
 */

import { json, type RequestEvent } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { xxhash64 } from "hash-wasm";
import { validateCsrfForRequest } from "@utils/security/csrf-utils";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { getDb, getDbInitPromise, isDbConnected } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import { isPublicRoute } from "@src/utils/hook-utils";
import { cacheService } from "@src/databases/cache/cache-service";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";

// Dynamic handlers map for build-time tree-shaking.
// Hot handlers (collections, content, auth, system) are eager-preloaded at import
// time to eliminate the ~0.3ms dynamic-import tax on 90%+ of API traffic.
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
  version: () => import("./handlers/version"),
  database: () => import("./handlers/database"),
  logs: () => import("./handlers/logs"),
  "api-keys": () => import("./handlers/api-keys"),
};

// Eager-preload hot handlers on first request (lazy-init to not break unit test mocks).
// Once triggered, subsequent requests resolve the cached module instantly.
let _hotPreload: Promise<void> | null = null;
function ensureHotPreload() {
  if (!_hotPreload) {
    _hotPreload = Promise.all([
      HANDLERS.collections(),
      HANDLERS.content(),
      HANDLERS.auth(),
      HANDLERS.system(),
      HANDLERS.tokens(),
    ])
      .then(() => {})
      .catch(() => {});
  }
  return _hotPreload;
}

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
  database: { handler: "database", fn: "handleDatabaseRoutes" },
  logs: { handler: "logs", fn: "handleLogsRoutes" },
  "api-keys": { handler: "api-keys", fn: "handleApiKeyRoutes" },
  webhooks: { handler: "system", fn: "handleWebhookRoutes" },
  "system-webhooks": { handler: "system", fn: "handleWebhookRoutes" },
  "system-virtual-folder": {
    handler: "system",
    fn: "handleSystemVirtualFolderRoutes",
  },
  systemVirtualFolder: {
    handler: "system",
    fn: "handleSystemVirtualFolderRoutes",
  },
  version: { handler: "version", fn: "handleVersionRoutes" },
  graphql: { handler: "content", fn: "handleGraphqlRoutes" },
  "system-jobs": { handler: "system", fn: "handleSystemJobRoutes" },
};

// Fail-closed mapping of namespaces/methods to core SveltyCMS permission IDs
const ENDPOINT_PERMISSIONS: Record<string, string | ((method: string) => string)> = {
  collections: (method: string) =>
    ["GET", "OPTIONS"].includes(method) ? "collections:read" : "collections:write",
  content: (method: string) =>
    ["GET", "OPTIONS"].includes(method) ? "collection:read" : "collection:write",
  "content-structure": (method: string) =>
    ["GET", "OPTIONS"].includes(method) ? "collection:read" : "collection:write",
  search: "collection:read",
  events: "collection:read",
  graphql: (method: string) =>
    ["GET", "OPTIONS"].includes(method) ? "collection:read" : "collection:write",
  media: (method: string) => {
    if (method === "OPTIONS") return "media:read";
    if (method === "GET") return "media:read";
    if (method === "DELETE") return "media:delete";
    return "media:write";
  },
  widgets: (method: string) =>
    ["GET", "OPTIONS"].includes(method) ? "system:read" : "system:settings",
  system: (method: string) =>
    ["GET", "OPTIONS"].includes(method) ? "system:read" : "system:settings",
  settings: (method: string) =>
    ["GET", "OPTIONS"].includes(method) ? "system:read" : "system:settings",
  "system-settings": (method: string) =>
    ["GET", "OPTIONS"].includes(method) ? "system:read" : "system:settings",
  importer: "config:importexport",
  "import-data": "config:importexport",
  import: "config:importexport",
  export: "config:importexport",
  ai: "system:settings",
  automations: "config:automations",
  theme: (method: string) =>
    ["GET", "OPTIONS"].includes(method) ? "system:read" : "system:settings",
  "system-preferences": (method: string) =>
    ["GET", "OPTIONS"].includes(method) ? "systemPreferences:read" : "systemPreferences:write",
  token: (method: string) =>
    ["GET", "OPTIONS"].includes(method) ? "system:read" : "system:settings",
  "website-tokens": (method: string) =>
    ["GET", "OPTIONS"].includes(method) ? "system:read" : "system:settings",
  webhooks: "config:webhooks",
  "system-webhooks": "config:webhooks",
  "system-virtual-folder": "system:settings",
  systemVirtualFolder: "system:settings",
  version: (method: string) =>
    ["GET", "OPTIONS"].includes(method) ? "system:read" : "system:settings",
  permission: "system:admin",
  "system-jobs": (method: string) =>
    ["GET", "OPTIONS"].includes(method) ? "system:read" : "system:settings",
  dashboard: "dashboard:read",
  database: (method: string) =>
    ["GET", "OPTIONS"].includes(method) ? "system:read" : "system:settings",
  logs: "system:admin",
  "api-keys": (method: string) =>
    ["GET", "OPTIONS"].includes(method) ? "system:read" : "system:settings",
};

/**
 * Checks authorization for endpoints in a fail-closed manner.
 */
function checkEndpointPermission(
  user: any,
  roles: any[],
  method: string,
  namespace: string,
  segments: string[],
): boolean {
  // 🚀 ADMIN FAST-PATH: System and super admins have all access
  if (user.isAdmin === true || user.role === "admin" || user.role === "super-admin") {
    return true;
  }

  // SCIM is enterprise-only
  if (namespace === "scim") {
    return false;
  }

  // User management endpoints
  if (namespace === "user" || namespace === "auth") {
    const action = segments[1];
    // Public / self endpoints are allowed
    if (
      !action ||
      action === "me" ||
      action === "login" ||
      action === "logout" ||
      action === "saml" ||
      action === "2fa"
    ) {
      return true;
    }
    // If updating user attributes or saving avatar on self:
    if (
      (action === "update-user-attributes" || action === "save-avatar") &&
      segments.length === 2
    ) {
      return true;
    }
    // Specific user routes: /api/user/[userId]
    // If modifying or reading own profile:
    if (segments.length >= 2 && segments[1] === user._id) {
      return true;
    }
    // Other user management endpoints require admin or user permissions
    const requiredPerm = method === "GET" ? "user:read" : "user:write";
    return hasPermissionWithRoles(user, requiredPerm, roles);
  }

  const mapping = ENDPOINT_PERMISSIONS[namespace];
  if (!mapping) {
    // Fail-closed: unmapped namespace
    return false;
  }

  const requiredPermission = typeof mapping === "function" ? mapping(method) : mapping;
  return hasPermissionWithRoles(user, requiredPermission, roles);
}

// ✨ CACHED SDK: Reusable instance to prevent object churn
let sharedCMS: LocalCMS | null = null;

// 🚀 Pre-allocated response headers for hot paths (avoids per-request Headers() allocation)
const _jsonHeaders = Object.freeze({ "Content-Type": "application/json" });
const _noCacheHeaders = Object.freeze({
  "Cache-Control": "private, must-revalidate",
  "X-API-Version": "1",
});

/**
 * Main API Dispatcher - Exported for internal testing only
 */
export const _handler = async (event: RequestEvent) => {
  if (process.env.BENCHMARK_DEBUG === "true") console.log(`🔥 Dispatcher: ${event.url.pathname}`);
  const { request, url, locals, cookies } = event;

  // 🚀 RESILIENCE: Always derive path from URL pathname to prevent route leakage/pollution in pooled servers
  const rawPath = url.pathname.replace(/^\/api\//, "");

  // 🚀 API VERSIONING: Strip /v1/ prefix for backward-compatible routing
  const versionedPath = rawPath.replace(/^v1\//, "");
  const segments = versionedPath.split("/").filter(Boolean);
  const namespace = segments[0];
  let user = locals.user;
  let tenantId = (locals.tenantId as string) || null;

  // Support tenantId override for super-admins
  if (url.searchParams.has("tenantId")) {
    if (user?.role === "super-admin") {
      tenantId = url.searchParams.get("tenantId")!;
    } else {
      throw new AppError("Forbidden: Cannot override tenantId", 403, "FORBIDDEN");
    }
  }

  if (!namespace) return new Response("Not Found", { status: 404 });

  // 🛡️ Global CORS Preflight handler
  if (request.method.toUpperCase() === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, x-test-secret, x-test-mode, x-tenant-id, x-test-worker-index, cookie",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // ── Cached imports for hot paths (avoids dynamic import on every request) ────
  let _getDatabaseResilience: any = null;

  // 🚀 HYPER-TURBO: Direct Health Check
  if (namespace === "system" && segments[1] === "health") {
    const connected = isDbConnected();
    if (!_getDatabaseResilience) {
      const mod = await import("@src/databases/database-resilience");
      _getDatabaseResilience = mod.getDatabaseResilience;
    }
    const metrics = _getDatabaseResilience().getMetrics();
    return json(
      {
        status: connected ? "healthy" : "initializing",
        overallStatus: connected ? "READY" : "INITIALIZING",
        database: connected,
        uptime: process.uptime(),
        timestamp: Date.now(),
        dbType: process.env.DB_TYPE || "unknown",
        memory: process.memoryUsage(),
        resilience: {
          circuitState: metrics.circuitState,
          totalRetries: metrics.totalRetries,
          successfulReconnections: metrics.successfulReconnections,
          averageRecoveryTime: metrics.averageRecoveryTime,
        },
      },
      { status: connected ? 200 : 533 }, // Use 533 to differentiate from standard 503 if needed
    );
  }

  // 🛡️ ADAPTER ACQUISITION: Optimized for speed
  let adapter = locals.dbAdapter as any;

  // 🚀 HARDENING: If adapter is missing or disconnected (e.g. after reinitialize), refresh it
  if (!adapter || (typeof adapter.isConnected === "function" && !adapter.isConnected())) {
    if (!isDbConnected()) {
      await getDbInitPromise();
    }
    adapter = getDb();
  }

  if (!adapter) throw new AppError("Database unavailable", 503);

  // 🚀 MEMORY OPTIMIZATION: Reuse CMS instance to prevent garbage collector pressure
  if (!sharedCMS || sharedCMS.db !== adapter) {
    sharedCMS = new LocalCMS(adapter);
  }
  const cms = sharedCMS;

  // Last-chance session hydration for requests that carry a valid session cookie
  // but arrive before upstream auth middleware has populated locals.user.
  if (!user) {
    const sessionId =
      cookies.get(SESSION_COOKIE_NAME) ||
      cookies.get(`__Host-${SESSION_COOKIE_NAME}`) ||
      cookies.get(`__Secure-${SESSION_COOKIE_NAME}`);

    if (sessionId && adapter?.auth?.getSessionTokenData && adapter?.auth?.getUserById) {
      const sessionResult = await adapter.auth.getSessionTokenData(sessionId as any);

      let resolvedUser: any = null;
      if (sessionResult?.success && sessionResult.data) {
        const expiresAt = new Date(sessionResult.data.expiresAt).getTime();
        if (!Number.isNaN(expiresAt) && expiresAt > Date.now()) {
          const userResult = await adapter.auth.getUserById(sessionResult.data.user_id as any, {
            suppressErrorLog: true,
          });
          resolvedUser =
            userResult && typeof userResult === "object" && "success" in userResult
              ? userResult.data
              : userResult;
        }
      }

      if (resolvedUser) {
        user = resolvedUser;
        locals.user = resolvedUser;
        tenantId =
          (locals.tenantId as string) || ((resolvedUser as any).tenantId as string) || null;
        locals.tenantId = tenantId as any;
      }
    }
  }

  // 🧪 TEST-MODE BYPASS: Allow E2E/integration testing endpoints to bypass auth
  // when x-test-mode and x-test-secret headers are present and valid.
  // This is a defense-in-depth layer beneath the turbo-pipeline bypass,
  // ensuring testing endpoints work even when the turbo pipeline hasn't
  // populated locals (e.g., early in server startup or after hot-reload).
  if (namespace === "testing" && !user && !(locals as any).__testBypass) {
    const { applyTestBypassFromRequest } = await import("@utils/test-bypass.server");
    if (applyTestBypassFromRequest(request, locals as App.Locals)) {
      user = locals.user as any;
      tenantId = (locals.tenantId as string) || tenantId;
    }
  }

  // Fail-closed authentication
  const isPublic = isPublicRoute(url.pathname, (locals as any).__testBypass === true);
  if (!user && !isPublic && request.method.toUpperCase() !== "OPTIONS") {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }

  // Fail-closed authorization
  if (!isPublic && !(locals as any).__testBypass && request.method.toUpperCase() !== "OPTIONS") {
    const roles = locals.roles || [];
    if (!checkEndpointPermission(user, roles, request.method, namespace, segments)) {
      throw new AppError("Forbidden: Insufficient permissions", 403, "FORBIDDEN");
    }
  }

  // --- CSRF Protection ---
  if (
    !(locals as any).__testBypass &&
    (globalThis as any).process?.env?.TEST_MODE !== "true" &&
    !(user as any)?.isApiKey &&
    !(user as any)?.isApiToken &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase())
  ) {
    const isSecure = url.protocol === "https:" || (!dev && url.hostname !== "localhost");
    const csrfResult = validateCsrfForRequest(cookies, request, isSecure);
    if (!csrfResult.isValid)
      throw new AppError(`Security violation: ${csrfResult.error}`, 403, "CSRF_VIOLATION");
  }

  // --- Body Size Limit (prevents memory exhaustion) ---
  const MAX_BODY_SIZE = 15 * 1024 * 1024; // 15MB for API requests (allows 10MB multipart uploads)
  if (["POST", "PUT", "PATCH"].includes(request.method) && request.headers.get("content-length")) {
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (contentLength > MAX_BODY_SIZE) {
      throw new AppError(
        `Request body too large (${(contentLength / 1024 / 1024).toFixed(1)}MB). Maximum is 15MB.`,
        413,
      );
    }
  }

  // 🚀 PERFORMANCE: L1 Synchronous Cache Hit AFTER Auth — pre-computed ETag avoids re-hash
  if (request.method === "GET") {
    const cached = cacheService.getSync?.(url.pathname + url.search, tenantId);
    if (cached) {
      if (process.env.SVELTY_BENCHMARK_SUITE !== "true" && process.env.BENCHMARK !== "true") {
        console.log(`[CacheHit] Hit: ${url.pathname + url.search}`);
      }
      // Cache tuple { body, etag } — pre-computed, zero hash overhead
      if (typeof cached === "object" && cached !== null && "body" in cached && "etag" in cached) {
        const entry = cached as { body: string; etag: string };
        return new Response(entry.body, {
          headers: { ..._jsonHeaders, "X-Cache": "HIT-L1", ETag: entry.etag },
        });
      }
      // Legacy: plain string body
      if (typeof cached === "string") {
        return new Response(cached, {
          headers: { ..._jsonHeaders, "X-Cache": "HIT-L1" },
        });
      }
      return json(cached, {
        headers: { ..._jsonHeaders, "X-Cache": "HIT-L1" },
      });
    }
  }

  if (!NAMESPACE_CONFIG[namespace]) {
    throw new AppError(`API Namespace "/api/${namespace}" not found`, 404, "NAMESPACE_NOT_FOUND");
  }

  // 🚀 Kick off hot-handler preload on first API request (non-blocking).
  // Once cached, subsequent handler imports resolve from module cache instantly.
  ensureHotPreload();

  const config = NAMESPACE_CONFIG[namespace];
  const handlerModule = await HANDLERS[config.handler]();
  const fn = handlerModule[config.fn];

  const response = await fn(event, cms, tenantId as DatabaseId, segments);

  if (!(response instanceof Response)) {
    throw new AppError(
      `API Error: Handler for "${rawPath}" did not return a valid Response.`,
      500,
      "INVALID_HANDLER_RESPONSE",
    );
  }

  // 🚀 ETag SUPPORT: Conditional request handling for cache-efficient GET responses
  // Skip ETag for streaming responses (SSE) and non-200 responses
  const contentType = response.headers.get("content-type") || "";
  const isStreaming = contentType.includes("text/event-stream");

  // ⚡ WEAK ETag FAST-PATH: Handler set apiDataHash on locals → skip body read entirely.
  // Downstream handlers (collections, content) set this to a lightweight timestamp-based
  // token (e.g. max updatedAt). The gateway uses it as a weak validator without cloning
  // the response body, avoiding V8 string allocation and GC pressure on large payloads.
  if (request.method === "GET" && response.status === 200 && !isStreaming) {
    const apiDataHash = (event.locals as any).apiDataHash;
    if (apiDataHash) {
      const weakEtag = `W/"${apiDataHash}"`;
      const ifNoneMatch = request.headers.get("if-none-match");

      if (ifNoneMatch === weakEtag || ifNoneMatch === "*") {
        return new Response(null, {
          status: 304,
          headers: {
            ETag: weakEtag,
            "Cache-Control": "private, must-revalidate",
            "X-API-Version": "1",
            "X-Cache": "WEAK-304",
          },
        });
      }

      response.headers.set("ETag", weakEtag);
      response.headers.set("X-API-Version", "1");
      response.headers.set("X-Cache", "WEAK-ETAG");
      return response;
    }
  }

  // Cache successful GET responses AND compute ETag — read body ONCE for both
  if (request.method === "GET" && response.status === 200 && !isStreaming) {
    const pathStr = url.pathname;
    const isCacheable =
      pathStr.includes("/api/collections") ||
      pathStr.includes("/api/content") ||
      pathStr.includes("/api/settings") ||
      pathStr.includes("/api/system") ||
      pathStr.includes("/api/schema") ||
      pathStr.includes("/api/navigation") ||
      pathStr.includes("/api/themes") ||
      pathStr.includes("/api/config");

    // 🚀 HYPER-PERFORMANCE: Read body once for ETag — cache only if cacheable
    const responseBody = await response.text();

    // Compute ETag once — works for both cacheable (cache + 304) and non-cacheable (304 only)
    let etag = "";
    try {
      etag = `"${await xxhash64(responseBody)}"`;
    } catch {
      // Hash unavailable — body served without ETag below
    }

    if (isCacheable && etag) {
      // Only cache cacheable endpoints — non-cacheable still get ETag for 304 support
      const { CacheCategory } = await import("@src/databases/cache/types");
      cacheService
        .set(
          url.pathname + url.search,
          { body: responseBody, etag },
          300,
          tenantId,
          CacheCategory.API,
        )
        .catch(() => {});
    }

    // ETag conditional response
    if (etag) {
      const ifNoneMatch = request.headers.get("if-none-match");

      if (ifNoneMatch === etag || ifNoneMatch === "*") {
        return new Response(null, {
          status: 304,
          headers: {
            ETag: etag,
            "Cache-Control": "private, must-revalidate",
            "X-API-Version": "1",
          },
        });
      }

      // Merge response headers with no-cache defaults + ETag
      const respHeaders: Record<string, string> = {
        ..._noCacheHeaders,
        ETag: etag,
      };
      response.headers.forEach((val, key) => {
        if (!respHeaders[key]) respHeaders[key] = val;
      });
      return new Response(responseBody, {
        status: response.status,
        statusText: response.statusText,
        headers: respHeaders,
      });
    }

    // Hash unavailable — return body without ETag.
    // responseBody was already read above; we must construct a new Response
    // because the original response.body is now consumed/disturbed.
    const fallbackHeaders: Record<string, string> = { ..._noCacheHeaders };
    response.headers.forEach((val, key) => {
      if (!fallbackHeaders[key]) fallbackHeaders[key] = val;
    });
    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: fallbackHeaders,
    });
  }

  // Streaming or non-GET/non-200: add API version header, return response as-is
  response.headers.set("X-API-Version", "1");
  return response;
};

export const GET = apiHandler(_handler);
export const POST = apiHandler(_handler);
export const PUT = apiHandler(_handler);
export const PATCH = apiHandler(_handler);
export const DELETE = apiHandler(_handler);
export const OPTIONS = apiHandler(_handler);
