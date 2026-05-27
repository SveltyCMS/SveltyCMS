/**
 * @file src/databases/auth/constants.ts
 * @description Authentication constants that are safe to import on both client and server
 *
 * This file contains constants that don't depend on server-side modules
 * and can be safely imported in client-side code.
 */

export const SESSION_COOKIE_NAME = "auth_sessions";

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
