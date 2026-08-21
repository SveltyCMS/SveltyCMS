/**
 * @file src/databases/auth/api-keys.ts
 * @description Headless CMS API Key generation and utilities.
 */

import crypto from "node:crypto";
import { getPrivateSettingSync } from "@src/services/core/settings-service";

/** Memoized derived HMAC secret (JWT_SECRET_KEY is a static infrastructure key). */
let cachedHmacSecret: string | null = null;

/** Derive the HMAC secret from the JWT secret for API key hashing. */
function getHmacSecret(): string {
  if (cachedHmacSecret) return cachedHmacSecret;
  const jwtSecret = getPrivateSettingSync("JWT_SECRET_KEY") as string;
  if (!jwtSecret) throw new Error("HMAC secret unavailable — JWT_SECRET_KEY not configured");
  cachedHmacSecret = `apikey-hmac:${jwtSecret}`;
  return cachedHmacSecret;
}

/**
 * Test-only: drop the memoized HMAC secret so the next call re-reads
 * `JWT_SECRET_KEY` (e.g. when a test swaps the secret mid-suite).
 */
export function resetApiKeyHmacSecretCache(): void {
  cachedHmacSecret = null;
}

/**
 * Generates a new cryptographically secure API key.
 *
 * Includes:
 * - full: The raw API key string to present to the user exactly ONCE.
 * - prefix: The first 12 characters (e.g. "sck_a1b2c3d4") safe for UI display.
 * - hash: HMAC-SHA-256 of the full key (stored in the database, v2 format).
 */
export function generateApiKey(): {
  full: string;
  prefix: string;
  hash: string;
} {
  const base64UrlToken = crypto.randomBytes(48).toString("base64url");
  const key = `sck_${base64UrlToken}`;

  return {
    full: key,
    prefix: key.slice(0, 12),
    hash: hashApiKey(key),
  };
}

/**
 * Validates if an API Key format is structurally sound before hashing.
 */
export function isValidApiKeyFormat(key: string): boolean {
  return key.startsWith("sck_") && key.length > 30;
}

/**
 * Hashes an incoming API key from an HTTP request to look it up in the database.
 * v2: uses HMAC-SHA-256 with server secret (resistant to offline brute-force).
 * Legacy: plain SHA-256 for keys generated before the v2 migration.
 */
export function hashApiKey(key: string): string {
  const secret = getHmacSecret();
  return crypto.createHmac("sha256", secret).update(key).digest("base64url");
}

/**
 * For DB lookups: returns both the v2 HMAC hash and the legacy SHA-256 hash
 * so existing keys continue to work during migration.
 * slop:suppress — legacy fallback intentionally uses SHA-256 for backward compat
 */
export function hashApiKeyWithLegacy(key: string): { current: string; legacy: string } {
  const secret = getHmacSecret();
  return {
    current: crypto.createHmac("sha256", secret).update(key).digest("base64url"),
    legacy: crypto.createHash("sha256").update(key).digest("base64url"),
  };
}

/**
 * Legacy plain SHA-256 hash (pre-v2 migration keys).
 * Only compute this when the current HMAC lookup misses — hot authentication
 * paths should never pay for the legacy digest.
 * slop:suppress — legacy fallback intentionally uses SHA-256 for backward compat
 */
export function hashApiKeyLegacy(key: string): string {
  return crypto.createHash("sha256").update(key).digest("base64url");
}
