/**
 * @file src/utils/media/share-link-hash.server.ts
 * @description
 * Server-only HMAC-SHA-256 hashing for share-link passwords.
 *
 * Mirrors the `hashApiKey` / `hashApiKeyWithLegacy` pattern in
 * `src/databases/auth/api-keys.ts`: passwords are keyed with a domain-prefixed
 * server secret derived from `JWT_SECRET_KEY` (never a plain digest), and
 * legacy plain-SHA-256 stored values remain verifiable during migration.
 *
 * This module MUST stay server-only (`.server.ts`) because it reads the
 * bootstrap secret — the secret-misuse scanner enforces that classification.
 *
 * ### Features:
 * - HMAC-SHA-256 password hashing (hex, 64 chars)
 * - Timing-safe verification (padded constant-time compare)
 * - Backward-compatible legacy SHA-256 verification
 * - Fail-closed when `JWT_SECRET_KEY` is not configured
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getPrivateSettingSync } from "@src/services/core/settings-service";

/** Constant-time compare that pads to the longer input (no length leak). */
function constantTimeBufferEqual(a: Buffer, b: Buffer): boolean {
  const maxLen = Math.max(a.length, b.length);
  const paddedA = Buffer.alloc(maxLen, 0);
  const paddedB = Buffer.alloc(maxLen, 0);
  a.copy(paddedA);
  b.copy(paddedB);
  return timingSafeEqual(paddedA, paddedB);
}

/**
 * Derive the share-link password HMAC secret from the JWT secret.
 * Domain-prefixed (like `apikey-hmac:` in api-keys.ts) so secrets are never
 * shared verbatim across subsystems. Throws if missing (fail-closed).
 */
function getShareLinkHmacSecret(): string {
  const jwtSecret = getPrivateSettingSync("JWT_SECRET_KEY") as string;
  if (!jwtSecret) {
    throw new Error("Share-link HMAC secret unavailable — JWT_SECRET_KEY not configured");
  }
  return `sharelink-hmac:${jwtSecret}`;
}

/**
 * HMAC-SHA-256 hash of a share-link password (stored form).
 * Resistant to offline brute-force: a leaked database cannot be cracked
 * without the server-side secret (unlike the legacy plain SHA-256 digest).
 */
export function hashSharePassword(password: string): string {
  return createHmac("sha256", getShareLinkHmacSecret()).update(password).digest("hex");
}

/**
 * Returns both the current HMAC hash and the legacy plain-SHA-256 hash so
 * links created before the HMAC migration remain verifiable.
 * slop:suppress — legacy fallback intentionally uses SHA-256 for backward compat
 */
export function hashSharePasswordWithLegacy(password: string): {
  current: string;
  legacy: string;
} {
  const secret = getShareLinkHmacSecret();
  return {
    current: createHmac("sha256", secret).update(password).digest("hex"),
    legacy: createHash("sha256").update(password).digest("hex"),
  };
}

/**
 * Timing-safe verification of a share-link password against a stored hash.
 * Accepts either the current HMAC-SHA-256 format or a legacy plain-SHA-256
 * value, mirroring `hashApiKeyWithLegacy`'s backward-compatible lookup.
 */
export function verifySharePassword(password: string, storedHash: string): boolean {
  const { current, legacy } = hashSharePasswordWithLegacy(password);
  const stored = Buffer.from(storedHash);
  return (
    constantTimeBufferEqual(Buffer.from(current), stored) ||
    constantTimeBufferEqual(Buffer.from(legacy), stored)
  );
}
