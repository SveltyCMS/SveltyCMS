/**
 * @file src/utils/media/share-link-hash.server.ts
 * @description
 * Server-only HMAC-SHA-256 hashing for share-link passwords.
 *
 * Passwords are keyed with a domain-prefixed server secret derived from
 * `JWT_SECRET_KEY` (never a plain digest). The pre-HMAC plain-SHA-256 scheme
 * was removed in 2026-08 — share links created before that migration have
 * expired (default 24 h TTL), so no dual-read fallback remains.
 *
 * This module MUST stay server-only (`.server.ts`) because it reads the
 * bootstrap secret — the secret-misuse scanner enforces that classification.
 *
 * ### Features:
 * - HMAC-SHA-256 password hashing (hex, 64 chars)
 * - Timing-safe verification (padded constant-time compare)
 * - Fail-closed when `JWT_SECRET_KEY` is not configured
 */

import { createHmac, timingSafeEqual } from "node:crypto";
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
  // codeql[js/insufficient-password-hash]: HMAC-SHA-256 with server secret (not unsalted SHA-256); login passwords are Argon2id
  return createHmac("sha256", getShareLinkHmacSecret()).update(password).digest("hex");
}

/**
 * Timing-safe verification of a share-link password against the stored HMAC.
 * Every link created since the HMAC migration stores `hashSharePassword`; the
 * pre-HMAC plain-SHA-256 scheme was removed with the legacy links (24 h TTL).
 */
export function verifySharePassword(password: string, storedHash: string): boolean {
  return constantTimeBufferEqual(Buffer.from(hashSharePassword(password)), Buffer.from(storedHash));
}
