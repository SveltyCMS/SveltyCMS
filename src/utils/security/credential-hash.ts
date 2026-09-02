/**
 * @file src/utils/security/credential-hash.ts
 * @description SHA-256 hashing for stored API credentials (website tokens, share links).
 *
 * Uses Web Crypto for edge/Bun/Node portability. Hex encoding preserves stable,
 * case-normalized DB lookups across all database adapters.
 *
 * ### Features:
 * - portable Web Crypto digest
 * - hex-encoded output for indexed equality lookups
 * - sync server-side digest for auth middleware hot paths
 *
 * ### Security model:
 * Inputs are CSPRNG website tokens / API keys (`generateSecureToken(32)`,
 * 256-bit entropy) stored and looked up by digest — the GitHub token-hash
 * pattern. Unsalted SHA-256 is sound for equality lookup of high-entropy
 * random tokens; it is NOT a password KDF (login passwords are Argon2id).
 */

// Use createRequire for sync node:crypto access to avoid Vite browser warnings.
// This runs once at module init and is only used in server-side code.
import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);
const { createHash: _createHash } = _require("node:crypto");
const HEX_TABLE = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

function bytesToSha256Hex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += HEX_TABLE[bytes[i]];
  }
  return hex;
}

/**
 * Hashes a credential string with SHA-256 (hex). Use for storage and lookup only —
 * never log or cache the plaintext input.
 *
 * Uses Web Crypto API — portable across Node, Bun, and edge runtimes.
 */
export async function hashCredentialSha256Hex(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return bytesToSha256Hex(new Uint8Array(hash));
}

/**
 * Sync SHA-256 (hex) for server middleware — avoids double-hashing on auth hot paths.
 */
export function hashCredentialSha256HexSync(value: string): string {
  // codeql[js/insufficient-password-hash]: high-entropy CSPRNG token equality
  // lookup (GitHub-style digest), not a password KDF — login is Argon2id.
  return _createHash("sha256").update(value).digest("hex");
}
