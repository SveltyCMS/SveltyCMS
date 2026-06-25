/**
 * @file tests/unit/widgets/core/checkbox.test.ts
 * @description Unit tests for the Checkbox widget
 */

import { describe, it, expect } from "vitest";
import CheckboxWidget from "@widgets/core/checkbox";
import { safeParse } from "valibot";

describe("Checkbox Widget", () => {
  it("should validate boolean values", () => {
    const field = CheckboxWidget({ label: "Active" });
    const schema = field.widget.validationSchema;

    expect(safeParse(schema as any, true).success).toBe(true);
    expect(safeParse(schema as any, false).success).toBe(true);
  });

  it("should reject non-boolean values", () => {
    const field = CheckboxWidget({ label: "Active" });
    const schema = field.widget.validationSchema;

    expect(safeParse(schema as any, "true").success).toBe(false);
    expect(safeParse(schema as any, 1).success).toBe(false);
    expect(safeParse(schema as any, null).success).toBe(false);
  });

  it("should have correct defaults", () => {
    const field = CheckboxWidget({ label: "Active" });

    expect(field.color).toBe("primary");
    expect(field.size).toBe("md");
    expect(field.translated).toBe(false);
  });

  it("should allow overriding defaults", () => {
    const field = CheckboxWidget({
      label: "Active",
      color: "secondary",
      size: "lg",
    });

    expect(field.color).toBe("secondary");
    expect(field.size).toBe("lg");
  });
});
