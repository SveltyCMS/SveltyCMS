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
 */

// Use createRequire for sync node:crypto access to avoid Vite browser warnings.
// This runs once at module init and is only used in server-side code.
import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);
const { createHash: _createHash } = _require("node:crypto");

function bytesToSha256Hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
  return _createHash("sha256").update(value).digest("hex");
}
