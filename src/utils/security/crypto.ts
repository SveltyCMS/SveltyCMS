/**
 * @file src/utils/security/crypto.ts
 * @description Unified security and cryptography system for SveltyCMS.
 *
 * Consolidates:
 * - Password hashing and verification (Argon2id with Worker Pool)
 * - AES-256-GCM data encryption/decryption
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
  } catch {
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
