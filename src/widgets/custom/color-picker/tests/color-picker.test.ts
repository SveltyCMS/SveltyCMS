/**
 * @file src/widgets/custom/color-picker/tests/color-picker.test.ts
 * @description Unit tests for the ColorPicker widget validation logic
 */

import { describe, it, expect } from "vitest";
import ColorPickerWidget from "../index";
import { safeParse } from "valibot";

describe("ColorPicker Widget - Validation", () => {
  it("should validate 6-digit hex colors", () => {
    const field = ColorPickerWidget({ label: "Brand Color" });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, "#ff0000").success).toBe(true);
    expect(safeParse(schema, "#f00").success).toBe(false); // Only 6-digit supported
    expect(safeParse(schema, "invalid").success).toBe(false);
  });

  it("should fallback to black if optional and missing", () => {
    const field = ColorPickerWidget({ label: "Color", required: false });
    const schema = (field.widget.validationSchema as any)(field);

    const result = safeParse(schema, undefined);
    expect(result.success).toBe(true);
    expect(result.output).toBe("#000000");
  });

  it("should reject non-string values", () => {
    const field = ColorPickerWidget({ label: "Color" });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, 123).success).toBe(false);
    expect(safeParse(schema, null).success).toBe(false);
  });
});
