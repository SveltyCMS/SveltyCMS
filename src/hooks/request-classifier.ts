/**
 * @file src/hooks/request-classifier.ts
 * @description
 * Ultra-Fast O(1) Environment-Aware Request Classifier for SveltyCMS.
 * Categorizes incoming HTTP requests into dedicated operational lanes:
 *
 * 1. FAST_STATIC: Static assets, favicon, robots.txt, sitemap.xml.
 * 2. HEALTH: Health check endpoints (/health, /api/system/health).
 * 3. HYPER_TURBO: Warm session GET requests on cacheable API prefixes.
 * 4. API_READ: Public & authenticated GET/HEAD API endpoints.
 * 5. API_WRITE: POST/PUT/PATCH/DELETE API endpoints (full CSRF & RBAC).
 * 6. APP_SSR: Admin application page rendering under /(app).
 * 7. BOOTSTRAP: Initial setup and authentication pages (/setup, /login).
 */

import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";

export enum RequestLane {
  FAST_STATIC = "FAST_STATIC",
  HEALTH = "HEALTH",
  HYPER_TURBO = "HYPER_TURBO",
  API_READ = "API_READ",
  API_WRITE = "API_WRITE",
  APP_SSR = "APP_SSR",
  BOOTSTRAP = "BOOTSTRAP",
  FILES = "FILES",
  PUBLIC_SITE = "PUBLIC_SITE",
}

export const CACHEABLE_PREFIXES = [
  "/api/collections",
  "/api/content",
  "/api/settings",
  "/api/system",
  "/api/schema",
  "/api/navigation",
  "/api/themes",
  "/api/config",
  "/api/media",
  "/api/widgets",
  "/api/roles",
  "/api/permission",
  "/api/automations",
  "/api/website-tokens",
  "/api/dashboard",
  "/api/webhooks",
  "/api/workflows",
  "/api/api-keys",
  "/api/graphql",
];

const ADMIN_APP_PREFIXES = [
  "/admin",
  "/dashboard",
  "/config",
  "/mediagallery",
  "/user",
  "/plugin",
  "/content",
  "/collections",
  "/settings",
  "/api-keys",
  "/webhooks",
  "/workflows",
  "/roles",
];

export function classifyRequest(url: URL, method: string, headers: Headers): RequestLane {
  const path = url.pathname;

  // 1. FAST_STATIC lane (O(1) direct string matches & static extensions)
  if (
    path === "/favicon.ico" ||
    path === "/robots.txt" ||
    path === "/sitemap.xml" ||
    path.startsWith("/_app/") ||
    path.startsWith("/static/")
  ) {
    return RequestLane.FAST_STATIC;
  }

  // 2. FILES lane (media storage downloads)
  if (path.startsWith("/files/") || path.startsWith("/media/")) {
    return RequestLane.FILES;
  }

  // 3. HEALTH lane
  if (path === "/health" || path === "/api/system/health") {
    return RequestLane.HEALTH;
  }

  // 4. API lanes
  if (path.startsWith("/api/")) {
    if (method === "GET" || method === "HEAD") {
      const cookie = headers.get("cookie") || "";
      // Must match production session cookie name (auth_sessions + Host/Secure prefixes).
      // Wrong names silently demote warm sessions to API_READ and disable turbo attribution.
      const hasSessionToken =
        headers.has("authorization") ||
        cookie.includes(SESSION_COOKIE_NAME) ||
        cookie.includes(`__Host-${SESSION_COOKIE_NAME}`) ||
        cookie.includes(`__Secure-${SESSION_COOKIE_NAME}`);

      const isCacheable = CACHEABLE_PREFIXES.some(
        (prefix) => path === prefix || path.startsWith(prefix + "/"),
      );

      if (hasSessionToken && isCacheable) {
        return RequestLane.HYPER_TURBO;
      }
      return RequestLane.API_READ;
    }
    return RequestLane.API_WRITE;
  }

  // 5. BOOTSTRAP lane
  if (path.startsWith("/setup") || path.startsWith("/login") || path.startsWith("/auth")) {
    return RequestLane.BOOTSTRAP;
  }

  // 6. PUBLIC_SITE vs APP_SSR (handles optional /en/ /de/ locale prefix)
  const normalizedPath = path.replace(/^\/[a-z]{2}(\/|$)/, "/");
  const isAdminRoute =
    normalizedPath === "/" ||
    ADMIN_APP_PREFIXES.some(
      (prefix) => normalizedPath === prefix || normalizedPath.startsWith(prefix + "/"),
    );

  if (isAdminRoute) {
    return RequestLane.APP_SSR;
  }

  return RequestLane.PUBLIC_SITE;
}
