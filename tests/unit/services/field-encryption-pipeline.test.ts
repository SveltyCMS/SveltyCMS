/**
 * @file tests/unit/services/field-encryption-pipeline.test.ts
 * @description Write/read pipeline tests for `encrypt: true` collection fields.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  encryptWritePayload,
  prepareWritePayload,
} from "@src/services/sdk/namespaces/collections/write-pipeline";
import {
  assertEncryptedFieldsNotQueried,
  decryptReadResult,
  decryptReadStream,
  presentRead,
} from "@src/services/sdk/namespaces/collections/read-pipeline";
import { ensureSchemaHotFlags } from "@src/services/sdk/namespaces/collections/schema-store";
import {
  resetFieldEncryptionKeyCache,
  isFieldEncryptionEnvelope,
} from "@utils/security/field-encryption";
import { AppError } from "@utils/error-handling";
import type { Schema } from "@src/content/types";

const ENCRYPTION_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";

const schema = {
  _id: "Contacts",
  name: "Contacts",
  fields: [
    { db_fieldName: "title", widget: { Name: "Input" }, type: "string" },
    { db_fieldName: "ssn", widget: { Name: "Input" }, type: "string", encrypt: true },
    { db_fieldName: "notes", widget: { Name: "Markdown" }, type: "string", encrypt: true },
  ],
} as Schema;

const CTX = { collectionId: "Contacts", tenantId: "global" };

describe("field-encryption write/read pipeline", () => {
  beforeEach(() => {
    vi.stubEnv("ENCRYPTION_KEY", ENCRYPTION_KEY);
    resetFieldEncryptionKeyCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetFieldEncryptionKeyCache();
  });

  it("compiles encrypted field names onto schema hot flags", () => {
    const hot = ensureSchemaHotFlags({ ...schema, fields: [...(schema.fields || [])] } as Schema);
    expect(hot._hasEncryptedFields).toBe(true);
    expect(hot._encryptedFieldNames).toEqual(["ssn", "notes"]);
  });

  it("does not flag system columns even if encrypt is set", () => {
    const s = {
      _id: "X",
      name: "X",
      fields: [{ db_fieldName: "_id", encrypt: true, widget: { Name: "Input" } }],
    } as Schema;
    const hot = ensureSchemaHotFlags(s);
    expect(hot._hasEncryptedFields).toBe(false);
    expect(hot._encryptedFieldNames).toEqual([]);
  });

  it("encrypts flagged fields on write and leaves others plaintext", async () => {
    const hot = ensureSchemaHotFlags({ ...schema } as Schema);
    const prepared = prepareWritePayload(
      { title: "Ada", ssn: "111-22-3333", notes: "private" },
      schema,
      hot,
      { user: { _id: "u1", isAdmin: true }, operation: "create", tenantId: "global" as any },
    );
    const stored = await encryptWritePayload(prepared, hot, CTX);
    expect(stored.title).toBe("Ada");
    expect(isFieldEncryptionEnvelope(stored.ssn)).toBe(true);
    expect(isFieldEncryptionEnvelope(stored.notes)).toBe(true);
    expect(stored.ssn).not.toBe("111-22-3333");
  });

  it("decrypts a cloned SDK result so the cache copy stays ciphertext", async () => {
    const hot = ensureSchemaHotFlags({ ...schema } as Schema);
    const stored = await encryptWritePayload({ title: "Ada", ssn: "111-22-3333" }, hot, CTX);
    const cached = { success: true, data: [{ ...stored }] };
    const read = await decryptReadResult(cached, hot, CTX, { clone: true });
    expect(read.data[0].ssn).toBe("111-22-3333");
    expect(isFieldEncryptionEnvelope(cached.data[0].ssn)).toBe(true);
  });

  it("rejects filters and sorts on encrypted fields", () => {
    const hot = ensureSchemaHotFlags({ ...schema } as Schema);
    expect(() => assertEncryptedFieldsNotQueried({ ssn: "111-22-3333" }, hot)).toThrowError(
      AppError,
    );
    try {
      assertEncryptedFieldsNotQueried({ $or: [{ ssn: "x" }] }, hot);
    } catch (err: any) {
      expect(err.code).toBe("ENCRYPTED_FIELD_NOT_QUERYABLE");
      expect(err.status).toBe(400);
    }
    expect(() => assertEncryptedFieldsNotQueried({}, hot, "ssn")).toThrowError(AppError);
    expect(() => assertEncryptedFieldsNotQueried({ title: "Ada" }, hot)).not.toThrow();
  });

  it("is a no-op on schemas without encrypted fields", async () => {
    const plain = {
      _id: "Posts",
      name: "Posts",
      fields: [{ db_fieldName: "title", widget: { Name: "Input" } }],
    } as Schema;
    const hot = ensureSchemaHotFlags(plain);
    expect(hot._hasEncryptedFields).toBe(false);
    const data = { title: "Hello" };
    expect(await encryptWritePayload(data, hot, CTX)).toBe(data);
    expect(await decryptReadResult({ success: true, data: [data] }, hot, CTX)).toEqual({
      success: true,
      data: [data],
    });
  });

  it("stays synchronous for standard AES-GCM envelopes and round-trips hybrid ML-KEM fields end-to-end", async () => {
    const hot = ensureSchemaHotFlags({ ...schema } as Schema);

    // 1. Standard AES-GCM stays synchronous (zero Promise overhead on hot read lane)
    const aesStored = await encryptWritePayload({ title: "Ada", ssn: "111-22-3333" }, hot, CTX);
    const syncRead = decryptReadResult({ success: true, data: [{ ...aesStored }] }, hot, CTX, {
      clone: true,
    });
    expect(syncRead instanceof Promise).toBe(false);
    expect(syncRead.data[0].ssn).toBe("111-22-3333");

    // 2. Hybrid ML-KEM fields round-trip through encryptWritePayload -> decryptReadResult / presentRead / decryptReadStream
    const { generateCompositeKemKeyPair, isCompositeKemAvailable, isHybridEnvelope } =
      await import("@utils/security/hybrid-kem");
    if (!(await isCompositeKemAvailable())) return;

    const keys = await generateCompositeKemKeyPair();
    vi.stubEnv("PQC_HYBRID_FIELDS", "true");
    vi.stubEnv("PQC_KEM_PUBLIC_KEY", keys.publicKey);
    vi.stubEnv("PQC_KEM_PRIVATE_KEY", keys.privateKey);
    vi.stubEnv("PQC_X25519_PUBLIC_KEY", keys.classicalPublicKey);
    vi.stubEnv("PQC_X25519_PRIVATE_KEY", keys.classicalPrivateKey);

    const hybridStored = await encryptWritePayload(
      { title: "Grace", ssn: "999-88-7777", notes: "pqc-protected" },
      hot,
      CTX,
    );
    expect(isHybridEnvelope(hybridStored.ssn)).toBe(true);
    expect(isHybridEnvelope(hybridStored.notes)).toBe(true);

    const cachedEnvelope = { success: true, data: [{ ...hybridStored }] };
    const decrypted = await decryptReadResult(cachedEnvelope, hot, CTX, { clone: true });
    expect(decrypted.data[0].ssn).toBe("999-88-7777");
    expect(decrypted.data[0].notes).toBe("pqc-protected");
    // Cache copy must remain ciphertext
    expect(isHybridEnvelope(cachedEnvelope.data[0].ssn)).toBe(true);

    // presentRead also unwraps hybrid envelopes cleanly
    const presented = await presentRead(
      cachedEnvelope,
      schema,
      hot,
      CTX,
      { _id: "admin", isAdmin: true } as any,
      true,
    );
    expect(presented.data[0].ssn).toBe("999-88-7777");

    // decryptReadStream yields decrypted hybrid documents
    async function* streamSource() {
      yield { ...hybridStored };
    }
    const streamed: Array<Record<string, unknown>> = [];
    for await (const doc of decryptReadStream(streamSource(), hot, CTX)) {
      streamed.push(doc);
    }
    expect(streamed).toHaveLength(1);
    expect(streamed[0].ssn).toBe("999-88-7777");
    expect(streamed[0].notes).toBe("pqc-protected");
  });
});
