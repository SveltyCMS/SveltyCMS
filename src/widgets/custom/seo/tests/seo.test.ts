/**
 * @file src/widgets/custom/seo/tests/seo.test.ts
 * @description Unit tests for the SEO widget validation logic.
 *
 * The schema is built once per required/optional variant (it is a pure function of
 * the field config) and the payload cases are table-driven, so each case isolates
 * one rule instead of re-deriving the widget nine times.
 */

import { describe, expect, it, vi } from "vitest";
import { safeParse } from "valibot";
import SeoWidget from "@widgets/custom/seo";
import { getSchema } from "@tests/unit/widgets/test-utils";

vi.mock(
  "@src/paraglide/messages",
  async () => (await import("@tests/unit/widgets/test-utils")).WIDGET_MESSAGES,
);

const validSeoData = {
  title: "Test Title",
  description: "Test Description",
  focusKeyword: "test",
  robotsMeta: "index, follow",
  canonicalUrl: "https://example.com",
  twitterCard: "summary",
};

/** Overrides that must be rejected by the schema. */
const REJECTED_CASES: Array<[string, Record<string, unknown>]> = [
  [
    "a title exceeding 60 characters",
    {
      title:
        "This title is definitely way too long and should exceed the sixty character limit specified in the schema",
    },
  ],
  ["a description exceeding 160 characters", { description: "A".repeat(161) }],
  ["a malformed canonical URL", { canonicalUrl: "not-a-url" }],
  [
    "JSON-LD containing an XSS payload",
    {
      schemaMarkup: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "<script>alert('xss')</script>",
      }),
    },
  ],
];

/** Overrides that must stay accepted. */
const ACCEPTED_CASES: Array<[string, Record<string, unknown>]> = [
  ["a complete payload", {}],
  ["an omitted canonical URL", { canonicalUrl: undefined }],
  ["an empty canonical URL", { canonicalUrl: "" }],
  [
    "safe JSON-LD schema markup",
    {
      schemaMarkup: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Test Page",
      }),
    },
  ],
];

describe("SEO Widget - Validation", () => {
  const requiredSchema = getSchema(SeoWidget({ label: "SEO", required: true }));
  const optionalSchema = getSchema(SeoWidget({ label: "SEO", required: false }));

  it.each(ACCEPTED_CASES)("accepts %s", (_label, overrides) => {
    expect(safeParse(requiredSchema, { ...validSeoData, ...overrides }).success).toBe(true);
  });

  it.each(REJECTED_CASES)("rejects %s", (_label, overrides) => {
    expect(safeParse(requiredSchema, { ...validSeoData, ...overrides }).success).toBe(false);
  });

  it("rejects null when required", () => {
    expect(safeParse(requiredSchema, null).success).toBe(false);
  });

  it("allows null when not required", () => {
    expect(safeParse(optionalSchema, null).success).toBe(true);
  });
});
