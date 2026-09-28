/**
 * @file tests/unit/databases/materialize-field.test.ts
 * @description Row-store policy: numbers are columns, plain strings stay in the blob.
 *
 * Features:
 * - Number and integer fields materialize without an explicit flag
 * - Strings stay in `data` unless indexed, unique, or materialize: true
 * - Non-scalar widgets and encrypted fields never become columns
 */

import { describe, expect, it } from "vitest";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import {
  getMaterializedFieldColumns,
  shouldMaterializeField,
} from "@src/databases/core/drizzle-sql-helpers";

describe("shouldMaterializeField", () => {
  it("materializes number and integer fields so a counter patch does not rewrite JSON", () => {
    expect(
      shouldMaterializeField({
        db_fieldName: "views",
        type: "number",
        widget: { Name: "Input" },
      }),
    ).toBe(true);
    expect(
      shouldMaterializeField({
        db_fieldName: "count",
        type: "integer",
      }),
    ).toBe(true);
  });

  it("keeps plain strings in the blob", () => {
    expect(
      shouldMaterializeField({
        db_fieldName: "title",
        type: "string",
        widget: { Name: "Input" },
      }),
    ).toBe(false);
    expect(
      shouldMaterializeField({
        db_fieldName: "body",
        type: "string",
        widget: { Name: "RichText" },
      }),
    ).toBe(false);
  });

  it("materialized field columns are the table definition minus the system columns", () => {
    // The Direct-to-Wire point stream builds its JSON from the `data` blob, so it
    // must merge exactly these columns back (see getMaterializedFieldColumns).
    const table = sqliteTable("collection_x", {
      _id: text("_id").primaryKey(),
      tenantId: text("tenantId"),
      collection: text("collection"),
      slug: text("slug"),
      locale: text("locale"),
      publishedAt: integer("publishedAt"),
      status: text("status"),
      isDeleted: integer("isDeleted"),
      createdAt: integer("createdAt"),
      updatedAt: integer("updatedAt"),
      data: text("data"),
      views: integer("views"),
      sku: text("sku"),
    });

    expect(getMaterializedFieldColumns(table)).toEqual(["views", "sku"]);
    expect(getMaterializedFieldColumns(null)).toEqual([]);
  });

  it("still materializes an indexed string and refuses encrypted or object fields", () => {
    expect(
      shouldMaterializeField({
        db_fieldName: "slug",
        type: "string",
        widget: { Name: "Input" },
        indexed: true,
      }),
    ).toBe(true);
    expect(
      shouldMaterializeField({
        db_fieldName: "secret",
        type: "number",
        encrypt: true,
      }),
    ).toBe(false);
    expect(
      shouldMaterializeField({
        db_fieldName: "price",
        type: "number",
        widget: { Name: "Price" },
      }),
    ).toBe(false);
    expect(
      shouldMaterializeField({
        db_fieldName: "author",
        type: "string",
        widget: { Name: "Relation" },
        indexed: true,
      }),
    ).toBe(false);
  });
});
