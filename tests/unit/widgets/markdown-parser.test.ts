/**
 * @file tests/unit/widgets/markdown-parser.test.ts
 * @description Unit tests for centralized markdown parser utility.
 */

import { describe, it, expect } from "vitest";
import { parseMarkdown } from "@src/widgets/custom/markdown/parse-markdown";

describe("parseMarkdown", () => {
  it("handles null, undefined, and empty string safely", () => {
    expect(parseMarkdown(null)).toBe("");
    expect(parseMarkdown(undefined)).toBe("");
    expect(parseMarkdown("")).toBe("");
  });

  it("handles multi-span bold without greedy capture", () => {
    const input = "**foo** bar **baz**";
    const result = parseMarkdown(input);
    expect(result).toContain("<strong>foo</strong>");
    expect(result).toContain("<strong>baz</strong>");
    expect(result).not.toContain("<strong>foo** bar **baz</strong>");
  });

  it("handles multi-span italic without greedy capture", () => {
    const input = "*foo* bar *baz*";
    const result = parseMarkdown(input);
    expect(result).toContain("<em>foo</em>");
    expect(result).toContain("<em>baz</em>");
    expect(result).not.toContain("<em>foo* bar *baz</em>");
  });

  it("renders headings h1 through h6", () => {
    expect(parseMarkdown("# Heading 1")).toContain("<h1>Heading 1</h1>");
    expect(parseMarkdown("## Heading 2")).toContain("<h2>Heading 2</h2>");
    expect(parseMarkdown("### Heading 3")).toContain("<h3>Heading 3</h3>");
    expect(parseMarkdown("#### Heading 4")).toContain("<h4>Heading 4</h4>");
  });

  it("renders unordered and ordered lists", () => {
    const ul = "- Item 1\n- Item 2";
    const ulResult = parseMarkdown(ul);
    expect(ulResult).toContain("<ul>");
    expect(ulResult).toContain("<li>Item 1</li>");
    expect(ulResult).toContain("<li>Item 2</li>");
    expect(ulResult).toContain("</ul>");

    const ol = "1. First\n2. Second";
    const olResult = parseMarkdown(ol);
    expect(olResult).toContain("<ol>");
    expect(olResult).toContain("<li>First</li>");
    expect(olResult).toContain("<li>Second</li>");
    expect(olResult).toContain("</ol>");
  });

  it("renders fenced code blocks", () => {
    const code = "```ts\nconst x = 42;\n```";
    const result = parseMarkdown(code);
    expect(result).toContain("<pre><code>");
    expect(result).toContain("const x = 42;");
    expect(result).toContain("</code></pre>");
  });

  it("renders blockquotes", () => {
    const bq = "> Note: this is important";
    const result = parseMarkdown(bq);
    expect(result).toContain("<blockquote><p>Note: this is important</p></blockquote>");
  });

  it("renders links and images", () => {
    const link = "[SveltyCMS](https://sveltycms.com)";
    expect(parseMarkdown(link)).toContain('<a href="https://sveltycms.com">SveltyCMS</a>');

    const img = "![Logo](https://example.com/logo.png)";
    expect(parseMarkdown(img)).toContain('<img alt="Logo" src="https://example.com/logo.png"');
  });

  it("sanitizes dangerous XSS payloads", () => {
    const dangerous = "<script>alert('xss')</script>";
    const result = parseMarkdown(dangerous);
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert('xss')");
  });
});
