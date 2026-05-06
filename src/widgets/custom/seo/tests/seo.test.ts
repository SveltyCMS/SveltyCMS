/**
 * @file src/widgets/custom/seo/tests/seo.test.ts
 * @description Unit tests for the SEO widget validation logic.
 */

import { describe, it, expect } from "bun:test";
import SeoWidget from "../index";
import { safeParse } from "valibot";

describe("SEO Widget - Validation", () => {
  const validSeoData = {
    title: "Test Title",
    description: "Test Description",
    focusKeyword: "test",
    robotsMeta: "index, follow",
    canonicalUrl: "https://example.com",
    twitterCard: "summary",
  };

  it("should validate correct SEO data", () => {
    const field = SeoWidget({ label: "SEO", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    const result = safeParse(schema, validSeoData);
    expect(result.success).toBe(true);
  });

  it("should reject title exceeding 60 characters", () => {
    const field = SeoWidget({ label: "SEO", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    const invalidData = {
      ...validSeoData,
      title:
        "This title is definitely way too long and should exceed the sixty character limit specified in the schema",
    };
    expect(safeParse(schema, invalidData).success).toBe(false);
  });

  it("should reject description exceeding 160 characters", () => {
    const field = SeoWidget({ label: "SEO", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    const invalidData = {
      ...validSeoData,
      description: "A".repeat(161),
    };
    expect(safeParse(schema, invalidData).success).toBe(false);
  });

  it("should validate optional canonical URL", () => {
    const field = SeoWidget({ label: "SEO", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    const dataWithoutUrl = { ...validSeoData, canonicalUrl: undefined };
    expect(safeParse(schema, dataWithoutUrl).success).toBe(true);

    const dataWithEmptyUrl = { ...validSeoData, canonicalUrl: "" };
    expect(safeParse(schema, dataWithEmptyUrl).success).toBe(true);
  });

  it("should reject invalid canonical URL", () => {
    const field = SeoWidget({ label: "SEO", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    const invalidData = { ...validSeoData, canonicalUrl: "not-a-url" };
    expect(safeParse(schema, invalidData).success).toBe(false);
  });

  it("should validate safe JSON-LD schema markup", () => {
    const field = SeoWidget({ label: "SEO", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    const validSchema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Test Page",
    });

    const dataWithSchema = { ...validSeoData, schemaMarkup: validSchema };
    expect(safeParse(schema, dataWithSchema).success).toBe(true);
  });

  it("should reject malicious JSON-LD schema markup", () => {
    const field = SeoWidget({ label: "SEO", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    const maliciousSchema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "<script>alert('xss')</script>",
    });

    const dataWithMaliciousSchema = { ...validSeoData, schemaMarkup: maliciousSchema };
    expect(safeParse(schema, dataWithMaliciousSchema).success).toBe(false);
  });

  it("should handle required constraint", () => {
    const field = SeoWidget({ label: "SEO", required: true });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, null).success).toBe(false);
  });

  it("should allow null if not required", () => {
    const field = SeoWidget({ label: "SEO", required: false });
    const schema = (field.widget.validationSchema as any)(field);

    expect(safeParse(schema, null).success).toBe(true);
  });
});
