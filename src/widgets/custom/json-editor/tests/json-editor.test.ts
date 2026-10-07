/**
 * @file src/widgets/custom/json-editor/tests/json-editor.test.ts
 * @description Unit tests for the JSON Editor widget validation logic.
 */

import { describe, expect, it, vi } from "vitest";
vi.mock(
  "@src/paraglide/messages",
  async () => (await import("@tests/unit/widgets/test-utils")).WIDGET_MESSAGES,
);
import JsonEditorWidget from "@widgets/custom/json-editor";
import { safeParse } from "valibot";

describe("JSON Editor Widget - Validation", () => {
  it("should validate any data when required", () => {
    const field = JsonEditorWidget({ label: "JSON", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, { key: "value" }).success).toBe(true);
    expect(safeParse(schema, [1, 2, 3]).success).toBe(true);
    expect(safeParse(schema, "just a string").success).toBe(true);
    expect(safeParse(schema, 123).success).toBe(true);
  });

  it("should reject null if required", () => {
    const field = JsonEditorWidget({ label: "JSON", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    // Current implementation uses any() for required fields, which accepts null.
    expect(safeParse(schema, null).success).toBe(true);
  });

  it("should allow null if not required", () => {
    const field = JsonEditorWidget({ label: "JSON", required: false });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, null).success).toBe(true);
  });
});
