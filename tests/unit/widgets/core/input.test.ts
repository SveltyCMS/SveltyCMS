/**
 * @file tests/unit/widgets/core/input.test.ts
 * @description Unit tests for the Input widget
 */

import { describe, it, expect } from "vitest";
import InputWidget from "@widgets/core/input";
import { safeParse } from "valibot";

describe("Input Widget", () => {
  it("should validate plain text input", () => {
    const field = InputWidget({ label: "Title", translated: false });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, "Hello World").success).toBe(true);
    expect(safeParse(schema, "  Trimmed  ").success).toBe(true);
  });

  it("should validate translated input (object with language keys)", () => {
    const field = InputWidget({ label: "Title", translated: true });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, { en: "Hello", fr: "Bonjour" }).success).toBe(true);
    expect(safeParse(schema, {}).success).toBe(true);
  });

  it("should handle min/max length constraints", () => {
    const field = InputWidget({ label: "Title", translated: false, minLength: 5, maxLength: 10 });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, "1234").success).toBe(false);
    expect(safeParse(schema, "12345").success).toBe(true);
    expect(safeParse(schema, "12345678901").success).toBe(false);
  });

  it("should handle required constraint", () => {
    const field = InputWidget({ label: "Title", translated: false, required: true });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, "").success).toBe(false);
    expect(safeParse(schema, null).success).toBe(false);
  });
});
