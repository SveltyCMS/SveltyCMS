/**
 * @file tests/unit/sdk/write-pipeline-perf.test.ts
 * @description Observable-behavior contracts for the optimized collections
 * write pipeline. Pins the contracts the optimizations rely on (never timings):
 * caller payloads are never mutated, create/update stamping semantics are
 * exact (updatedBy only when the schema declares the field), the no-encryption
 * encrypt pass is a synchronous identity, hot-flag plans are stable per
 * schema, and persistWithOutbox passes an empty tx-options object to the
 * adapter exactly once and returns the adapter result unchanged.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  encryptWritePayload,
  prepareWritePayload,
} from "@src/services/sdk/namespaces/collections/write-pipeline";
import { persistWithOutbox } from "@src/services/sdk/namespaces/collections/post-write";
import { ensureSchemaHotFlags } from "@src/services/sdk/namespaces/collections/schema-store";
import { resetFieldEncryptionKeyCache } from "@utils/security/field-encryption";
import type { Schema } from "@src/content/types";

const plainSchema = {
  _id: "Articles",
  name: "Articles",
  fields: [
    { db_fieldName: "title", widget: { Name: "Input" }, type: "string" },
    { db_fieldName: "views", widget: { Name: "Input" }, type: "number" },
  ],
} as Schema;

const schemaWithAudit = {
  _id: "Audited",
  name: "Audited",
  fields: [
    { db_fieldName: "title", widget: { Name: "Input" }, type: "string" },
    { db_fieldName: "updatedBy", widget: { Name: "Input" }, type: "string" },
  ],
} as Schema;

describe("collections write-pipeline observable contracts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("create stamps tenantId/createdBy/createdAt on a copy and never mutates the caller payload", () => {
    const user = { _id: "u1", isAdmin: true };
    const payload = { title: "Hello", views: 1 };
    const hot = ensureSchemaHotFlags(plainSchema);

    const prepared = prepareWritePayload(payload, plainSchema, hot, {
      user,
      operation: "create",
      tenantId: "tenant-a" as never,
    });

    expect(prepared).not.toBe(payload);
    expect(payload).toEqual({ title: "Hello", views: 1 });
    expect(prepared.title).toBe("Hello");
    expect(prepared.tenantId).toBe("tenant-a");
    expect(prepared.createdBy).toBe("u1");
    expect(typeof prepared.createdAt).toBe("string");
  });

  it("create stamps createdBy as 'system' for system writes", () => {
    const hot = ensureSchemaHotFlags(plainSchema);
    const prepared = prepareWritePayload({ title: "Sys" }, plainSchema, hot, {
      user: undefined,
      system: true,
      operation: "create",
      tenantId: "tenant-a" as never,
    });
    expect(prepared.createdBy).toBe("system");
    expect(prepared.tenantId).toBe("tenant-a");
  });

  it("update stamps updatedBy only when the schema declares the field", () => {
    const user = { _id: "u2", isAdmin: true };

    const hotDeclared = ensureSchemaHotFlags(schemaWithAudit);
    const stamped = prepareWritePayload({ title: "T" }, schemaWithAudit, hotDeclared, {
      user,
      operation: "update",
      tenantId: "tenant-a" as never,
      entryId: "e1",
    });
    expect(stamped.updatedBy).toBe("u2");
    expect(typeof stamped.updatedAt).toBe("string");

    // Undeclared updatedBy must NOT be stamped (blob-rewrite guard).
    const hotPlain = ensureSchemaHotFlags(plainSchema);
    const unstamped = prepareWritePayload({ title: "T" }, plainSchema, hotPlain, {
      user,
      operation: "update",
      tenantId: "tenant-a" as never,
      entryId: "e1",
    });
    expect("updatedBy" in unstamped).toBe(false);
    expect(typeof unstamped.updatedAt).toBe("string");
  });

  it("encryptWritePayload is a synchronous identity when the schema has no encrypted fields", () => {
    const hot = ensureSchemaHotFlags(plainSchema);
    expect(hot._hasEncryptedFields).toBe(false);
    const data = { title: "Hello", views: 1 };
    const result = encryptWritePayload(data, hot, {
      collectionId: "Articles",
      tenantId: "tenant-a",
    });
    expect(result).toBe(data);
    expect(result && typeof (result as { then?: unknown }).then === "function").toBe(false);
  });

  it("encryptWritePayload still resolves to the same object when encryption is declared", async () => {
    vi.stubEnv(
      "ENCRYPTION_KEY",
      "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    );
    resetFieldEncryptionKeyCache();
    const encrypted = {
      _id: "Secrets",
      name: "Secrets",
      fields: [
        { db_fieldName: "title", widget: { Name: "Input" }, type: "string" },
        { db_fieldName: "ssn", widget: { Name: "Input" }, type: "string", encrypt: true },
      ],
    } as Schema;
    const hot = ensureSchemaHotFlags(encrypted);
    expect(hot._hasEncryptedFields).toBe(true);

    const data = { title: "Ada", ssn: "111-22-3333" };
    const result = encryptWritePayload(data, hot, { collectionId: "Secrets", tenantId: "t1" });
    expect(result && typeof (result as { then?: unknown }).then === "function").toBe(true);
    await expect(result).resolves.toBe(data);
    expect(data.ssn).not.toBe("111-22-3333");
  });

  it("hot-flag plans are compiled once per schema and stay referentially stable", () => {
    const first = ensureSchemaHotFlags(plainSchema);
    const second = ensureSchemaHotFlags(plainSchema);
    expect(first).toBe(second);
    expect(second._numberFields).toBe(first._numberFields);
    expect(second._dateTimeFieldNames).toBe(first._dateTimeFieldNames);
    expect(first._hasNumberFields).toBe(true);
    expect(first._numberFields).toHaveLength(1);
    expect(first._numberFields?.[0].db_fieldName).toBe("views");
  });

  it("persistWithOutbox calls the adapter write exactly once with empty tx opts and passes the result through", async () => {
    vi.stubEnv("DISABLE_OUTBOX", "true");
    const write = vi.fn().mockResolvedValue({ success: true, data: { _id: "e1", title: "Hi" } });
    const schema = plainSchema;

    const result = await persistWithOutbox(
      "create",
      write,
      schema,
      "tenant-a" as never,
      { _id: "u1" },
      (res) => String(res.data?._id ?? ""),
      (res) => res.data,
    );

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toEqual({});
    expect(result).toEqual({ success: true, data: { _id: "e1", title: "Hi" } });
  });

  it("persistWithOutbox skips outbox scheduling on failure and propagates write rejections", async () => {
    vi.stubEnv("DISABLE_OUTBOX", "true");
    const write = vi.fn().mockResolvedValue({ success: false, message: "boom" });
    const getId = vi.fn();
    const result = await persistWithOutbox(
      "update",
      write,
      plainSchema,
      undefined,
      { _id: "u1" },
      getId,
      (res) => res.data,
    );
    expect(result.success).toBe(false);
    expect(getId).not.toHaveBeenCalled();

    const failure = new Error("db down");
    await expect(
      persistWithOutbox(
        "create",
        () => Promise.reject(failure),
        plainSchema,
        undefined,
        { _id: "u1" },
        getId,
        (res) => res.data,
      ),
    ).rejects.toBe(failure);
  });
});
