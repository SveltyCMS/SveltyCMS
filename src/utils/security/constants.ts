/**
 * @file src/utils/security/constants.ts
 * @description Standard security headers for SveltyCMS.
 * Extracted to a standalone file to prevent circular dependencies in the middleware pipeline.
 *
 * Page routes get no CSP from this code: `vite.config.ts` defines no `csp` config, so
 * SvelteKit's default `mode: "auto"` runs with empty `directives` and emits no header
 * (no nonce is generated anywhere). `applyAllSecurityHeaders()` in
 * `src/hooks/handle-security-headers.ts` copies a SvelteKit-set page CSP through and sets
 * the API/GraphQL policies.
 * Do NOT set Content-Security-Policy in BASE_HEADERS — middleware must not clobber it.
 */

/** Strict CSP for JSON/API responses (no inline scripts). */
export const API_CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; media-src 'self'; frame-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

/** Required for /files/ assets to load under COEP require-corp admin pages. */
export const MEDIA_RESOURCE_HEADERS: Record<string, string> = {
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
};

export const BASE_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Permissions-Policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=()",
  "X-DNS-Prefetch-Control": "off",
  "X-Permitted-Cross-Domain-Policies": "none",
};
