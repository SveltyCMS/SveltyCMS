/**
 * @file tests/unit/utils/sanitize-html.test.ts
 * @description Tests for the lightweight HTML sanitizer.
 */
import { describe, it, expect } from "vitest";
import { sanitizeHtml, stripHtml } from "@utils/sanitize-html";

describe("sanitizeHtml", () => {
  it("should return empty string for falsy input", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("should strip script tags and their content", () => {
    const input = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("script");
    expect(result).not.toContain("alert");
    expect(result).toContain("<p>Hello</p>");
  });

  it("should strip iframe tags", () => {
    const input = '<iframe src="evil.com"></iframe><p>Safe</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("iframe");
    expect(result).toContain("<p>Safe</p>");
  });

  it("should strip on* event handlers", () => {
    const input = '<div onclick="alert(1)">Click</div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("onclick");
    expect(result).toContain("<div");
  });

  it("should strip javascript: protocol in href", () => {
    const input = '<a href="javascript:alert(1)">Link</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("javascript:");
    expect(result).toContain("#blocked");
  });

  it("should preserve safe HTML", () => {
    const input = "<p><strong>Bold</strong> <em>Italic</em></p>";
    const result = sanitizeHtml(input);
    expect(result).toContain("<strong>");
    expect(result).toContain("<em>");
  });

  it("should strip self-closing script tags", () => {
    const input = '<script src="evil.js"/><p>Safe</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("script");
    expect(result).toContain("<p>Safe</p>");
  });

  it("self-closing dangerous tag should produce empty output", () => {
    const result = sanitizeHtml("<script/>");
    expect(result.trim()).toBe("");
  });

  it("event handler with spaces in value", () => {
    const result = sanitizeHtml('<div onclick="doSomething(1, 2)">x</div>');
    expect(result).not.toContain("onclick");
    expect(result).toContain("<div");
  });

  it("should strip self-closing iframe tags", () => {
    const result = sanitizeHtml('<iframe src="x"/>content');
    expect(result).not.toContain("iframe");
  });

  it("should strip orphan closing tags", () => {
    const result = sanitizeHtml("content</script>more</style>");
    expect(result).not.toContain("</script>");
    expect(result).not.toContain("</style>");
  });

  it("should strip event handlers with single quotes", () => {
    const result = sanitizeHtml("<div onclick='alert(1)'>x</div>");
    expect(result).not.toContain("onclick");
  });

  it("should strip event handlers without quotes", () => {
    const result = sanitizeHtml("<div onclick=alert(1)>x</div>");
    expect(result).not.toContain("onclick");
  });

  it("should strip opening script tags without closing", () => {
    const input = "<script>unclosed<p>Safe</p>";
    const result = sanitizeHtml(input);
    expect(result).not.toContain("script");
  });
});

describe("stripHtml", () => {
  it("should remove all HTML tags", () => {
    expect(stripHtml("<p>Hello</p>")).toBe("Hello");
    expect(stripHtml("<div><span>Text</span></div>")).toBe("Text");
  });

  it("should return empty for falsy input", () => {
    expect(stripHtml("")).toBe("");
  });
});
