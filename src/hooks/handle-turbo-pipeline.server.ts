/**
 * @file src/hooks/handle-turbo-pipeline.server.ts
 * @description
 * Consolidated high-performance middleware pipeline for SveltyCMS.
 *
 * ### Pipeline (in order of execution cost)
 * 1. Static Asset Fast Exit      — regex match + zero logic
 * 2. Bootstrap Route Bypass      — /setup, /login (no logic)
 * 3. System State Gate           — block if FAILED or INITIALIZING
 * 4. Setup Completeness Gate     — redirect to /setup if config missing
 * 5. CORS Preflight Fast Exit    — handle OPTIONS requests
 * 6. Post-resolve security headers + immutable static cache headers
 *
 * Optimized to minimize work for hot paths and static content.
 * All post-resolve header writes use `withMutableHeaders` (immutable Response safety).
 */

import { dev } from "$app/env";
import {
  getSetupState,
  SetupState,
  isSetupComplete,
  getTestSecret,
} from "@utils/server/setup-check";
import { getSystemState } from "@src/stores/system/state.svelte.ts";
import { isRedirect, isHttpError } from "@sveltejs/kit";
import type { Handle } from "@sveltejs/kit/hooks";
import { readSessionCookie, isAdmin } from "@src/databases/auth/constants";
import {
  isApiLike,
  isBootstrapRoute,
  isStaticOrInternalRequest,
  classifyRequest,
  STATIC_ASSET_REGEX,
  restrictedResponse,
  boundaryResponse,
  withMutableHeaders,
} from "@src/utils/hook-utils";
import {
  API_CONTENT_SECURITY_POLICY,
  BASE_HEADERS,
  MEDIA_RESOURCE_HEADERS,
} from "../utils/security/constants";
import { applyAllSecurityHeaders } from "./handle-security-headers";
import { getTurboAuthContext } from "./handle-turbo-get";
import { logger } from "@src/utils/logger";
// Hook is initialized lazily
let cachedDbAdapter: any = null;
let healthHeaders: Record<string, string> | null = null;

// 🚀 DEDUP: a single shared init promise prevents concurrent requests from
// racing `if (!cachedDbAdapter) { await import(...) }` and importing the DB
// module N times during the same tick (cold-start thundering herd).
let dbAdapterInitPromise: Promise<any> | null = null;
async function ensureCachedDbAdapter(): Promise<any> {
  // 🐛 FRESHNESS: never reuse a dead adapter — after graceful shutdown, HMR
  // reloads, or failover/reconnection the cached instance holds a defunct
  // connection; health checks would report "healthy" while every query throws.
  if (
    cachedDbAdapter &&
    typeof cachedDbAdapter.isConnected === "function" &&
    cachedDbAdapter.isConnected()
  ) {
    return cachedDbAdapter;
  }
  if (!dbAdapterInitPromise) {
    dbAdapterInitPromise = (async () => {
      const { getDbInitPromise, getDb } = await import("@src/databases/db");
      await getDbInitPromise(false, "CORE");
      cachedDbAdapter = getDb();
      return cachedDbAdapter;
    })().finally(() => {
      dbAdapterInitPromise = null;
    });
  }
  return dbAdapterInitPromise;
}

// 🚀 MODULE-LEVEL CACHE: settings-service is imported on EVERY CORS preflight.
// Cache the module so only the first preflight pays the dynamic import cost.
let settingsServiceModule: typeof import("@src/services/core/settings-service") | null = null;
async function getSettingsService() {
  if (!settingsServiceModule) {
    settingsServiceModule = await import("@src/services/core/settings-service");
  }
  return settingsServiceModule;
}

// --- HELPERS ---

/** Generates a unique request ID for tracing - Optimized for high throughput */
const generateRequestId = () => {
  // Use CSPRNG for all trace IDs (security hardening)
  return globalThis.crypto.randomUUID().slice(0, 8) + Date.now().toString(36);
};

/** Logs request performance — ONLY in development mode to avoid string interpolation overhead in production */
const logRequest = (event: any, duration: number, status: number) => {
  if (!dev) return; // No-op in production; avoids string interpolation entirely
  const method = event.request.method;
  const path = event.url.pathname;
  const id = event.locals.requestId;
  logger.debug(`[Turbo] ${method} ${path} (${status}) - ${duration.toFixed(2)}ms [ID:${id}]`);
};

/**
 * Builds a health-check response (de-duplicated from test bypass and regular paths).
 */
function buildHealthResponse(db: any, searchParams: URLSearchParams): Response {
  if (!healthHeaders) {
    healthHeaders = {
      "Content-Type": "application/json",
      ...BASE_HEADERS,
      "Content-Security-Policy": API_CONTENT_SECURITY_POLICY,
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    };
  }

  const includeDiagnostics =
    searchParams.has("verbose") || searchParams.has("hooks") || searchParams.has("gc");
  const health: Record<string, unknown> = {
    status: db ? "healthy" : "initializing",
    overallStatus: db ? "READY" : "SETUP",
    database: !!db,
    timestamp: Date.now(),
    uptime: process.uptime(),
    dbType: DB_TYPE || "unknown",
  };

  if (includeDiagnostics) {
    if (searchParams.has("gc")) {
      if (typeof global !== "undefined" && (global as any).gc) (global as any).gc();
      if (typeof (globalThis as any).Bun !== "undefined" && (globalThis as any).Bun.gc) {
        (globalThis as any).Bun.gc(true);
      }
    }
    health.memory = process.memoryUsage();
  }

  return new Response(JSON.stringify(health), {
    status: 200,
    headers: healthHeaders,
  });
}

/**
 * Inline CORS header generator that reads origins from the database
 * (private settings). This differs from the canonical getCorsHeaders in
 * cors-utils.ts which uses hardcoded/env-var origins.
 * Both are used in the pipeline: this for the preflight fast exit,
 * getCorsHeaders (via applyAllSecurityHeaders) for post-resolve headers.
 */
async function getCorsHeadersInline(
  origin: string | null,
  isApiRoute: boolean,
): Promise<Record<string, string> | null> {
  const { getPrivateSettingSync } = await getSettingsService();
  const corsEnabled = getPrivateSettingSync("CORS_ENABLED") as boolean;
  if (!isApiRoute) return null;
  // Origin-less OPTIONS are never browser preflights (same-origin clients,
  // curl, health probes) — answer with empty headers instead of a hard 403
  // that would break legitimate same-origin API calls.
  if (!origin) return {};
  if (!corsEnabled) return null;

  const allowedOriginsRaw = getPrivateSettingSync("CORS_ALLOWED_ORIGINS") as any;
  const allowedOrigins = Array.isArray(allowedOriginsRaw)
    ? allowedOriginsRaw
    : typeof allowedOriginsRaw === "string"
      ? allowedOriginsRaw.split(",").map((s: string) => s.trim())
      : [];

  if (
    Array.isArray(allowedOrigins) &&
    !allowedOrigins.includes(origin) &&
    !allowedOrigins.includes("*")
  )
    return null;

  const allowOrigin = allowedOrigins.includes(origin) ? origin : "*";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": (
      (getPrivateSettingSync("CORS_ALLOWED_METHODS") as string[]) || [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
      ]
    ).join(", "),
    "Access-Control-Allow-Headers": (
      (getPrivateSettingSync("CORS_ALLOWED_HEADERS") as string[]) || [
        "Content-Type",
        "Authorization",
      ]
    ).join(", "),
    "Access-Control-Max-Age": String((getPrivateSettingSync("CORS_MAX_AGE") as number) || 86400),
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, X-Total-Count",
  };

  if ((getPrivateSettingSync("CORS_ALLOW_CREDENTIALS") as boolean) && allowOrigin !== "*") {
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

// ✨ PERFORMANCE: Cache environment lookups to avoid process.env overhead on every request
const IS_TEST_MODE =
  typeof globalThis !== "undefined" &&
  (String((globalThis as any).process?.env?.TEST_MODE) === "true" ||
    String((globalThis as any).process?.env?.VITE_TEST_MODE) === "true" ||
    (globalThis as any).process?.env?.NODE_ENV === "test");
const DB_TYPE =
  typeof globalThis !== "undefined" ? (globalThis as any).process?.env?.DB_TYPE : "unknown";
const IS_STRICT_SETUP_CHECK =
  typeof globalThis !== "undefined" &&
  (globalThis as any).process?.env?.STRICT_SETUP_CHECK === "true";

// Main Turbo Pipeline Hook
export const handleTurboPipeline: Handle = async ({ event, resolve }) => {
  const requestId = generateRequestId();
  const requestStart = performance.now();
  event.locals.requestStart = requestStart;
  event.locals.requestId = requestId.toString();

  const pathname = event.url.pathname;

  // 🚀 ONE-SHOT CLASSIFICATION: Computes isStatic/isApi/isBootstrap/isPublic once.
  // All downstream hooks read from locals.__flags via getRequestFlags().
  const flags = classifyRequest(pathname, event.locals as any);

  // ── 0. STATIC ASSET DELEGATION (before test bypass) ─────────────────────
  // Playwright attaches x-test-secret to every request; test bypass must not
  // skip CORP/cache headers or setup gates for uploaded media at /files/.
  // Uses the already-computed flags (no second regex/prefix walk per request).
  if (pathname.length > 1 && flags.isStatic) {
    const response = await resolve(event);
    // Clone headers — resolve() Responses can be immutable
    const out = withMutableHeaders(response, (headers) => {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      if (pathname.startsWith("/files/")) {
        for (const [key, value] of Object.entries(MEDIA_RESOURCE_HEADERS)) {
          headers.set(key, value);
        }
      }
    });
    if (dev) logRequest(event, performance.now() - requestStart, out.status);
    return out;
  }

  // ── 0a. TERMINAL TEST BYPASS ──────────────────────────────────────────
  const isTest = IS_TEST_MODE;

  const testSecret =
    event.request.headers.get("x-test-secret") || event.request.headers.get("X-Test-Secret");

  if (isTest && testSecret) {
    const expected = process.env.TEST_API_SECRET || getTestSecret();

    if (expected && testSecret === expected) {
      // 🚀 TERMINAL BYPASS: Verified test secret receives full system access.
      // We explicitly skip ALL other middleware by calling the dispatcher or returning a direct response.
      if (
        !cachedDbAdapter ||
        typeof cachedDbAdapter.isConnected !== "function" ||
        !cachedDbAdapter.isConnected()
      ) {
        try {
          await ensureCachedDbAdapter();
        } catch {
          /* ignore */
        }
      }

      const db = cachedDbAdapter;
      logger.debug(
        `[Turbo] TEST BYPASS for ${pathname} (db: ${!!db}, connected: ${db?.isConnected()})`,
      );

      if (pathname.includes("/setup")) {
        logger.debug(`[Turbo] TEST BYPASS for ${pathname} method=${event.request.method}`);
      }

      const sessionId = readSessionCookie(event.cookies);
      if (sessionId) {
        // 🚀 PERFORMANCE: Reuse the in-memory turbo-auth cache instead of a
        // validateSession DB JOIN on every request. The cache is populated by
        // handleAuthorization (_populateTurboAuth) at the end of the previous
        // request; reading it here avoids a redundant auth_sessions⋈auth_users
        // round-trip per request (the single biggest warm-path cost).
        const turboCtx = getTurboAuthContext(sessionId);
        let user: any = turboCtx?.user;
        if (!user?._id) {
          // Cache miss → DB fallback (identical behavior to pre-optimization).
          // Using globalThis access for the auth service to ensure we don't
          // trigger recursive imports.
          const authService = (globalThis as any).__AUTH_INSTANCE__;
          if (authService) {
            try {
              const result = await authService.validateSession(sessionId);
              // 🛡️ HARDENING: Handle both high-level Auth (User|null) and
              // adapter (DatabaseResult<User|null>)
              user = (result as any)?.success !== undefined ? (result as any).data : result;
            } catch {
              /* ignore session errors in bypass */
            }
          }
        }

        if (user && user._id) {
          // Single apply point (cache-hit AND DB fallback): set user, allow the
          // x-test-tenant-id/x-tenant-id header to override the default tenant
          // (tenant-isolation tests), and propagate roles + bitset the cache
          // already carries so RBAC-aware endpoints see the same privileges as
          // a normal request.
          (event.locals as any).user = user;
          const testTenantHeader =
            event.request.headers.get("x-test-tenant-id") ||
            event.request.headers.get("x-tenant-id");
          (event.locals as any).tenantId =
            testTenantHeader || turboCtx?.tenantId || user.tenantId || null;
          if (turboCtx) {
            (event.locals as any).roles = turboCtx.roles;
            (event.locals as any)._rbacBitset = turboCtx.bitset;
          }
          logger.debug(
            `[Turbo] Resolved ${turboCtx ? "user from turbo-auth cache" : "REAL user"}: ${user.email}`,
          );
        }
      }

      if (!event.locals.user) {
        // 🛡️ HARDENING: Only fallback to system user for management endpoints or setup.
        // This prevents false positives in integration tests checking for 401/403.
        // Setup: only inject while install is incomplete — never after private.ts exists
        // (admin-takeover class if /api/setup/* still accepted a synthetic admin).
        const setupIncomplete = pathname.includes("/api/setup") && !isSetupComplete();
        const isManagement =
          pathname.includes("/api/testing") ||
          setupIncomplete ||
          pathname.includes("/api/system/health") ||
          pathname.includes("/health") ||
          pathname.includes("/api/user/login"); // Allow login bypass to proceed

        if (isManagement) {
          (event.locals as any).user = {
            _id: "system",
            role: "admin",
            isAdmin: true,
            email: "system@sveltycms",
          };

          // 🚀 TENANT SYNC: Extract tenantId from header if provided
          const headerTenant =
            event.request.headers.get("x-tenant-id") ||
            event.request.headers.get("x-test-tenant-id") ||
            event.request.headers.get("X-Tenant-Id");
          (event.locals as any).tenantId = headerTenant || null;

          logger.debug(
            `[Turbo] Fallback to SYSTEM user for ${pathname} (Tenant: ${headerTenant || "null"})`,
          );
        } else {
          logger.debug(`[Turbo] No session found and not a management endpoint. Proceeding...`);
        }
      }

      (event.locals as any).isAdmin = isAdmin(event.locals.user);
      (event.locals as any).dbAdapter = db;
      // 🛡️ HARDENING: Only set testBypass when explicitly requested — never in benchmarks.
      if (event.request.headers.get("x-test-security") !== "true") {
        if (event.locals.user) {
          (event.locals as any).__testBypass = true;
        }
      }

      // If it's a health check, return the health response (shared builder)
      if (pathname === "/api/system/health" || pathname === "/health") {
        return buildHealthResponse(db, event.url.searchParams);
      }

      return await resolve(event);
    }
  }

  // ── 0b. TERMINAL HEALTH CHECK BYPASS ──────────────────────────────────
  // Health checks must be zero-latency and bypass ALL other hooks.
  if (pathname === "/api/system/health" || pathname === "/health") {
    if (
      !cachedDbAdapter ||
      typeof cachedDbAdapter.isConnected !== "function" ||
      !cachedDbAdapter.isConnected()
    ) {
      try {
        cachedDbAdapter = await ensureCachedDbAdapter();
      } catch {
        /* ignore */
      }
    }
    return buildHealthResponse(cachedDbAdapter, event.url.searchParams);
  }

  const isHttps = event.url.protocol === "https:";
  const isApiRoute = isApiLike(pathname);
  const origin = event.request.headers.get("Origin");

  // Base security header map
  const baseHeaderMap = BASE_HEADERS;

  try {
    // ── 2. STATE DISCOVERY (ONE-TIME) ────────────────────────────────────────
    const systemState = getSystemState();
    const overallState = systemState.overallState;
    const isSystemOperationallyReady =
      overallState === "READY" ||
      overallState === "WARMED" ||
      overallState === "WARMING" ||
      overallState === "DEGRADED";

    const isTestMode = process.env.TEST_MODE === "true" || process.env.VITE_TEST_MODE === "true";

    let setupState: SetupState;

    if (isSystemOperationallyReady && !isTestMode) {
      setupState = SetupState.COMPLETE;
    } else {
      // ── 3. ROBUST SETUP REDIRECT (FAST-PATH) ─────────────────────────────────
      // Shallow check first: If no private.ts, we DEFINITELY need setup.
      // ⚡️ PERFORMANCE: Bypass expensive filesystem check if build-time constant says it's complete
      const isComplete =
        (typeof (globalThis as any).__SVELTY_SETUP_COMPLETE__ !== "undefined" &&
          (globalThis as any).__SVELTY_SETUP_COMPLETE__ === true) ||
        isSetupComplete();

      if (!isComplete) {
        const isSetupRoute =
          pathname.startsWith("/setup") || /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/setup/.test(pathname);

        if (
          !isSetupRoute &&
          !isApiRoute &&
          !isStaticOrInternalRequest(pathname) &&
          // The setup wizard drives its steps through SvelteKit remote
          // functions — let those through so the wizard can POST its config
          // (they no longer classify as static assets).
          !pathname.startsWith("/_app/remote/")
        ) {
          const returnTo =
            pathname === "/"
              ? ""
              : `?from=${encodeURIComponent(event.url.pathname + event.url.search)}`;
          logger.info(`[Turbo] Config missing, redirecting to /setup from ${pathname}`);
          const response = new Response(null, {
            status: 302,
            headers: {
              ...baseHeaderMap,
              Location: `/setup${returnTo}`,
              "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
              Pragma: "no-cache",
              Expires: "0",
            },
          });
          if (dev) logRequest(event, performance.now() - requestStart, 302);
          return response;
        }
        // Deep check only if config is missing (unlikely here) or we need to know if admin is missing
        setupState = await getSetupState();
      } else if (isTestMode) {
        // Test resets intentionally keep config/private.ts but wipe auth/content state.
        // Re-check the full setup state so black-box tests still see /setup gating.
        setupState = await getSetupState();
      } else {
        // 🚀 CRITICAL: If config exists, we are NOT in MISSING_CONFIG.
        // We might be MISSING_ADMIN, but we should NOT redirect back to /setup
        // if the database is simply initializing/busy.
        // We assume COMPLETE for the sake of the Turbo Gate, and let the
        // handleSystemState hook handle the "INITIALIZING" wait.
        setupState = SetupState.COMPLETE;
      }
    }

    // ── 3b. SETUP ROUTE DEEP STATE CHECK ──────────────────────────────────────
    // CRITICAL: Always perform a deep check for /setup routes, even when the system
    // is operationally READY. Without this, the fast path (isSystemOperationallyReady=true)
    // would set setupState=COMPLETE and block all setup remote function calls
    // (testRedisConnection, testEmailConnection, etc.) with a 302 redirect, returning
    // HTML instead of JSON and causing "Unexpected token '<'" errors.
    {
      const isSetupRouteDeep =
        pathname.startsWith("/setup") || /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/setup/.test(pathname);
      const shouldForceDeepSetupCheck =
        isSetupRouteDeep || process.env.STRICT_SETUP_CHECK === "true";
      if (shouldForceDeepSetupCheck) {
        setupState = await getSetupState();
      }
    }
    (event.locals as any).__setupState = setupState;

    // ── 4. DEPRECATED HEALTH CHECK BYPASS (Now at top) ──────────────────────

    // ── 5. BOOTSTRAP ROUTE BYPASS ───────────────────────────────────────────
    const isLoginDuringSetup = pathname === "/login" && setupState !== SetupState.COMPLETE;
    const isSetupRoute =
      pathname.startsWith("/setup") || /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/setup/.test(pathname);

    if (isBootstrapRoute(pathname) && !isLoginDuringSetup) {
      // Security Gate: Block /setup routes if setup is already complete
      const isTestMode = process.env.TEST_MODE === "true" || process.env.VITE_TEST_MODE === "true";
      const shouldEnforceCompletedSetupRedirect = !isTestMode || IS_STRICT_SETUP_CHECK;

      if (
        isSetupRoute &&
        setupState === SetupState.COMPLETE &&
        shouldEnforceCompletedSetupRedirect &&
        (isSystemOperationallyReady || IS_STRICT_SETUP_CHECK)
      ) {
        if (
          !(
            event.request.method === "POST" &&
            (event.url.pathname + event.url.search).includes("/completeSetup")
          )
        ) {
          logger.debug(`Blocked request to ${pathname} - setup already complete and system ready`);
          return new Response(null, {
            status: 302,
            headers: { Location: "/", ...baseHeaderMap },
          });
        }
      }

      const resolveOptions = isSetupRoute
        ? {
            filterSerializedResponseHeaders: (name: string) => {
              const lower = name.toLowerCase();
              return (
                lower.startsWith("content-") ||
                lower.startsWith("etag") ||
                lower === "set-cookie" ||
                lower === "cache-control"
              );
            },
          }
        : undefined;

      const response = await resolve(event, resolveOptions);
      if (dev) logRequest(event, performance.now() - requestStart, response.status);
      return response;
    }

    // ── 6. SYSTEM STATE GATE ────────────────────────────────────────────────
    if (systemState.overallState === "INITIALIZING" && !pathname.includes("/health")) {
      logger.info(`[Turbo] System initializing, waiting for CORE boot... [ID:${requestId}]`);
      const { getDbInitPromise } = await import("@src/databases/db");
      await getDbInitPromise(false, "CORE");

      // Verify if it failed during wait
      const { getSystemState: getNewState } = await import("@src/stores/system/state.svelte.ts");
      if (getNewState().overallState === "FAILED") {
        return restrictedResponse("FAILED", isApiRoute, baseHeaderMap);
      }
    } else if (systemState.overallState === "FAILED" && !pathname.includes("/health")) {
      const response = withMutableHeaders(
        restrictedResponse("FAILED", isApiRoute, baseHeaderMap),
        (headers) => {
          headers.set("X-Request-ID", requestId.toString());
        },
      );
      if (dev) logRequest(event, performance.now() - requestStart, response.status);
      return response;
    }

    // ── 7. SETUP COMPLETENESS GATE (GRANULAR) ───────────────────────────────
    if (setupState !== SetupState.COMPLETE) {
      const isFinalization =
        event.request.method === "POST" &&
        (event.url.pathname + event.url.search).includes("/completeSetup");
      if (isFinalization) return await resolve(event);

      const destination = "/setup";

      if (isApiRoute) {
        return new Response(
          JSON.stringify({
            error: "Setup incomplete",
            setupState,
            redirectTo: destination,
          }),
          {
            status: 503,
            headers: { "Content-Type": "application/json", ...baseHeaderMap },
          },
        );
      }

      if (
        !isStaticOrInternalRequest(pathname) &&
        (!isBootstrapRoute(pathname) || pathname === "/login")
      ) {
        const returnTo =
          pathname === "/" || pathname === "/login"
            ? ""
            : `?from=${encodeURIComponent(event.url.pathname + event.url.search)}`;
        return new Response(null, {
          status: 302,
          headers: {
            ...baseHeaderMap,
            Location: `${destination}${returnTo}`,
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          },
        });
      }
    }

    // ── 8. CORS PREFLIGHT FAST EXIT (SINGLE CANONICAL HANDLER) ────────────────
    // Every `/api/` OPTIONS request short-circuits here. The API dispatcher and
    // handler layer intentionally carry NO preflight logic of their own — one
    // code path owns allowlist validation, CORS headers, security headers and
    // request-id stamping.
    if (event.request.method === "OPTIONS" && isApiRoute) {
      const corsHeaders = await getCorsHeadersInline(origin, isApiRoute);
      if (!corsHeaders) return new Response(null, { status: 403 });

      return withMutableHeaders(
        new Response(null, { status: 204, headers: corsHeaders }),
        (headers) => {
          applyAllSecurityHeaders(headers, isHttps, origin, pathname);
          headers.set("X-Request-ID", requestId.toString());
        },
      );
    }

    // ── 9. FINAL RESOLVE ───────────────────────────────────────────────────
    const response = await resolve(event);

    // ── 10. POST-RESOLVE: Security Headers + Static Asset Caching ──────────
    // Consolidated here to reduce Promise chain depth by 2 hooks.
    // Always clone headers — resolve() Responses are often immutable.
    const out = withMutableHeaders(response, (headers) => {
      if (!STATIC_ASSET_REGEX.test(pathname)) {
        applyAllSecurityHeaders(headers, isHttps, origin, pathname);
      } else {
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
      }
      headers.set("X-Request-ID", requestId.toString());
    });

    if (dev) logRequest(event, performance.now() - requestStart, out.status);
    return out;
  } catch (err: unknown) {
    if (isRedirect(err) || isHttpError(err)) throw err;
    logger.error(`[Turbo] Pipeline error:`, err);
    const fallback = boundaryResponse(err, isHttps);
    return withMutableHeaders(fallback, (headers) => {
      headers.set("X-Request-ID", requestId.toString());
    });
  }
};
