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
 *
 * Note: This implementation avoids external dependencies to keep the bundle size minimal.
 */

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
// encryption. Falls back gracefully if no encryption key is configured.

const TOTP_ENVELOPE_VERSION = 1;
const TOTP_AES_ALGORITHM = "aes-256-gcm";
const TOTP_IV_LENGTH = 16; // 128-bit nonce for GCM
const TOTP_AUTH_TAG_LENGTH = 16; // 128 bits
const TOTP_KEY_LENGTH = 32; // 256 bits

let _totpEncryptionKey: Buffer | null | undefined;

/** Load the TOTP encryption key from environment (ENCRYPTION_KEY or SECRET_ENCRYPTION_KEY). */
async function getTotpEncryptionKey(): Promise<Buffer | null> {
  if (_totpEncryptionKey !== undefined) return _totpEncryptionKey;
  _totpEncryptionKey = null;

  try {
    const raw =
      (typeof process !== "undefined" ? process.env.ENCRYPTION_KEY : undefined) ||
      (typeof process !== "undefined" ? process.env.SECRET_ENCRYPTION_KEY : undefined);
    if (!raw || raw.length < 32) return null;

    // Hex-encoded 64-char key
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      _totpEncryptionKey = Buffer.from(raw, "hex");
      return _totpEncryptionKey;
    }
    // Base64-encoded (>=44 chars)
    if (raw.length >= 44) {
      try {
        const decoded = Buffer.from(raw, "base64");
        if (decoded.length >= TOTP_KEY_LENGTH) {
          _totpEncryptionKey = decoded.subarray(0, TOTP_KEY_LENGTH);
          return _totpEncryptionKey;
        }
      } catch {
        /* fall through */
      }
    }
    // Derive from raw string via SHA-256
    const cryptoModule = await getCrypto();
    _totpEncryptionKey = cryptoModule.createHash("sha256").update(raw, "utf8").digest();
    return _totpEncryptionKey;
  } catch {
    return null;
  }
}

/**
 * Encrypt a TOTP secret for storage in the database.
 *
 * Envelope format (base64): version_byte || iv || authTag || ciphertext
 * Returns the encrypted envelope string, or the raw secret if encryption is unavailable.
 */
export async function encryptTotpSecret(secret: string): Promise<string> {
  const key = await getTotpEncryptionKey();
  if (!key) return secret; // No encryption key — store as plaintext (graceful degradation)

  const cryptoModule = await getCrypto();
  const iv = cryptoModule.randomBytes(TOTP_IV_LENGTH);
  const cipher = cryptoModule.createCipheriv(TOTP_AES_ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const version = Buffer.from([TOTP_ENVELOPE_VERSION]);
  const envelope = Buffer.concat([version, iv, authTag, encrypted]);
  return envelope.toString("base64");
}

/**
 * Decrypt a TOTP secret from storage.
 *
 * Detects the envelope format (version byte). If the value is a plain base32
 * string (legacy, unencrypted), returns it as-is for backward compatibility.
 *
 * @param stored - The value from the user.totpSecret field
 * @returns The decrypted base32 secret, or null on failure
 */
export async function decryptTotpSecret(stored: string): Promise<string | null> {
  if (!stored) return null;

  // Backward compatibility: if it looks like a base32 TOTP secret and NOT an envelope, it's legacy plaintext
  if (!stored.startsWith("AQ") && /^[A-Z2-7]+=*$/.test(stored) && stored.length >= 16) {
    return stored;
  }

  const key = await getTotpEncryptionKey();
  if (!key) return null;

  try {
    const cryptoModule = await getCrypto();
    const combined = Buffer.from(stored, "base64");

    let offset = 0;
    const version = combined[0];
    if (version !== TOTP_ENVELOPE_VERSION) return null;
    offset = 1;

    const iv = combined.subarray(offset, (offset += TOTP_IV_LENGTH));
    const authTag = combined.subarray(offset, (offset += TOTP_AUTH_TAG_LENGTH));
    const ciphertext = combined.subarray(offset);

    const decipher = cryptoModule.createDecipheriv(TOTP_AES_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    // If decryption fails and it looks like a base32 secret (not an envelope), return as legacy plaintext
    if (!stored.startsWith("AQ") && /^[A-Z2-7]+=*$/.test(stored) && stored.length >= 16)
      return stored;
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
  const key = await getTotpEncryptionKey();
  if (!key) return null;

  const cryptoModule = await getCrypto();
  const expiresAt = Date.now() + TRUSTED_DEVICE_TTL_MS;
  const payload = `${userId}:${deviceFingerprint}:${expiresAt}`;
  const signature = cryptoModule.createHmac("sha256", key).update(payload).digest("base64url");
  return `${payload}:${signature}`;
}

/**
 * Verify a trusted-device token. Returns the userId if valid, null otherwise.
 */
export async function verifyTrustedDeviceToken(token: string): Promise<string | null> {
  const key = await getTotpEncryptionKey();
  if (!key) return null;

  try {
    const parts = token.split(":");
    // Expect: userId:fingerprint:expiresAt:signature
    if (parts.length < 4) return null;

    const signature = parts.pop()!;
    const payload = parts.join(":");
    const expiresAt = parseInt(parts[2], 10);

    if (Date.now() > expiresAt) return null; // Expired

    const cryptoModule = await getCrypto();
    const expectedSig = cryptoModule.createHmac("sha256", key).update(payload).digest("base64url");

    if (
      signature.length === expectedSig.length &&
      cryptoModule.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))
    ) {
      return parts[0]; // userId
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

export async function getCurrentTOTPCode(secret: string): Promise<string> {
  const cryptoModule = await getCrypto();
  const now = Math.floor(Date.now() / 1000);
  const counter = Math.floor(now / TOTP_CONFIG.STEP);

  const keyBuffer = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x1_00_00_00_00), 0);
  counterBuffer.writeUInt32BE(counter & 0xff_ff_ff_ff, 4);

  const hmac = cryptoModule.createHmac(TOTP_CONFIG.ALGORITHM, keyBuffer);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  const offset = digest.at(-1)! & 0xf;
  const truncated =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const code = (truncated % 10 ** TOTP_CONFIG.DIGITS).toString().padStart(TOTP_CONFIG.DIGITS, "0");
  return code;
}

export async function verifyTOTPCode(secret: string, userCode: string): Promise<boolean> {
  if (!userCode || userCode.length !== TOTP_CONFIG.DIGITS) {
    return false;
  }

  const cryptoModule = await getCrypto();
  const now = Math.floor(Date.now() / 1000);

  // Check current window and adjacent windows (for time drift tolerance)
  for (let i = -TOTP_CONFIG.WINDOW; i <= TOTP_CONFIG.WINDOW; i++) {
    const counter = Math.floor(now / TOTP_CONFIG.STEP) + i;

    const keyBuffer = base32Decode(secret);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeUInt32BE(Math.floor(counter / 0x1_00_00_00_00), 0);
    counterBuffer.writeUInt32BE(counter & 0xff_ff_ff_ff, 4);

    const hmac = cryptoModule.createHmac(TOTP_CONFIG.ALGORITHM, keyBuffer);
    hmac.update(counterBuffer);
    const digest = hmac.digest();

    const offset = digest.at(-1)! & 0xf;
    const truncated =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);

    const code = (truncated % 10 ** TOTP_CONFIG.DIGITS)
      .toString()
      .padStart(TOTP_CONFIG.DIGITS, "0");

    // Timing-safe comparison
    if (
      code.length === userCode.length &&
      cryptoModule.timingSafeEqual(Buffer.from(code), Buffer.from(userCode))
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
    const code = cryptoModule.randomBytes(4).toString("hex").toUpperCase();
    codes.push(code);
  }

  return codes;
}

export async function hashBackupCode(code: string): Promise<string> {
  const cryptoModule = await getCrypto();
  return cryptoModule.createHash("sha256").update(code.toLowerCase()).digest("hex");
}

export async function verifyBackupCode(code: string, hashedCode: string): Promise<boolean> {
  const cryptoModule = await getCrypto();
  const hash = cryptoModule.createHash("sha256").update(code.toLowerCase()).digest("hex");
  return cryptoModule.timingSafeEqual(Buffer.from(hash), Buffer.from(hashedCode));
}

export function isValidTOTPSecret(secret: string): boolean {
  // Basic validation for base32 encoded secret
  const base32Regex = /^[A-Z2-7]+=*$/;
  return typeof secret === "string" && secret.length >= 16 && base32Regex.test(secret);
}
