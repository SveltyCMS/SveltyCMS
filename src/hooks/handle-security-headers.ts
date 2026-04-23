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

export const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
  const { url, request } = event;
  const pathname = url.pathname;

  // 1. PERFORMANCE: Fast-exit for static assets
  // (Note: handleTurboPipeline handles assets first, but we keep this for defense-in-depth)
  if (STATIC_ASSET_REGEX.test(pathname)) {
    return await resolve(event);
  }

  const response = await resolve(event);
  const isHttps = url.protocol === "https:";
  const origin = request.headers.get("Origin");

  // 2. SECURITY: Apply unified base headers (X-Frame, X-Content-Type, Referrer, COOP, COEP)
  // applySecurityHeaders also handles HSTS logic internally.
  applySecurityHeaders(response.headers, isHttps && !dev);

  // 3. SECURITY: Additional Hardening
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  response.headers.set("Permissions-Policy", PERMISSIONS_POLICY);

  // 4. SECURITY/PERFORMANCE: API-specific CORS
  if (pathname.startsWith("/api/")) {
    const corsHeaders = getCorsHeaders(origin, true);
    if (corsHeaders) {
      for (const [key, value] of Object.entries(corsHeaders)) {
        response.headers.set(key, value as string);
      }
    }
  }

  return response;
};
