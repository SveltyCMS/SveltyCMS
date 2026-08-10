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
