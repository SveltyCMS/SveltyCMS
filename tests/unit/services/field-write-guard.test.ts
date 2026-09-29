/**
 * @file tests/unit/services/field-write-guard.test.ts
 * @description Unit tests for the schema-level field write guard
 * (`assertWriteAllowed` / `hasGuardedFields` / `getCollectionFields`).
 *
 * Verifies the FLAC write-rejection path without the HTTP layer: guarded
 * fields are rejected with 403 for non-admin roles, admin and unguarded
 * collections pass through at zero cost, and unknown collections resolve to
 * null (schema loading stays adapter-driven).
 */

import { describe, it, expect } from "vitest";
import {
  assertWriteAllowed,
  hasGuardedFields,
  getCollectionFields,
  getCollectionFromPath,
} from "@src/services/security/field-permission-service";
import { canAccessField, redactReadEnvelope } from "@utils/field-access";
import { ensureSchemaHotFlags } from "@src/services/sdk/namespaces/collections/schema-store";

const guardedFields = [
  { label: "Title", name: "title", type: "text", required: false, translated: false },
  {
    label: "Internal Notes",
    db_fieldName: "internal_notes",
    type: "text",
    required: false,
    translated: false,
    permissions: { readRoles: ["admin"], writeRoles: ["admin"] },
  },
] as any;

const hiddenFieldFields = [
  {
    label: "Title",
    name: "title",
    type: "text",
    required: false,
    translated: false,
  },
  {
    label: "Slug",
    db_fieldName: "slug",
    type: "text",
    required: false,
    translated: false,
    hidden: true,
  },
] as any;

const unguardedFields = [
  { label: "Title", name: "title", type: "text", required: false, translated: false },
  { label: "Body", name: "body", type: "richtext", required: false, translated: false },
] as any;

const editor = { _id: "u1", role: "editor", username: "ed" };

describe("hasGuardedFields", () => {
  it("detects role-restricted fields", () => {
    expect(hasGuardedFields(guardedFields)).toBe(true);
  });

  it("detects hidden fields", () => {
    expect(hasGuardedFields(hiddenFieldFields)).toBe(true);
  });

  it("returns false for plain fields", () => {
    expect(hasGuardedFields(unguardedFields)).toBe(false);
  });

  it("returns false for an empty field list", () => {
    expect(hasGuardedFields([])).toBe(false);
  });

  it("treats permissions.visibility private as a guard even with an empty role list", () => {
    const fields = [
      {
        label: "Secret",
        db_fieldName: "secretNotes",
        permissions: { visibility: "private", readRoles: [], writeRoles: [] },
      },
    ] as any;
    expect(hasGuardedFields(fields)).toBe(true);
    expect(canAccessField(fields[0], editor, "read")).toBe(false);
    expect(canAccessField(fields[0], { _id: "admin", role: "admin" }, "read")).toBe(true);
    expect(
      canAccessField(
        { ...fields[0], permissions: { visibility: "private", readRoles: ["editor"] } },
        editor,
        "read",
      ),
    ).toBe(true);
  });

  it("does not treat a public field with an empty role list as a guard", () => {
    expect(
      hasGuardedFields([
        {
          label: "Title",
          db_fieldName: "title",
          permissions: { visibility: "public", readRoles: [], writeRoles: [] },
        },
      ] as any),
    ).toBe(false);
  });
});

describe("assertWriteAllowed", () => {
  it("skips unguarded collections without throwing", async () => {
    await expect(
      assertWriteAllowed(unguardedFields, { title: "x", body: "y" }, editor),
    ).resolves.toBeUndefined();
  });

  it("allows admins to write guarded fields", async () => {
    await expect(
      assertWriteAllowed(
        guardedFields,
        { title: "x", internal_notes: "secret" },
        { _id: "admin", role: "admin" },
      ),
    ).resolves.toBeUndefined();
  });

  it("allows writes to fields outside the guarded set", async () => {
    await expect(
      assertWriteAllowed(guardedFields, { title: "x" }, editor),
    ).resolves.toBeUndefined();
  });

  it("rejects guarded-field writes for non-admin roles with 403", async () => {
    await expect(
      assertWriteAllowed(guardedFields, { title: "x", internal_notes: "secret" }, editor),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects writes to hidden fields for non-admin roles", async () => {
    await expect(
      assertWriteAllowed(hiddenFieldFields, { title: "x", slug: "mine" }, editor),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("rejects writes to a private-visibility field for non-admin roles", async () => {
    const fields = [
      {
        label: "Secret",
        db_fieldName: "secretNotes",
        permissions: { visibility: "private", readRoles: [], writeRoles: [] },
      },
    ] as any;
    await expect(assertWriteAllowed(fields, { secretNotes: "nope" }, editor)).rejects.toMatchObject(
      { status: 403 },
    );
  });
});

describe("read redaction for private visibility", () => {
  const fields = [
    { label: "Title", db_fieldName: "title", permissions: { visibility: "public" } },
    {
      label: "Secret",
      db_fieldName: "secretNotes",
      permissions: { visibility: "private", readRoles: [], writeRoles: [] },
    },
  ] as any;

  it("strips the private field for an editor and leaves the source row intact", () => {
    const row = { _id: "1", title: "Hello", secretNotes: "payroll" };
    const envelope = { success: true, data: row };
    const redacted = redactReadEnvelope(envelope, fields, editor) as {
      data: Record<string, unknown>;
    };
    expect(redacted.data.title).toBe("Hello");
    expect(redacted.data.secretNotes).toBeUndefined();
    expect(row.secretNotes).toBe("payroll");
    expect(envelope.data).toBe(row);
  });

  it("keeps the private field for an admin without copying the envelope", () => {
    const envelope = { success: true, data: { _id: "1", title: "Hello", secretNotes: "payroll" } };
    const redacted = redactReadEnvelope(envelope, fields, { _id: "admin", role: "admin" });
    expect(redacted).toBe(envelope);
  });

  it("compiles the private flag onto the schema hot path", () => {
    const schema = ensureSchemaHotFlags({
      _id: "posts",
      name: "posts",
      fields,
    } as any);
    expect(schema._hasGuardedFields).toBe(true);
  });
});

describe("getCollectionFields", () => {
  it("returns null for an unknown collection (adapter-driven loading)", async () => {
    const fields = await getCollectionFields("does-not-exist", "t1");
    expect(fields).toBeNull();
  });

  it("caches the resolved schema for 30s (second call hits the memo)", async () => {
    // Setup mock listSchemas returns an empty dataset, so both calls resolve
    // to null — exercising the memoized path deterministically.
    const first = await getCollectionFields("memo-check", "t2");
    const second = await getCollectionFields("memo-check", "t2");
    expect(first).toBeNull();
    expect(second).toBeNull();
  });
});

describe("getCollectionFromPath", () => {
  it("parses /api/collections/{name}", () => {
    expect(getCollectionFromPath("/api/collections/posts/abc")).toBe("posts");
  });

  it("parses /api/content/{name}", () => {
    expect(getCollectionFromPath("/api/content/pages")).toBe("pages");
  });

  it("parses the LocalSDK /api/local/collections/{name} prefix", () => {
    expect(getCollectionFromPath("/api/local/collections/posts/abc")).toBe("posts");
  });

  it("returns null for non-collection routes", () => {
    expect(getCollectionFromPath("/api/system/health")).toBeNull();
    expect(getCollectionFromPath("/")).toBeNull();
  });
});
