/**
 * @file src/hooks/handle-security-headers.ts
 * @description
 * Security headers middleware applying essential HTTP security headers for defense-in-depth.
 * Consolidates CORS, HSTS, and restrictive browser policies.
 *
 * Performance:
 * - Pre-calculated policy strings.
 * - Fast-exit for static assets.
 * - Leverages unified utility for base headers.
 */

import type { Handle } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { getCorsHeaders } from "@utils/security/cors-utils";
import { applySecurityHeaders, STATIC_ASSET_REGEX } from "@utils/hook-utils";

// ✨ PERFORMANCE: Pre-calculated to avoid string manipulation on every request
const PERMISSIONS_POLICY = [
  "geolocation=()",
  "microphone=()",
  "camera=()",
  "display-capture=()",
  "clipboard-read=()",
  "clipboard-write=(self)",
  "web-share=(self)",
].join(", ");

/**
 * SECURITY: Applies the full suite of security headers to a Headers object.
 * This is designed to be used by both the middleware hook and the global error guard.
 */
export function applyAllSecurityHeaders(
  headers: Headers,
  isHttps: boolean,
  origin: string | null,
  pathname: string,
) {
  // 1. Base security headers (X-Frame, X-Content-Type, Referrer, COOP, COEP, HSTS)
  applySecurityHeaders(headers, isHttps && !dev);

  // 2. Additional Hardening
  headers.set("X-XSS-Protection", "1; mode=block");
  headers.set("X-DNS-Prefetch-Control", "off");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("Permissions-Policy", PERMISSIONS_POLICY);

  // 3. Cross-Origin Isolation (prevents Spectre-style side-channel attacks)
  // API routes get stricter isolation; page routes get same-origin defaults
  if (pathname.startsWith("/api/")) {
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "require-corp");
    headers.set("Cross-Origin-Resource-Policy", "same-origin");
  }

  // 4. API-specific CORS
  if (pathname.startsWith("/api/")) {
    const corsHeaders = getCorsHeaders(origin, true);
    if (corsHeaders) {
      for (const [key, value] of Object.entries(corsHeaders)) {
        headers.set(key, value as string);
      }
    }
  }

  // 5. GraphQL playground needs relaxed CSP for inline scripts and external CDN resources
  if (pathname.startsWith("/api/graphql")) {
    headers.set(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
        "img-src 'self' data: blob: https://cdn.jsdelivr.net",
        "connect-src 'self' https://cdn.jsdelivr.net",
        "frame-src 'none'",
      ].join("; "),
    );
    headers.set("Cross-Origin-Embedder-Policy", "unsafe-none");
  } else {
    // 🛡️ Tightly-scoped CSP for all non-GraphQL routes.
    // No inline eval, no external script sources — prevents XSS at the browser level.
    headers.set(
      "Content-Security-Policy",
      [
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
      ].join("; "),
    );
  }
}

export const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
  const { url, request } = event;
  const pathname = url.pathname;

  // 1. PERFORMANCE: Fast-exit for static assets
  // (Note: handleTurboPipeline handles assets first, but we keep this for defense-in-depth)
  if (STATIC_ASSET_REGEX.test(pathname)) {
    return await resolve(event);
  }

  const response = await resolve(event);

  applyAllSecurityHeaders(
    response.headers,
    url.protocol === "https:",
    request.headers.get("Origin"),
    pathname,
  );

  return response;
};
