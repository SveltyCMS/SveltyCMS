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

import { randomBytes, scryptSync } from "node:crypto";
import { getPrivateSettingSync } from "@src/services/core/settings-service";
import { constantTimeBufferEqual } from "@utils/security/constant-time";

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
  const pepper = Buffer.from(getShareLinkPepper());
  const derived = scryptSync(password, Buffer.concat([salt, pepper]), SCRYPT_KEY_LENGTH);
  try {
    return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
  } finally {
    // Ephemeral key material: never leave the derived digest or pepper in the heap.
    derived.fill(0);
    pepper.fill(0);
  }
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
    let pepper: Buffer | undefined;
    let expected: Buffer | undefined;
    let derived: Buffer | undefined;
    try {
      pepper = Buffer.from(getShareLinkPepper());
      expected = Buffer.from(hashHex!, "hex");
      derived = scryptSync(
        password,
        Buffer.concat([Buffer.from(saltHex!, "hex"), pepper]),
        SCRYPT_KEY_LENGTH,
      );
      return constantTimeBufferEqual(derived, expected);
    } catch {
      return false;
    } finally {
      derived?.fill(0);
      pepper?.fill(0);
      expected?.fill(0);
    }
  }

  // Legacy format: one 64-char hex digest keyed with the old static salt.
  if (LEGACY_HASH_PATTERN.test(storedHash)) {
    let pepper: Buffer | undefined;
    let expected: Buffer | undefined;
    let derived: Buffer | undefined;
    try {
      pepper = Buffer.from(getShareLinkPepper());
      expected = Buffer.from(storedHash, "hex");
      derived = scryptSync(password, pepper, SCRYPT_KEY_LENGTH);
      return constantTimeBufferEqual(derived, expected);
    } catch {
      return false;
    } finally {
      derived?.fill(0);
      pepper?.fill(0);
      expected?.fill(0);
    }
  }

  return false;
}
