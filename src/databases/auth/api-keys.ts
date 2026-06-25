/**
 * @file src/databases/auth/api-keys.ts
 * @description Headless CMS API Key generation and utilities.
 */

import crypto from "node:crypto";
import { generateSecureToken } from "@src/utils/native-utils";

/**
 * Generates a new cryptographically secure API key.
 *
 * Includes:
 * - full: The raw API key string to present to the user exactly ONCE.
 * - prefix: The first 12 characters (e.g. "sck_a1b2c3d4") safe for UI display.
 * - hash: The SHA-256 hash of the full key (stored in the database).
 */
export function generateApiKey(): {
  full: string;
  prefix: string;
  hash: string;
} {
  // SveltyCMS Key ("sck_") + 48 bytes of entropy (approx 64 characters)
  const randomHex = generateSecureToken(48); // We use the existing crypto token util

  // Convert hex to base64url to match the required format and density
  const randomBytes = Buffer.from(randomHex, "hex");
  const base64UrlToken = randomBytes.toString("base64url");

  const key = `sck_${base64UrlToken}`;

  return {
    full: key,
    prefix: key.slice(0, 12),
    hash: crypto.createHash("sha256").update(key).digest("base64url"),
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
 */
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("base64url");
}
