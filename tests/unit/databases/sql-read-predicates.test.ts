/**
 * @file tests/unit/databases/sql-read-predicates.test.ts
 * @description
 * Unit coverage for the shared SQL read predicates: soft-delete row detection
 * across dialect wire shapes and `isDeleted` filter introspection (top level and
 * `$and`-nested).
 *
 * ### Features:
 * - boolean / 0-1 / stringified soft-delete truthiness
 * - explicit `isDeleted` filters win over the automatic live-row clamp
 */

import { describe, expect, it } from "vitest";
import { isSoftDeletedRow, queryHasSoftDeleteKey } from "@src/databases/sql/read-predicates";

describe("isSoftDeletedRow", () => {
  it("accepts every dialect representation of a deleted row", () => {
    expect(isSoftDeletedRow({ isDeleted: true })).toBe(true);
    expect(isSoftDeletedRow({ isDeleted: 1 })).toBe(true);
    expect(isSoftDeletedRow({ isDeleted: "1" })).toBe(true);
    expect(isSoftDeletedRow({ isDeleted: "true" })).toBe(true);
  });

  it("rejects live rows, missing flags and non-objects", () => {
    expect(isSoftDeletedRow({ isDeleted: false })).toBe(false);
    expect(isSoftDeletedRow({ isDeleted: 0 })).toBe(false);
    expect(isSoftDeletedRow({})).toBe(false);
    expect(isSoftDeletedRow(null)).toBe(false);
    expect(isSoftDeletedRow(undefined)).toBe(false);
  });
});

describe("queryHasSoftDeleteKey", () => {
  it("detects a top-level isDeleted filter", () => {
    expect(queryHasSoftDeleteKey({ isDeleted: true })).toBe(true);
    expect(queryHasSoftDeleteKey({ isDeleted: false })).toBe(true);
  });

  it("detects an isDeleted filter nested in $and", () => {
    expect(queryHasSoftDeleteKey({ $and: [{ status: "draft" }, { isDeleted: true }] })).toBe(true);
    expect(
      queryHasSoftDeleteKey({ $and: [{ $and: [{ isDeleted: false }] }, { title: "x" }] }),
    ).toBe(true);
  });

  it("ignores unrelated filters and non-objects", () => {
    expect(queryHasSoftDeleteKey({ status: "draft" })).toBe(false);
    expect(queryHasSoftDeleteKey({ $and: [{ title: "x" }] })).toBe(false);
    expect(queryHasSoftDeleteKey(null)).toBe(false);
    expect(queryHasSoftDeleteKey("isDeleted")).toBe(false);
  });
});
