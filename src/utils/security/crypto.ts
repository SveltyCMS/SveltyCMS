/**
 * @file src/utils/security/crypto.ts
 * @description Unified security and cryptography system for SveltyCMS.
 *
 * Consolidates:
 * - Password hashing and verification (Argon2id with Worker Pool)
 * - AES-256-GCM data encryption/decryption
 * - HKDF-SHA-256 static-key derivation (passphrase env fallback, cached by callers)
 * - Secure token and UUID generation
 * - SHA256 checksums
 */

// --- Types & Constants ---

const IS_TEST =
  typeof process !== "undefined" &&
  (process.env.NODE_ENV === "test" ||
    process.env.TEST_MODE === "true" ||
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
    try {
      const { logger } = await import("@utils/logger");
      logger.warn("verifyPassword failed", {
        error: err instanceof Error ? err.message : String(err),
        hashPrefix: typeof hash === "string" ? hash.slice(0, 14) : typeof hash,
      });
    } catch {
      // logger unavailable (edge) — fall through to the security-safe result
    }
    return false;
  }
}

// --- Encryption Utilities ---

export async function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  const argon2 = await import("argon2");
  const pwd = Buffer.from(password, "utf8");
  const hash = await argon2.hash(pwd, { ...ARGON2_CONFIG, salt, raw: true });
  return Buffer.from(hash).subarray(0, ENCRYPTION_CONFIG.keyLength);
}

export async function encryptData(data: any, password: string): Promise<string> {
  const crypto = await import(/* @vite-ignore */ "node:crypto");
  const salt = crypto.randomBytes(ENCRYPTION_CONFIG.saltLength);
  const iv = crypto.randomBytes(ENCRYPTION_CONFIG.ivLength);
  const key = await deriveKey(password, salt);

  const cipher = crypto.createCipheriv(ENCRYPTION_CONFIG.algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const version = Buffer.from([0x01]);
  return Buffer.concat([version, salt, iv, authTag, encrypted]).toString("base64");
}

export async function decryptData(encryptedData: string, password: string): Promise<any> {
  const crypto = await import(/* @vite-ignore */ "node:crypto");
  const combined = Buffer.from(encryptedData, "base64");

  let offset = 0;

  // Check for version byte
  const isVersion1 = combined[0] === 0x01;
  if (isVersion1) {
    offset = 1;
  }

  const salt = combined.subarray(offset, (offset += ENCRYPTION_CONFIG.saltLength));
  const iv = combined.subarray(offset, (offset += ENCRYPTION_CONFIG.ivLength));
  const authTag = combined.subarray(offset, (offset += ENCRYPTION_CONFIG.authTagLength));
  const encrypted = combined.subarray(offset);

  try {
    const key = await deriveKey(password, Buffer.from(salt));
    const decipher = crypto.createDecipheriv(ENCRYPTION_CONFIG.algorithm, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8"));
  } catch (err) {
    // Fallback: If it was identified as version 1 but failed (e.g. legacy data where first byte of salt happened to be 0x01)
    if (isVersion1) {
      offset = 0;
      const legacySalt = combined.subarray(offset, (offset += ENCRYPTION_CONFIG.saltLength));
      const legacyIv = combined.subarray(offset, (offset += ENCRYPTION_CONFIG.ivLength));
      const legacyAuthTag = combined.subarray(offset, (offset += ENCRYPTION_CONFIG.authTagLength));
      const legacyEncrypted = combined.subarray(offset);

      const legacyKey = await deriveKey(password, Buffer.from(legacySalt));
      const legacyDecipher = crypto.createDecipheriv(
        ENCRYPTION_CONFIG.algorithm,
        legacyKey,
        legacyIv,
      );
      legacyDecipher.setAuthTag(legacyAuthTag);

      const legacyDecrypted = Buffer.concat([
        legacyDecipher.update(legacyEncrypted),
        legacyDecipher.final(),
      ]);
      return JSON.parse(legacyDecrypted.toString("utf8"));
    }
    throw err;
  }
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
    // slop:suppress — dual-read of pre-HKDF passphrase envelopes (SHA-256(raw))
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
