/**
 * @file tests/unit/databases/json-data-patch-merge.test.ts
 * @description Unit guard for the partial-update JSON `data` merge helpers.
 *
 * Features:
 * - `jsonPatchNeedsJsMerge` — pins the exactness boundary: `json_patch` /
 *   `JSON_MERGE_PATCH` (RFC 7396) merge nested objects recursively and delete
 *   keys patched with `null`, so exactly those values must take the JS merge
 *   path. Scalars, dates and arrays are replaced identically by both, so they
 *   stay on the zero-read SQL operator path.
 * - `parseJsonDataBlob` — TEXT vs pre-decoded object vs double-encoded payloads,
 *   with NULL/malformed/non-object input returning null so a merge fails closed.
 * - marker lifecycle — the patch marker is invisible to `Object.keys`, spreads
 *   and JSON serialization (so no SQL builder ever sees an extra column) and is
 *   dropped once the caller has produced a complete blob.
 */

import { describe, it, expect } from "vitest";
import {
  clearJsonDataPatch,
  getJsonDataPatch,
  jsonPatchNeedsJsMerge,
  parseJsonDataBlob,
  setJsonDataPatch,
} from "@src/databases/core/json-data-patch";

describe("jsonPatchNeedsJsMerge — RFC 7396 deviation boundary", () => {
  it("keeps scalar, date and array patches on the SQL operator path", () => {
    expect(jsonPatchNeedsJsMerge({})).toBe(false);
    expect(jsonPatchNeedsJsMerge({ title: "x", views: 3, published: true })).toBe(false);
    expect(jsonPatchNeedsJsMerge({ tags: ["a", "b"] })).toBe(false);
    expect(jsonPatchNeedsJsMerge({ tags: [] })).toBe(false);
    expect(jsonPatchNeedsJsMerge({ when: new Date("2026-09-22T00:00:00.000Z") })).toBe(false);
    expect(jsonPatchNeedsJsMerge({ blob: new Uint8Array([1, 2]) })).toBe(false);
  });

  it("routes nested objects to the JS merge (json_patch would merge recursively)", () => {
    expect(jsonPatchNeedsJsMerge({ seo: { title: "a" } })).toBe(true);
    expect(jsonPatchNeedsJsMerge({ title: "x", seo: { title: "a" } })).toBe(true);
  });

  it("routes explicit nulls to the JS merge (json_patch would delete the key)", () => {
    expect(jsonPatchNeedsJsMerge({ relation: null })).toBe(true);
    expect(jsonPatchNeedsJsMerge({ tags: ["a"], relation: null })).toBe(true);
  });

  it("ignores inherited properties", () => {
    const patch = Object.create({ inherited: { nested: true } }) as Record<string, unknown>;
    patch.views = 1;
    expect(jsonPatchNeedsJsMerge(patch)).toBe(false);
  });
});

describe("parseJsonDataBlob — stored blob decoding", () => {
  it("parses SQLite-style JSON text", () => {
    expect(parseJsonDataBlob('{"title":"x","views":3}')).toEqual({ title: "x", views: 3 });
  });

  it("accepts an already-decoded object (MariaDB JSON columns)", () => {
    const obj = { title: "x" };
    expect(parseJsonDataBlob(obj)).toBe(obj);
  });

  it("unwraps a double-encoded payload", () => {
    expect(parseJsonDataBlob(JSON.stringify('{"title":"x"}'))).toEqual({ title: "x" });
  });

  it("fails closed on NULL, empty, malformed and non-object payloads", () => {
    expect(parseJsonDataBlob(null)).toBeNull();
    expect(parseJsonDataBlob(undefined)).toBeNull();
    expect(parseJsonDataBlob("")).toBeNull();
    expect(parseJsonDataBlob("{not json")).toBeNull();
    expect(parseJsonDataBlob("[1,2,3]")).toBeNull();
    expect(parseJsonDataBlob("42")).toBeNull();
    expect(parseJsonDataBlob('"scalar"')).toBeNull();
  });
});

describe("JSON patch marker lifecycle", () => {
  it("is invisible to column enumeration and serialization", () => {
    const values: Record<string, unknown> = { title: "x", updatedAt: "2026-09-22T00:00:00.000Z" };
    setJsonDataPatch(values, { title: "x" });

    expect(Object.keys(values)).toEqual(["title", "updatedAt"]);
    expect(JSON.stringify(values)).toBe('{"title":"x","updatedAt":"2026-09-22T00:00:00.000Z"}');
    expect(getJsonDataPatch({ ...values, other: 1 })).toBeUndefined();
    expect(getJsonDataPatch(values)).toEqual({ title: "x" });

    clearJsonDataPatch(values);
    expect(getJsonDataPatch(values)).toBeUndefined();
  });
});
