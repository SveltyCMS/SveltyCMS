/**
 * @file src/widgets/custom/rating/tests/rating.test.ts
 * @description Unit tests for the Rating widget validation logic.
 */

import { describe, it, expect } from "vitest";
import RatingWidget from "../index";
import { safeParse } from "valibot";

describe("Rating Widget - Validation", () => {
  it("should validate a correct numeric rating", () => {
    const field = RatingWidget({ label: "Rating", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, 3).success).toBe(true);
    expect(safeParse(schema, 5).success).toBe(true);
  });

  it("should reject ratings outside the allowed range", () => {
    const field = RatingWidget({ label: "Rating", required: true, max: 5 });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, 6).success).toBe(false);
    expect(safeParse(schema, -1).success).toBe(false);
    expect(safeParse(schema, 0).success).toBe(false); // Required rating must be >= 1
  });

  it("should allow 0 if not required", () => {
    const field = RatingWidget({ label: "Rating", required: false, max: 5 });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, 0).success).toBe(true);
  });

  it("should handle optional values if not required", () => {
    const field = RatingWidget({ label: "Rating", required: false });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, null).success).toBe(true);
  });

  it("should respect custom max ratings", () => {
    const field = RatingWidget({ label: "Rating", required: true, max: 10 });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, 10).success).toBe(true);
    expect(safeParse(schema, 11).success).toBe(false);
  });
});
