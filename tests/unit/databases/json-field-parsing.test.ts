/**
 * @file tests/unit/databases/json-field-parsing.test.ts
 * @description Regression tests for JSON field read hardening — legacy
 *   double-encoded values (stringified strings) must parse to arrays so
 *   role permission bitsets never silently degrade to empty.
 */

import { describe, expect, it } from "vitest";
import { parseJsonField } from "@src/databases/core/relational-utils";

describe("parseJsonField (legacy encoding tolerance)", () => {
  it("parses a plain JSON array", () => {
    expect(parseJsonField<string[]>('["a","b"]', [])).toEqual(["a", "b"]);
  });

  it("parses a double-encoded array (stringified string)", () => {
    expect(parseJsonField<string[]>(JSON.stringify('["a","b"]'), [])).toEqual(["a", "b"]);
  });

  it("parses a double-encoded empty array to an empty array, not a string", () => {
    const parsed = parseJsonField<string[]>(JSON.stringify("[]"), []);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toEqual([]);
  });

  it("returns arrays unchanged", () => {
    expect(parseJsonField<string[]>(["a", "b"], [])).toEqual(["a", "b"]);
  });

  it("returns the fallback for undefined/null", () => {
    expect(parseJsonField<string[]>(undefined, [])).toEqual([]);
    expect(parseJsonField<string[]>(null, [])).toEqual([]);
  });

  it("returns plain non-JSON strings unchanged", () => {
    expect(parseJsonField("hello", "fallback")).toBe("hello");
  });
});
