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
import { isRedirect, redirect, type Handle } from "@sveltejs/kit";
import { getDbInitPromise, getDb } from "@src/databases/db";
import {
  isApiLike,
  isBootstrapRoute,
  isStaticOrInternalRequest,
  STATIC_ASSET_REGEX,
  BASE_HEADERS,
  restrictedResponse,
  boundaryResponse,
} from "@utils/hook-utils";
import { logger } from "@utils/logger.server";
import { getPrivateSettingSync } from "@src/services/settings-service";

console.log("🚀 SveltyCMS Turbo Pipeline Hook loaded (PID: " + process.pid + ")");

// --- HELPERS ---

/** Generates a unique request ID for tracing */
const generateRequestId = () =>
  Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

/** Logs request performance in development */
const logRequest = (event: any, duration: number, status: number) => {
  const method = event.request.method;
  const path = event.url.pathname;
  const id = event.locals.requestId;
  logger.debug(`[Turbo] ${method} ${path} (${status}) - ${duration.toFixed(2)}ms [ID:${id}]`);
};

/** Simplified inline getCorsHeaders to avoid circular dependencies */
function getCorsHeadersInline(
  origin: string | null,
  isApiRoute: boolean,
): Record<string, string> | null {
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
  const { url } = event;
  const pathname = url.pathname;

  // ── Tracing bootstrap (Standard Path) ──
  const requestStart = performance.now();
  const requestId = generateRequestId();
  event.locals.requestStart = requestStart;
  event.locals.requestId = requestId;

  // ── 0. TEST ISOLATION BYPASS ───────────────────────────────────────────
  // High-performance cryptographic bypass for CI and automated testing.
  const isTest =
    process.env.TEST_MODE === "true" ||
    process.env.VITE_TEST_MODE === "true" ||
    (process.env as any).TEST_MODE === true ||
    process.env.NODE_ENV === "test";

  const testSecret =
    event.request.headers.get("x-test-secret") || event.request.headers.get("X-Test-Secret");

  if (isTest && testSecret) {
    const expected = getTestSecret();

    if (expected && testSecret === expected) {
      // 🚀 HARD BYPASS: Verified test secret receives full system access and skips ALL middleware.
      await getDbInitPromise(false, "CORE");

      if (dev || isTest) {
        logger.debug(`[Turbo] Bypass SUCCESS for ${pathname}.`);
      }

      (event.locals as any).user = {
        _id: "system",
        role: "admin",
        isAdmin: true,
        email: "system@sveltycms",
      };
      (event.locals as any).dbAdapter = getDb();
      (event.locals as any).__testBypass = true;

      const response = await resolve(event);
      if (dev) logRequest(event, performance.now() - requestStart, response.status);
      return response;
    } else {
      logger.warn(
        `[Turbo] Bypass FAILED for ${pathname}: Secret mismatch. Received: "${testSecret?.substring(0, 5)}...", Expected: "${expected?.substring(0, 5)}..."`,
      );
    }
  } else if (testSecret) {
    logger.error(
      `[Turbo] Bypass SKIPPED for ${pathname}: isTest is false. (TEST_MODE: ${process.env.TEST_MODE}, VITE_TEST_MODE: ${process.env.VITE_TEST_MODE}, NODE_ENV: ${process.env.NODE_ENV})`,
    );
  }

  const isHttps = event.url.protocol === "https:";
  const isApiRoute = isApiLike(pathname);
  const origin = event.request.headers.get("Origin");

  // Base security header map
  const baseHeaderMap = Object.fromEntries(BASE_HEADERS);

  try {
    // ── 1. STATIC ASSET DELEGATION ───────────────────────────────────────────
    // Note: handleStaticAssetCaching now handles this early in the sequence.
    // We just resolve here to let the rest of the chain proceed.
    if (isStaticOrInternalRequest(pathname)) {
      return await resolve(event);
    }

    // ── 2. ROBUST SETUP REDIRECT (FAST-PATH) ─────────────────────────────────
    // Check if config exists BEFORE any bootstrap bypass or DB initialization.
    // Optimization: isSetupComplete() is sync and memoized.
    if (!isSetupComplete()) {
      const isSetupRoute =
        pathname.startsWith("/setup") || /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/setup/.test(pathname);

      if (!isSetupRoute && !isApiRoute && !STATIC_ASSET_REGEX.test(pathname)) {
        const returnTo =
          pathname === "/"
            ? ""
            : `?from=${encodeURIComponent(event.url.pathname + event.url.search)}`;
        logger.info(`[Turbo] Config missing, redirecting to /setup from ${pathname}`);
        throw redirect(302, `/setup${returnTo}`);
      }
    }

    // ── 3. STATE DISCOVERY (ONE-TIME) ────────────────────────────────────────
    // Consolidate setup state check to avoid redundant DB/File I/O
    const setupState = await getSetupState();
    (event.locals as any).__setupState = setupState;

    // ── 2. HEALTH CHECK BYPASS ──────────────────────────────────────────────
    if (pathname.startsWith("/api/system/health")) {
      return await resolve(event);
    }

    // ── 4. BOOTSTRAP ROUTE BYPASS ───────────────────────────────────────────
    // We allow /setup and /login to bypass the main pipeline, but only if they are valid for the current state.
    // Specifically, /login should NOT bypass if the system is uninitialized (it needs to hit the setup gate).
    const isLoginDuringSetup = pathname === "/login" && setupState !== SetupState.COMPLETE;

    if (isBootstrapRoute(pathname) && !isLoginDuringSetup) {
      const response = await resolve(event);

      if (dev) logRequest(event, performance.now() - requestStart, response.status);
      return response;
    }
    // ── 3. SYSTEM STATE GATE ────────────────────────────────────────────────
    const systemState = getSystemState();
    const isHealthCheck = pathname.startsWith("/api/system/health");

    if (dev || process.env.BENCHMARK_DEBUG === "true") {
      console.error(
        `[TurboPipeline] pathname: "${pathname}", isHealthCheck: ${isHealthCheck}, state: ${systemState.overallState}`,
      );
    }

    if (RESTRICTED_STATES.has(systemState.overallState) && !isHealthCheck) {
      const response = restrictedResponse(systemState.overallState, isApiRoute, baseHeaderMap);
      response.headers.set("X-Request-ID", requestId);
      if (dev) logRequest(event, performance.now() - requestStart, response.status);
      return response;
    }

    // ── 5. SETUP COMPLETENESS GATE (GRANULAR) ───────────────────────────────
    // This handles the MISSING_ADMIN state which requires DB access.
    // Optimized: using cached setupState from Phase 3.

    if (setupState !== SetupState.COMPLETE) {
      // Allow finalization request to bypass redirect loop
      const isFinalization = event.request.method === "POST" && pathname.includes("/completeSetup");
      if (isFinalization) return await resolve(event);

      const destination = setupState === SetupState.MISSING_CONFIG ? "/setup" : "/setup/admin";

      if (isApiRoute) {
        const response = new Response(
          JSON.stringify({ error: "Setup incomplete", setupState, redirectTo: destination }),
          {
            status: 503,
            headers: { "Content-Type": "application/json", ...baseHeaderMap },
          },
        );
        if (dev) logRequest(event, performance.now() - requestStart, 503);
        return response;
      }

      // If we are not on a bootstrap route and setup is not complete, redirect.
      // Note: isBootstrapRoute check above handles /setup and assets.
      const isLoginAccessDuringSetup = pathname === "/login";
      if (!isBootstrapRoute(pathname) || isLoginAccessDuringSetup) {
        const returnTo =
          pathname === "/" || pathname === "/login"
            ? ""
            : `?from=${encodeURIComponent(event.url.pathname + event.url.search)}`;
        throw redirect(302, `${destination}${returnTo}`);
      }
    }

    // ── 5. CORS PREFLIGHT FAST EXIT ─────────────────────────────────────────
    // OPTIONS must be handled before resolve() so SvelteKit doesn't 404 it.
    if (event.request.method === "OPTIONS" && isApiRoute) {
      const corsHeaders = getCorsHeadersInline(origin, isApiRoute);

      if (corsHeaders === null) {
        // Origin explicitly not allowed.
        return new Response(null, { status: 403 });
      }

      const response = new Response(null, {
        status: 204,
        headers: { ...corsHeaders, "X-Request-ID": requestId },
      });

      if (dev) logRequest(event, performance.now() - requestStart, 204);
      return response;
    }

    // ── 6. FINAL RESOLVE ───────────────────────────────────────────────────
    const response = await resolve(event);
    if (dev) logRequest(event, performance.now() - requestStart, response.status);
    return response;
  } catch (err: any) {
    // Pipeline Error Recovery (Boundary)
    if (
      isRedirect(err) ||
      (err && typeof err === "object" && err.status >= 300 && err.status <= 308 && err.location)
    ) {
      throw err;
    }

    logger.error(`[Turbo] Pipeline error:`, err);
    const fallback = boundaryResponse(err, isHttps);
    fallback.headers.set("X-Request-ID", requestId);
    if (dev) logRequest(event, performance.now() - requestStart, fallback.status);
    return fallback;
  }
};
