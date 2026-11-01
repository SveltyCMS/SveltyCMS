/**
 * @file tests/unit/widgets/core/rich-text.test.ts
 * @description Unit tests for the RichText widget validation schema and the
 * comparison normalizer that guards the editor↔value sync loop.
 *
 * Tests:
 * - Simple HTML content validation
 * - Empty content rejection when required
 * - Empty content allowance when not required
 * - Script tag sanitization
 * - `normalizeHtml` against the REAL implementation (default LTR alignment must
 *   compare equal to plain HTML without discarding real alignment)
 */

import RichTextWidget from "@widgets/core/rich-text";
import { normalizeHtml } from "@widgets/core/rich-text/normalize-html";
import { safeParse } from "valibot";

vi.mock("@src/paraglide/messages", async () => (await import("../test-utils")).WIDGET_MESSAGES);

describe("RichText Widget - Validation", () => {
  it("should validate simple HTML content", () => {
    const field = RichTextWidget({ label: "Content" });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, { content: "<p>Hello World</p>" }).success).toBe(true);
  });

  it("should reject empty content when required", () => {
    const field = RichTextWidget({ label: "Content", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, { content: "" }).success).toBe(false);
    expect(safeParse(schema, { content: "<p></p>" }).success).toBe(false);
    expect(safeParse(schema, { content: "   " }).success).toBe(false);
  });

  it("should allow empty content when not required", () => {
    const field = RichTextWidget({ label: "Content", required: false });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, { content: "" }).success).toBe(true);
    expect(safeParse(schema, { content: "<p></p>" }).success).toBe(true);
  });

  it("should sanitize script tags (basic check)", () => {
    const field = RichTextWidget({ label: "Content" });
    const schema = (field.widget.validationSchema as any)(field);

    // Note: The validation schema might just check for presence or use a transformer.
    const result = safeParse(schema, {
      content: "<p>Hello<script>alert(1)</script></p>",
    });

    expect(result.success).toBe(true);
  });
});

describe("RichText normalizeHtml - default alignment", () => {
  it("treats TipTap's default LTR alignment as plain HTML", () => {
    expect(normalizeHtml('<p style="text-align: left;">Body text</p>')).toBe(
      normalizeHtml("<p>Body text</p>"),
    );
    expect(normalizeHtml('<h2 style="text-align: start;">Title</h2>')).toBe(
      normalizeHtml("<h2>Title</h2>"),
    );
  });

  it("strips only the default declaration from a mixed style", () => {
    expect(normalizeHtml('<p style="text-align: left; color: red">x</p>')).toBe(
      normalizeHtml('<p style="color: red">x</p>'),
    );
    expect(normalizeHtml('<p style="text-align: left; color: red">x</p>')).toBe(
      '<p style="color: red">x</p>',
    );
  });

  it("preserves real alignment and keeps it distinct from plain HTML", () => {
    const plain = normalizeHtml("<p>x</p>");
    const center = normalizeHtml('<p style="text-align: center">x</p>');
    const right = normalizeHtml('<p style="text-align: right">x</p>');
    const end = normalizeHtml('<p style="text-align: end">x</p>');

    expect(center).toBe('<p style="text-align: center">x</p>');
    expect(right).toBe('<p style="text-align: right">x</p>');
    expect(end).toBe('<p style="text-align: end">x</p>');
    expect(center).not.toBe(plain);
    expect(right).not.toBe(plain);
    expect(end).not.toBe(plain);
  });

  it("normalizes empty style attributes and declaration spacing", () => {
    expect(normalizeHtml('<p style="">x</p>')).toBe("<p>x</p>");
    expect(normalizeHtml('<p style="color:red">x</p>')).toBe(
      normalizeHtml('<p style="color: red">x</p>'),
    );
    expect(normalizeHtml("<p style='color: red'>x</p>")).toBe('<p style="color: red">x</p>');
  });
});

describe("RichText normalizeHtml - empty documents and whitespace", () => {
  it("normalizes every empty-document form to an empty string", () => {
    expect(normalizeHtml("")).toBe("");
    expect(normalizeHtml("<p></p>")).toBe("");
    expect(normalizeHtml("<p><br></p>")).toBe("");
    expect(normalizeHtml('<p style="text-align: left;"></p>')).toBe("");
    expect(normalizeHtml('<p style="color: red"><br /></p>')).toBe("");
  });

  it("keeps whitespace inside a non-empty paragraph stable", () => {
    expect(normalizeHtml("<p> x </p>")).toBe("<p> x </p>");
    expect(normalizeHtml('  <p style="text-align: left;"> x </p>  ')).toBe(
      normalizeHtml("<p> x </p>"),
    );
  });
});
