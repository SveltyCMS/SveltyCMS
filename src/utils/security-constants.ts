/**
 * @file src/utils/security-constants.ts
 * @description Standard security headers for SveltyCMS.
 * Extracted to a standalone file to prevent circular dependencies in the middleware pipeline.
 */

export const BASE_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "X-XSS-Protection": "1; mode=block",
  "X-DNS-Prefetch-Control": "off",
  "X-Permitted-Cross-Domain-Policies": "none",
};
