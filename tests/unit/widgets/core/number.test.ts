/**
 * @file tests/unit/widgets/core/number.test.ts
 * @description Unit tests for the Number widget
 */

import { describe, it, expect } from "vitest";
import NumberWidget from "@widgets/core/number";
import { safeParse } from "valibot";

describe("Number Widget", () => {
  it("should validate numeric values", () => {
    const field = NumberWidget({ label: "Age" });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, 25).success).toBe(true);
    expect(safeParse(schema, 0).success).toBe(true);
    expect(safeParse(schema, -10).success).toBe(true);
  });

  it("should reject non-numeric values", () => {
    const field = NumberWidget({ label: "Age" });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, "25").success).toBe(false);
    expect(safeParse(schema, true).success).toBe(false);
  });

  it("should validate min/max constraints", () => {
    const field = NumberWidget({ label: "Score", min: 0, max: 100 });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, 50).success).toBe(true);
    expect(safeParse(schema, -1).success).toBe(false);
    expect(safeParse(schema, 101).success).toBe(false);
  });

  it("should handle required constraint", () => {
    const requiredField = NumberWidget({ label: "Age", required: true });
    const optionalField = NumberWidget({ label: "Age", required: false });

    const reqSchema = (requiredField.widget.validationSchema as any)(requiredField);
    const optSchema = (optionalField.widget.validationSchema as any)(optionalField);

    expect(safeParse(reqSchema, null).success).toBe(false);
    expect(safeParse(optSchema, null).success).toBe(true);
  });
});
