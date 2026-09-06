/**
 * @file tests/unit/collectionbuilder/smart-inference.test.ts
 * @description Unit tests for natural-language widget inferencing in the Collection Builder.
 */

import { describe, expect, it } from "vitest";
import {
  humanizeLabel,
  inferWidgetFromFieldName,
  sanitizeDbFieldName,
} from "@src/routes/(app)/config/collectionbuilder/smart-inference";

describe("smart-inference", () => {
  describe("humanizeLabel", () => {
    it("converts snake_case to Title Case", () => {
      expect(humanizeLabel("user_email")).toBe("User Email");
      expect(humanizeLabel("product_cover_image")).toBe("Product Cover Image");
    });

    it("converts camelCase to Title Case", () => {
      expect(humanizeLabel("authorName")).toBe("Author Name");
      expect(humanizeLabel("totalPriceUSD")).toBe("Total Price Usd");
    });

    it("handles kebab-case and extra spaces", () => {
      expect(humanizeLabel("blog-post-title")).toBe("Blog Post Title");
      expect(humanizeLabel("   raw    title   ")).toBe("Raw Title");
    });
  });

  describe("sanitizeDbFieldName", () => {
    it("converts inputs to lower_snake_case without special characters", () => {
      expect(sanitizeDbFieldName("User Email Address!")).toBe("user_email_address");
      expect(sanitizeDbFieldName("price$$$")).toBe("price");
      expect(sanitizeDbFieldName("__leading_and_trailing__")).toBe("leading_and_trailing");
    });

    it("falls back to 'field' for empty inputs", () => {
      expect(sanitizeDbFieldName("")).toBe("field");
      expect(sanitizeDbFieldName("!@#$%^")).toBe("field");
    });
  });

  describe("inferWidgetFromFieldName", () => {
    it("infers email widget for email names", () => {
      const res = inferWidgetFromFieldName("email");
      expect(res.widgetKey).toBe("input");
      expect(res.displayName).toBe("Email (Input)");
      expect(res.defaults?.type).toBe("email");
      expect(res.db_fieldName).toBe("email");
      expect(res.label).toBe("Email");
    });

    it("infers currency widget for price-related names", () => {
      const res = inferWidgetFromFieldName("unit_price");
      expect(res.widgetKey).toBe("currency");
      expect(res.displayName).toBe("Currency / Price");
      expect(res.defaults?.currency).toBe("USD");
      expect(res.db_fieldName).toBe("unit_price");
      expect(res.label).toBe("Unit Price");
    });

    it("infers media widget for image/photo/cover names", () => {
      const res1 = inferWidgetFromFieldName("cover_image");
      expect(res1.widgetKey).toBe("media");
      expect(res1.displayName).toBe("Image (Media)");

      const res2 = inferWidgetFromFieldName("avatar");
      expect(res2.widgetKey).toBe("media");
    });

    it("infers markdown/richtext widget for content/body names", () => {
      const res = inferWidgetFromFieldName("article_content");
      expect(res.widgetKey).toBe("markdown");
      expect(res.displayName).toBe("Markdown / Rich Text");
    });

    it("infers boolean widget for is_*/has_* or status flags", () => {
      const res1 = inferWidgetFromFieldName("is_featured");
      expect(res1.widgetKey).toBe("boolean");
      expect(res1.displayName).toBe("Boolean Switch");

      const res2 = inferWidgetFromFieldName("published");
      expect(res2.widgetKey).toBe("boolean");
    });

    it("infers date widget for date and timestamp fields", () => {
      const res1 = inferWidgetFromFieldName("publish_date");
      expect(res1.widgetKey).toBe("date");
      expect(res1.defaults?.includeTime).toBe(false);

      const res2 = inferWidgetFromFieldName("created_at");
      expect(res2.widgetKey).toBe("date");
      expect(res2.defaults?.includeTime).toBe(true);
    });

    it("infers tags widget for tags/keywords/labels", () => {
      const res = inferWidgetFromFieldName("tags");
      expect(res.widgetKey).toBe("tags");
      expect(res.displayName).toBe("Tags");
    });

    it("infers relation widget when matching an existing collection", () => {
      const res = inferWidgetFromFieldName("author", ["categories", "author", "tags"]);
      expect(res.widgetKey).toBe("relation");
      expect(res.displayName).toBe("Relation to author");
      expect(res.defaults?.relationCollection).toBe("author");
    });

    it("falls back to standard text input for arbitrary names", () => {
      const res = inferWidgetFromFieldName("subtitle");
      expect(res.widgetKey).toBe("input");
      expect(res.displayName).toBe("Text Input");
      expect(res.label).toBe("Subtitle");
      expect(res.db_fieldName).toBe("subtitle");
    });
  });
});
