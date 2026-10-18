/**
 * @file src/utils/security/field-encryption.ts
 * @description Native field-level AES-256-GCM encryption at rest for collection
 * fields flagged `encrypt: true`.
 *
 * Features:
 * - Versioned envelope `v2:<keyId>:iv:tag:ciphertext` (base64url; v1 stays readable)
 * - Key-ID selection with a configured decrypt ring (`ENCRYPTION_KEY_RING`)
 * - Domain-separated HKDF from ENCRYPTION_KEY (`sveltycms-field-at-rest`)
 * - AAD binds ciphertext to tenant + collection + field (swap protection)
 * - JSON-encoded values so translated objects, numbers, and booleans round-trip
 * - Fail-closed writes when ENCRYPTION_KEY is missing
 * - Legacy plaintext passthrough on read (gradual adoption)
 */

import nodeCrypto from "node:crypto";
import { logger } from "@utils/logger";
import { AppError } from "@utils/error-handling";
import { AES256_HKDF_INFO, ENCRYPTION_CONFIG, aesGcmDecryptWithKeys } from "@utils/security/crypto";
import {
  encodeColonEnvelope,
  isColonEnvelope,
  keysForEnvelope,
  parseColonEnvelope,
  resolveKeyRing,
  type ResolvedKeyRing,
} from "@utils/security/envelope";
import {
  isHybridEnvelope,
  hybridSeal,
  hybridOpen,
  isMlKemAvailable,
} from "@utils/security/hybrid-kem";

const ALGORITHM = ENCRYPTION_CONFIG.algorithm;
const IV_LENGTH = ENCRYPTION_CONFIG.ivLength;

export interface FieldEncryptionContext {
  collectionId: string;
  tenantId: string;
}

let _fieldKeys: ResolvedKeyRing | null | undefined;

/**
 * Test-only: drop the memoized key ring so the next call re-reads env.
 */
export function resetFieldEncryptionKeyCache(): void {
  _fieldKeys = undefined;
}

function readEncryptionKeyRaw(): string | null {
  if (typeof process === "undefined") return null;
  const raw = process.env.ENCRYPTION_KEY || process.env.SECRET_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) return null;
  return raw;
}

/**
 * Synchronous static AES key resolver (cached after first resolution).
 */
export function getFieldKeysSync(): ResolvedKeyRing | null {
  if (_fieldKeys !== undefined) return _fieldKeys;
  _fieldKeys = null;
  try {
    const raw = readEncryptionKeyRaw();
    if (!raw) return null;
    _fieldKeys = resolveKeyRing(nodeCrypto, raw, AES256_HKDF_INFO.fieldAtRest, {
      keyId: process.env.ENCRYPTION_KEY_ID,
      ringJson: process.env.ENCRYPTION_KEY_RING,
    });
    return _fieldKeys;
  } catch (err) {
    logger.error("[FieldEncryption] Failed to load the field-encryption key", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function buildAad(context: FieldEncryptionContext, fieldName: string): Buffer {
  return Buffer.from(`${context.tenantId}:${context.collectionId}:${fieldName}`, "utf8");
}

/** True when `value` is a v1/v2 field-encryption envelope or hybrid ML-KEM envelope. */
export function isFieldEncryptionEnvelope(value: unknown): value is string {
  return isColonEnvelope(value) || isHybridEnvelope(value);
}

/**
 * Synchronously encrypt a JSON-serializable value into a `v2:<keyId>:iv:tag:ciphertext`
 * envelope. Zero async overhead / zero microtask allocation on write hot paths.
 */
export function encryptFieldValueSync(
  value: unknown,
  context: FieldEncryptionContext,
  fieldName: string,
): string {
  if (isFieldEncryptionEnvelope(value)) return value;

  const keys = getFieldKeysSync();
  if (!keys) {
    throw new AppError(
      "Field-level encryption requires ENCRYPTION_KEY in config/private.ts.",
      503,
      "FIELD_ENCRYPTION_UNAVAILABLE",
    );
  }

  try {
    const iv = nodeCrypto.randomBytes(IV_LENGTH);
    const cipher = nodeCrypto.createCipheriv(
      ALGORITHM,
      keys.primary,
      iv,
    ) as import("node:crypto").CipherGCM;
    cipher.setAAD(buildAad(context, fieldName));
    const plaintext = JSON.stringify(value);
    const ciphertext = cipher.update(plaintext, "utf8");
    cipher.final();
    const tag = cipher.getAuthTag();
    return encodeColonEnvelope(iv, tag, ciphertext, keys.primaryId);
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error("[FieldEncryption] Encrypt failed", {
      fieldName,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new AppError("Failed to encrypt field value.", 500, "FIELD_ENCRYPTION_FAILED");
  }
}

/**
 * Encrypt a JSON-serializable value into an envelope.
 * When `PQC_HYBRID_FIELDS=true` and `KEM_PUBLIC_KEY` is present, seals into
 * a post-quantum hybrid envelope (ML-KEM-768 + AES-256-GCM).
 * Otherwise seals into a standard `v2:<keyId>:iv:tag:ciphertext` envelope.
 * @throws AppError FIELD_ENCRYPTION_UNAVAILABLE when ENCRYPTION_KEY is missing
 * @throws AppError FIELD_ENCRYPTION_FAILED on cipher errors
 */
export async function encryptFieldValue(
  value: unknown,
  context: FieldEncryptionContext,
  fieldName: string,
): Promise<string> {
  if (isFieldEncryptionEnvelope(value)) return value;
  if (process.env.PQC_HYBRID_FIELDS === "true") {
    const kemPublicKey = process.env.KEM_PUBLIC_KEY;
    if (kemPublicKey && (await isMlKemAvailable())) {
      const plaintext = new TextEncoder().encode(JSON.stringify(value));
      const aad = buildAad(context, fieldName);
      return hybridSeal(plaintext, { publicKey: kemPublicKey, aad });
    }
  }
  return encryptFieldValueSync(value, context, fieldName);
}

/**
 * Synchronously decrypt a `v1`/`v2` envelope. Legacy plaintext is returned as-is.
 * Tampered / AAD-mismatched / unknown-key-ID envelopes return `null` (fail-closed per field).
 */
export function decryptFieldValueSync(
  stored: unknown,
  context: FieldEncryptionContext,
  fieldName: string,
): unknown {
  if (!isFieldEncryptionEnvelope(stored)) return stored;

  const keys = getFieldKeysSync();
  if (!keys) {
    throw new AppError(
      "Field-level encryption requires ENCRYPTION_KEY in config/private.ts.",
      503,
      "FIELD_ENCRYPTION_UNAVAILABLE",
    );
  }

  try {
    const parsed = parseColonEnvelope(stored);
    if (!parsed) {
      logger.error("[FieldEncryption] Malformed envelope", { fieldName });
      return null;
    }
    if (parsed.iv.length !== IV_LENGTH || parsed.tag.length !== ENCRYPTION_CONFIG.authTagLength) {
      logger.error("[FieldEncryption] Invalid envelope lengths", { fieldName });
      return null;
    }
    const selection = keysForEnvelope(keys, parsed);
    if (selection.unknownKeyId) {
      logger.error("[FieldEncryption] Unknown key ID — refusing to decrypt", {
        fieldName,
        keyId: parsed.keyId,
      });
      return null;
    }
    const decrypted = aesGcmDecryptWithKeys(nodeCrypto, {
      keys: selection.keys,
      iv: parsed.iv,
      authTag: parsed.tag,
      ciphertext: parsed.ciphertext,
      aad: buildAad(context, fieldName),
      algorithm: ALGORITHM,
    });
    if (!decrypted) {
      logger.error("[FieldEncryption] Decrypt/AAD verification failed", { fieldName });
      return null;
    }
    return JSON.parse(decrypted.toString("utf8"));
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error("[FieldEncryption] Decrypt failed", {
      fieldName,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Decrypt a `v1`/`v2` AES-GCM envelope or a hybrid ML-KEM envelope. Legacy plaintext is returned as-is.
 * Tampered / AAD-mismatched / unknown-key-ID envelopes return `null` (fail-closed per field).
 */
export async function decryptFieldValue(
  stored: unknown,
  context: FieldEncryptionContext,
  fieldName: string,
): Promise<unknown> {
  if (!isFieldEncryptionEnvelope(stored)) return stored;
  if (isHybridEnvelope(stored)) {
    const kemPrivateKey = process.env.KEM_PRIVATE_KEY;
    if (!kemPrivateKey) {
      logger.error(
        "[FieldEncryption] Hybrid PQC envelope detected but KEM_PRIVATE_KEY is missing",
        {
          fieldName,
        },
      );
      return null;
    }
    try {
      const aad = buildAad(context, fieldName);
      const plaintextBytes = await hybridOpen(stored, { privateKey: kemPrivateKey, aad });
      const jsonStr = new TextDecoder().decode(plaintextBytes);
      return JSON.parse(jsonStr);
    } catch (err) {
      logger.error("[FieldEncryption] Hybrid PQC decrypt failed", {
        fieldName,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
  return decryptFieldValueSync(stored, context, fieldName);
}

function isEmptyFieldValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/**
 * Synchronously encrypt flagged fields in place. Skips missing/empty values and envelopes.
 */
export function encryptDocumentFieldsSync(
  doc: Record<string, unknown>,
  fieldNames: readonly string[],
  context: FieldEncryptionContext,
): Record<string, unknown> {
  if (!doc || fieldNames.length === 0) return doc;
  for (let i = 0; i < fieldNames.length; i++) {
    const name = fieldNames[i];
    if (!Object.hasOwn(doc, name)) continue;
    const value = doc[name];
    if (isEmptyFieldValue(value) || isFieldEncryptionEnvelope(value)) continue;
    doc[name] = encryptFieldValueSync(value, context, name);
  }
  return doc;
}

/**
 * Encrypt flagged fields in place. Skips missing/empty values and envelopes.
 * When `PQC_HYBRID_FIELDS=true`, applies ML-KEM-768 hybrid envelopes asynchronously.
 */
export async function encryptDocumentFields(
  doc: Record<string, unknown>,
  fieldNames: readonly string[],
  context: FieldEncryptionContext,
): Promise<Record<string, unknown>> {
  if (!doc || fieldNames.length === 0) return doc;
  if (process.env.PQC_HYBRID_FIELDS === "true" && process.env.KEM_PUBLIC_KEY) {
    for (let i = 0; i < fieldNames.length; i++) {
      const name = fieldNames[i];
      if (!Object.hasOwn(doc, name)) continue;
      const value = doc[name];
      if (isEmptyFieldValue(value) || isFieldEncryptionEnvelope(value)) continue;
      doc[name] = await encryptFieldValue(value, context, name);
    }
    return doc;
  }
  return encryptDocumentFieldsSync(doc, fieldNames, context);
}

/**
 * Synchronously decrypt flagged fields in place. Legacy plaintext is left untouched.
 * Per-field decrypt failure replaces the value with `null`.
 */
export function decryptDocumentFieldsSync(
  doc: Record<string, unknown>,
  fieldNames: readonly string[],
  context: FieldEncryptionContext,
): Record<string, unknown> {
  if (!doc || fieldNames.length === 0) return doc;
  for (let i = 0; i < fieldNames.length; i++) {
    const name = fieldNames[i];
    if (!Object.hasOwn(doc, name)) continue;
    const value = doc[name];
    if (!isFieldEncryptionEnvelope(value)) continue;
    doc[name] = decryptFieldValueSync(value, context, name);
  }
  return doc;
}

/**
 * Decrypt flagged fields in place. Legacy plaintext is left untouched.
 * Supports both standard AES-GCM and ML-KEM hybrid envelopes asynchronously.
 * Per-field decrypt failure replaces the value with `null`.
 */
export async function decryptDocumentFields(
  doc: Record<string, unknown>,
  fieldNames: readonly string[],
  context: FieldEncryptionContext,
): Promise<Record<string, unknown>> {
  if (!doc || fieldNames.length === 0) return doc;
  let hasHybrid = false;
  for (let i = 0; i < fieldNames.length; i++) {
    const name = fieldNames[i];
    if (Object.hasOwn(doc, name) && isHybridEnvelope(doc[name])) {
      hasHybrid = true;
      break;
    }
  }
  if (hasHybrid) {
    for (let i = 0; i < fieldNames.length; i++) {
      const name = fieldNames[i];
      if (!Object.hasOwn(doc, name)) continue;
      const value = doc[name];
      if (!isFieldEncryptionEnvelope(value)) continue;
      doc[name] = await decryptFieldValue(value, context, name);
    }
    return doc;
  }
  return decryptDocumentFieldsSync(doc, fieldNames, context);
}
