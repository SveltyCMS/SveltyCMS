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
import { getSetupState, SetupState } from "@src/utils/setup-check";
import { getSystemState } from "@src/stores/system/state";
import { redirect, type Handle } from "@sveltejs/kit";
import {
  isApiLike,
  isBootstrapRoute,
  STATIC_ASSET_REGEX,
  applySecurityHeaders,
  BASE_HEADERS,
  restrictedResponse,
  boundaryResponse,
} from "@utils/hook-utils";
import { logger } from "@utils/logger.server";
import { getPrivateSettingSync } from "@src/services/settings-service";

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

/**
 * Main Turbo Pipeline Hook
 */
export const handleTurboPipeline: Handle = async ({ event, resolve }) => {
  const { url } = event;
  const pathname = url.pathname;

  // ── Tracing bootstrap (Standard Path) ──
  const requestStart = performance.now();
  const requestId = generateRequestId();
  event.locals.requestStart = requestStart;
  event.locals.requestId = requestId;

  const isHttps = event.url.protocol === "https:";
  const isApiRoute = isApiLike(pathname);
  const origin = event.request.headers.get("Origin");

  // Base security header map
  const baseHeaderMap = Object.fromEntries(BASE_HEADERS);

  // ── 0. TEST ISOLATION BYPASS ───────────────────────────────────────────
  // High-performance cryptographic bypass for CI and automated testing.
  const isTest =
    process.env.TEST_MODE === "true" ||
    process.env.VITE_TEST_MODE === "true" ||
    (process.env as any).TEST_MODE === true;

  const testSecret =
    event.request.headers.get("x-test-secret") || event.request.headers.get("X-Test-Secret");

  if (isTest && testSecret) {
    const expected =
      process.env.TEST_API_SECRET ||
      process.env.VITE_TEST_API_SECRET ||
      "SVELTYCMS_TEST_SECRET_2026";
    if (testSecret === expected) {
      // 🚀 HARD BYPASS: Verified test secret receives full system access and skips ALL middleware.
      const { getDbInitPromise, getDb } = await import("@src/databases/db");
      await getDbInitPromise(false, "CORE");

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
    }
  }

  try {
    // ── 1. STATIC ASSET FAST EXIT ───────────────────────────────────────────
    if (STATIC_ASSET_REGEX.test(pathname)) {
      const response = await resolve(event);
      response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
      applySecurityHeaders(response.headers, isHttps);

      if (dev) logRequest(event, performance.now() - requestStart, response.status);
      return response;
    }

    // ── 2. BOOTSTRAP ROUTE BYPASS ───────────────────────────────────────────
    if (isBootstrapRoute(pathname)) {
      const response = await resolve(event);
      applySecurityHeaders(response.headers, isHttps);

      if (dev) logRequest(event, performance.now() - requestStart, response.status);
      return response;
    }
    // ── 3. SYSTEM STATE GATE ────────────────────────────────────────────────
    const systemState = getSystemState();
    if (RESTRICTED_STATES.has(systemState.overallState)) {
      const response = restrictedResponse(systemState.overallState, isApiRoute, baseHeaderMap);
      if (dev) logRequest(event, performance.now() - requestStart, response.status);
      return response;
    }

    // ── 4. SETUP COMPLETENESS GATE ──────────────────────────────────────────
    const setupState = await getSetupState();

    if (setupState !== SetupState.COMPLETE) {
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

      // Preserve the originally-requested URL so setup can redirect back after completion.
      const returnTo = encodeURIComponent(event.url.pathname + event.url.search);
      throw redirect(302, `${destination}?from=${returnTo}`);
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
        headers: corsHeaders,
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
    logger.error(`[Turbo] Pipeline error:`, err);
    const fallback = boundaryResponse(err, isHttps);
    fallback.headers.set("X-Request-ID", requestId);
    if (dev) logRequest(event, performance.now() - requestStart, fallback.status);
    return fallback;
  }
};
