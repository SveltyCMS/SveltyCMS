/**
 * @file src/databases/auth/totp.ts
 * @description Time-based One-Time Password (TOTP) implementation for two-factor authentication
 * using only Node.js built-in crypto module. It follows RFC 6238 standard.
 *
 * Features:
 * - Generate TOTP secrets
 * - Generate QR code URLs for authenticator apps
 * - Generate manual entry details
 * - Generate current TOTP codes
 * - Verify TOTP codes with time drift tolerance
 * - Generate and verify backup codes
 * - Validate TOTP secret format
 * - AES-256-GCM at rest: hex/base64 keys as-is, passphrase via HKDF-SHA-256 (SHA-256 dual-read)
 * - AAD binds the TOTP ciphertext to a domain and, when supplied, the user ID
 * - Fail-closed writes: no encryption key means no secret is persisted
 * - Legacy plaintext secrets are rejected (force re-enrollment), never returned
 *
 * Note: This implementation avoids external dependencies to keep the bundle size minimal.
 */

import { raise } from "@utils/error-handling";
import { logger } from "@utils/logger";
import {
  AES256_HKDF_INFO,
  aesGcmDecryptWithKeys,
  hmacSha256VerifyWithKeys,
} from "@utils/security/crypto";
import {
  encodeBinaryEnvelope,
  keysForEnvelope,
  parseBinaryEnvelope,
  resolveKeyRing,
  type ResolvedKeyRing,
} from "@utils/security/envelope";

/** Cached lazy handle to the settings service — one module-registry lookup instead of one per call. */
let settingsServiceModulePromise:
  | Promise<typeof import("@src/services/core/settings-service")>
  | undefined;
function loadSettingsServiceModule(): Promise<
  typeof import("@src/services/core/settings-service")
> {
  return (settingsServiceModulePromise ??= import("@src/services/core/settings-service"));
}

// Server-side only: Dynamic import to prevent bundling in client code
let crypto: typeof import("node:crypto");

async function getCrypto() {
  if (!crypto) {
    crypto = await import("node:crypto");
  }
  return crypto;
}

const TOTP_CONFIG = {
  SECRET_LENGTH: 20,
  WINDOW: getTotpWindow(),
  STEP: 30,
  DIGITS: 6,
  ALGORITHM: "sha1" as const,
};

/**
 * Get the TOTP verification window tolerance from environment.
 * Default: 1 (±30s). Set TOTP_WINDOW=2 for ±60s tolerance on clock-drifted devices.
 */
function getTotpWindow(): number {
  const env = typeof process !== "undefined" ? process.env.TOTP_WINDOW : undefined;
  if (env) {
    const parsed = parseInt(env, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 5) return parsed;
  }
  return 1;
}

// ─── AES-256-GCM TOTP Secret Encryption ─────────────────────────────────────
// Uses the same ENCRYPTION_KEY from config/private.ts for TOTP secret at-rest
// encryption. Writes fail closed when no key is configured — a TOTP secret is
// a 2FA bypass token and must never be stored in plaintext.

const TOTP_AES_ALGORITHM = "aes-256-gcm";
const TOTP_IV_LENGTH = 16; // 128-bit nonce for GCM
const TOTP_AUTH_TAG_LENGTH = 16; // 128 bits
/** Domain separator for the TOTP AEAD envelope. */
const TOTP_AAD_PREFIX = "sveltycms:totp-secret:v1";
let _totpKeys: ResolvedKeyRing | null | undefined;

/**
 * AAD for a TOTP envelope. Every write carries the domain prefix; when the
 * user is known the secret is additionally bound to that user, so copying the
 * ciphertext into another user's record fails authentication.
 */
function buildTotpAad(userId?: string): Buffer {
  return Buffer.from(userId ? `${TOTP_AAD_PREFIX}:${userId}` : TOTP_AAD_PREFIX, "utf8");
}

/** True when `value` decodes to a v1/v2 binary envelope (not base32 plaintext). */
function decodeTotpEnvelope(value: string): Buffer | null {
  if (value.length < 4 || value.length % 4 !== 0) return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;

  const decoded = Buffer.from(value, "base64");
  if (decoded.length < 2 || (decoded[0] !== 1 && decoded[0] !== 2)) return null;
  return parseBinaryEnvelope(decoded, TOTP_IV_LENGTH, TOTP_AUTH_TAG_LENGTH) ? decoded : null;
}

/**
 * Test-only: drop the memoized TOTP key ring so the next call re-reads env.
 */
export function resetTotpEncryptionKeyCache(): void {
  _totpKeys = undefined;
}

/** Load the TOTP encryption key ring from ENCRYPTION_KEY or SECRET_ENCRYPTION_KEY. */
async function getTotpKeys(): Promise<ResolvedKeyRing | null> {
  if (_totpKeys !== undefined) return _totpKeys;
  _totpKeys = null;

  try {
    const usesEncryptionKey = Boolean(typeof process !== "undefined" && process.env.ENCRYPTION_KEY);
    const raw = usesEncryptionKey
      ? process.env.ENCRYPTION_KEY
      : typeof process !== "undefined"
        ? process.env.SECRET_ENCRYPTION_KEY
        : undefined;
    if (!raw || raw.length < 32) return null;

    const cryptoModule = await getCrypto();
    _totpKeys = resolveKeyRing(cryptoModule, raw, AES256_HKDF_INFO.totpSecret, {
      keyId: usesEncryptionKey
        ? process.env.ENCRYPTION_KEY_ID
        : process.env.SECRET_ENCRYPTION_KEY_ID,
      ringJson: usesEncryptionKey
        ? process.env.ENCRYPTION_KEY_RING
        : process.env.SECRET_ENCRYPTION_KEY_RING,
    });
    return _totpKeys;
  } catch {
    return null;
  }
}

/**
 * Encrypt a TOTP secret for storage in the database.
 *
 * Envelope format (v2, base64): [2][keyIdLen][keyId][iv][authTag][ciphertext]
 * v1 (no key ID) stays readable. Writes are AEAD-bound to the TOTP domain and,
 * when `userId` is supplied, to that user.
 *
 * @throws AppError `TOTP_KEY_MISSING` (500) when no encryption key is configured.
 */
export async function encryptTotpSecret(secret: string, userId?: string): Promise<string> {
  const keys = await getTotpKeys();
  if (!keys) {
    raise(500, "TOTP encryption key unavailable", "TOTP_KEY_MISSING");
  }

  const cryptoModule = await getCrypto();
  const iv = cryptoModule.randomBytes(TOTP_IV_LENGTH);
  const cipher = cryptoModule.createCipheriv(
    TOTP_AES_ALGORITHM,
    keys.primary,
    iv,
  ) as import("node:crypto").CipherGCM;
  cipher.setAAD(buildTotpAad(userId));

  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return encodeBinaryEnvelope(iv, authTag, encrypted, keys.primaryId).toString("base64");
}

/**
 * Decrypt a TOTP secret from storage.
 *
 * Accepts the AAD-bound envelope written by `encryptTotpSecret` (user-bound
 * when `userId` matches) and legacy encrypted envelopes written before AAD was
 * introduced. Legacy plaintext base32 values are logged and rejected — the
 * caller must force re-enrollment rather than silently trusting an unsealed
 * secret.
 *
 * @param stored - The value from the user.totpSecret field
 * @param userId - The owning user ID (enables AAD binding checks)
 * @returns The decrypted base32 secret, or null on failure
 */
export async function decryptTotpSecret(stored: string, userId?: string): Promise<string | null> {
  if (!stored) return null;

  const combined = decodeTotpEnvelope(stored);
  if (!combined) {
    if (isValidTOTPSecret(stored)) {
      logger.warn(
        "[TOTP] Rejected a legacy plaintext TOTP secret — encryption at rest is required; re-enrollment needed",
        { userId },
      );
    }
    return null;
  }

  const keys = await getTotpKeys();
  if (!keys) return null;

  try {
    const cryptoModule = await getCrypto();
    const parsed = parseBinaryEnvelope(combined, TOTP_IV_LENGTH, TOTP_AUTH_TAG_LENGTH);
    if (!parsed) return null;

    const selection = keysForEnvelope(keys, parsed);
    if (selection.unknownKeyId) return null;

    // Current envelopes: domain AAD, plus the user ID when the caller knows it.
    const aadCandidates: Buffer[] = userId
      ? [buildTotpAad(userId), buildTotpAad()]
      : [buildTotpAad()];
    for (const aad of aadCandidates) {
      const decrypted = aesGcmDecryptWithKeys(cryptoModule, {
        keys: selection.keys,
        iv: parsed.iv,
        authTag: parsed.tag,
        ciphertext: parsed.ciphertext,
        aad,
        algorithm: TOTP_AES_ALGORITHM,
      });
      if (decrypted) return decrypted.toString("utf8");
    }

    // Legacy compatibility: envelopes written before AAD was introduced.
    const legacyDecrypted = aesGcmDecryptWithKeys(cryptoModule, {
      keys: selection.keys,
      iv: parsed.iv,
      authTag: parsed.tag,
      ciphertext: parsed.ciphertext,
      algorithm: TOTP_AES_ALGORITHM,
    });
    if (legacyDecrypted) {
      logger.warn(
        "[TOTP] Decrypted a legacy non-AAD TOTP envelope — it will be re-sealed on the next write",
        { userId },
      );
      return legacyDecrypted.toString("utf8");
    }
    return null;
  } catch {
    // Fail-closed for tampered envelopes.
    return null;
  }
}

// ─── Trusted Device Cookie ──────────────────────────────────────────────────

const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TRUSTED_DEVICE_COOKIE = "__Host-2fa-trusted-device";

/**
 * Generate a signed trusted-device token that allows skipping 2FA for 30 days.
 * The token is HMAC-SHA256 signed with the encryption key and includes a device
 * fingerprint (hashed IP prefix + user-agent).
 */
export async function generateTrustedDeviceToken(
  userId: string,
  deviceFingerprint: string,
): Promise<string | null> {
  const keys = await getTotpKeys();
  if (!keys) return null;

  const cryptoModule = await getCrypto();
  const expiresAt = Date.now() + TRUSTED_DEVICE_TTL_MS;
  const payload = `${userId}:${deviceFingerprint}:${expiresAt}`;
  const signature = cryptoModule
    .createHmac("sha256", keys.primary)
    .update(payload)
    .digest("base64url");
  return `${payload}:${signature}`;
}

/**
 * Verify a trusted-device token. Returns the userId if valid, null otherwise.
 *
 * 🛡️ HARDENING (pen-test M9): when `expectedFingerprint` (current IP prefix +
 * UA hash) is supplied, the fingerprint embedded in the token must match — a
 * stolen trusted-device cookie can no longer skip 2FA from a different device
 * for the 30-day TTL.
 */
export async function verifyTrustedDeviceToken(
  token: string,
  expectedFingerprint?: string,
): Promise<string | null> {
  const keys = await getTotpKeys();
  if (!keys) return null;

  try {
    const parts = token.split(":");
    // Expect: userId:fingerprint:expiresAt:signature
    if (parts.length < 4) return null;

    // Pop from the END: the fingerprint itself contains a colon
    // (`ipPrefix:uaHash`), so the userId is the only fixed leading field.
    const signature = parts.pop()!;
    const expiresAtRaw = parts.pop()!;
    const expiresAt = parseInt(expiresAtRaw, 10);
    if (Number.isNaN(expiresAt) || Date.now() > expiresAt) return null; // Expired / malformed

    const userId = parts[0];
    const fingerprint = parts.slice(1).join(":");

    // Bind the token to the device that is presenting it — not just to the
    // device that originally completed 2FA.
    if (expectedFingerprint && fingerprint !== expectedFingerprint) return null;

    const payload = `${parts.join(":")}:${expiresAtRaw}`;
    const cryptoModule = await getCrypto();
    if (
      hmacSha256VerifyWithKeys(cryptoModule, {
        keys: [...keys.entries.map((entry) => entry.key), ...keys.legacy],
        payload,
        signatureB64url: signature,
      })
    ) {
      return userId;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build a device fingerprint from IP prefix and user-agent for trusted-device binding.
 * Uses first 2 octets of IP + truncated SHA-256 hash of user-agent.
 */
export async function buildDeviceFingerprint(ip: string, userAgent: string): Promise<string> {
  const cryptoModule = await getCrypto();
  const ipPrefix = ip.split(".").slice(0, 2).join(".");
  const uaHash = cryptoModule.createHash("sha256").update(userAgent).digest("hex").substring(0, 16);
  return `${ipPrefix}:${uaHash}`;
}

/**
 * Get the trusted device cookie configuration for response headers.
 */
export function getTrustedDeviceCookieConfig(): {
  name: string;
  maxAge: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "strict" | "lax";
  path: string;
} {
  return {
    name: TRUSTED_DEVICE_COOKIE,
    maxAge: Math.floor(TRUSTED_DEVICE_TTL_MS / 1000),
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
  };
}

// Base32 encoding (RFC 4648)
const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  // Add padding
  while (output.length % 8 !== 0) {
    output += "=";
  }

  return output;
}

function base32Decode(encoded: string): Buffer {
  // Remove padding and convert to uppercase
  encoded = encoded.replace(/=+$/, "").toUpperCase();

  let bits = 0;
  let value = 0;
  let index = 0;
  const output = Buffer.alloc(Math.ceil((encoded.length * 5) / 8));

  for (let i = 0; i < encoded.length; i++) {
    const char = encoded[i];
    const charValue = BASE32_CHARS.indexOf(char);

    if (charValue === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }

    value = (value << 5) | charValue;
    bits += 5;

    if (bits >= 8) {
      output[index++] = (value >>> (bits - 8)) & 255;
      bits -= 8;
    }
  }

  return output.subarray(0, index);
}

export async function generateTOTPSecret(): Promise<string> {
  const cryptoModule = await getCrypto();
  const buffer = cryptoModule.randomBytes(TOTP_CONFIG.SECRET_LENGTH);
  return base32Encode(buffer);
}

export function generateQRCodeURL(secret: string, userEmail: string, serviceName: string): string {
  const label = encodeURIComponent(`${serviceName}:${userEmail}`);
  const issuer = encodeURIComponent(serviceName);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}`;
}

export function generateManualEntryDetails(
  secret: string,
  userEmail: string,
  serviceName: string,
): {
  account: string;
  secret: string;
  issuer: string;
  algorithm: string;
  digits: number;
  period: number;
} {
  return {
    account: userEmail,
    secret,
    issuer: serviceName,
    algorithm: TOTP_CONFIG.ALGORITHM,
    digits: TOTP_CONFIG.DIGITS,
    period: TOTP_CONFIG.STEP,
  };
}

/**
 * RFC 6238 code computation for a given time counter: HMAC-SHA1 over the
 * 8-byte big-endian counter buffer with dynamic truncation to 6 digits.
 * The caller is responsible for decoding the base32 secret once.
 */
async function computeTotpCode(counter: number, keyBuffer: Buffer): Promise<string> {
  const cryptoModule = await getCrypto();
  const counterBuffer = Buffer.allocUnsafe(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter), 0);

  const hmac = cryptoModule.createHmac(TOTP_CONFIG.ALGORITHM, keyBuffer);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  const offset = digest.at(-1)! & 0xf;
  const truncated =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (truncated % 10 ** TOTP_CONFIG.DIGITS).toString().padStart(TOTP_CONFIG.DIGITS, "0");
}

export async function getCurrentTOTPCode(secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / TOTP_CONFIG.STEP);

  return computeTotpCode(counter, base32Decode(secret));
}

export async function verifyTOTPCode(secret: string, userCode: string): Promise<boolean> {
  if (!userCode || userCode.length !== TOTP_CONFIG.DIGITS) {
    return false;
  }

  const cryptoModule = await getCrypto();
  const now = Math.floor(Date.now() / 1000);
  const keyBuffer = base32Decode(secret); // Decode once; shared across all windows
  const userCodeBuf = Buffer.from(userCode);

  // Check current window and adjacent windows (for time drift tolerance)
  for (let i = -TOTP_CONFIG.WINDOW; i <= TOTP_CONFIG.WINDOW; i++) {
    const counter = Math.floor(now / TOTP_CONFIG.STEP) + i;
    const code = await computeTotpCode(counter, keyBuffer);
    const codeBuf = Buffer.from(code);

    // Timing-safe comparison
    if (
      codeBuf.length === userCodeBuf.length &&
      cryptoModule.timingSafeEqual(codeBuf, userCodeBuf)
    ) {
      return true;
    }
  }

  return false;
}

export async function generateBackupCodes(count = 10): Promise<string[]> {
  const cryptoModule = await getCrypto();
  const codes: string[] = [];

  for (let i = 0; i < count; i++) {
    // 8 random bytes → 16 hex chars = 64 bits of entropy per code.
    // Backup codes are 2FA-bypass secrets; 32 bits (8 hex chars) would be
    // brute-forceable within the rate-limit window.
    const code = cryptoModule.randomBytes(8).toString("hex").toUpperCase();
    codes.push(code);
  }

  return codes;
}

export async function hashBackupCode(code: string): Promise<string> {
  const [cryptoModule, secret] = await Promise.all([getCrypto(), getBackupCodeHmacSecret()]);
  return cryptoModule.createHmac("sha256", secret).update(code.toLowerCase()).digest("hex");
}

export async function verifyBackupCode(code: string, hashedCode: string): Promise<boolean> {
  const cryptoModule = await getCrypto();
  const secret = await getBackupCodeHmacSecret();
  // HMAC-SHA-256 with the server secret (resistant to offline brute-force).
  // The pre-HMAC plain-SHA-256 scheme was removed in 2026-08 — codes from
  // before that migration must be regenerated (regenerateBackupCodes).
  const hmac = cryptoModule.createHmac("sha256", secret).update(code.toLowerCase()).digest("hex");
  return (
    hmac.length === hashedCode.length &&
    cryptoModule.timingSafeEqual(Buffer.from(hmac), Buffer.from(hashedCode))
  );
}

/** Memoized HMAC secret for backup-code hashing — domain-salted from JWT_SECRET_KEY. */
let cachedBackupCodeHmacSecret: string | null = null;
async function getBackupCodeHmacSecret(): Promise<string> {
  if (cachedBackupCodeHmacSecret) return cachedBackupCodeHmacSecret;
  const { getPrivateSettingSync } = await loadSettingsServiceModule();
  const jwtSecret = getPrivateSettingSync("JWT_SECRET_KEY") as string;
  if (!jwtSecret) throw new Error("HMAC secret unavailable — JWT_SECRET_KEY not configured");
  cachedBackupCodeHmacSecret = `backupcode-hmac:${jwtSecret}`;
  return cachedBackupCodeHmacSecret;
}

export function isValidTOTPSecret(secret: string): boolean {
  // Basic validation for base32 encoded secret
  const base32Regex = /^[A-Z2-7]+=*$/;
  return typeof secret === "string" && secret.length >= 16 && base32Regex.test(secret);
}
