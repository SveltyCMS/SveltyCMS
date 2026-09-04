/**
 * @file src/utils/security/crypto.ts
 * @description Shared security/crypto primitives for SveltyCMS.
 *
 * - Password hashing/verification (Argon2id)
 * - Static AES-256-GCM key resolution (hex / strict-base64 raw keys,
 *   HKDF-SHA-256 passphrase derivation with legacy decrypt fallbacks)
 * - Shared GCM decrypt / HMAC verify helpers for the key ring
 */

import { logger } from "@utils/logger";

// --- Types & Constants ---

// ⚠️ Never weaken Argon2 on bare TEST_MODE: a public process mislabeled
// TEST_MODE=true would hash new passwords at 1 MB / t=1 (offline-bruteable).
// Only genuine harness runtimes (Vitest, bun:test, NODE_ENV=test) get the
// fast config — E2E/preview servers keep production parameters.
const IS_TEST =
  typeof process !== "undefined" &&
  (process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    process.env.BUN_TEST === "true");

export const ARGON2_CONFIG = IS_TEST
  ? ({
      memoryCost: 1024, // 1 MB
      timeCost: 1,
      parallelism: 1,
      type: 2, // argon2id
    } as const)
  : ({
      memoryCost: 65_536, // 64 MB
      timeCost: 3,
      parallelism: 4,
      type: 2, // argon2id
    } as const);

export const ENCRYPTION_CONFIG = {
  algorithm: "aes-256-gcm" as const,
  keyLength: 32,
  ivLength: 16,
  saltLength: 32,
  authTagLength: 16,
};

// Why AES-256-GCM stays (2026) — do not swap for a "newer" cipher without
// measuring first:
// - Hardware-accelerated: OpenSSL dispatches to AES-NI/VAES on x86-64, so this
//   is already near silicon speed; pure-JS AEADs (e.g. AEGIS-256 via @noble)
//   are slower on a server, and XChaCha20-Poly1305 isn't exposed by OpenSSL.
// - Quantum-safe: Grover's algorithm on a 256-bit key costs ~2^128 quantum
//   operations, so AES-256 is post-quantum secure by NIST/NSA classification.
//   Shor's algorithm threatens asymmetric crypto (RSA/ECC — TLS/infra level),
//   never symmetric AEAD. Keys are always 256-bit (keyLength: 32).

// server-only guard (used by encryption functions)

// --- Note: Worker pool removed — hashPassword/verifyPassword now use
// nodeRequire("argon2") directly to bypass Vite's SSR module runner.

// Use createRequire for argon2 to bypass Vite's ESM loader entirely.
// Dynamically imported to avoid Vite browser externalization errors.
async function _loadArgon2() {
  const { createRequire } = await import("node:module");
  const nodeRequire = createRequire(import.meta.url);
  return nodeRequire("argon2");
}

export async function hashPassword(password: string): Promise<string> {
  const argon2 = await _loadArgon2();
  return argon2.hash(Buffer.from(password, "utf8"), ARGON2_CONFIG);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    const argon2 = await _loadArgon2();
    return await argon2.verify(hash, Buffer.from(password, "utf8"));
  } catch (err) {
    // Never swallow silently: a broken argon2 binding / malformed hash must be
    // visible in logs instead of surfacing as a generic "Invalid credentials".
    logger.warn("verifyPassword failed", {
      error: err instanceof Error ? err.message : String(err),
      hashPrefix: typeof hash === "string" ? hash.slice(0, 14) : typeof hash,
    });
    return false;
  }
}

/**
 * Static pre-computed Argon2id hash for timing-attack normalization (CWE-208).
 * Ensures constant-time responses on invalid login attempts.
 */
export const DUMMY_ARGON2_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$punB3mzTQn8lO0gv2NyhzA$LAUqIF+QTNuFGt9Gj3EsKsKuupHl6NIrkGTqhG79gFE";

/**
 * Executes a constant-time Argon2id password verification against a dummy hash.
 * Used when a user is not found to prevent user enumeration via timing discrepancies.
 */
export async function verifyDummyPassword(password: string): Promise<boolean> {
  try {
    const argon2 = await _loadArgon2();
    await argon2.verify(DUMMY_ARGON2_HASH, Buffer.from(password || "dummy-password", "utf8"));
  } catch {
    // Expected mismatch against dummy hash
  }
  return false;
}

// --- Token & Hash Utilities ---

/**
 * Creates a SHA-256 checksum for the provided data.
 */
export async function createChecksum(data: any): Promise<string> {
  const { createHash } = await import(/* @vite-ignore */ "node:crypto");
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

// --- Static AES-256 key resolution (plugin settings, TOTP, backups) ---
//
// Hex / strict-base64 env values are already 256-bit keys — use them as-is
// (AES-NI encrypt, no KDF on the request path).
// Passphrase-shaped values used to be SHA-256(raw) or a lenient base64 decode.
// New writes use HKDF-SHA-256 (RFC 5869) with a domain `info` string so the
// same env blob cannot be reused across subsystems. Decrypt tries HKDF first,
// then the legacy digests, so existing envelopes keep working. Derivation is
// cached by the caller (once per process), not per request.

/** Domain-separated HKDF salt. Changing this orphans passphrase-derived ciphertext. */
export const AES256_HKDF_SALT = "sveltycms-aes-gcm-v1";

export const AES256_HKDF_INFO = {
  pluginSettings: "sveltycms-plugin-settings",
  totpSecret: "sveltycms-totp-secret",
  backupArtifact: "sveltycms-backup-artifact",
  fieldAtRest: "sveltycms-field-at-rest",
} as const;

const HEX_AES_KEY_RE = /^[0-9a-fA-F]{64}$/;
const STRICT_B64_AES_KEY_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const STRICT_B64URL_AES_KEY_RE = /^[A-Za-z0-9_-]+={0,2}$/;

export type ResolvedStaticAesKey = {
  /** Key used for new encrypts and first decrypt attempt. */
  primary: Buffer;
  /** Legacy passphrase digests (SHA-256 / lenient base64). Empty for hex/strict-base64 keys. */
  fallbacks: readonly Buffer[];
};

type HkdfCrypto = {
  hkdfSync: (
    digest: string,
    ikm: string | Buffer | NodeJS.ArrayBufferView,
    salt: string | Buffer | NodeJS.ArrayBufferView,
    info: string | Buffer | NodeJS.ArrayBufferView,
    keylen: number,
  ) => ArrayBuffer;
  createHash: (algorithm: string) => import("node:crypto").Hash;
  createDecipheriv: typeof import("node:crypto").createDecipheriv;
  createHmac: typeof import("node:crypto").createHmac;
  timingSafeEqual: typeof import("node:crypto").timingSafeEqual;
};

function buffersEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && a.equals(b);
}

function uniqueKeyBuffers(keys: Buffer[]): Buffer[] {
  const out: Buffer[] = [];
  for (const key of keys) {
    if (!out.some((existing) => buffersEqual(existing, key))) {
      out.push(key);
    }
  }
  return out;
}

function decodeStrictBase64Key(raw: string): Buffer | null {
  if (raw.length >= 44 && STRICT_B64_AES_KEY_RE.test(raw)) {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length >= ENCRYPTION_CONFIG.keyLength) {
      return decoded.subarray(0, ENCRYPTION_CONFIG.keyLength);
    }
  }
  if (raw.length >= 43 && STRICT_B64URL_AES_KEY_RE.test(raw) && /[-_]/.test(raw)) {
    const decoded = Buffer.from(raw, "base64url");
    if (decoded.length >= ENCRYPTION_CONFIG.keyLength) {
      return decoded.subarray(0, ENCRYPTION_CONFIG.keyLength);
    }
  }
  return null;
}

/**
 * Resolve a static AES-256 key from an env/config string.
 *
 * Hex (64 chars) and strict base64 stay raw 32-byte keys — the production
 * setup-wizard path. Anything else is treated as a passphrase: HKDF-SHA-256
 * for new ciphertext, with SHA-256(raw) and (for 44+ char strings) the old
 * lenient-base64 decode as decrypt fallbacks.
 */
export function resolveStaticAesKey(
  cryptoMod: Pick<HkdfCrypto, "hkdfSync" | "createHash">,
  raw: string,
  info: string,
): ResolvedStaticAesKey {
  if (HEX_AES_KEY_RE.test(raw)) {
    return { primary: Buffer.from(raw, "hex"), fallbacks: [] };
  }

  const strictB64 = decodeStrictBase64Key(raw);
  if (strictB64) {
    return { primary: strictB64, fallbacks: [] };
  }

  const primary = Buffer.from(
    cryptoMod.hkdfSync("sha256", raw, AES256_HKDF_SALT, info, ENCRYPTION_CONFIG.keyLength),
  );
  const fallbacks: Buffer[] = [
    // slop:suppress — dual-read of pre-HKDF env-key envelopes (SHA-256(raw))
    // codeql[js/insufficient-password-hash]: AES env-key compatibility digest, not a login password hash (Argon2id)
    cryptoMod.createHash("sha256").update(raw, "utf8").digest(),
  ];
  // slop:suppress — lenient base64 matches the pre-HKDF `Buffer.from(raw, "base64")`
  // path that accepted any 44+ character string (Node ignores non-alphabet chars).
  if (raw.length >= 44) {
    const lenient = Buffer.from(raw, "base64");
    if (lenient.length >= ENCRYPTION_CONFIG.keyLength) {
      fallbacks.push(lenient.subarray(0, ENCRYPTION_CONFIG.keyLength));
    }
  }
  return {
    primary,
    fallbacks: uniqueKeyBuffers(fallbacks.filter((key) => !buffersEqual(key, primary))),
  };
}

/** Primary key plus decrypt fallbacks, in try order. */
export function staticAesKeyRing(resolved: ResolvedStaticAesKey): Buffer[] {
  return [resolved.primary, ...resolved.fallbacks];
}

/**
 * AES-256-GCM decrypt that walks a key ring. GCM auth failures are expected
 * for legacy keys and are not logged (callers log a single failure).
 */
export function aesGcmDecryptWithKeys(
  cryptoMod: Pick<HkdfCrypto, "createDecipheriv">,
  params: {
    keys: readonly Buffer[];
    iv: NodeJS.ArrayBufferView;
    authTag: NodeJS.ArrayBufferView;
    ciphertext: NodeJS.ArrayBufferView;
    aad?: NodeJS.ArrayBufferView;
    algorithm?: string;
  },
): Buffer | null {
  const algorithm = params.algorithm ?? ENCRYPTION_CONFIG.algorithm;
  for (const key of params.keys) {
    try {
      // aes-256-gcm is always the AEAD mode here — the string overload returns
      // plain Decipheriv (no setAuthTag in @types/node), so narrow to DecipherGCM.
      const decipher = cryptoMod.createDecipheriv(
        algorithm,
        key,
        params.iv,
      ) as import("node:crypto").DecipherGCM;
      decipher.setAuthTag(params.authTag);
      if (params.aad) decipher.setAAD(params.aad);
      return Buffer.concat([decipher.update(params.ciphertext), decipher.final()]);
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * HMAC-SHA-256 verify against a key ring (trusted-device cookies signed with
 * a passphrase-derived key that later moved to HKDF).
 */
export function hmacSha256VerifyWithKeys(
  cryptoMod: Pick<HkdfCrypto, "createHmac" | "timingSafeEqual">,
  params: {
    keys: readonly Buffer[];
    payload: string;
    signatureB64url: string;
  },
): boolean {
  const sig = Buffer.from(params.signatureB64url);
  for (const key of params.keys) {
    const expected = cryptoMod.createHmac("sha256", key).update(params.payload).digest("base64url");
    const expectedBuf = Buffer.from(expected);
    if (sig.length === expectedBuf.length && cryptoMod.timingSafeEqual(sig, expectedBuf)) {
      return true;
    }
  }
  return false;
}
