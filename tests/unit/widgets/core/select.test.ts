/**
 * @file tests/unit/widgets/core/select.test.ts
 * @description Unit tests for the Select widget
 */

import { describe, it, expect } from "vitest";
import SelectWidget from "@widgets/core/select";
import { safeParse } from "valibot";

describe("Select Widget", () => {
  it("should validate selected option from string list", () => {
    const field = SelectWidget({
      label: "Category",
      options: ["News", "Sports", "Tech"],
    });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, "News").success).toBe(true);
    expect(safeParse(schema, "Sports").success).toBe(true);
    expect(safeParse(schema, "Other").success).toBe(false);
  });

  it("should validate selected option from object list", () => {
    const field = SelectWidget({
      label: "Category",
      options: [
        { label: "News", value: "news" },
        { label: "Sports", value: "sports" },
      ],
    });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, "news").success).toBe(true);
    expect(safeParse(schema, "sports").success).toBe(true);
    expect(safeParse(schema, "News").success).toBe(false); // Case sensitive
  });

  it("should handle required constraint", () => {
    const field = SelectWidget({
      label: "Category",
      required: true,
      options: ["A"],
    });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, null).success).toBe(false);
  });
});
