/**
 * @file src/utils/security/safe-redirect.ts
 * @description Safe redirect target validation utility preventing open redirects.
 *
 * Enforces that redirect targets are strictly internal relative paths (e.g. `/dashboard`),
 * blocking protocol-relative URLs (`//evil.com`), external URIs (`https://evil.com`),
 * and script payloads (`javascript:...`).
 */

import { logger } from "@utils/logger";

/**
 * Validates a redirect URL candidate and returns it only if it is a safe, internal relative path.
 * Otherwise returns the provided fallback URL.
 */
export function safeRedirect(raw: string | null | undefined, fallback: string): string {
  if (!raw || typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  // Safe relative paths start with '/' but NOT '//' (protocol-relative), and have no URI scheme
  if (
    trimmed.startsWith("/") &&
    !trimmed.startsWith("//") &&
    !trimmed.startsWith("/\\") &&
    !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
  ) {
    return trimmed;
  }
  logger.warn(`[SafeRedirect] Blocked unsafe redirect target: ${trimmed}`);
  return fallback;
}
