/**
 * @file src/widgets/custom/currency/tests/currency.test.ts
 * @description Unit tests for the Currency widget validation logic
 */

import { describe, it, expect } from "vitest";
import CurrencyWidget from "../index";
import { safeParse } from "valibot";

describe("Currency Widget - Validation", () => {
  it("should validate numeric values", () => {
    const field = CurrencyWidget({ label: "Price" });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, 10.5).success).toBe(true);
    expect(safeParse(schema, "10.5").success).toBe(false);
  });

  it("should respect min/max constraints", () => {
    const field = CurrencyWidget({ label: "Price", minValue: 10, maxValue: 100 });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, 50).success).toBe(true);
    expect(safeParse(schema, 5).success).toBe(false);
    expect(safeParse(schema, 150).success).toBe(false);
  });

  it("should handle optional values if not required", () => {
    const field = CurrencyWidget({ label: "Price", required: false });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, null).success).toBe(true);
    expect(safeParse(schema, undefined).success).toBe(false); // Current impl uses nullable, not optional
  });
});
