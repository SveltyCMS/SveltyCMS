/**
 * @file src/utils/cookie-utils.ts
 * @description Hardened cookie parsing utility for authentication bridges.
 *
 * ### Hardening (audit 2026-07):
 * - Prototype pollution protection: Object.create(null) + explicit key blocking
 * - Strict type check: typeof guard prevents runtime errors on non-string input
 * - Trim before split: cleaner pair processing
 *
 * Standardized cookie parsing utilities for SveltyCMS (WebSocket auth bridge).
 */

/**
 * 🛡️ Hardened: Parses cookie header with protection against prototype pollution
 * and malicious key collision.
 */
export function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
  if (!cookieHeader || typeof cookieHeader !== "string") return Object.create(null);

  const cookies: Record<string, string> = Object.create(null);
  let start = 0;
  const len = cookieHeader.length;

  while (start < len) {
    let end = cookieHeader.indexOf(";", start);
    if (end === -1) end = len;

    const splitIndex = cookieHeader.indexOf("=", start);
    if (splitIndex !== -1 && splitIndex < end) {
      const key = cookieHeader.slice(start, splitIndex).trim();
      const value = cookieHeader.slice(splitIndex + 1, end).trim();

      // 🛡️ Ignore internal prototype keys to prevent pollution
      if (key && value && key !== "__proto__" && key !== "constructor" && key !== "prototype") {
        try {
          cookies[key] = decodeURIComponent(value);
        } catch {
          cookies[key] = value;
        }
      }
    }
    start = end + 1;
  }

  return cookies;
}
