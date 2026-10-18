/**
 * @file tests/unit/databases/sql-value-preparation.test.ts
 * @description
 * Unit coverage for the pure value-preparation helpers shared by the SQL
 * adapters: date-column detection, temporal bind coercion, JSON-blob
 * serialization, and the sparse insert-default plan.
 *
 * ### Features:
 * - createdAt/updatedAt always count as date columns
 * - suffix heuristics never coerce TEXT columns without date metadata
 * - ISO-bind vs Date-bind temporal coercion per dialect
 * - insert defaults preserve existing values and honour intBooleans
 */

import { describe, expect, it } from "vitest";
import {
  applyInsertDefaults,
  buildInsertDefaultsPlan,
  coerceDateBindValue,
  collectDateColumnKeys,
  isDateColumnKey,
  isDateLikeColumnName,
  isJsonSerializableValue,
} from "@src/databases/sql/value-preparation";

describe("isDateLikeColumnName", () => {
  it("recognizes the special pair and temporal suffixes", () => {
    expect(isDateLikeColumnName("createdAt")).toBe(true);
    expect(isDateLikeColumnName("updatedAt")).toBe(true);
    expect(isDateLikeColumnName("publishDate")).toBe(true);
    expect(isDateLikeColumnName("startTime")).toBe(true);
    expect(isDateLikeColumnName("title")).toBe(false);
  });
});

describe("isDateColumnKey", () => {
  it("always treats createdAt/updatedAt as temporal", () => {
    expect(isDateColumnKey("createdAt", undefined)).toBe(true);
    expect(isDateColumnKey("updatedAt", { dataType: "string" })).toBe(true);
  });

  it("requires date metadata for other temporal-looking names", () => {
    expect(isDateColumnKey("publishDate", undefined)).toBe(false);
    expect(isDateColumnKey("publishDate", { dataType: "string" })).toBe(false);
    expect(isDateColumnKey("publishDate", { dataType: "date" })).toBe(true);
    expect(isDateColumnKey("startTime", { columnType: "Timestamp" })).toBe(true);
    expect(isDateColumnKey("startTime", { config: { dataType: "date" } })).toBe(true);
    expect(isDateColumnKey("startTime", { config: { columnType: "Timestamp" } })).toBe(true);
  });

  it("ignores non-temporal names even with date metadata", () => {
    expect(isDateColumnKey("title", { dataType: "date" })).toBe(false);
  });
});

describe("collectDateColumnKeys", () => {
  it("collects only real date columns and ignores inherited properties", () => {
    const schema = Object.create({
      inheritedDate: { dataType: "date" },
    }) as Record<string, unknown>;
    schema._id = {};
    schema.createdAt = {};
    schema.updatedAt = {};
    schema.publishDate = { dataType: "date" };
    schema.noteDate = { dataType: "string" };
    schema.title = {};

    expect(collectDateColumnKeys(schema)).toEqual(
      new Set(["createdAt", "updatedAt", "publishDate"]),
    );
  });
});

describe("coerceDateBindValue", () => {
  const iso = "2026-10-18T12:34:56.000Z";

  it("converts epochs and ISO text to Date for Date-bind dialects", () => {
    expect(coerceDateBindValue(1_700_000_000_000, true)).toEqual(new Date(1_700_000_000_000));
    expect(coerceDateBindValue(iso, true)).toEqual(new Date(iso));
  });

  it("leaves non-temporal and malformed values untouched for Date-bind dialects", () => {
    expect(coerceDateBindValue("not-a-date-at-all", true)).toBe("not-a-date-at-all");
    expect(coerceDateBindValue(0, true)).toBe(0);
    const date = new Date(iso);
    expect(coerceDateBindValue(date, true)).toBe(date);
  });

  it("converts Date and epochs to ISO text for ISO-bind dialects", () => {
    expect(coerceDateBindValue(new Date(iso), false)).toBe(iso);
    expect(coerceDateBindValue(1_700_000_000_000, false)).toBe(
      new Date(1_700_000_000_000).toISOString(),
    );
    expect(coerceDateBindValue(iso, false)).toBe(iso);
  });

  it("leaves invalid Dates and negative epochs untouched", () => {
    const invalid = new Date(Number.NaN);
    expect(coerceDateBindValue(invalid, false)).toBe(invalid);
    expect(coerceDateBindValue(-5, false)).toBe(-5);
  });
});

describe("isJsonSerializableValue", () => {
  it("accepts objects and arrays, rejects null, Date and primitives", () => {
    expect(isJsonSerializableValue({ a: 1 })).toBe(true);
    expect(isJsonSerializableValue([1, 2])).toBe(true);
    expect(isJsonSerializableValue(null)).toBe(false);
    expect(isJsonSerializableValue(new Date())).toBe(false);
    expect(isJsonSerializableValue("text")).toBe(false);
    expect(isJsonSerializableValue(3)).toBe(false);
  });
});

describe("insert defaults", () => {
  it("builds literal, function and timestamp entries", () => {
    const plan = buildInsertDefaultsPlan({
      _id: {},
      status: { default: "draft" },
      isDeleted: { default: false },
      slug: { defaultFn: () => "generated" },
      createdAt: {},
      updatedAt: {},
      optionalNote: {},
    });

    expect(plan).toEqual([
      { name: "status", def: "draft", isBooleanDef: false },
      { name: "isDeleted", def: false, isBooleanDef: true },
      { name: "slug", defaultFn: expect.any(Function) },
      { name: "createdAt", isTimestamp: true },
      { name: "updatedAt", isTimestamp: true },
    ]);
  });

  it("applies defaults without overwriting caller values", () => {
    const plan = buildInsertDefaultsPlan({
      status: { default: "draft" },
      isDeleted: { default: false },
      slug: { defaultFn: () => "generated" },
      createdAt: {},
    });

    const row = applyInsertDefaults(
      { _id: "abc", status: "published" },
      plan,
      () => "2026-10-18T00:00:00.000Z",
    );

    expect(row).toEqual({
      _id: "abc",
      status: "published",
      isDeleted: false,
      slug: "generated",
      createdAt: "2026-10-18T00:00:00.000Z",
    });
  });

  it("calls the stamp callback lazily, once", () => {
    let calls = 0;
    const plan = buildInsertDefaultsPlan({ createdAt: {}, updatedAt: {} });

    const row = applyInsertDefaults({}, plan, () => {
      calls += 1;
      return "stamp";
    });

    expect(calls).toBe(1);
    expect(row).toEqual({ createdAt: "stamp", updatedAt: "stamp" });
  });

  it("coerces boolean defaults to 0/1 for intBoolean dialects", () => {
    const plan = buildInsertDefaultsPlan({ isDeleted: { default: false } });
    expect(applyInsertDefaults({}, plan, () => "now", { intBooleans: true })).toEqual({
      isDeleted: 0,
    });
  });

  it("does not treat inherited columns as defaults", () => {
    const cols = Object.create({ inherited: { default: "x" } }) as Record<string, unknown>;
    cols.own = { default: "y" };
    expect(buildInsertDefaultsPlan(cols)).toEqual([{ name: "own", def: "y", isBooleanDef: false }]);
  });
});
