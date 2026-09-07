/**
 * @file src/widgets/custom/seo/tests/seo.test.ts
 * @description Unit tests for the SEO widget validation logic.
 */

import { describe, it, expect } from "vitest";
import SeoWidget from "@widgets/custom/seo";
import { safeParse } from "valibot";
import {
  buildPreviewUrl,
  classifyHeatmapWord,
  formatSerpUrl,
  isSeoPayload,
  parseFocusKeywords,
  readEntryBody,
  seoFeatureList,
  truncateToPx,
  unwrapSeoPayload,
} from "@widgets/custom/seo/seo-serp";

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

    const dataWithMaliciousSchema = {
      ...validSeoData,
      schemaMarkup: maliciousSchema,
    };
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

describe("SEO Widget - SERP helpers", () => {
  it("parses focus keywords into phrase and word tokens", () => {
    expect(parseFocusKeywords("SveltyCMS tutorial")).toEqual(
      expect.arrayContaining(["sveltycms tutorial", "sveltycms", "tutorial"]),
    );
  });

  it("does not invent heatmap keywords from empty input", () => {
    expect(parseFocusKeywords("")).toEqual([]);
  });

  it("classifies keyword, power word, and prominent roles", () => {
    const power = new Set(["free"]);
    expect(classifyHeatmapWord("SveltyCMS", 8, ["sveltycms"], power)).toBe("keyword");
    expect(classifyHeatmapWord("free", 8, [], power)).toBe("power");
    expect(classifyHeatmapWord("The", 0, [], power)).toBe("prominent");
  });

  it("builds preview URLs from canonical, then slug", () => {
    expect(buildPreviewUrl("https://example.com", "https://cdn.example.com/page", "ignored")).toBe(
      "https://cdn.example.com/page",
    );
    expect(buildPreviewUrl("https://example.com", "/about", "")).toBe("https://example.com/about");
    expect(buildPreviewUrl("https://example.com", "", "hello-world")).toBe(
      "https://example.com/hello-world",
    );
  });

  it("formats a Google-like breadcrumb from a URL", () => {
    expect(formatSerpUrl("https://example.com/pages/hello")).toEqual({
      site: "example.com",
      breadcrumb: "example.com › pages › hello",
    });
  });

  it("truncates long snippets to the pixel budget", () => {
    const long = "A".repeat(200);
    const truncated = truncateToPx(long, 80, "title");
    expect(truncated.endsWith("…")).toBe(true);
    expect(truncated.length).toBeLessThan(long.length);
  });

  it("reads features from the field instance, then widget defaults", () => {
    expect(seoFeatureList({ features: ["social", "advanced"] })).toEqual(["social", "advanced"]);
    expect(seoFeatureList({ widget: { defaults: { features: ["ai"] } } })).toEqual(["ai"]);
    expect(seoFeatureList({ features: "social, advanced" })).toEqual(["social", "advanced"]);
    expect(seoFeatureList({})).toEqual(["social", "schema", "advanced", "ai"]);
  });

  it("unwraps locale maps and accidental double-wraps to the SEO payload", () => {
    const payload = { title: "Home", description: "Welcome", focusKeyword: "cms" };
    expect(isSeoPayload(payload)).toBe(true);
    expect(unwrapSeoPayload({ en: payload }, "en")).toEqual(payload);
    expect(unwrapSeoPayload({ en: { en: payload } }, "en")).toEqual(payload);
    expect(unwrapSeoPayload({ en: { de: payload } }, "de")).toEqual(payload);
  });

  it("reads rich-text body from locale-wrapped entry fields", () => {
    expect(readEntryBody({ body: { en: { title: "", content: "<p>Hello</p>" } } })).toBe(
      "<p>Hello</p>",
    );
    expect(readEntryBody({ body: { content: "<p>Direct</p>" } })).toBe("<p>Direct</p>");
  });
});
