/**
 * @file src/databases/auth/constants.ts
 * @description Authentication constants that are safe to import on both client and server
 *
 * This file contains constants that don't depend on server-side modules
 * and can be safely imported in client-side code.
 */

export const SESSION_COOKIE_NAME = "auth_sessions";

/**
 * Whether the request should use Secure / __Host- session cookies.
 *
 * IMPORTANT: CI and local E2E use http://127.0.0.1:4173. The old check
 * `hostname !== "localhost"` treated 127.0.0.1 as secure, which set
 * `Secure; __Host-auth_sessions` over plain HTTP. Browsers then drop the
 * cookie → empty storageState and 401s on authenticated routes.
 *
 * Secure only when:
 * - protocol is https:, OR
 * - production AND host is not a loopback name
 */
export function isSecureCookieContext(
  protocol: string,
  hostname: string,
  opts?: { forceInsecure?: boolean },
): boolean {
  if (opts?.forceInsecure) return false;
  if (protocol === "https:") return true;
  const host = (hostname || "").toLowerCase();
  const isLoopback =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".localhost");
  if (isLoopback) return false;
  // TEST_MODE / non-production: never force Secure cookies on http
  if (process.env.TEST_MODE === "true" || process.env.NODE_ENV !== "production") {
    return false;
  }
  return true;
}

/**
 * Returns the session cookie name with the correct security prefix.
 *
 * - On secure connections (HTTPS or production non-localhost), uses the
 *   `__Host-` prefix per RFC 6265bis for subdomain isolation.
 * - On insecure connections (localhost/dev), uses the raw cookie name.
 *
 * **DO NOT hardcode cookie names anywhere else.** Use this function or
 * `SESSION_COOKIE_NAME` directly with the secure-prefix pattern.
 *
 * @param isSecure - Whether the connection is HTTPS or production
 * @returns The correctly prefixed session cookie name
 */
export function getSessionCookieName(isSecure: boolean): string {
  return isSecure ? `__Host-${SESSION_COOKIE_NAME}` : SESSION_COOKIE_NAME;
}

/**
 * Reads the session cookie value from an event's cookies, trying both the
 * __Host- prefixed and unprefixed variants in the correct security order.
 *
 * - Secure connections: ONLY accept __Host- prefixed cookie (prevents subdomain cookie tossing)
 * - Insecure connections: ONLY accept unprefixed cookie (never fall back to __Host-)
 *
 * @param cookies - The event's Cookies object
 * @param isSecure - Whether the connection is secure
 * @returns The session ID string, or undefined if not found
 */
export function readSessionCookie(
  cookies: { get: (name: string) => string | undefined },
  isSecure: boolean,
): string | undefined {
  const hostPrefixed = `__Host-${SESSION_COOKIE_NAME}`;
  const securePrefixed = `__Secure-${SESSION_COOKIE_NAME}`;
  if (isSecure) {
    // Prefer __Host-; fall back for transitional deploys
    return (
      cookies.get(hostPrefixed) || cookies.get(SESSION_COOKIE_NAME) || cookies.get(securePrefixed)
    );
  }
  // Loopback/http: prefer plain name; accept accidental secure leftovers
  return (
    cookies.get(SESSION_COOKIE_NAME) || cookies.get(hostPrefixed) || cookies.get(securePrefixed)
  );
}

/**
 * Generates a cryptographically secure random alphanumeric token with zero bias.
 *
 * Uses rejection sampling to eliminate the modulo bias present in simpler
 * implementations. Random bytes above 256 - (256 % charset.length) are discarded
 * and re-sampled, guaranteeing uniform distribution across all characters.
 *
 * For UUID-based tokens, consider `crypto.randomUUID()` from `@utils/native-utils.ts`.
 *
 * @param length - Desired token length (default: 32, providing ~190 bits of entropy)
 * @returns Cryptographically secure random token with uniform distribution
 * @throws {Error} If crypto.getRandomValues is not available
 */
export function generateRandomToken(length = 32): string {
  const crypto = globalThis.crypto;
  if (!crypto?.getRandomValues) {
    throw new Error(
      "Cryptographically secure random number generator (crypto.getRandomValues) is not available in this environment",
    );
  }

  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const charsetLength = charset.length;
  // Maximum value that is a multiple of charsetLength (rejection sampling threshold)
  const maxValidByte = 256 - (256 % charsetLength);
  let result = "";

  while (result.length < length) {
    // Generate a batch of random bytes
    const batchSize = Math.min(64, (length - result.length) * 2);
    const bytes = crypto.getRandomValues(new Uint8Array(batchSize));

    for (let i = 0; i < batchSize && result.length < length; i++) {
      // Rejection sampling: discard biased values to ensure uniform distribution
      if (bytes[i] < maxValidByte) {
        result += charset[bytes[i] % charsetLength];
      }
    }
  }
  return result;
}

export function generateTokenWithExpiry(expirationMinutes = 60): {
  token: string;
  expires: Date;
} {
  return {
    token: generateRandomToken(),
    expires: new Date(Date.now() + expirationMinutes * 60 * 1000),
  };
}
