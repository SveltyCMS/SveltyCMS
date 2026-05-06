/**
 * @file tests/unit/widgets/core/radio.test.ts
 * @description Unit tests for the Radio widget
 */

import { describe, it, expect } from "vitest";
import RadioWidget from "@widgets/core/radio";
import { safeParse } from "valibot";

describe("Radio Widget", () => {
  it("should validate selected option from allowed values", () => {
    const field = RadioWidget({
      label: "Color",
      options: [
        { label: "Red", value: "red" },
        { label: "Blue", value: "blue" },
      ],
    });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, "red").success).toBe(true);
    expect(safeParse(schema, "blue").success).toBe(true);
  });

  it("should reject values not in the options list", () => {
    const field = RadioWidget({
      label: "Color",
      options: [
        { label: "Red", value: "red" },
        { label: "Blue", value: "blue" },
      ],
    });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, "green").success).toBe(false);
    expect(safeParse(schema, "yellow").success).toBe(false);
  });

  it("should handle required constraint", () => {
    const field = RadioWidget({
      label: "Color",
      required: true,
      options: [{ label: "Red", value: "red" }],
    });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, null).success).toBe(false);
  });

  it("should allow null if not required", () => {
    const field = RadioWidget({
      label: "Color",
      required: false,
      options: [{ label: "Red", value: "red" }],
    });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, null).success).toBe(true);
  });
});
