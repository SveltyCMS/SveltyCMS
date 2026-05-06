/**
 * @file tests/unit/widgets/core/slug.test.ts
 * @description Unit tests for the Slug widget
 */

import { describe, it, expect } from "vitest";
import SlugWidget from "@widgets/core/slug";
import { safeParse } from "valibot";

describe("Slug Widget", () => {
  it("should validate URL-safe slug strings", () => {
    const field = SlugWidget({ label: "Slug" });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, "my-slug").success).toBe(true);
    expect(safeParse(schema, "my_slug_123").success).toBe(true);
  });

  it("should reject unsafe slug strings", () => {
    const field = SlugWidget({ label: "Slug" });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema as any, "My Slug").success).toBe(false); // No spaces
    expect(safeParse(schema as any, "slug@!").success).toBe(false); // No special chars
    expect(safeParse(schema as any, "SLUG").success).toBe(true); // Transformed to lower case before validation
  });

  it("should handle min/max length constraints", () => {
    const field = SlugWidget({ label: "Slug", minLength: 3, maxLength: 10 });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema as any, "ab").success).toBe(false);
    expect(safeParse(schema as any, "abc").success).toBe(true);
    expect(safeParse(schema as any, "abcdefghijk").success).toBe(false);
  });

  it("should handle required constraint", () => {
    const field = SlugWidget({ label: "Slug", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema as any, "").success).toBe(false);
    expect(safeParse(schema as any, null).success).toBe(false);
  });
});
