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
import { shouldMaterializeField } from "@src/databases/core/drizzle-sql-helpers";

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
