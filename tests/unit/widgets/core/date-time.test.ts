/**
 * @file tests/unit/widgets/core/date-time.test.ts
 * @description Unit tests for the DateTime widget
 */

import { describe, it, expect } from "vitest";
import DateTimeWidget from "@widgets/core/date-time";
import { safeParse } from "valibot";

describe("DateTime Widget", () => {
  it("should validate valid ISO 8601 timestamps", () => {
    const field = DateTimeWidget({ label: "Birthday" });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema as any, "2026-05-06T00:00:00Z").success).toBe(true);
    expect(safeParse(schema as any, "2026-05-06").success).toBe(false); // isoTimestamp requires time
  });

  it("should reject invalid date strings", () => {
    const field = DateTimeWidget({ label: "Birthday" });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema as any, "invalid-date").success).toBe(false);
    expect(safeParse(schema as any, "06-05-2026").success).toBe(false); // Non-ISO
  });

  it("should handle required constraint", () => {
    const requiredField = DateTimeWidget({ label: "Birthday", required: true });
    const optionalField = DateTimeWidget({
      label: "Birthday",
      required: false,
    });

    const reqSchema = (requiredField.widget.validationSchema as any)(requiredField);
    const optSchema = (optionalField.widget.validationSchema as any)(optionalField);

    expect(safeParse(reqSchema, null).success).toBe(false);
    expect(safeParse(optSchema, null).success).toBe(true);
  });

  it("should have correct defaults", () => {
    const field = DateTimeWidget({ label: "Birthday" });
    expect(field.translated).toBe(false);
  });
});
