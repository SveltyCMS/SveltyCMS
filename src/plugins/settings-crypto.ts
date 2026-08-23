/**
 * @file src/plugins/settings-crypto.ts
 * @description AES-256-GCM encryption for plugin settings secrets.
 *
 * Implements the aphexcms pattern for encrypted plugin settings:
 * - `secret` field type for plugin settings declarations
 * - AES-256-GCM encryption at rest under a static key from `SECRET_ENCRYPTION_KEY`
 * - Hex/base64 keys used as-is; passphrase keys via HKDF-SHA-256 (SHA-256 dual-read)
 * - AAD (Additional Authenticated Data) binding ciphertext to tenant+plugin context
 * - Versioned envelope format: `v1:iv:authTag:ciphertext` (base64)
 * - Secrets never reach the browser: API serves masked values
 * - Submitting a blank/masked field leaves the stored secret untouched
 * - Fails loudly if encryption key is missing when saving a secret
 *
 * ### Features:
 * - static-key AES-256-GCM encryption (no per-request password needed)
 * - AAD context binding (tenantId:pluginId) prevents cross-tenant secret swap
 * - versioned envelope for future key rotation
 * - server-only decryption accessor
 * - masked values for API responses (never leaks plaintext to client)
 * - deterministic blank/masked detection
 */

import { logger } from "@utils/logger";
import {
  AES256_HKDF_INFO,
  aesGcmDecryptWithKeys,
  resolveStaticAesKey,
  staticAesKeyRing,
  type ResolvedStaticAesKey,
} from "@utils/security/crypto";

// ============================================================================
// Constants
// ============================================================================

const ENV_KEY_NAME = "SECRET_ENCRYPTION_KEY";
const ENVELOPE_VERSION = 1;
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

const MASKED_VALUE = "••••••••";

// ============================================================================
// Types
// ============================================================================

/**
 * Encryption context passed to bind ciphertext to a specific tenant+plugin.
 * Prevents an attacker with DB write access from swapping encrypted
 * secrets between tenants or plugins.
 */
export interface EncryptionContext {
  tenantId: string;
  pluginId: string;
}

// ============================================================================
// Key Management
// ============================================================================

let cachedKeys: ResolvedStaticAesKey | null | undefined;

/**
 * Test-only: drop the memoized key ring so the next call re-reads
 * `SECRET_ENCRYPTION_KEY` (e.g. when a test swaps the secret mid-suite).
 */
export function resetSettingsCryptoKeyCache(): void {
  cachedKeys = undefined;
}

/**
 * Load the encryption key ring from the environment.
 * Hex / strict-base64 → raw 32-byte AES key. Passphrase → HKDF-SHA-256
 * (cached for the process; SHA-256 dual-read for envelopes written before HKDF).
 */
async function getEncryptionKeys(): Promise<ResolvedStaticAesKey | null> {
  if (cachedKeys !== undefined) return cachedKeys;

  try {
    const raw = typeof process !== "undefined" ? process.env[ENV_KEY_NAME] : undefined;
    if (!raw || raw.length === 0) {
      logger.debug("[SettingsCrypto] No SECRET_ENCRYPTION_KEY set — secret encryption disabled");
      cachedKeys = null;
      return null;
    }

    const crypto = await import("node:crypto");
    cachedKeys = resolveStaticAesKey(crypto, raw, AES256_HKDF_INFO.pluginSettings);
    if (cachedKeys.fallbacks.length > 0) {
      logger.warn(
        "[SettingsCrypto] SECRET_ENCRYPTION_KEY is not hex/base64 — deriving key via HKDF-SHA-256. " +
          "For production, generate a key: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    } else {
      logger.debug("[SettingsCrypto] Loaded static encryption key");
    }
    return cachedKeys;
  } catch (err) {
    logger.error("[SettingsCrypto] Failed to load encryption key", { error: String(err) });
    cachedKeys = null;
    return null;
  }
}

// ============================================================================
// Encryption / Decryption
// ============================================================================

/**
 * Encrypt a plaintext string value for storage in plugin settings.
 *
 * Format: base64(version_byte || iv || authTag || ciphertext)
 * Envelope: `v1:iv:authTag:ciphertext` (base64-encoded)
 *
 * When `context` is provided, the tenantId:pluginId pair is bound into
 * the GCM encryption as Additional Authenticated Data (AAD). This ensures
 * an envelope copied to a different tenant or plugin fails decryption.
 *
 * @param plaintext - The value to encrypt
 * @param context - Optional tenant+plugin binding for AAD
 * @returns The encrypted envelope string
 * @throws If encryption key is not configured
 */
export async function encryptSecret(
  plaintext: string,
  context?: EncryptionContext,
): Promise<string | null> {
  const keys = await getEncryptionKeys();
  if (!keys) {
    throw new Error(
      `[SettingsCrypto] Cannot encrypt secret: ${ENV_KEY_NAME} is not set. ` +
        "Generate one: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }

  try {
    const crypto = await import("node:crypto");
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, keys.primary, iv);

    // Bind ciphertext to tenant+plugin context (AAD)
    if (context) {
      const aad = Buffer.from(`${context.tenantId}:${context.pluginId}`, "utf8");
      cipher.setAAD(aad);
    }

    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Encode: version byte + IV + authTag + ciphertext
    const version = Buffer.from([ENVELOPE_VERSION]);
    const envelope = Buffer.concat([version, iv, authTag, encrypted]);
    return envelope.toString("base64");
  } catch (err) {
    logger.error("[SettingsCrypto] Encryption failed", { error: String(err) });
    throw err;
  }
}

/**
 * Decrypt a secret value from plugin settings.
 *
 * When `context` is provided, the AAD (tenantId:pluginId) is verified
 * against what was set during encryption. If the ciphertext was copied
 * from a different tenant or plugin, `decipher.final()` throws.
 *
 * @param envelope - The encrypted envelope string
 * @param context - Optional tenant+plugin binding for AAD verification
 * @returns The decrypted plaintext, or null if decryption is unavailable
 */
export async function decryptSecret(
  envelope: string,
  context?: EncryptionContext,
): Promise<string | null> {
  const keys = await getEncryptionKeys();
  if (!keys) {
    logger.warn("[SettingsCrypto] Cannot decrypt secret: no encryption key configured");
    return null;
  }

  try {
    const crypto = await import("node:crypto");
    const combined = Buffer.from(envelope, "base64");

    let offset = 0;

    // Check version byte
    const version = combined[0];
    if (version !== ENVELOPE_VERSION) {
      logger.warn(`[SettingsCrypto] Unknown envelope version: ${version}`);
      return null;
    }
    offset = 1;

    const iv = combined.subarray(offset, (offset += IV_LENGTH));
    const authTag = combined.subarray(offset, (offset += AUTH_TAG_LENGTH));
    const ciphertext = combined.subarray(offset);

    const aad = context
      ? Buffer.from(`${context.tenantId}:${context.pluginId}`, "utf8")
      : undefined;
    const decrypted = aesGcmDecryptWithKeys(crypto, {
      keys: staticAesKeyRing(keys),
      iv,
      authTag,
      ciphertext,
      aad,
      algorithm: ALGORITHM,
    });
    if (!decrypted) {
      logger.error("[SettingsCrypto] Context verification or decryption failed");
      return null;
    }
    return decrypted.toString("utf8");
  } catch (err) {
    logger.error("[SettingsCrypto] Context verification or decryption failed", {
      error: String(err),
    });
    return null;
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if a value is the masked placeholder.
 * Used to detect when a user submits a form without changing the secret field.
 */
export function isMasked(value: string): boolean {
  return value === MASKED_VALUE || value === "" || value === null || value === undefined;
}

/**
 * Get the masked display value for API responses.
 * The actual secret is NEVER sent to the browser.
 */
export function getMaskedValue(): string {
  return MASKED_VALUE;
}

/**
 * Check if secret encryption is available.
 */
export async function isEncryptionAvailable(): Promise<boolean> {
  const keys = await getEncryptionKeys();
  return keys !== null;
}

/**
 * Process a plugin settings object, encrypting secret fields and
 * preserving existing secrets when blank/masked values are submitted.
 *
 * @param submitted - The settings values submitted by the user
 * @param existing - The currently stored settings (for preserving unchanged secrets)
 * @param secretFields - Array of field names that are typed 'secret'
 * @param context - Optional tenant+plugin binding for AAD
 * @returns The processed settings object ready for storage
 */
export async function processSecretFields(
  submitted: Record<string, unknown>,
  existing: Record<string, unknown> | null,
  secretFields: string[],
  context?: EncryptionContext,
): Promise<Record<string, unknown>> {
  const result = { ...submitted };

  for (const fieldName of secretFields) {
    const submittedValue = submitted[fieldName];

    if (isMasked(submittedValue as string)) {
      // User didn't change the secret — preserve existing encrypted value
      if (existing && existing[fieldName]) {
        result[fieldName] = existing[fieldName];
      }
      continue;
    }

    // New plaintext value — encrypt it with context binding
    try {
      const encrypted = await encryptSecret(String(submittedValue), context);
      if (encrypted) {
        result[fieldName] = encrypted;
      }
    } catch (err) {
      logger.error(`[SettingsCrypto] Failed to encrypt secret field "${fieldName}"`, {
        error: String(err),
      });
      throw err;
    }
  }

  return result;
}

/**
 * Decrypt secret fields in a settings object for server-side consumption.
 * Masked values remain masked — this is for server code only.
 *
 * @param stored - The stored settings with encrypted secret fields
 * @param secretFields - Array of field names that are typed 'secret'
 * @param context - Optional tenant+plugin binding for AAD verification
 * @returns Settings with decrypted secrets (server-side only)
 */
export async function decryptSecretFields(
  stored: Record<string, unknown>,
  secretFields: string[],
  context?: EncryptionContext,
): Promise<Record<string, unknown>> {
  const result = { ...stored };

  for (const fieldName of secretFields) {
    const encrypted = stored[fieldName];
    if (typeof encrypted === "string" && !isMasked(encrypted)) {
      try {
        const decrypted = await decryptSecret(encrypted, context);
        if (decrypted !== null) {
          result[fieldName] = decrypted;
        }
      } catch {
        // Leave as-is if decryption fails (context mismatch or tampering)
      }
    }
  }

  return result;
}

/**
 * Mask secret fields in a settings object for API responses.
 * Replaces encrypted values with the masked placeholder so secrets
 * never reach the browser.
 *
 * @param stored - The stored settings (may contain encrypted secrets)
 * @param secretFields - Array of field names that are typed 'secret'
 * @returns Settings safe for API response (secrets masked)
 */
export function maskSecretFields(
  stored: Record<string, unknown>,
  secretFields: string[],
): Record<string, unknown> {
  const result = { ...stored };

  for (const fieldName of secretFields) {
    if (stored[fieldName] && !isMasked(stored[fieldName] as string)) {
      result[fieldName] = MASKED_VALUE;
    }
  }

  return result;
}
