/**
 * @file src/hooks/handle-security-headers.ts
 * @description
 * Hardened security headers utility (CORS + CSP + isolation headers).
 *
 * ### Features:
 * - CSP (page vs API vs GraphQL playground)
 * - CORS allowlist via getCorsHeaders (never reflect Origin blindly)
 * - COOP/COEP/CORP for API isolation
 * - Permissions-Policy lockdown
 * - deduplicated Vary header (case-insensitive token merge)
 *
 * The `applyAllSecurityHeaders()` utility is called inline from
 * `handleTurboPipeline`, `handleTurboGet`, the rate-limit 429 path, and the
 * top-level error guard in hooks.server.ts. There is intentionally no standalone
 * Handle — the header set is always merged onto the already-produced response.
 */

import { getCorsHeaders } from "@utils/security/cors-utils";
import { API_CONTENT_SECURITY_POLICY } from "@utils/security/constants";
import { applySecurityHeaders } from "@utils/hook-utils";

const PERMISSIONS_POLICY = [
  "geolocation=()",
  "microphone=()",
  "camera=()",
  "display-capture=()",
  "clipboard-read=()",
  "clipboard-write=(self)",
  "web-share=(self)",
].join(", ");

const STATIC_COMMON_HEADERS: readonly [string, string][] = [
  ["X-XSS-Protection", "1; mode=block"],
  ["X-DNS-Prefetch-Control", "off"],
  ["X-Permitted-Cross-Domain-Policies", "none"],
  ["Permissions-Policy", PERMISSIONS_POLICY],
];

const STATIC_API_ISOLATION_HEADERS: readonly [string, string][] = [
  ["Cross-Origin-Opener-Policy", "same-origin"],
  ["Cross-Origin-Resource-Policy", "same-origin"],
];

const GRAPHQL_PLAYGROUND_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https://cdn.jsdelivr.net",
  "connect-src 'self' https://cdn.jsdelivr.net",
  "frame-src 'none'",
].join("; ");

const GRAPHQL_PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/**
 * Appends a `Vary` token only when the exact token (case-insensitive) is not
 * already present, preventing duplicates like `Vary: Origin, Origin` when a
 * downstream layer already added the same token.
 */
function addVaryHeader(headers: Headers, value: string): void {
  const current = headers.get("Vary");
  if (!current) {
    headers.set("Vary", value);
    return;
  }
  const target = value.toLowerCase();
  if (current.toLowerCase().includes(target)) {
    return;
  }
  headers.set("Vary", `${current}, ${value}`);
}

export function applyAllSecurityHeaders(
  headers: Headers,
  isHttps: boolean,
  origin: string | null,
  pathname: string,
) {
  const isApi = pathname.startsWith("/api/");
  const isPageRoute = !isApi;
  const svelteKitCsp = isPageRoute ? headers.get("Content-Security-Policy") : null;

  applySecurityHeaders(headers, isHttps);

  for (let i = 0; i < STATIC_COMMON_HEADERS.length; i++) {
    const pair = STATIC_COMMON_HEADERS[i];
    headers.set(pair[0], pair[1]);
  }

  if (isPageRoute) {
    headers.set("X-AEO-Enabled", "true");
  }

  if (isApi) {
    for (let i = 0; i < STATIC_API_ISOLATION_HEADERS.length; i++) {
      const pair = STATIC_API_ISOLATION_HEADERS[i];
      headers.set(pair[0], pair[1]);
    }
    // Cross-Origin Isolation: use credentialless for media routes to avoid third-party asset breakage
    if (pathname.startsWith("/api/media/") || pathname.includes("/mediagallery")) {
      headers.set("Cross-Origin-Embedder-Policy", "credentialless");
    } else {
      headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    }

    const corsHeaders = getCorsHeaders(origin, true);
    if (corsHeaders) {
      for (const key in corsHeaders) {
        if (Object.prototype.hasOwnProperty.call(corsHeaders, key)) {
          headers.set(key, corsHeaders[key]);
        }
      }
    }
    addVaryHeader(headers, "Origin");
  }

  if (pathname.startsWith("/api/graphql")) {
    const isProduction = process.env.NODE_ENV === "production";
    const allowPlayground = !isProduction && process.env.ALLOW_GRAPHQL_PLAYGROUND !== "false";
    if (allowPlayground) {
      headers.set("Content-Security-Policy", GRAPHQL_PLAYGROUND_CSP);
      headers.set("Cross-Origin-Embedder-Policy", "unsafe-none");
    } else {
      headers.set("Content-Security-Policy", GRAPHQL_PROD_CSP);
    }
  } else if (isApi) {
    headers.set("Content-Security-Policy", API_CONTENT_SECURITY_POLICY);
  } else if (svelteKitCsp) {
    headers.set("Content-Security-Policy", svelteKitCsp);
  }
}
