/**
 * @file src/hooks/handle-turbo-pipeline.server.ts
 * @description Consolidated high-performance middleware pipeline for SveltyCMS.
 *
 * ### Pipeline (in order of execution cost)
 * 1. Static Asset Fast Exit      — regex match, full headers, immutable cache
 * 2. Bootstrap Route Bypass      — setup/login/health always pass through
 * 3. System State Gate           — 503 during INITIALIZING / MAINTENANCE / FAILED
 * 4. Setup Completeness Gate     — redirect to /setup or /setup/admin when needed
 * 5. CORS Preflight              — OPTIONS fast-exit for API/GraphQL routes
 * 6. Resolution + Security       — resolve + apply full header set
 *
 * ### Architectural Note: CSP delegation
 * Content-Security-Policy (CSP) is NOT handled in this pipeline. It is managed
 * natively via `svelte.config.js` to ensure proper integration with SvelteKit's
 * CSRF and script-nonce systems.
 *
 * ### Error boundary
 * All stages are wrapped so an unexpected throw still returns a well-formed
 * response with security headers rather than leaking a stack trace.
 */

import { dev } from "$app/environment";
import { redirect } from "@sveltejs/kit";
import { STATIC_ASSET_REGEX } from "./handle-static-asset-caching";
import { getSystemState } from "@src/stores/system/state";
import { isBootstrapRoute, getSetupState, SetupState } from "@utils/setup-check";
import { logger } from "@utils/logger.server";
import type { Handle, RequestEvent } from "@sveltejs/kit";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PipelineLocals {
  /** Monotonic timestamp (ms) set at the start of every request. */
  requestStart: number;
  /** Short random hex ID for log correlation. */
  requestId: string;
}

// Extend SvelteKit's Locals so downstream handlers can read these fields.
declare global {
  namespace App {
    interface Locals extends PipelineLocals {}
  }
}

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

const BASE_HEADERS: ReadonlyArray<[string, string]> = [
  ["X-Frame-Options", "SAMEORIGIN"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()"],
];

const ISOLATION_HEADERS: ReadonlyArray<[string, string]> = [
  ["Cross-Origin-Opener-Policy", "same-origin"],
  // credentialless: allows cross-origin subresources without opt-in,
  // which is safer than require-corp for a CMS that embeds third-party media.
  ["Cross-Origin-Embedder-Policy", "credentialless"],
];

/**
 * Builds a Content-Security-Policy string.
 *
 * The nonce is injected by SvelteKit's `resolve({ transformPageChunk })` but we
 * need it here for the header.  Pass `event.locals.nonce` if your render hook
 * sets one; otherwise omit it for a baseline policy that you can tighten later.
 *
 * @see https://csp.withgoogle.com/docs/strict-csp.html
 */
function applySecurityHeaders(headers: Headers, isHttps: boolean): void {
  for (const [k, v] of BASE_HEADERS) {
    if (!headers.has(k)) headers.set(k, v);
  }
  for (const [k, v] of ISOLATION_HEADERS) {
    if (!headers.has(k)) headers.set(k, v);
  }
  if (!dev && isHttps && !headers.has("Strict-Transport-Security")) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
}

// ---------------------------------------------------------------------------
// System state gate
// ---------------------------------------------------------------------------
const RESTRICTED_STATES = new Set(["IDLE", "INITIALIZING", "RECOVERY", "MAINTENANCE", "FAILED"]);

const STATE_MESSAGES: Record<string, { status: number; message: string; retryAfter?: string }> = {
  INITIALIZING: {
    status: 503,
    message: "System is starting up — please retry shortly.",
    retryAfter: "5",
  },
  RECOVERY: {
    status: 503,
    message: "System is autonomously healing from a service failure. Please wait...",
    retryAfter: "5",
  },
  MAINTENANCE: {
    status: 503,
    message: "System is under scheduled maintenance.",
  },
  IDLE: {
    status: 503,
    message: "System is not yet running.",
    retryAfter: "10",
  },
  FAILED: {
    status: 503,
    message: "System initialization failed. Check server logs.",
  },
};

function restrictedResponse(
  state: string,
  isApiRoute: boolean,
  headers: Record<string, string>,
): Response {
  const { status, message, retryAfter } = STATE_MESSAGES[state] ?? {
    status: 503,
    message: "Service unavailable.",
  };

  const responseHeaders: Record<string, string> = {
    "Content-Type": isApiRoute ? "application/json" : "text/plain; charset=utf-8",
    ...headers,
  };
  if (retryAfter) responseHeaders["Retry-After"] = retryAfter;

  const body = isApiRoute ? JSON.stringify({ error: message, state }) : message;
  return new Response(body, { status, headers: responseHeaders });
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

/**
 * Allowed origins for cross-origin API access.
 *
 * In production, read from your config/env rather than hard-coding.
 * The list is resolved at module load time so it's a constant per process.
 */
const ALLOWED_ORIGINS: ReadonlySet<string> = new Set(
  (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),
);

/**
 * Returns CORS headers appropriate for the incoming request.
 * Returns `null` if the origin is not permitted (request should be rejected).
 */
function getCorsHeaders(origin: string | null, isApiRoute: boolean): Record<string, string> | null {
  // Non-API routes don't need CORS.
  if (!isApiRoute || !origin) return {};

  // In dev or test mode (local), allow all origins to reduce friction.
  const isTestMode = process.env.TEST_MODE === "true" || process.env.VITE_TEST_MODE === "true";
  const isLocalOrigin =
    origin === "http://localhost:4173" ||
    origin === "http://127.0.0.1:4173" ||
    origin === "http://localhost:5173" ||
    origin === "http://127.0.0.1:5173";

  if (dev || (isTestMode && isLocalOrigin) || ALLOWED_ORIGINS.has(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-ID",
      "Access-Control-Max-Age": "86400", // Cache preflight for 24 h
      Vary: "Origin",
    };
  }

  // Origin not allowed.
  return null;
}

// ---------------------------------------------------------------------------
// Request tracing
// ---------------------------------------------------------------------------

/** Generates a short 8-hex-char request ID. Avoids crypto.randomUUID() overhead. */
function generateRequestId(): string {
  return Math.random().toString(16).slice(2, 10);
}

/** Logs a structured one-liner in dev via the enterprise logger. */
function logRequest(event: RequestEvent, durationMs: number, status: number): void {
  if (!dev) return;
  const { method } = event.request;
  const { pathname } = event.url;
  const id = event.locals.requestId;
  const color = status >= 500 ? "\x1b[31m" : status >= 400 ? "\x1b[33m" : "\x1b[32m";

  // Use logger.debug for request tracing to keep info logs clean for system events
  logger.debug(
    `${color}[${id}] ${method} ${pathname} → ${status} (${durationMs.toFixed(2)}ms)\x1b[0m`,
  );
}

// ---------------------------------------------------------------------------
// Error boundary errors
// ---------------------------------------------------------------------------

/** Wraps an unhandled error into a safe 500 response with security headers applied. */
function boundaryResponse(err: unknown, isHttps: boolean): Response {
  const message = dev && err instanceof Error ? err.message : "Internal server error.";
  const res = new Response(message, {
    status: 500,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
  applySecurityHeaders(res.headers, isHttps);
  return res;
}

// ---------------------------------------------------------------------------
// Route classification
// ---------------------------------------------------------------------------

/**
 * Classifies a pathname as an "API-like" route — one where JSON/programmatic
 * responses are appropriate instead of HTML redirects.
 *
 * Covers /api/*, /graphql, and any future RPC-style mount points.
 */
function isApiLike(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname === "/api" || pathname.startsWith("/graphql");
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export const handleTurboPipeline: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;

  // ── AUTH BYPASS FOR TESTING (CRITICAL PATH) ────────────────────────────────
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
      "SveltyCMS-Benchmark-Secret-2026";
    if (testSecret === expected) {
      // logger.debug(`[Backdoor] Valid test secret received for ${pathname}`);
      // Fast-track: Provision system user and bypass EVERYTHING
      const { getDbInitPromise, dbAdapter } = await import("@src/databases/db");
      await getDbInitPromise(false, "CORE");

      (event.locals as any).user = {
        _id: "system",
        role: "admin",
        isAdmin: true,
        email: "system@sveltycms",
      };
      (event.locals as any).dbAdapter = dbAdapter;
      (event.locals as any).__testBypass = true;
      return resolve(event);
    } else {
      logger.warn(
        `[Backdoor] Invalid test secret for ${pathname}. Expected: ${expected?.slice(0, 4)}..., Got: ${testSecret?.slice(0, 4)}...`,
      );
    }
  }

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
      const corsHeaders = getCorsHeaders(origin, isApiRoute);

      if (corsHeaders === null) {
        // Origin explicitly not allowed.
        const response = new Response("Forbidden", {
          status: 403,
          headers: { "Content-Type": "text/plain", ...baseHeaderMap },
        });
        if (dev) logRequest(event, performance.now() - requestStart, 403);
        return response;
      }

      const response = new Response(null, { status: 204, headers: corsHeaders });
      applySecurityHeaders(response.headers, isHttps);
      if (dev) logRequest(event, performance.now() - requestStart, 204);
      return response;
    }

    // ── 6. RESOLUTION + FULL HEADER SET ─────────────────────────────────────
    const response = await resolve(event);

    applySecurityHeaders(response.headers, isHttps);

    // Attach CORS headers to all API responses (not just preflight).
    const corsHeaders = getCorsHeaders(origin, isApiRoute);
    if (corsHeaders === null) {
      // Active request from a disallowed origin — replace with 403.
      const blocked = new Response("Forbidden", {
        status: 403,
        headers: { "Content-Type": "text/plain" },
      });
      applySecurityHeaders(blocked.headers, isHttps);
      if (dev) logRequest(event, performance.now() - requestStart, 403);
      return blocked;
    }
    for (const [k, v] of Object.entries(corsHeaders)) {
      if (!response.headers.has(k)) response.headers.set(k, v);
    }

    // Attach request ID to response for client-side log correlation.
    response.headers.set("X-Request-ID", requestId);

    if (dev) logRequest(event, performance.now() - requestStart, response.status);
    return response;
  } catch (err) {
    // Re-throw SvelteKit's own redirect/error responses — they are not real errors.
    if (err instanceof Response || (err as any)?.status) throw err;

    console.error(`[${requestId}] Unhandled pipeline error:`, err);
    const fallback = boundaryResponse(err, isHttps);
    fallback.headers.set("X-Request-ID", requestId);
    if (dev) logRequest(event, performance.now() - requestStart, fallback.status);
    return fallback;
  }
};
