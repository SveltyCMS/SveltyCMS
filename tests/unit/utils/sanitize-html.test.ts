/**
 * @file tests/unit/utils/sanitize-html.test.ts
 * @description Tests for the parser-based HTML sanitizer and the browser-safe
 * `stripHtml` helper.
 */
import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "@utils/sanitize-html.server";
import { safeHref, stripHtml } from "@utils/sanitize-html";

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
    expect(result).toBe("<a>Link</a>");
  });

  it("should preserve safe HTML", () => {
    const input = "<p><strong>Bold</strong> <em>Italic</em></p>";
    const result = sanitizeHtml(input);
    expect(result).toContain("<strong>");
    expect(result).toContain("<em>");
  });

  it("should strip self-closing script tags", () => {
    // HTML has no self-closing <script>: the parser (like the browser) treats
    // everything up to `</script>` (or EOF) as script content.
    const input = '<script src="evil.js"/><p>Safe</p>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("script");
    expect(result).toBe("");
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

  it("fast path: plain text containing the substring 'on' returns the same reference", () => {
    // Regression: the old fast path bailed on the bare "on" substring, so
    // harmless plain-text values like "Content for item…" (fields such as
    // title/content/slug) ran the full regex pipeline on every write.
    const input = "Content for item 0 with representative text payload";
    expect(sanitizeHtml(input)).toBe(input);
    expect(sanitizeHtml(input)).toBe(input); // value-identical
  });

  it("fast path: no-'<' strings with safe words are untouched", () => {
    for (const input of ["one", "foundation", "done", "console", "version 2.0"]) {
      expect(sanitizeHtml(input)).toBe(input);
    }
  });

  it("no-'<' attribute-injection payloads stay inert text (no parser call)", () => {
    // A string without `<` cannot open a tag, so the fast path returns it as-is;
    // `@html` renders it as text, never as an attribute of a live element.
    const injection = '" onmouseover="alert(1)" text';
    expect(sanitizeHtml(injection)).toBe(injection);

    const url = 'href="javascript:alert(1)"';
    expect(sanitizeHtml(url)).toBe(url);
    expect(sanitizeHtml('HREF="JAVASCRIPT:alert(1)"')).toBe('HREF="JAVASCRIPT:alert(1)"');
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

describe("safeHref", () => {
  it("allows relative paths, fragments and query strings", () => {
    expect(safeHref("/login")).toBe("/login");
    expect(safeHref("#section")).toBe("#section");
    expect(safeHref("?page=2")).toBe("?page=2");
    expect(safeHref("docs/intro")).toBe("docs/intro");
    expect(safeHref("/my page")).toBe("/my page");
  });

  it("allows http, https, mailto and tel", () => {
    expect(safeHref("https://sveltycms.com")).toBe("https://sveltycms.com");
    expect(safeHref("http://localhost:4173/health")).toBe("http://localhost:4173/health");
    expect(safeHref("mailto:security@sveltycms.com")).toBe("mailto:security@sveltycms.com");
    expect(safeHref("tel:+4912345")).toBe("tel:+4912345");
  });

  it("rejects script-capable schemes case-insensitively", () => {
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("JaVaScRiPt:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html;base64,PHNjcmlwdD4=")).toBeUndefined();
    expect(safeHref("vbscript:msgbox(1)")).toBeUndefined();
    expect(safeHref("file:///etc/passwd")).toBeUndefined();
  });

  it("sees through entity-encoded and padded payloads", () => {
    // The browser decodes entities and trims whitespace/control chars before
    // resolving the scheme, so the check must normalise first.
    expect(safeHref("java&#115;cript:alert(1)")).toBeUndefined();
    expect(safeHref("java&colon;script:alert(1)")).toBeUndefined();
    expect(safeHref("  javascript:alert(1)")).toBeUndefined();
    expect(safeHref("java\tscript:alert(1)")).toBeUndefined();
    expect(safeHref("java&#9;script:alert(1)")).toBeUndefined();
    expect(safeHref("java script:alert(1)")).toBeUndefined();
    expect(safeHref("java\u0000script:alert(1)")).toBeUndefined();
  });

  it("returns undefined for empty input", () => {
    expect(safeHref("")).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
    expect(safeHref("   ")).toBeUndefined();
  });
});
