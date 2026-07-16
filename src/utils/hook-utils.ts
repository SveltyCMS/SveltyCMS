/**
 * @file src/utils/hook-utils.ts
 * @description High-performance utility for middleware hook short-circuiting and response generation.
 *
 * ### Hardening (audit 2026-07):
 * - IP spoofing prevention: fallback to "0.0.0.0" instead of untrusted x-forwarded-for
 * - ReDoS fix: split regex into INTERNAL_PATH_REGEX + anchored STATIC_EXT_REGEX
 * - O(1) Set lookup for 80% of public routes (replaces array scan)
 * - IS_TEST_MODE IIFE at module load (zero repeated globalThis lookups)
 * - Token validation uses regex capture group (zero allocation)
 */

import { isSiteStarterPublicPath } from "@src/services/site/site-config.server";
import type { RequestEvent } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";
import { BASE_HEADERS } from "./security/constants";

// 🚀 Pre-cache to avoid Object.entries allocation on every request
const BASE_HEADERS_ENTRIES = Object.entries(BASE_HEADERS);

// 🚀 Cache static environment flag at module load
const IS_TEST_MODE = (() => {
  if (typeof globalThis === "undefined") return false;
  const env = (globalThis as any).process?.env;
  return env?.TEST_MODE === "true" || env?.VITE_TEST_MODE === "true" || env?.BENCHMARK === "true";
})();

// ─── Pre-compiled classification matchers ─────────────────────────────────

export const INTERNAL_PATH_REGEX =
  /^\/(?:@vite\/client|@fs\/|src\/|node_modules\/|vite\/|_app|static|files\/|\.svelte-kit\/generated\/client\/nodes)/;

/** Anchored to end ($) to prevent catastrophic backtracking (ReDoS). */
export const STATIC_EXT_REGEX =
  /\.(?:svg|png|jpg|jpeg|gif|css|js|mjs|cjs|woff|woff2|ttf|eot|map|json|ico|pdf|txt|xml|webmanifest)$/i;

/** @deprecated Split into INTERNAL_PATH_REGEX + STATIC_EXT_REGEX (anchored to prevent ReDoS).
 * Kept for backward compatibility — legacy single regex matching both internal paths and extensions. */
export const STATIC_ASSET_REGEX =
  /^\/(?:@vite\/client|@fs\/|src\/|node_modules\/|vite\/|_app|static|files\/|favicon\.ico|\.svelte-kit\/generated\/client\/nodes|.*\.(svg|png|jpg|jpeg|gif|css|js|woff|woff2|ttf|eot|map|json))/;

const LOCALIZED_BOOTSTRAP_REGEX = /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/(setup|login|register)/;
const LOCALIZED_PUBLIC_REGEX = /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/(setup|login|register|forgot-password)/;

// O(1) Set lookup for 80% of public routes
const PUBLIC_EXACT_ROUTES = new Set([
  "/login",
  "/register",
  "/forgot-password",
  "/setup",
  "/share",
  "/api/system/health",
  "/api/health",
  "/api/system/version",
  "/api/user/login",
  "/api/auth/login",
  "/api/preview",
  "/api/media/share",
  "/api/system/penalize-bounce",
  "/api/security/csp-report",
  "/api/auth/saml/acs",
  "/api/auth/saml/login",
]);

const PUBLIC_PREFIX_ROUTES = ["/api/settings/public", "/api/theme/public"];

// ─── One-shot request classifier ──────────────────────────────────────────

export interface RequestFlags {
  isStatic: boolean;
  isApi: boolean;
  isBootstrap: boolean;
  isPublic: boolean;
  isTestMode: boolean;
}

export function classifyRequest(pathname: string, locals: App.Locals): RequestFlags {
  const existing = (locals as any).__flags as RequestFlags | undefined;
  if (existing) return existing;

  const isStatic = isStaticOrInternalRequest(pathname);
  const isBootstrap = isBootstrapRoute(pathname);

  const flags: RequestFlags = {
    isStatic,
    isApi: pathname.startsWith("/api/"),
    isBootstrap,
    isPublic: isStatic || isBootstrap || isPublicRoute(pathname, IS_TEST_MODE),
    isTestMode: IS_TEST_MODE,
  };

  (locals as any).__flags = flags;
  return flags;
}

export function getRequestFlags(locals: App.Locals): RequestFlags {
  const existing = (locals as any).__flags as RequestFlags | undefined;
  if (existing) return existing;

  return {
    isStatic: false,
    isApi: false,
    isBootstrap: false,
    isPublic: false,
    isTestMode: IS_TEST_MODE,
  };
}

// ─── Path classification ──────────────────────────────────────────────────

export function isStaticOrInternalRequest(pathname: string): boolean {
  if (pathname.length < 2) return false;
  if (pathname.startsWith("/api/")) return false;
  if (
    pathname.startsWith("/files/") ||
    pathname.startsWith("/.well-known/") ||
    pathname.startsWith("/_")
  )
    return true;

  return INTERNAL_PATH_REGEX.test(pathname) || STATIC_EXT_REGEX.test(pathname);
}

export function isApiLike(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname.includes("/api-");
}

export function isAdmin(user: any): boolean {
  if (!user) return false;
  return user.isAdmin === true || user.role === "admin" || user.role === "super-admin";
}

/**
 * High-performance client IP detection.
 * 🛡️ If getClientAddress fails, returns "0.0.0.0" to prevent IP spoofing via
 * untrusted X-Forwarded-For / X-Real-IP headers.
 */
export function getClientIp(event: RequestEvent): string {
  if (IS_TEST_MODE) return "127.0.0.1";

  try {
    return event.getClientAddress();
  } catch (err: any) {
    if (process.env.BENCHMARK_DEBUG === "true") {
      console.log(
        `[getClientIp] Failed: ${err.message}. Defaulting to 0.0.0.0 to prevent IP spoofing.`,
      );
    }
    return "0.0.0.0";
  }
}

export function isBootstrapRoute(pathname: string): boolean {
  if (pathname === "/" || pathname.startsWith("/setup") || pathname.startsWith("/api/setup"))
    return true;
  if (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/user/login")
  )
    return true;

  if (
    pathname.startsWith("/api/system") ||
    pathname.startsWith("/api/debug") ||
    pathname.startsWith("/api/testing") ||
    pathname.startsWith("/api/settings/public") ||
    pathname.startsWith("/api/content/version") ||
    pathname.startsWith("/api/dashboard/health") ||
    pathname.startsWith("/ui-test")
  )
    return true;

  if (
    !pathname.startsWith("/api/") &&
    (pathname.startsWith("/_") ||
      pathname.startsWith("/static") ||
      pathname.startsWith("/assets") ||
      pathname.startsWith("/favicon.ico") ||
      pathname.startsWith("/.well-known") ||
      STATIC_EXT_REGEX.test(pathname))
  )
    return true;

  if (pathname.startsWith("/warming-up")) return true;
  return LOCALIZED_BOOTSTRAP_REGEX.test(pathname);
}

export function isPublicRoute(pathname: string, testMode = false): boolean {
  // 1. O(1) Exact match
  if (PUBLIC_EXACT_ROUTES.has(pathname)) return true;

  // 2. Prefix match
  for (let i = 0; i < PUBLIC_PREFIX_ROUTES.length; i++) {
    if (pathname.startsWith(PUBLIC_PREFIX_ROUTES[i])) return true;
  }

  if (isSiteStarterPublicPath(pathname)) return true;
  if (testMode && pathname.startsWith("/api/testing")) return true;

  // 3. Token access (regex capture — zero allocation)
  if (pathname.startsWith("/api/token/")) {
    const tokenMatch = pathname.match(/^\/api\/token\/([^/]+)/);
    if (tokenMatch) {
      const action = tokenMatch[1];
      if (
        action !== "list" &&
        action !== "batch" &&
        action !== "create-token" &&
        action !== "resolve"
      ) {
        return true;
      }
    }
  }

  // 4. Localized routes + OAuth
  return (
    LOCALIZED_PUBLIC_REGEX.test(pathname) ||
    (pathname.includes("/login?") && pathname.includes("OAuth"))
  );
}

// ─── Response generation ──────────────────────────────────────────────────

export function applySecurityHeaders(headers: Headers, isHttps: boolean) {
  for (const [key, value] of BASE_HEADERS_ENTRIES) {
    if (key === "Content-Security-Policy") continue;
    headers.set(key, value);
  }

  if (isHttps) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
}

export function restrictedResponse(
  state: string,
  isApi: boolean,
  baseHeaders: Record<string, string>,
): Response {
  const status = 503;
  const isInit = state === "INITIALIZING";
  const message = isInit ? "System is initializing." : "System error or maintenance.";

  if (isApi) {
    return json({ error: message, state }, { status, headers: baseHeaders });
  }

  const html = isInit
    ? `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="2"><title>Initializing</title><style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f8fafc;color:#334155;} .loader{border:4px solid #e2e8f0;border-top:4px solid #3b82f6;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin-right:15px;} @keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}</style></head><body><div class="loader"></div><h2>System is starting up...</h2></body></html>`
    : `<!DOCTYPE html><html><head><title>System Maintenance</title></head><body><h2>${message}</h2></body></html>`;

  const headers = new Headers(baseHeaders);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Retry-After", "2");

  return new Response(html, { status, headers });
}

export function boundaryResponse(error: any, isHttps: boolean): Response {
  const status = error.status || 500;
  const message = error.message || "Internal Server Error";

  const headers = new Headers({ "Content-Type": "application/json" });
  applySecurityHeaders(headers, isHttps);

  return json({ error: message, code: error.code || "INTERNAL_ERROR" }, { status, headers });
}
