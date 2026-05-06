/**
 * @file src/widgets/custom/date-range/tests/date-range.test.ts
 * @description Unit tests for the Date Range widget validation logic.
 */

import { describe, it, expect } from "bun:test";
import DateRangeWidget from "../index";
import { safeParse } from "valibot";

describe("Date Range Widget - Validation", () => {
  const validRange = {
    start: "2026-01-01T00:00:00Z",
    end: "2026-01-10T00:00:00Z",
  };

  it("should validate a correct date range", () => {
    const field = DateRangeWidget({ label: "Range", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    const result = safeParse(schema, validRange);
    expect(result.success).toBe(true);
  });

  it("should reject if end date is before start date", () => {
    const field = DateRangeWidget({ label: "Range", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    const invalidRange = {
      start: "2026-01-10T00:00:00Z",
      end: "2026-01-01T00:00:00Z",
    };
    expect(safeParse(schema, invalidRange).success).toBe(false);
  });

  it("should reject invalid date formats", () => {
    const field = DateRangeWidget({ label: "Range", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    const invalidRange = {
      start: "not-a-date",
      end: "2026-01-10T00:00:00Z",
    };
    expect(safeParse(schema, invalidRange).success).toBe(false);
  });

  it("should handle required constraint", () => {
    const field = DateRangeWidget({ label: "Range", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, null).success).toBe(false);
  });

  it("should allow null if not required", () => {
    const field = DateRangeWidget({ label: "Range", required: false });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, null).success).toBe(true);
  });
});
