/**
 * @file src/widgets/custom/markdown/tests/markdown.test.ts
 * @description Unit tests for the Markdown widget validation logic.
 */

import { describe, it, expect } from "vitest";
import MarkdownWidget from "../index";
import { safeParse } from "valibot";

describe("Markdown Widget - Validation", () => {
  it("should validate a string", () => {
    const field = MarkdownWidget({ label: "Content", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, "# Hello World").success).toBe(true);
  });

  it("should handle optional values if not required", () => {
    const field = MarkdownWidget({ label: "Content", required: false });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, null).success).toBe(true);
  });

  it("should reject non-string values", () => {
    const field = MarkdownWidget({ label: "Content", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, 123).success).toBe(false);
  });
});
