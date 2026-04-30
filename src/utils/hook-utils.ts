/**
 * @file src/utils/hook-utils.ts
 * @description High-performance utility for middleware hook short-circuiting and response generation.
 */

import type { RequestEvent } from "@sveltejs/kit";
import { json } from "@sveltejs/kit";

/**
 * Compiled regular expression for all static assets and internal Vite/SvelteKit routes.
 */
export const STATIC_ASSET_REGEX =
  /^\/(?:@vite\/client|@fs\/|src\/|node_modules\/|vite\/|_app|static|favicon\.ico|\.svelte-kit\/generated\/client\/nodes|.*\.(svg|png|jpg|jpeg|gif|css|js|woff|woff2|ttf|eot|map|json))/;

/**
 * Legacy alias for STATIC_ASSET_REGEX
 */
export const ASSET_REGEX = STATIC_ASSET_REGEX;

/**
 * Common public routes that bypass authentication and authorization.
 */
export const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/setup",
  "/api/settings/public",
  "/api/system/health",
  "/api/system/version",
  "/api/user/login",
  "/api/auth/login",
  "/api/preview",
];

/**
 * Common security headers applied to all responses
 */
export const BASE_HEADERS: [string, string][] = [
  ["X-Frame-Options", "SAMEORIGIN"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["Cross-Origin-Opener-Policy", "same-origin"],
  ["Cross-Origin-Embedder-Policy", "credentialless"],
];

/**
 * Checks if a pathname is a static asset or internal system route.
 */
export function isStaticOrInternalRequest(pathname: string): boolean {
  if (pathname.length < 2) return false;
  if (pathname.startsWith("/api/")) return false; // API routes are never static/internal bypass candidates
  if (pathname.startsWith("/.well-known/") || pathname.startsWith("/_")) return true;
  return STATIC_ASSET_REGEX.test(pathname);
}

/**
 * Checks if a pathname looks like an API route.
 */
export function isApiLike(pathname: string): boolean {
  return pathname.startsWith("/api/") || pathname.includes("/api-");
}

/**
 * Unified check for administrative privileges across all hooks.
 */
export function isAdmin(user: any): boolean {
  if (!user) return false;
  // Check common admin flags and roles
  const result = user.isAdmin === true || user.role === "admin" || user.role === "super-admin";
  return result;
}

/**
 * High-performance client IP detection with fallback chain.
 */
export function getClientIp(event: RequestEvent): string {
  try {
    return event.getClientAddress();
  } catch {
    return (
      event.request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      event.request.headers.get("x-real-ip") ||
      "127.0.0.1"
    );
  }
}

/**
 * Checks if a pathname is a bootstrap route (/setup, /login, etc)
 */
export function isBootstrapRoute(pathname: string): boolean {
  return (
    pathname === "/setup" ||
    pathname === "/setup/admin" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/api/setup")
  );
}

/**
 * Checks if a pathname is a public route or matches a localized/OAuth public route pattern.
 * @param pathname - The request URL pathname
 * @param testMode - Whether system is in test mode
 * @returns boolean - True if the route is public
 */
export function isPublicRoute(pathname: string, testMode = false): boolean {
  // 1. Prefix match against common public routes (fastest)
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) return true;

  if (testMode && pathname.startsWith("/api/testing")) return true;

  // Security and Auth Public Endpoints
  if (pathname === "/api/security/csp-report") return true;
  if (pathname === "/api/auth/saml/acs" || pathname === "/api/auth/saml/login") return true;

  // Public Token access (GET specific token validation)
  if (pathname.startsWith("/api/token/")) {
    const parts = pathname.split("/").filter(Boolean);
    if (parts.length === 3) {
      const action = parts[2];
      const reserved = ["list", "batch", "create-token", "resolve"];
      if (!reserved.includes(action)) {
        return true;
      }
    }
  }

  // 2. Localized routes (e.g. /en/login) + Precise OAuth flow detection
  return (
    /^\/[a-z]{2,5}(-[a-zA-Z]+)?\/(setup|login|register|forgot-password)/.test(pathname) ||
    (pathname.includes("/login?") && pathname.includes("OAuth"))
  );
}

/**
 * Applies standard security headers to a Headers object
 */
export function applySecurityHeaders(headers: Headers, isHttps: boolean) {
  for (const [key, value] of BASE_HEADERS) {
    headers.set(key, value);
  }

  if (isHttps) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  }
}

/**
 * Generates a standard restricted access response based on system state
 */
export function restrictedResponse(
  state: string,
  isApi: boolean,
  baseHeaders: Record<string, string>,
): Response {
  const message =
    state === "INITIALIZING" ? "System is initializing." : "System error or maintenance.";
  const status = 503;

  if (isApi) {
    return json({ error: message, state }, { status, headers: baseHeaders });
  }

  const html =
    state === "INITIALIZING"
      ? `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="2"><title>Initializing</title><style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f8fafc;color:#334155;} .loader{border:4px solid #e2e8f0;border-top:4px solid #3b82f6;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin-right:15px;} @keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}</style></head><body><div class="loader"></div><h2>System is starting up...</h2></body></html>`
      : `<!DOCTYPE html><html><head><title>System Maintenance</title></head><body><h2>${message}</h2></body></html>`;

  const headers = new Headers(baseHeaders);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Retry-After", "2");

  return new Response(html, { status, headers });
}

/**
 * Generates a standard boundary error response
 */
export function boundaryResponse(error: any, isHttps: boolean): Response {
  const status = error.status || 500;
  const message = error.message || "Internal Server Error";

  const headers = new Headers({ "Content-Type": "application/json" });
  applySecurityHeaders(headers, isHttps);

  return json({ error: message, code: error.code || "INTERNAL_ERROR" }, { status, headers });
}
