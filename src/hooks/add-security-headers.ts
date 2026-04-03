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
import { getPrivateSettingSync } from "@src/services/settings-service";

export const addSecurityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

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
  const corsEnabled = getPrivateSettingSync("CORS_ENABLED");
  if (corsEnabled && event.url.pathname.startsWith("/api/")) {
    const allowedOrigins = getPrivateSettingSync("CORS_ALLOWED_ORIGINS") || [];
    const requestOrigin = event.request.headers.get("Origin");

    // Default to same-origin if no origin match
    let allowOrigin = "null";

    if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
      allowOrigin = requestOrigin;
    } else if (allowedOrigins.includes("*")) {
      allowOrigin = "*";
    }

    if (allowOrigin !== "null") {
      response.headers.set("Access-Control-Allow-Origin", allowOrigin);

      if (getPrivateSettingSync("CORS_ALLOW_CREDENTIALS") && allowOrigin !== "*") {
        response.headers.set("Access-Control-Allow-Credentials", "true");
      }

      const allowedMethods = getPrivateSettingSync("CORS_ALLOWED_METHODS") || [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
      ];
      response.headers.set("Access-Control-Allow-Methods", allowedMethods.join(", "));

      const allowedHeaders = getPrivateSettingSync("CORS_ALLOWED_HEADERS") || [
        "Content-Type",
        "Authorization",
      ];
      response.headers.set("Access-Control-Allow-Headers", allowedHeaders.join(", "));

      const maxAge = getPrivateSettingSync("CORS_MAX_AGE") || 86400;
      response.headers.set("Access-Control-Max-Age", String(maxAge));

      // Expose additional headers if needed
      response.headers.set(
        "Access-Control-Expose-Headers",
        "Content-Length, Content-Range, X-Total-Count",
      );
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
