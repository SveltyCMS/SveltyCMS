/**
 * @file src/widgets/custom/phone-number/tests/phone-number.test.ts
 * @description Unit tests for the PhoneNumber widget validation logic.
 */

import { describe, it, expect } from "vitest";
import PhoneNumberWidget from "../index";
import { safeParse } from "valibot";

describe("PhoneNumber Widget - Validation", () => {
  it("should validate a correct international phone number", () => {
    const field = PhoneNumberWidget({ label: "Phone", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, "+49123456789").success).toBe(true);
    expect(safeParse(schema, "1234567890").success).toBe(true);
  });

  it("should reject invalid phone numbers", () => {
    const field = PhoneNumberWidget({ label: "Phone", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, "abc").success).toBe(false);
    expect(safeParse(schema, "+0123").success).toBe(false);
  });

  it("should respect custom patterns", () => {
    const field = PhoneNumberWidget({
      label: "Phone",
      required: true,
      pattern: "^\\d{3}-\\d{3}-\\d{4}$", // US Format
    });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, "123-456-7890").success).toBe(true);
    expect(safeParse(schema, "+49123456789").success).toBe(false);
  });

  it("should handle optional values if not required", () => {
    const field = PhoneNumberWidget({ label: "Phone", required: false });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, null).success).toBe(true);
    expect(safeParse(schema, undefined).success).toBe(true);
  });
});
