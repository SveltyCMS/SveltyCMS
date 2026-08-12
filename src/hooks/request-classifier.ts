/**
 * @file src/hooks/request-classifier.ts
 * @description
 * Ultra-Fast O(1) Environment-Aware Request Classifier for SveltyCMS.
 * Categorizes incoming HTTP requests into dedicated operational lanes:
 *
 * 1. FAST_STATIC: Static assets, favicon, robots.txt, sitemap.xml.
 * 2. HEALTH: Health check endpoints (/health, /api/system/health).
 * 3. HYPER_TURBO: Warm session GET/HEAD requests on cacheable API prefixes.
 * 4. API_READ: Public & authenticated GET/HEAD/OPTIONS API endpoints.
 * 5. API_WRITE: POST/PUT/PATCH/DELETE API endpoints (full CSRF & RBAC).
 * 6. APP_SSR: Admin application page rendering under /(app).
 * 7. BOOTSTRAP: Initial setup and authentication pages (/setup, /login).
 *
 * ### Features:
 * - exact cookie-name boundary matching (`(^|;\s*)<name>=`, case-insensitive)
 * - OPTIONS preflights are reads — never HYPER_TURBO, never API_WRITE
 * - locale-prefix normalization driven by the configured Paraglide locales
 */

import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import { locales } from "@src/paraglide/runtime";

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

/**
 * Exact cookie-name boundary match against a `Cookie` header value.
 *
 * Only `(^|;\s*)<name>=` counts — a cookie named `my_auth_sessions_extra` must
 * NOT match `auth_sessions`. Cookie names are case-sensitive per RFC 6265, so
 * the pattern is compiled WITHOUT the `i` flag (and must never gain a `g`
 * flag — a shared global regex carries `lastIndex` state between calls).
 *
 * The cache is bounded (FIFO eviction) as defense-in-depth: callers today
 * pass only module constants, but a stray runtime name must never grow the
 * map unboundedly.
 */
const COOKIE_PATTERN_CACHE_MAX = 16;

const cookiePatternCache = new Map<string, RegExp>();

function getCookiePattern(cookieName: string): RegExp {
  let pattern = cookiePatternCache.get(cookieName);
  if (pattern) return pattern;
  if (cookiePatternCache.size >= COOKIE_PATTERN_CACHE_MAX) {
    const oldest = cookiePatternCache.keys().next().value;
    if (oldest !== undefined) cookiePatternCache.delete(oldest);
  }
  const escapedName = cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  pattern = new RegExp(`(^|;\\s*)${escapedName}=`);
  cookiePatternCache.set(cookieName, pattern);
  return pattern;
}

function hasExactCookie(cookieHeader: string, cookieName: string): boolean {
  if (!cookieHeader) return false;
  // Fast-fail: indexOf is SIMD-optimized. If the name is absent entirely no
  // boundary match is possible, so the common anonymous-request path (no
  // session cookie) never touches the regex engine.
  if (!cookieHeader.includes(cookieName)) return false;
  return getCookiePattern(cookieName).test(cookieHeader);
}

/**
 * Matches a leading `/en/`, `/de`, … prefix built from the configured
 * Paraglide locales — never a generic `[a-z]{2}` (which would misclassify
 * public paths like /about or /blog as APP_SSR).
 */
const LOCALE_PREFIX_REGEX = new RegExp(
  `^/(?:${locales.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(/|$)`,
);

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
    const upperMethod = method.toUpperCase();
    if (upperMethod === "GET" || upperMethod === "HEAD" || upperMethod === "OPTIONS") {
      const cookie = headers.get("cookie") || "";
      // Must match production session cookie name (auth_sessions + Host/Secure prefixes).
      // Wrong names silently demote warm sessions to API_READ and disable turbo attribution.
      const hasSessionToken =
        headers.has("authorization") ||
        hasExactCookie(cookie, SESSION_COOKIE_NAME) ||
        hasExactCookie(cookie, `__Host-${SESSION_COOKIE_NAME}`) ||
        hasExactCookie(cookie, `__Secure-${SESSION_COOKIE_NAME}`);

      const isCacheable = CACHEABLE_PREFIXES.some(
        (prefix) => path === prefix || path.startsWith(prefix + "/"),
      );

      // OPTIONS preflights are never turbo-classified, but also never writes.
      if (hasSessionToken && isCacheable && upperMethod !== "OPTIONS") {
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
  const normalizedPath = path.replace(LOCALE_PREFIX_REGEX, "/");
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
