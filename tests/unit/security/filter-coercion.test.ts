/**
 * @file tests/unit/security/filter-coercion.test.ts
 * @description REST filter values are query-string strings; the SDK coerces
 * them to the declared schema type before they reach an adapter.
 *
 * Without this, `filter[featured]=true` is a string: SQLite/Mongo match no rows
 * and MariaDB compares `'true'` against a TINYINT as `0` (returns the opposite
 * rows). See `docs/security/threat-models/` (input handling).
 */

import { describe, expect, it } from "vitest";
import type { Schema } from "@src/content/types";
import { coerceFilterValues } from "@utils/collection-query-filters.server";

const schema = {
  fields: [
    { db_fieldName: "featured", name: "featured", label: "Featured", type: "boolean" },
    { db_fieldName: "views", name: "views", label: "Views", type: "number" },
    {
      db_fieldName: "team",
      name: "team",
      label: "Team",
      type: "group",
      fields: [{ db_fieldName: "salary", name: "salary", label: "Salary", type: "number" }],
    },
  ],
} as unknown as Schema;

describe("coerceFilterValues", () => {
  it("coerces boolean strings to booleans", () => {
    expect(coerceFilterValues(schema, { featured: "true" })).toEqual({ featured: true });
    expect(coerceFilterValues(schema, { featured: "1" })).toEqual({ featured: true });
    expect(coerceFilterValues(schema, { featured: "false" })).toEqual({ featured: false });
    expect(coerceFilterValues(schema, { featured: "0" })).toEqual({ featured: false });
  });

  it("coerces numeric strings, including operator operands", () => {
    expect(coerceFilterValues(schema, { views: "10" })).toEqual({ views: 10 });
    expect(coerceFilterValues(schema, { views: { $gte: "10" } })).toEqual({
      views: { $gte: 10 },
    });
    expect(coerceFilterValues(schema, { views: { $in: ["1", "2"] } })).toEqual({
      views: { $in: [1, 2] },
    });
  });

  it("resolves dotted paths inside groups", () => {
    expect(coerceFilterValues(schema, { "team.salary": { $gt: "100000" } })).toEqual({
      "team.salary": { $gt: 100000 },
    });
  });

  it("rejects values that cannot be represented in the field type", () => {
    expect(() => coerceFilterValues(schema, { featured: "maybe" })).toThrow(/Invalid boolean/);
    expect(() => coerceFilterValues(schema, { views: "many" })).toThrow(/Invalid numeric/);
  });

  it("walks logical groups", () => {
    expect(coerceFilterValues(schema, { $or: [{ featured: "1" }, { views: "5" }] })).toEqual({
      $or: [{ featured: true }, { views: 5 }],
    });
  });

  it("never mutates the caller's filter and passes unknown fields through", () => {
    const input = { unknown: "value" };
    const result = coerceFilterValues(schema, input);
    expect(result).toEqual({ unknown: "value" });
    expect(result).not.toBe(input);
    expect(input).toEqual({ unknown: "value" });
  });
});
