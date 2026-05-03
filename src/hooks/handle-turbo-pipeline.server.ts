/**
 * @file src/hooks/handle-turbo-pipeline.server.ts
 * @description Consolidated high-performance middleware pipeline for SveltyCMS.
 *
 * ### Pipeline (in order of execution cost)
 * 1. Static Asset Fast Exit      — regex match + zero logic
 * 2. Bootstrap Route Bypass      — /setup, /login (no logic)
 * 3. System State Gate           — block if FAILED or INITIALIZING
 * 4. Setup Completeness Gate     — redirect to /setup if config missing
 * 5. CORS Preflight Fast Exit    — handle OPTIONS requests
 *
 * Optimized to minimize work for hot paths and static content.
 */

import { dev } from "$app/environment";
import { getSetupState, SetupState, isSetupComplete, getTestSecret } from "@src/utils/setup-check";
import { getSystemState } from "@src/stores/system/state";
import { isRedirect, type Handle } from "@sveltejs/kit";
import {
  isApiLike,
  isBootstrapRoute,
  isStaticOrInternalRequest,
  STATIC_ASSET_REGEX,
  BASE_HEADERS,
  restrictedResponse,
  boundaryResponse,
} from "@src/utils/hook-utils";
import { logger } from "@src/utils/logger";
// Hook is initialized lazily

// --- HELPERS ---

/** Generates a unique request ID for tracing - Optimized for high throughput */
let requestIdCounter = 0;
const generateRequestId = () => {
  if (process.env.BENCHMARK === "true") return String(++requestIdCounter);
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
};

/** Logs request performance in development */
const logRequest = (event: any, duration: number, status: number) => {
  const method = event.request.method;
  const path = event.url.pathname;
  const id = event.locals.requestId;
  logger.debug(`[Turbo] ${method} ${path} (${status}) - ${duration.toFixed(2)}ms [ID:${id}]`);
};

/** Simplified inline getCorsHeaders to avoid circular dependencies */
async function getCorsHeadersInline(
  origin: string | null,
  isApiRoute: boolean,
): Promise<Record<string, string> | null> {
  const { getPrivateSettingSync } = await import("@src/services/settings-service");
  const corsEnabled = getPrivateSettingSync("CORS_ENABLED") as boolean;
  if (!corsEnabled || !isApiRoute || !origin) return null;

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

// --- STATES TO BLOCK ---
const RESTRICTED_STATES = new Set(["INITIALIZING", "FAILED"]);

// Main Turbo Pipeline Hook
export const handleTurboPipeline: Handle = async ({ event, resolve }) => {
  const requestId = generateRequestId();
  const requestStart = performance.now();
  event.locals.requestStart = requestStart;
  event.locals.requestId = requestId;

  const pathname = event.url.pathname;

  // ── 0a. TERMINAL HEALTH CHECK BYPASS ──────────────────────────────────
  // Health checks must be zero-latency and bypass ALL other hooks.
  if (pathname === "/api/system/health" || pathname === "/health") {
    const { dbAdapter } = await import("@src/databases/db");
    const health = {
      status: dbAdapter ? "healthy" : "initializing",
      overallStatus: dbAdapter ? "READY" : "SETUP",
      database: !!dbAdapter,
      uptime: process.uptime(),
      timestamp: Date.now(),
      dbType: process.env.DB_TYPE || "unknown",
      memory: process.memoryUsage(),
    };
    return new Response(JSON.stringify(health), {
      status: 200,
      headers: { "Content-Type": "application/json", ...Object.fromEntries(BASE_HEADERS) },
    });
  }

  // ── 0b. TERMINAL TEST BYPASS ──────────────────────────────────────────
  const isTest =
    String(process.env.TEST_MODE) === "true" ||
    String(process.env.VITE_TEST_MODE) === "true" ||
    process.env.NODE_ENV === "test" ||
    process.env.BENCHMARK === "true";

  const testSecret =
    event.request.headers.get("x-test-secret") || event.request.headers.get("X-Test-Secret");

  if (isTest && testSecret) {
    const expected = getTestSecret();

    if (expected && testSecret === expected) {
      // 🚀 TERMINAL BYPASS: Verified test secret receives full system access.
      // We explicitly skip ALL other middleware by calling the dispatcher or returning a direct response.
      const { getDbInitPromise, getDb } = await import("@src/databases/db");
      try {
        await getDbInitPromise(false, "CORE");
      } catch {
        /* ignore */
      }

      const db = getDb();
      (event.locals as any).user = {
        _id: "system",
        role: "admin",
        isAdmin: true,
        email: "system@sveltycms",
      };
      (event.locals as any).isAdmin = true;
      (event.locals as any).dbAdapter = db;
      (event.locals as any).__testBypass = true;

      // For Benchmarks, if it's an API route, we can skip the remaining hooks and go to the dispatcher
      // However, since we can't easily call the dispatcher here without circular imports,
      // we'll let it continue but FLAG it so other hooks skip their logic.
      return await resolve(event);
    }
  }

  const isHttps = event.url.protocol === "https:";
  const isApiRoute = isApiLike(pathname);
  const origin = event.request.headers.get("Origin");

  // Base security header map
  const baseHeaderMap = Object.fromEntries(BASE_HEADERS);

  try {
    // ── 1. STATIC ASSET DELEGATION ───────────────────────────────────────────
    if (isStaticOrInternalRequest(pathname)) {
      return await resolve(event);
    }

    // ── 2. STATE DISCOVERY (ONE-TIME) ────────────────────────────────────────
    // We get the system state FIRST because it allows us to short-circuit EVERYTHING if the system is READY.
    const systemState = getSystemState();
    const isSystemOperationallyReady =
      systemState.overallState === "READY" ||
      systemState.overallState === "WARMED" ||
      systemState.overallState === "WARMING" ||
      systemState.overallState === "DEGRADED";

    // ✨ SMART BYPASS: If system is operationally ready, we know setup is complete.
    // This avoids redundant filesystem/DB checks on every single request.
    let setupState: SetupState;
    if (isSystemOperationallyReady) {
      setupState = SetupState.COMPLETE;
    } else {
      // ── 3. ROBUST SETUP REDIRECT (FAST-PATH) ─────────────────────────────────
      // Shallow check first: If no private.ts, we DEFINITELY need setup.
      if (!isSetupComplete()) {
        const isSetupRoute =
          pathname.startsWith("/setup") || /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/setup/.test(pathname);

        if (!isSetupRoute && !isApiRoute && !STATIC_ASSET_REGEX.test(pathname)) {
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
      } else {
        // 🚀 CRITICAL: If config exists, we are NOT in MISSING_CONFIG.
        // We might be MISSING_ADMIN, but we should NOT redirect back to /setup
        // if the database is simply initializing/busy.
        // We assume COMPLETE for the sake of the Turbo Gate, and let the
        // handleSystemState hook handle the "INITIALIZING" wait.
        setupState = SetupState.COMPLETE;

        // However, if we are specifically ON a setup route, we might want the real state
        // to show the "Admin created" step etc.
        const isSetupRoute =
          pathname.startsWith("/setup") || /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/setup/.test(pathname);
        if (isSetupRoute) {
          setupState = await getSetupState();
        }
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
      if (isSetupRoute && setupState === SetupState.COMPLETE && !isTestMode) {
        if (!(event.request.method === "POST" && pathname.includes("/completeSetup"))) {
          logger.warn(`Blocked request to ${pathname} - setup already complete`);
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
    if (RESTRICTED_STATES.has(systemState.overallState) && !pathname.includes("/health")) {
      const response = restrictedResponse(systemState.overallState, isApiRoute, baseHeaderMap);
      response.headers.set("X-Request-ID", requestId);
      if (dev) logRequest(event, performance.now() - requestStart, response.status);
      return response;
    }

    // ── 7. SETUP COMPLETENESS GATE (GRANULAR) ───────────────────────────────
    if (setupState !== SetupState.COMPLETE) {
      const isFinalization = event.request.method === "POST" && pathname.includes("/completeSetup");
      if (isFinalization) return await resolve(event);

      const destination = setupState === SetupState.MISSING_CONFIG ? "/setup" : "/setup/admin";

      if (isApiRoute) {
        return new Response(
          JSON.stringify({ error: "Setup incomplete", setupState, redirectTo: destination }),
          {
            status: 503,
            headers: { "Content-Type": "application/json", ...baseHeaderMap },
          },
        );
      }

      if (!isBootstrapRoute(pathname) || pathname === "/login") {
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

    // ── 8. CORS PREFLIGHT FAST EXIT ─────────────────────────────────────────
    if (event.request.method === "OPTIONS" && isApiRoute) {
      const corsHeaders = await getCorsHeadersInline(origin, isApiRoute);
      if (!corsHeaders) return new Response(null, { status: 403 });

      return new Response(null, {
        status: 204,
        headers: { ...corsHeaders, "X-Request-ID": requestId },
      });
    }

    // ── 9. FINAL RESOLVE ───────────────────────────────────────────────────
    const response = await resolve(event);
    if (dev) logRequest(event, performance.now() - requestStart, response.status);
    return response;
  } catch (err: any) {
    if (isRedirect(err)) throw err;
    logger.error(`[Turbo] Pipeline error:`, err);
    const fallback = boundaryResponse(err, isHttps);
    fallback.headers.set("X-Request-ID", requestId);
    return fallback;
  }
};
