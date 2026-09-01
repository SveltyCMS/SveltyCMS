/**
 * @file src/widgets/custom/tags/tests/tags.test.ts
 * @description Unit tests for the Tags widget validation logic.
 */

import { describe, it, expect } from "vitest";
import TagsWidget from "../index";
import { safeParse } from "valibot";

describe("Tags Widget - Validation", () => {
  it("should validate an array of strings", () => {
    const field = TagsWidget({ label: "Tags", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, ["tag1", "tag2"]).success).toBe(true);
  });

  it("should reject empty tags in the array", () => {
    const field = TagsWidget({ label: "Tags", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, ["tag1", ""]).success).toBe(false);
  });

  it("should respect minTags and maxTags", () => {
    const field = TagsWidget({
      label: "Tags",
      required: true,
      minTags: 2,
      maxTags: 3,
    });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, ["tag1"]).success).toBe(false); // Too few
    expect(safeParse(schema, ["tag1", "tag2"]).success).toBe(true);
    expect(safeParse(schema, ["tag1", "tag2", "tag3"]).success).toBe(true);
    expect(safeParse(schema, ["tag1", "tag2", "tag3", "tag4"]).success).toBe(false); // Too many
  });

  it("should handle optional values if not required", () => {
    const field = TagsWidget({ label: "Tags", required: false });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, null).success).toBe(true);
    expect(safeParse(schema, []).success).toBe(true);
  });
});
