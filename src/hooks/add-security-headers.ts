/**
 * @file src/hooks/add-security-headers.ts
 * @description Security headers middleware with essential HTTP security headers
 *
 * ### Security Headers Applied
 * - **X-Frame-Options**: Prevents clickjacking attacks
 * - **X-Content-Type-Options**: Prevents MIME-sniffing vulnerabilities
 * - **Referrer-Policy**: Controls referrer information leakage
 * - **Permissions-Policy**: Restricts browser feature access
 * - **Strict-Transport-Security**: Enforces HTTPS in production
 *
 * ### CSP Handling
 * - Content Security Policy is managed by SvelteKit's built-in CSP system
 * - Configured in svelte.config.js for optimal nonce-based protection
 *
 * ### Performance
 * - Static assets are handled by handleStaticAssetCaching middleware (runs earlier)
 * - Minimal overhead as headers are only set for dynamic responses
 *
 * @prerequisite Static asset handling done by earlier middleware
 */

import type { Handle } from "@sveltejs/kit";
import { dev } from "$app/environment";
import { getCorsHeaders } from "@utils/security/cors-utils";

export const addSecurityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  const { url, request } = event;
  const pathname = url.pathname;
  const origin = request.headers.get("Origin");

  // Static assets are already handled by handleStaticAssetCaching middleware

  // Basic security headers (SvelteKit handles CSP via svelte.config.js)
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Cross-Origin Isolation (Essential for WebGPU / SharedArrayBuffer / WASM performance)
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Embedder-Policy", "credentialless");

  response.headers.set(
    "Permissions-Policy",
    [
      "geolocation=()",
      "microphone=()",
      "camera=()",
      "display-capture=()",
      "clipboard-read=()",
      "clipboard-write=(self)",
      "web-share=(self)",
    ].join(", "),
  );

  // --- Configurable CORS for API endpoints (headless CMS support) ---
  if (pathname.startsWith("/api/")) {
    const isApiRoute = true; // confirmed by pathname check
    const corsHeaders = getCorsHeaders(origin, isApiRoute);

    if (corsHeaders) {
      for (const [key, value] of Object.entries(corsHeaders)) {
        response.headers.set(key, value as string);
      }
    }
  }

  // HTTPS-only headers for production (CRITICAL: Fixed from 'httpss:' typo)
  if (!dev && event.url.protocol === "https:") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
  }

  return response;
};
