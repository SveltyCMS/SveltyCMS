/**
 * @file tests/unit/services/field-encryption-pipeline.test.ts
 * @description Write/read pipeline tests for `encrypt: true` collection fields.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptWritePayload,
  prepareWritePayload,
} from "@src/services/sdk/namespaces/collections/write-pipeline";
import {
  assertEncryptedFieldsNotQueried,
  decryptReadResult,
} from "@src/services/sdk/namespaces/collections/read-pipeline";
import { ensureSchemaHotFlags } from "@src/services/sdk/namespaces/collections/schema-store";
import {
  resetFieldEncryptionKeyCache,
  isFieldEncryptionEnvelope,
} from "@utils/security/field-encryption";
import { AppError } from "@utils/error-handling";
import type { Schema } from "@src/content/types";

const ENCRYPTION_KEY = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";
const OLD_ENV = { ...process.env };

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
    process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
    resetFieldEncryptionKeyCache();
  });

  afterEach(() => {
    process.env = { ...OLD_ENV };
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
});
