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
import { AppError, raise } from "@utils/error-handling";
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
import { cloudKms } from "@utils/security/cloud-kms";

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

function readKemPublicKey(): string | null {
  if (typeof process === "undefined") return null;
  const raw = process.env.PQC_KEM_PUBLIC_KEY || process.env.KEM_PUBLIC_KEY;
  return raw && raw.trim().length > 0 ? raw.trim() : null;
}

function readKemPrivateKey(): string | null {
  if (typeof process === "undefined") return null;
  const raw = process.env.PQC_KEM_PRIVATE_KEY || process.env.KEM_PRIVATE_KEY;
  return raw && raw.trim().length > 0 ? raw.trim() : null;
}

function readClassicalPublicKey(): string | undefined {
  if (typeof process === "undefined") return undefined;
  const raw = process.env.PQC_X25519_PUBLIC_KEY;
  return raw && raw.trim().length > 0 ? raw.trim() : undefined;
}

function readClassicalPrivateKey(): string | undefined {
  if (typeof process === "undefined") return undefined;
  const raw = process.env.PQC_X25519_PRIVATE_KEY;
  return raw && raw.trim().length > 0 ? raw.trim() : undefined;
}

/** True when any encrypted field on `doc` holds a `v1:`/`v2:` hybrid ML-KEM envelope. */
export function hasHybridEnvelopeInDoc(doc: unknown, fieldNames: readonly string[]): boolean {
  if (!doc || typeof doc !== "object" || fieldNames.length === 0) return false;
  const rec = doc as Record<string, unknown>;
  for (let i = 0; i < fieldNames.length; i++) {
    const name = fieldNames[i];
    if (Object.hasOwn(rec, name) && isHybridEnvelope(rec[name])) return true;
  }
  return false;
}

/**
 * True when an SDK `{ success, data }` envelope, array, or bare document contains
 * at least one hybrid ML-KEM field envelope requiring async WebCrypto decryption.
 */
export function hasHybridEnvelopeInResult(result: unknown, fieldNames: readonly string[]): boolean {
  if (!result || typeof result !== "object" || fieldNames.length === 0) return false;
  if ("success" in result && "data" in result) {
    const data = (result as { data: unknown }).data;
    if (data == null) return false;
    if (Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        if (hasHybridEnvelopeInDoc(data[i], fieldNames)) return true;
      }
      return false;
    }
    return hasHybridEnvelopeInDoc(data, fieldNames);
  }
  if (Array.isArray(result)) {
    for (let i = 0; i < result.length; i++) {
      if (hasHybridEnvelopeInDoc(result[i], fieldNames)) return true;
    }
    return false;
  }
  return hasHybridEnvelopeInDoc(result, fieldNames);
}

/**
 * Synchronous static AES key resolver (cached after first resolution).
 */
export function getFieldKeysSync(): ResolvedKeyRing | null {
  if (cloudKms.isEnabled()) {
    const kmsDek = cloudKms.getActiveDekSync();
    if (kmsDek) {
      return {
        primaryId: kmsDek.keyId,
        primary: kmsDek.plaintext,
        entries: [{ id: kmsDek.keyId, key: kmsDek.plaintext }],
        legacy: [],
      };
    }
  }

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

const aadCache = new Map<string, Buffer>();

function buildAad(context: FieldEncryptionContext, fieldName: string): Buffer {
  const key = `${context.tenantId}:${context.collectionId}:${fieldName}`;
  let buf = aadCache.get(key);
  if (!buf) {
    buf = Buffer.from(key, "utf8");
    if (aadCache.size < 1024) aadCache.set(key, buf);
  }
  return buf;
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
 * When `PQC_HYBRID_FIELDS=true`, seals into a post-quantum envelope
 * (`v1:` ML-KEM-768 + AES-256-GCM, or `v2:` X25519 + ML-KEM-768 + AES-256-GCM when
 * `PQC_X25519_PUBLIC_KEY` is also set). Fails closed if keys or runtime ML-KEM support
 * are unavailable — never silently downgrades to classical encryption.
 * Otherwise seals into a standard `v2:<keyId>:iv:tag:ciphertext` envelope.
 * @throws AppError PQC_FIELD_ENCRYPTION_UNAVAILABLE when PQC_HYBRID_FIELDS is enabled without keys/runtime
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
    const kemPublicKey = readKemPublicKey();
    if (!kemPublicKey) {
      raise(
        503,
        "PQC_HYBRID_FIELDS=true requires PQC_KEM_PUBLIC_KEY (or KEM_PUBLIC_KEY).",
        "PQC_FIELD_ENCRYPTION_UNAVAILABLE",
      );
    }
    if (!(await isMlKemAvailable())) {
      raise(
        503,
        "PQC_HYBRID_FIELDS=true requires a runtime with ML-KEM-768 WebCrypto support.",
        "PQC_FIELD_ENCRYPTION_UNAVAILABLE",
      );
    }
    const plaintext = new TextEncoder().encode(JSON.stringify(value));
    const aad = buildAad(context, fieldName);
    const classicalPublicKey = readClassicalPublicKey();
    try {
      return await hybridSeal(plaintext, {
        publicKey: kemPublicKey,
        classicalPublicKey,
        aad,
      });
    } finally {
      // Ephemeral plaintext must not outlive the seal call in the V8 heap.
      plaintext.fill(0);
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
    if (selection.unknownKeyId && parsed.keyId?.startsWith("kms.")) {
      const cachedDek = cloudKms.getCachedDekSync(parsed.keyId);
      if (cachedDek) {
        selection.keys = [cachedDek];
        selection.unknownKeyId = false;
      }
    }
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
    try {
      return JSON.parse(decrypted.toString("utf8"));
    } finally {
      // The caller only needs the parsed JSON, not the decrypted bytes.
      decrypted.fill(0);
    }
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
    const kemPrivateKey = readKemPrivateKey();
    if (!kemPrivateKey) {
      logger.error(
        "[FieldEncryption] Hybrid PQC envelope detected but PQC_KEM_PRIVATE_KEY / KEM_PRIVATE_KEY is missing",
        {
          fieldName,
        },
      );
      return null;
    }
    try {
      const aad = buildAad(context, fieldName);
      const classicalPrivateKey = readClassicalPrivateKey();
      const plaintextBytes = await hybridOpen(stored, {
        privateKey: kemPrivateKey,
        classicalPrivateKey,
        aad,
      });
      try {
        return JSON.parse(new TextDecoder().decode(plaintextBytes));
      } finally {
        plaintextBytes.fill(0);
      }
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
 * When `PQC_HYBRID_FIELDS=true`, applies ML-KEM-768 (or composite X25519+ML-KEM-768)
 * envelopes asynchronously and fails closed if keys are missing.
 */
export async function encryptDocumentFields(
  doc: Record<string, unknown>,
  fieldNames: readonly string[],
  context: FieldEncryptionContext,
): Promise<Record<string, unknown>> {
  if (!doc || fieldNames.length === 0) return doc;
  if (process.env.PQC_HYBRID_FIELDS === "true") {
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
