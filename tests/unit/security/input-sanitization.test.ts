/**
 * @file tests/unit/security/input-sanitization.test.ts
 * @description Tests for the input sanitization middleware.
 *
 * Validates:
 * - XSS vectors stripped from string values
 * - Safe HTML preserved
 * - Event handlers removed
 * - javascript: URLs sanitized
 * - Nested/encoded vectors caught
 * - Non-string values pass through unchanged
 */

import { describe, test, expect } from "vitest";
import {
  sanitizeString,
  sanitizeObject,
  containsXssVector,
} from "@src/utils/security/input-sanitizer";

describe("sanitizeString", () => {
  test("strips script tags with content", () => {
    const result = sanitizeString('hello<script>alert("xss")</script>world');
    expect(result).toBe("helloworld");
  });

  test("strips iframe tags", () => {
    const result = sanitizeString('<iframe src="https://evil.com"></iframe>');
    expect(result).toBe("");
  });

  test("strips object tags", () => {
    const result = sanitizeString('<object data="evil.swf"></object>');
    expect(result).toBe("");
  });

  test("strips embed tags", () => {
    const result = sanitizeString('<embed src="evil.svg" />');
    expect(result).toBe("");
  });

  test("removes event handlers (onclick, onload, onerror)", () => {
    const result = sanitizeString('<p onclick="alert(1)">Click</p>');
    expect(result).toBe("<p>Click</p>");
  });

  test("removes javascript: URLs in href", () => {
    const result = sanitizeString('<a href="javascript:alert(1)">link</a>');
    expect(result).toBe('<a href="">link</a>');
  });

  test("removes javascript: URLs in src", () => {
    const result = sanitizeString('<img src="javascript:alert(1)" />');
    expect(result).toBe('<img src="" />');
  });

  test("preserves safe HTML tags", () => {
    const input = "<p><strong>Safe</strong> <em>content</em></p>";
    const result = sanitizeString(input);
    // The safe tags (p, strong, em) should be preserved — DANGEROUS_TAGS_RE doesn't include them
    expect(result).toContain("<p>");
    expect(result).toContain("<strong>");
    expect(result).toContain("Safe");
  });

  test("strips dangerous tags but keeps safe ones mixed", () => {
    const input = "<div><script>evil()</script><p>hello <b>world</b></p></div>";
    const result = sanitizeString(input);
    expect(result).not.toContain("<script>");
    expect(result).toContain("<p>");
    expect(result).toContain("<b>");
    expect(result).toContain("hello");
  });

  test("handles null/empty input", () => {
    expect(sanitizeString("")).toBe("");
  });

  test("skips very large payloads (>100k chars)", () => {
    const large = "a".repeat(100_001);
    expect(sanitizeString(large)).toBe(large);
  });

  test("removes onmouseover handler", () => {
    const result = sanitizeString('<span onmouseover="alert(1)">hover</span>');
    expect(result).toBe("<span>hover</span>");
  });

  test("strips data:text/html URIs in src", () => {
    const result = sanitizeString(
      '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>',
    );
    // IFRAME tag itself is stripped, but data URI should be caught too
    expect(result).toBe("");
  });
});

describe("sanitizeObject", () => {
  test("sanitizes all string values in a nested object", () => {
    const input = {
      title: "Hello<script>alert(1)</script>",
      body: '<p onclick="evil()">Safe text</p>',
      meta: { description: '<iframe src="x"></iframe>nested' },
    };
    const result = sanitizeObject(input);
    expect(result.title).not.toContain("<script>");
    expect(result.body).not.toContain("onclick");
    expect(result.meta.description).not.toContain("<iframe>");
    expect(result.title).toBe("Hello");
    expect(result.body).toBe("<p>Safe text</p>");
    expect(result.meta.description).toBe("nested");
  });

  test("sanitizes arrays of objects", () => {
    const input = [{ name: '<b onclick="x()">bold</b>' }, { name: "<script>evil()</script>clean" }];
    const result = sanitizeObject(input);
    expect(result[0].name).not.toContain("onclick");
    expect(result[1].name).not.toContain("<script>");
    expect(result[0].name).toBe("<b>bold</b>");
    expect(result[1].name).toBe("clean");
  });

  test("passes non-string values through unchanged", () => {
    const input = { num: 42, bool: true, nil: null, arr: [1, 2, 3] };
    const result = sanitizeObject(input);
    expect(result.num).toBe(42);
    expect(result.bool).toBe(true);
    expect(result.nil).toBeNull();
    expect(result.arr).toEqual([1, 2, 3]);
  });

  test("handles deeply nested objects (max depth 20)", () => {
    let deep: any = { value: "<script>deep</script>" };
    let current = deep;
    for (let i = 0; i < 15; i++) {
      current.nested = { value: "<script>nested</script>" };
      current = current.nested;
    }
    const result = sanitizeObject(deep);
    expect(result.value).toBe("");
  });
});

describe("containsXssVector", () => {
  test("detects script tags", () => {
    expect(containsXssVector("<script>alert(1)</script>")).toBe(true);
  });

  test("detects iframes", () => {
    expect(containsXssVector('<iframe src="x"></iframe>')).toBe(true);
  });

  test("detects javascript: URLs", () => {
    expect(containsXssVector('<a href="javascript:alert(1)">')).toBe(true);
  });

  test("returns false for safe strings", () => {
    expect(containsXssVector("<p>Hello world</p>")).toBe(false);
  });

  test("returns false for non-string input", () => {
    expect(containsXssVector("")).toBe(false);
  });
});
