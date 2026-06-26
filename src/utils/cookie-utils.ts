/**
 * @file src/utils/cookie-utils.ts
 * @description Standardized cookie parsing utilities for SveltyCMS (WebSocket auth bridge).
 */

/**
 * Parses a standard Cookie header string into a key-value object.
 * This is used to unify authentication logic across standard HTTP and WebSocket upgrades.
 *
 * @param cookieHeader - The raw 'cookie' header string from the request.
 * @returns An object containing the parsed cookies.
 */
export function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
  if (!cookieHeader) return {};

  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(";");

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const splitIndex = pair.indexOf("=");

    if (splitIndex === -1) continue;

    const key = pair.slice(0, splitIndex).trim();
    const value = pair.slice(splitIndex + 1).trim();

    if (key && value) {
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        // Fallback for malformed URI components
        cookies[key] = value;
      }
    }
  }

  return cookies;
}
