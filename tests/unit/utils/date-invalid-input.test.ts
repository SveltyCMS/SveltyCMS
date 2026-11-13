/**
 * @file tests/unit/utils/date-invalid-input.test.ts
 * @description Regression tests for isoDateStringToDate invalid-input handling.
 *
 * Features:
 * - a corrupt ISO string must not become the current timestamp
 * - valid ISO strings continue to parse to the same instant
 */
import { isoDateStringToDate, isISODateString, parseISODateStringStrict } from "@src/utils/date";
import { describe, expect, it } from "vitest";

describe("isoDateStringToDate invalid input", () => {
  it("does not manufacture the current timestamp for a corrupt ISO string", () => {
    const before = Date.now();
    const result = isoDateStringToDate("not-a-date");
    const after = Date.now();

    // A corrupt string must not resolve to a live timestamp.
    expect(Number.isNaN(result.getTime())).toBe(true);
    // Belt-and-braces: the returned value must not be a "now"-like timestamp.
    expect(result.getTime() >= before && result.getTime() <= after).toBe(false);
  });

  it("keeps parsing valid ISO strings", () => {
    const valid = "2025-01-20T12:00:00.000Z";
    expect(isISODateString(valid)).toBe(true);
    expect(isoDateStringToDate(valid).toISOString()).toBe(valid);
  });

  it("returns null from the strict parser for invalid input", () => {
    expect(parseISODateStringStrict("not-a-date")).toBeNull();
    expect(parseISODateStringStrict("2025-02-30")).toBeNull();
  });

  it("returns a Date from the strict parser for valid input", () => {
    const valid = "2025-01-20T12:00:00.000Z";
    expect(parseISODateStringStrict(valid)?.toISOString()).toBe(valid);
  });
});
