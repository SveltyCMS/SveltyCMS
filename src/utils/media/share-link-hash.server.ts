/**
 * @file src/utils/media/share-link-hash.server.ts
 * @description
 * Server-only scrypt hashing for share-link passwords.
 *
 * Every link gets a fresh 16-byte CSPRNG salt, mixed with a domain-prefixed
 * server pepper derived from `JWT_SECRET_KEY`. The pepper means a leaked
 * database alone cannot be cracked offline; the per-link salt means two links
 * with the same password do not share a hash.
 *
 * Legacy links created before the per-link-salt migration stored a 64-char hex
 * digest with the old static salt. They remain verifiable until their 24 h TTL
 * expires, then the fallback can be removed.
 *
 * This module MUST stay server-only (`.server.ts`) because it reads the
 * bootstrap secret — the secret-misuse scanner enforces that classification.
 *
 * ### Features:
 * - scrypt with a per-link random salt + server pepper
 * - Timing-safe verification (padded constant-time compare)
 * - Legacy static-salt verification for expired-format links
 * - Fail-closed when `JWT_SECRET_KEY` is not configured
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
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
 * Server pepper for share-link passwords. Domain-prefixed so a leaked JWT
 * secret is never reused verbatim across subsystems. Throws when missing.
 */
function getShareLinkPepper(): string {
  const jwtSecret = getPrivateSettingSync("JWT_SECRET_KEY") as string;
  if (!jwtSecret) {
    throw new Error("Share-link password pepper unavailable — JWT_SECRET_KEY not configured");
  }
  return `sharelink-hmac:${jwtSecret}`;
}

const SCRYPT_KEY_LENGTH = 32;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_HASH_PATTERN = /^scrypt\$([0-9a-f]{32})\$([0-9a-f]{64})$/i;
const LEGACY_HASH_PATTERN = /^[0-9a-f]{64}$/i;

/**
 * scrypt with a per-link random salt and the server pepper (stored form).
 * Format: `scrypt$<saltHex>$<hashHex>`.
 */
export function hashSharePassword(password: string): string {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = scryptSync(
    password,
    Buffer.concat([salt, Buffer.from(getShareLinkPepper())]),
    SCRYPT_KEY_LENGTH,
  );
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/**
 * Timing-safe verification. Accepts the current per-link-salt format and the
 * legacy static-salt 64-hex digest used by links created before the migration.
 */
export function verifySharePassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;

  const current = SCRYPT_HASH_PATTERN.exec(storedHash);
  if (current) {
    const [, saltHex, hashHex] = current;
    try {
      const derived = scryptSync(
        password,
        Buffer.concat([Buffer.from(saltHex!, "hex"), Buffer.from(getShareLinkPepper())]),
        SCRYPT_KEY_LENGTH,
      );
      return constantTimeBufferEqual(derived, Buffer.from(hashHex!, "hex"));
    } catch {
      return false;
    }
  }

  // Legacy format: one 64-char hex digest keyed with the old static salt.
  if (LEGACY_HASH_PATTERN.test(storedHash)) {
    try {
      const derived = scryptSync(password, getShareLinkPepper(), SCRYPT_KEY_LENGTH);
      return constantTimeBufferEqual(derived, Buffer.from(storedHash, "hex"));
    } catch {
      return false;
    }
  }

  return false;
}
