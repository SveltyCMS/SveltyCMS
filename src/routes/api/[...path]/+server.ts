/**
 * @file src/routes/api/[...path]/+server.ts
 * @description
 * Optimized API Gatekeeper using dynamic chunked dispatching and fail-closed endpoint authorization.
 */

import { logger } from "@utils/logger";
import { json, type RequestEvent } from "@sveltejs/kit";
import { validateCsrfForRequest } from "@utils/security/csrf-utils";
import { apiHandler } from "@utils/api-handler";
import { AppError } from "@utils/error-handling";
import { getDb, getDbInitPromise, isDbConnected } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";
import {
  isPublicRoute,
  getUserCacheId,
  buildUserCacheKey,
  MUTATION_HTTP_METHODS,
  WRITE_HTTP_METHODS,
} from "@src/utils/hook-utils";
import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { isSecureCookieContext, readSessionCookie, isAdmin } from "@src/databases/auth/constants";
import { pluginRouteRegistry } from "@src/plugins/plugin-route-registry";
import {
  responseCache,
  buildUserResponseCacheKey,
  generateContentEtag,
} from "@src/services/cache/response-cache";

// Dynamic handlers map for build-time tree-shaking.
// Hot handlers (collections, content, auth, system) are eager-preloaded at import
// time to eliminate the ~0.3ms dynamic-import tax on 90%+ of API traffic.
const HANDLERS: Record<string, () => Promise<any>> = {
  auth: () => import("./handlers/auth"),
  collections: () => import("./handlers/collections"),
  "virtual-collections": () => import("./handlers/virtual-collections"),
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
  config: () => import("./handlers/config"),
  "content-transfer": () => import("./handlers/content-transfer"),
  migrations: () => import("./handlers/migrations"),
  importers: () => import("./handlers/importers"),
  backups: () => import("./handlers/backups"),
  "content-sync": () => import("./handlers/content-sync"),
  gdpr: () => import("./handlers/gdpr"),
  commerce: () => import("./handlers/commerce"),
  stripe: () => import("./handlers/stripe"),
};

// Eager-preload hot handlers on first request (lazy-init to not break unit test mocks).
// Once triggered, subsequent requests resolve the cached module synchronously.
const LOADED_HANDLERS: Record<string, any> = {};
let _hotPreload: Promise<void> | null = null;
function ensureHotPreload() {
  if (!_hotPreload) {
    _hotPreload = Promise.all([
      HANDLERS.collections().then((m) => {
        LOADED_HANDLERS.collections = m;
      }),
      HANDLERS.content().then((m) => {
        LOADED_HANDLERS.content = m;
      }),
      HANDLERS.auth().then((m) => {
        LOADED_HANDLERS.auth = m;
      }),
      HANDLERS.system().then((m) => {
        LOADED_HANDLERS.system = m;
      }),
      HANDLERS.tokens().then((m) => {
        LOADED_HANDLERS.tokens = m;
      }),
    ])
      .then(() => {})
      .catch(() => {
        _hotPreload = null;
      });
  }
  return _hotPreload;
}

// Map domain namespaces to the correct handler module
const NAMESPACE_CONFIG: Record<string, { handler: string; fn: string }> = {
  auth: { handler: "auth", fn: "handleAuthUserRoutes" },
  user: { handler: "auth", fn: "handleAuthUserRoutes" },
  permission: { handler: "auth", fn: "handlePermissionRoutes" },
  collections: { handler: "collections", fn: "handleCollectionsRoutes" },
  "virtual-collections": {
    handler: "virtual-collections",
    fn: "handleVirtualCollectionsRoutes",
  },
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
  ai: { handler: "system", fn: "handleAiRoutes" },
  "ai-builder": { handler: "system", fn: "handleAiBuilderRoutes" },
  automations: { handler: "system", fn: "handleAutomationRoutes" },
  workflows: { handler: "system", fn: "handleWorkflowRoutes" },
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

  // Data Operations (Phase 1)
  config: { handler: "config", fn: "handleConfigRoutes" },
  "content-export": { handler: "content-transfer", fn: "handleContentExportRoutes" },
  "content-import": { handler: "content-transfer", fn: "handleContentImportRoutes" },
  migrations: { handler: "migrations", fn: "handleMigrationRoutes" },
  importers: { handler: "importers", fn: "handleImporterRoutes" },
  backups: { handler: "backups", fn: "handleBackupRoutes" },
  "content-sync": { handler: "content-sync", fn: "handleContentSyncRoutes" },

  // Plugin Settings (encrypted, per-tenant, per-plugin)
  "plugin-settings": { handler: "system", fn: "handlePluginSettingsRoutes" },

  // GDPR Right to Access / Erasure (self or admin)
  gdpr: { handler: "gdpr", fn: "handleGdprRoutes" },
  commerce: { handler: "commerce", fn: "handleCommerceRoutes" },
  stripe: { handler: "stripe", fn: "handleStripeRoutes" },

  // Deprecated Aliases
  "import-data": { handler: "importers", fn: "handleImporterRoutes" },
  config_sync: { handler: "config", fn: "handleConfigRoutes" },
  "config-sync": { handler: "config", fn: "handleConfigRoutes" },
};

// 🚀 Pre-compiled Map for O(1) instant namespace lookup
const NAMESPACE_MAP = new Map<string, { handler: string; fn: string }>(
  Object.entries(NAMESPACE_CONFIG),
);

// Fail-closed mapping of namespaces/methods to core SveltyCMS permission IDs
const isReadMethod = (m: string) => m === "GET" || m === "OPTIONS";

const ENDPOINT_PERMISSIONS: Record<string, string | ((method: string) => string)> = {
  collections: (method: string) =>
    isReadMethod(method) ? "collections:read" : "collections:write",
  "virtual-collections": (method: string) =>
    isReadMethod(method) ? "collection:read" : "collection:write",
  content: (method: string) => (isReadMethod(method) ? "collection:read" : "collection:write"),
  "content-structure": (method: string) =>
    isReadMethod(method) ? "collection:read" : "collection:write",
  search: "collection:read",
  events: "collection:read",
  graphql: (method: string) => (isReadMethod(method) ? "collection:read" : "collection:write"),
  media: (method: string) => {
    if (method === "OPTIONS" || method === "GET") return "media:read";
    if (method === "DELETE") return "media:delete";
    return "media:write";
  },
  widgets: (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  system: (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  settings: (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  "system-settings": (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  importer: "config:importexport",
  "import-data": "config:importexport",
  import: "config:importexport",
  export: "config:importexport",
  ai: "system:settings",
  "ai-builder": "system:settings",
  automations: "config:automations",
  workflows: "config:automations",
  theme: (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  "system-preferences": (method: string) =>
    isReadMethod(method) ? "systemPreferences:read" : "systemPreferences:write",
  token: (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  "website-tokens": (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  webhooks: "config:webhooks",
  "system-webhooks": "config:webhooks",
  "system-virtual-folder": "system:settings",
  systemVirtualFolder: "system:settings",
  version: (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  "version-check": (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  permission: "system:admin",
  "system-jobs": (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  dashboard: "dashboard:read",
  "openapi.json": (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  database: (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),
  logs: "system:admin",
  "api-keys": (method: string) => (isReadMethod(method) ? "system:read" : "system:settings"),

  // Data Operations permissions
  config: (method: string) => (method === "POST" ? "config:write" : "config:read"),
  "content-export": (method: string) => (method === "POST" ? "content:export" : "content:read"),
  "content-import": (method: string) => (method === "POST" ? "content:import" : "content:read"),
  migrations: (method: string) => (method === "POST" ? "migration:apply" : "migration:read"),
  importers: (method: string) => (method === "POST" ? "content:import" : "content:read"),
  backups: (method: string) => {
    if (method === "OPTIONS" || method === "GET") return "backup:read";
    if (method === "POST") return "backup:create";
    return "backup:read";
  },
  "content-sync": (method: string) => (method === "POST" ? "content:sync" : "content:read"),
  config_sync: (method: string) => (method === "POST" ? "config:write" : "config:read"),
  "config-sync": (method: string) => (method === "POST" ? "config:write" : "config:read"),

  // Plugin Settings (encrypted per-tenant settings, gated behind plugin:settings:manage)
  "plugin-settings": "plugin:settings:manage",

  // GDPR — authenticated self-service (handler enforces self-or-admin)
  gdpr: (method: string) => (isReadMethod(method) ? "user:read" : "user:write"),
  commerce: (method: string) => (isReadMethod(method) ? "collections:read" : "collections:write"),
  stripe: (method: string) => (isReadMethod(method) ? "collections:read" : "collections:write"),
};

/**
 * Checks authorization for endpoints in a fail-closed manner.
 */
// Exported with `_` prefix (SvelteKit route modules only allow `_`-prefixed
// custom exports) so the security-audit benchmark can measure the REAL
// dispatcher gate instead of a synthetic stand-in.
export function _checkEndpointPermission(
  user: any,
  roles: any[],
  method: string,
  namespace: string,
  segments: string[],
): boolean {
  // 🚀 ADMIN FAST-PATH: System and super admins have all access
  if (isAdmin(user)) {
    return true;
  }

  // SCIM is enterprise-only
  if (namespace === "scim") {
    return false;
  }

  // User management endpoints
  // GDPR self-service: any authenticated user; handler enforces self-or-admin
  if (namespace === "gdpr") {
    return true;
  }

  if (namespace === "user" || namespace === "auth") {
    const action = segments[1];
    // Public / self endpoints are allowed
    if (
      !action ||
      action === "me" ||
      action === "login" ||
      action === "logout" ||
      action === "oidc-logout" ||
      action === "frontchannel-logout" ||
      action === "backchannel-logout" ||
      action === "saml" ||
      action === "2fa"
    ) {
      return true;
    }
    // If updating user attributes or saving avatar on self:
    if (
      (action === "update-user-attributes" ||
        action === "save-avatar" ||
        action === "delete-avatar") &&
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
  if (process.env.BENCHMARK_DEBUG === "true") logger.debug(`🔥 Dispatcher: ${event.url.pathname}`);
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

  // Note: CORS OPTIONS preflight is handled by a SINGLE canonical path — the
  // turbo-pipeline preflight exit — which runs before this dispatcher for every
  // `/api/` request. No preflight logic lives here (or in any handler).

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
    const isSecure = isSecureCookieContext(url.protocol, url.hostname);
    const sessionId = readSessionCookie(cookies, isSecure);

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
  //
  // ⚠️ Always apply for the testing namespace so x-test-tenant-id is
  // respected even when an authenticated user session already exists
  // (tenant-isolation tests need per-request tenant header overrides).
  if (namespace === "testing" && !(locals as any).__testBypass) {
    const { applyTestBypassFromRequest } = await import("@utils/test-bypass.server");
    if (applyTestBypassFromRequest(request, locals as App.Locals)) {
      if (!user) user = locals.user as any;
      tenantId = (locals.tenantId as string) || tenantId;
    }
  }

  // Fail-closed authentication
  const isPublic = isPublicRoute(url.pathname, (locals as any).__testBypass === true);
  const pluginMatch = pluginRouteRegistry.match(request.method, url.pathname);
  const pluginRoutePublic = pluginMatch?.requiredCapabilities === "public";
  if (!user && !isPublic && !pluginRoutePublic && request.method.toUpperCase() !== "OPTIONS") {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }

  // Fail-closed authorization (core namespaces). Plugin `{ type: "route" }`
  // entries skip ENDPOINT_PERMISSIONS and use requiredCapabilities instead.
  if (
    !isPublic &&
    !pluginMatch &&
    !(locals as any).__testBypass &&
    request.method.toUpperCase() !== "OPTIONS"
  ) {
    const roles = locals.roles || [];
    if (!_checkEndpointPermission(user, roles, request.method, namespace, segments)) {
      throw new AppError("Forbidden: Insufficient permissions", 403, "FORBIDDEN");
    }
  }

  // --- CSRF Protection ---
  // Guest commerce mutations are public but still CSRF-gated. Stripe webhooks
  // and plugin routes declared `requiredCapabilities: "public"` use their own
  // authenticity check (signature, etc.).
  const commerceMutation =
    namespace === "commerce" && MUTATION_HTTP_METHODS.has(request.method.toUpperCase());
  const stripeWebhook = namespace === "stripe" && segments[1] === "webhook";
  if (
    (!isPublic || commerceMutation) &&
    !stripeWebhook &&
    !pluginRoutePublic &&
    !(locals as any).__testBypass &&
    (globalThis as any).process?.env?.TEST_MODE !== "true" &&
    !(user as any)?.isApiKey &&
    !(user as any)?.isApiToken &&
    MUTATION_HTTP_METHODS.has(request.method.toUpperCase())
  ) {
    const isSecure = isSecureCookieContext(url.protocol, url.hostname);
    const csrfResult = validateCsrfForRequest(cookies, request, isSecure);
    if (!csrfResult.isValid)
      throw new AppError(`Security violation: ${csrfResult.error}`, 403, "CSRF_VIOLATION");
  }

  // --- Body Size Limit (prevents memory exhaustion) ---
  const MAX_BODY_SIZE = 15 * 1024 * 1024; // 15MB for API requests (allows 10MB multipart uploads)
  if (WRITE_HTTP_METHODS.has(request.method) && request.headers.get("content-length")) {
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
    const userIdStr = getUserCacheId(user);
    const dispatchCacheKey = buildUserCacheKey(url.pathname, url.search, userIdStr);
    const cached = cacheService.getSync?.(dispatchCacheKey, tenantId);
    if (cached) {
      // Per-request cache HIT is debug-only (default info/prod error stay quiet)
      // Cache tuple { body, etag } — pre-computed, zero hash overhead
      if (typeof cached === "object" && cached !== null && "body" in cached && "etag" in cached) {
        const entry = cached as { body: string; etag: string; buffer?: Uint8Array };
        return new Response((entry.buffer ?? entry.body) as BodyInit, {
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

  const config = NAMESPACE_MAP.get(namespace);
  if (!config) {
    if (pluginMatch) {
      const { pluginRegistry } = await import("@src/plugins/registry");
      const tenantKey = String(tenantId || "default");
      const state = await pluginRegistry.getPluginState(pluginMatch.pluginId, tenantKey);
      const enabled = state
        ? state.enabled
        : (pluginRegistry.get(pluginMatch.pluginId)?.metadata?.enabled ?? false);
      if (!enabled) {
        throw new AppError(
          `Plugin '${pluginMatch.pluginId}' is not enabled`,
          403,
          "PLUGIN_DISABLED",
        );
      }
      const caps = pluginMatch.requiredCapabilities;
      if (caps !== "public") {
        if (!user) throw new AppError("Authentication required", 401, "UNAUTHORIZED");
        const roles = locals.roles || [];
        const isAdminUser = isAdmin(user);
        if (!isAdminUser && Array.isArray(caps) && caps.length > 0) {
          const ok = caps.every((cap) => hasPermissionWithRoles(user, cap, roles));
          if (!ok) throw new AppError("Forbidden: Insufficient permissions", 403, "FORBIDDEN");
        }
      }
      return pluginMatch.handler(event);
    }
    // Fail-closed: unknown namespaces are Forbidden (not 404).
    throw new AppError(`API Namespace "/api/${namespace}" not found`, 403, "NAMESPACE_FORBIDDEN");
  }

  // 🚀 Kick off hot-handler preload on first API request (non-blocking).
  // Once cached, subsequent handler imports resolve from module cache instantly.
  ensureHotPreload();

  let handlerModule = LOADED_HANDLERS[config.handler];
  if (!handlerModule) {
    handlerModule = await HANDLERS[config.handler]();
    LOADED_HANDLERS[config.handler] = handlerModule;
  }
  const fn = handlerModule[config.fn];

  if (typeof fn !== "function") {
    throw new AppError(
      `API Endpoint for namespace "/api/${namespace}" is not enabled or available in this environment`,
      404,
      "API_ENDPOINT_NOT_AVAILABLE",
    );
  }

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

  // ⚡ CONTENT-BASED ETag: Computed from the actual response body.
  // Warms responseCache L1 from stashed apiBody so handleTurboGet can HIT next request.
  if (request.method === "GET" && response.status === 200 && !isStreaming) {
    const stashedBody = (locals as any).apiBody as string | undefined;
    if (stashedBody) {
      const contentEtag = generateContentEtag(stashedBody);
      const ifNoneMatch = request.headers.get("if-none-match");
      const userIdStr = getUserCacheId(user);
      const turboKey = buildUserResponseCacheKey(url.pathname, url.search, userIdStr);

      if (user) {
        // Sync L1 turbo cache — zero microtask delay for next authenticated GET
        responseCache.set(turboKey, { body: stashedBody, etag: contentEtag }, 300_000, tenantId);
      }

      if (ifNoneMatch === contentEtag || ifNoneMatch === "*") {
        return new Response(null, {
          status: 304,
          headers: {
            ETag: contentEtag,
            "Cache-Control": "private, must-revalidate",
            "X-API-Version": "1",
            "X-Cache": "CONTENT-304",
          },
        });
      }

      response.headers.set("ETag", contentEtag);
      response.headers.set("X-API-Version", "1");
      response.headers.set("X-Cache", "CONTENT-ETAG");
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

    // 🚀 HYPER-PERFORMANCE: Read body once for ETag — use stashed apiBody when available
    const apiBody = (locals as any).apiBody;
    const responseBody = typeof apiBody === "string" ? apiBody : await response.text();

    // Sync FNV/SHA etag — no async hash-wasm on the critical path
    const etag = responseBody ? generateContentEtag(responseBody) : "";

    if (isCacheable && etag) {
      const userIdStr = getUserCacheId(user);
      const dispatchCacheKey = buildUserCacheKey(url.pathname, url.search, userIdStr);
      const turboKey = buildUserResponseCacheKey(url.pathname, url.search, userIdStr);
      // L1 turbo map (sync) + L2 cacheService (async fire-and-forget)
      responseCache.set(turboKey, { body: responseBody, etag }, 300_000, tenantId);
      cacheService
        .set(dispatchCacheKey, { body: responseBody, etag }, 300, tenantId, CacheCategory.API)
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
        const lowerKey = key.toLowerCase();
        const exists = Object.keys(respHeaders).some((k) => k.toLowerCase() === lowerKey);
        if (!exists) respHeaders[key] = val;
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

/**
 * Frozen list of catch-all API namespaces (for ownership / completeness tests).
 * Underscore prefix required by SvelteKit (+server only allows HTTP handlers
 * or `_`-prefixed private exports).
 * When you add a namespace to NAMESPACE_CONFIG, unit ownership inventory will fail
 * until a test owner is declared in tests/unit/api/namespace-ownership.test.ts.
 */
export const _API_NAMESPACE_KEYS: readonly string[] = Object.freeze(Object.keys(NAMESPACE_CONFIG));
