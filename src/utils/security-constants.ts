/**
 * @file src/utils/security-constants.ts
 * @description Standard security headers for SveltyCMS.
 * Extracted to a standalone file to prevent circular dependencies in the middleware pipeline.
 */

export const BASE_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline' https://*.iconify.design; img-src 'self' data: blob: https://*.iconify.design https://*.simplesvg.com https://*.unisvg.com https://placehold.co https://api.qrserver.com https://github.com https://raw.githubusercontent.com; font-src 'self' data:; connect-src 'self' ws: wss: https://*.iconify.design https://*.simplesvg.com https://*.unisvg.com https://code.iconify.design https://raw.githubusercontent.com; media-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
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
