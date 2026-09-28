/**
 * @file tests/unit/databases/composite-index-policy.test.ts
 * @description
 * Policy guard for the covering composite index `(tenantId, status, <col>, _id)`.
 *
 * Every extra index is maintained on **every** write: `updatedAt` is indexed and
 * rewritten by each update, so PostgreSQL can never take the HOT path and each
 * adapter touches all indexes (measured 2026-09-28: one extra index on a column
 * an UPDATE does not touch cost +11–17 % on a 2 000-row PostgreSQL UPDATE).
 * The index is therefore provisioned only for declared query targets:
 * `indexed: true` fields, numeric fields (the default `listFilterSort` sort
 * targets), and the `publishedAt` base column. `unique` / `materialize: true`
 * storage-only columns and the equality-lookup base columns (`collection`,
 * `slug`, `locale`) keep their single-column index only.
 *
 * All three SQL adapters (PostgreSQL, MariaDB, SQLite) consume
 * `buildCompositeIndexColumns`, so this suite pins the shared contract — a drift
 * here would silently re-add write amplification on one engine only.
 *
 * ### Features:
 * - eligibility: numeric + `indexed: true` accepted
 * - eligibility: `unique` / `materialize` / unmaterialized / encrypted rejected
 * - column set: `publishedAt` base column in, lookup columns out
 * - field naming: `db_fieldName` preferred, `label` fallback
 */

import { describe, expect, it } from "vitest";
import {
  buildCompositeIndexColumns,
  earnsCompositeIndex,
} from "@src/databases/core/drizzle-sql-helpers";

describe("earnsCompositeIndex", () => {
  it("accepts numeric fields (default filter/sort targets)", () => {
    expect(earnsCompositeIndex({ type: "number", db_fieldName: "count" })).toBe(true);
    expect(earnsCompositeIndex({ type: "integer", db_fieldName: "views" })).toBe(true);
  });

  it("accepts explicitly indexed scalars", () => {
    expect(earnsCompositeIndex({ type: "string", db_fieldName: "slug", indexed: true })).toBe(true);
    expect(earnsCompositeIndex({ type: "boolean", db_fieldName: "flag", indexed: true })).toBe(
      true,
    );
  });

  it("rejects storage-only columns (unique / materialize)", () => {
    expect(earnsCompositeIndex({ type: "string", db_fieldName: "sku", unique: true })).toBe(false);
    expect(earnsCompositeIndex({ type: "string", db_fieldName: "note", materialize: true })).toBe(
      false,
    );
  });

  it("rejects unmaterialized fields and encrypted fields", () => {
    expect(earnsCompositeIndex({ type: "string", db_fieldName: "body" })).toBe(false);
    expect(
      earnsCompositeIndex({ type: "number", db_fieldName: "secret", indexed: true, encrypt: true }),
    ).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(earnsCompositeIndex(undefined)).toBe(false);
    expect(earnsCompositeIndex("count")).toBe(false);
  });
});

describe("buildCompositeIndexColumns", () => {
  it("always includes the publishedAt base column, never the lookup columns", () => {
    const cols = buildCompositeIndexColumns(undefined);

    expect(cols.has("publishedAt")).toBe(true);
    expect(cols.has("collection")).toBe(false);
    expect(cols.has("slug")).toBe(false);
    expect(cols.has("locale")).toBe(false);
  });

  it("adds eligible fields by db_fieldName or label", () => {
    const cols = buildCompositeIndexColumns([
      { type: "number", db_fieldName: "count" },
      { type: "string", label: "publishDate", indexed: true },
      { type: "string", db_fieldName: "content" },
      { type: "string", db_fieldName: "sku", unique: true },
    ]);

    expect([...cols].sort()).toEqual(["count", "publishDate", "publishedAt"]);
  });

  it("tolerates a non-array fields value", () => {
    expect([...buildCompositeIndexColumns({})]).toEqual(["publishedAt"]);
  });
});
