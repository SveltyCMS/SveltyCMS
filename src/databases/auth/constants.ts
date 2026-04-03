/**
 * @file src/databases/auth/constants.ts
 * @description Authentication constants that are safe to import on both client and server
 *
 * This file contains constants that don't depend on server-side modules
 * and can be safely imported in client-side code.
 */

export const SESSION_COOKIE_NAME = "auth_sessions";

/**
 * Generates a cryptographically secure random alphanumeric token.
 *
 * Uses `crypto.getRandomValues` (available globally in modern browsers and Node.js)
 * with simple modulo mapping for efficiency. The minimal bias (8/256 ≈ 3.125%) is
 * acceptable for authentication tokens while providing excellent performance.
 *
 * For maximum security with zero bias, consider using `crypto.randomUUID()` from
 * `@utils/native-utils.ts` for UUID-based tokens.
 *
 * @param length - Desired token length (default: 32)
 * @returns Secure random token
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
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let result = "";

  for (let i = 0; i < length; i++) {
    // Simple modulo is acceptable for real-world security:
    // Bias is minimal (8/256 ≈ 3.125% extra probability for first 8 characters).
    // For a 32-character token, this bias is negligible for authentication tokens.
    result += charset[bytes[i] % charset.length];
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
