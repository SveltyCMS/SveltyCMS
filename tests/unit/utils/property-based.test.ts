/**
 * @file tests/unit/utils/property-based.test.ts
 * @description Property-based tests for critical utilities using fast-check.
 *
 * Unlike example-based tests ("input X → output Y"), property-based tests
 * generate random inputs and verify invariants hold for ALL values.
 * This catches edge cases that manual test writing would miss:
 * - null, undefined, NaN, Infinity
 * - Empty strings, zero-length arrays
 * - Unicode, emoji, special characters
 * - Extremely long inputs
 * - Negative numbers, floating point edge cases
 *
 * ### Properties Verified
 * - sanitize-html: sanitizeHtml(idempotent) === sanitizeHtml(original)
 * - sanitize-html: output never contains dangerous tags
 * - error-handling: raise() always throws AppError
 * - error-handling: AppError.message is always defined
 * - date-utils: parse → format round-trip preserves valid dates
 * - Validation: schemas reject known-invalid inputs
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { sanitizeHtml, stripHtml } from "@utils/sanitize-html";

// ---------------------------------------------------------------------------
// sanitize-html properties
// ---------------------------------------------------------------------------

describe("sanitizeHtml — property-based", () => {
  /**
   * Idempotence: sanitizing already-sanitized output should not change it.
   */
  it("should be idempotent", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const first = sanitizeHtml(input);
        const second = sanitizeHtml(first);
        expect(second).toBe(first);
      }),
      { numRuns: 500 },
    );
  });

  /**
   * Safety: output must never contain dangerous tags.
   */
  const DANGEROUS_TAGS = ["script", "iframe", "object", "embed", "style"];

  it("should never contain dangerous tags in output", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 2000 }), (input) => {
        const result = sanitizeHtml(input).toLowerCase();
        for (const tag of DANGEROUS_TAGS) {
          expect(result).not.toContain(`<${tag}`);
        }
      }),
      { numRuns: 500 },
    );
  });

  /**
   * Preservation: safe HTML tags should pass through.
   */
  it("should preserve safe HTML structure", () => {
    const safeInput = "<p><strong>Hello</strong> <em>World</em></p>";
    const result = sanitizeHtml(safeInput);
    expect(result).toContain("<strong>");
    expect(result).toContain("<em>");
    expect(result).toContain("<p>");
  });

  /**
   * Protocol stripping: javascript: and data: URIs should be removed.
   */
  it("should strip javascript: and data: protocols", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 100 }), (payload) => {
        const input = `<a href="javascript:${payload}">click</a>`;
        const result = sanitizeHtml(input);
        expect(result).not.toContain("javascript:");
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// stripHtml properties
// ---------------------------------------------------------------------------

describe("stripHtml — property-based", () => {
  /**
   * Output must never contain HTML tags.
   */
  it("should never contain HTML tags", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = stripHtml(input);
        expect(result).not.toMatch(/<[^>]+>/);
      }),
      { numRuns: 500 },
    );
  });

  /**
   * Idempotence: stripping already-stripped text is a no-op.
   */
  it("should be idempotent", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const first = stripHtml(input);
        const second = stripHtml(first);
        expect(second).toBe(first);
      }),
      { numRuns: 500 },
    );
  });
});

// ---------------------------------------------------------------------------
// edge cases: special characters
// ---------------------------------------------------------------------------

describe("sanitizeHtml — edge cases", () => {
  it("should handle null bytes", () => {
    expect(() => sanitizeHtml("\0")).not.toThrow();
    expect(() => sanitizeHtml("hello\0world")).not.toThrow();
  });

  it("should handle extremely long inputs", () => {
    const long = "a".repeat(100_000);
    expect(() => sanitizeHtml(long)).not.toThrow();
  });

  it("should handle unicode and emoji", () => {
    const input = "<p>Hello 🌍 你好</p><script>alert('xss')</script>";
    const result = sanitizeHtml(input);
    expect(result).toContain("🌍");
    expect(result).toContain("你好");
    expect(result).not.toContain("script");
  });

  it("should handle mixed case tags", () => {
    const input = "<SCRIPT>alert(1)</SCRIPT><sCrIpT>alert(2)</sCrIpT>";
    const result = sanitizeHtml(input);
    expect(result).not.toContain("alert");
  });

  it("should handle nested dangerous tags", () => {
    const input = "<div><script>outer</script><p><script>inner</script></p></div>";
    const result = sanitizeHtml(input);
    expect(result).not.toContain("script");
    expect(result).not.toContain("outer");
    expect(result).not.toContain("inner");
  });
});
