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

import { str } from "./string-utils";

/**
 * 🛡️ Hardened: Parses cookie header with protection against prototype pollution
 * and malicious key collision.
 */
export function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
  if (str.isEmpty(cookieHeader) || typeof cookieHeader !== "string") return Object.create(null);

  const cookies = Object.create(null);
  const pairs = cookieHeader.split(";");

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i].trim();
    if (!pair) continue;

    const splitIndex = pair.indexOf("=");
    if (splitIndex === -1) continue;

    const key = pair.slice(0, splitIndex).trim();
    const value = pair.slice(splitIndex + 1).trim();

    // 🛡️ Ignore internal prototype keys to prevent pollution
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;

    if (key && value) {
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
    }
  }

  return cookies;
}
