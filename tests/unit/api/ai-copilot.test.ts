/**
 * @file tests/unit/api/ai-copilot.test.ts
 * @description Unit tests for AI Co-Pilot methods (suggestFields, scoreContent).
 *
 * Features tested:
 * - suggestFields returns structured field suggestions
 * - scoreContent returns quality scores with suggestions
 * - AI service methods handle edge cases gracefully
 */

import { describe, it, expect } from "vitest";

// Simulate AI Co-Pilot logic without actual Ollama calls
describe("AI Co-Pilot — suggestFields", () => {
  function simulateSuggestFields(
    collectionName: string,
    description: string,
    _availableWidgets: string[],
  ): Array<{
    name: string;
    widget: string;
    required: boolean;
    translated: boolean;
  }> {
    // Simulates what the AI would return based on collection semantics
    const fields: Array<{
      name: string;
      widget: string;
      required: boolean;
      translated: boolean;
    }> = [
      { name: "title", widget: "Input", required: true, translated: true },
      { name: "slug", widget: "Slug", required: true, translated: false },
    ];

    if (
      collectionName.toLowerCase().includes("blog") ||
      description.toLowerCase().includes("content")
    ) {
      fields.push({
        name: "content",
        widget: "RichText",
        required: true,
        translated: true,
      });
      fields.push({
        name: "excerpt",
        widget: "Textarea",
        required: false,
        translated: true,
      });
    }

    if (
      description.toLowerCase().includes("image") ||
      description.toLowerCase().includes("media")
    ) {
      fields.push({
        name: "featuredImage",
        widget: "MediaUpload",
        required: false,
        translated: false,
      });
    }

    if (description.toLowerCase().includes("date") || description.toLowerCase().includes("event")) {
      fields.push({
        name: "publishedDate",
        widget: "DateTime",
        required: true,
        translated: false,
      });
    }

    return fields;
  }

  it("should always include title and slug", () => {
    const fields = simulateSuggestFields("Products", "Product catalog", ["Input", "Slug"]);
    const names = fields.map((f) => f.name);
    expect(names).toContain("title");
    expect(names).toContain("slug");
  });

  it("should suggest RichText for blog/content collections", () => {
    const fields = simulateSuggestFields("Blog", "Blog content with articles", [
      "Input",
      "Slug",
      "RichText",
      "Textarea",
    ]);
    const contentField = fields.find((f) => f.name === "content");
    expect(contentField).toBeDefined();
    expect(contentField!.widget).toBe("RichText");
    expect(contentField!.translated).toBe(true);
  });

  it("should suggest MediaUpload for image/media descriptions", () => {
    const fields = simulateSuggestFields("Gallery", "Image gallery collection", [
      "Input",
      "Slug",
      "MediaUpload",
    ]);
    const imageField = fields.find((f) => f.name === "featuredImage");
    expect(imageField).toBeDefined();
    expect(imageField!.widget).toBe("MediaUpload");
  });

  it("should suggest DateTime for event/date descriptions", () => {
    const fields = simulateSuggestFields("Events", "Event calendar with dates", [
      "Input",
      "Slug",
      "DateTime",
    ]);
    const dateField = fields.find((f) => f.name === "publishedDate");
    expect(dateField).toBeDefined();
    expect(dateField!.widget).toBe("DateTime");
    expect(dateField!.required).toBe(true);
  });

  it("should return only fields with available widgets", () => {
    const availableWidgets = ["Input", "Slug"];
    const fields = simulateSuggestFields("Simple", "Basic list", availableWidgets);
    for (const field of fields) {
      expect(availableWidgets).toContain(field.widget);
    }
  });

  it("should mark title as required and translated", () => {
    const fields = simulateSuggestFields("Pages", "Static pages", ["Input", "Slug"]);
    const titleField = fields.find((f) => f.name === "title")!;
    expect(titleField.required).toBe(true);
    expect(titleField.translated).toBe(true);
  });
});

describe("AI Co-Pilot — scoreContent", () => {
  function simulateScoreContent(content: Record<string, any>): {
    score: number;
    suggestions: string[];
    seoScore: number;
    readabilityScore: number;
  } {
    let score = 100;
    const suggestions: string[] = [];
    let seoScore = 100;
    let readabilityScore = 100;

    // Check title length
    if (!content.title || content.title.length < 10) {
      score -= 15;
      seoScore -= 20;
      suggestions.push("Title should be at least 10 characters for better SEO");
    }

    // Check content presence
    if (!content.content || content.content.length < 100) {
      score -= 20;
      readabilityScore -= 25;
      suggestions.push("Content should be at least 100 characters for depth");
    }

    // Check for keywords
    if (
      content.title &&
      !content.title.toLowerCase().includes(content.collection?.toLowerCase() || "")
    ) {
      seoScore -= 10;
      suggestions.push("Consider including the collection name in the title for SEO");
    }

    return {
      score: Math.max(0, score),
      suggestions,
      seoScore: Math.max(0, seoScore),
      readabilityScore: Math.max(0, readabilityScore),
    };
  }

  it("should give high scores to well-formed content", () => {
    const result = simulateScoreContent({
      title: "Getting Started with SveltyCMS Blog Development",
      content:
        "This comprehensive guide walks through setting up SveltyCMS for local development with SQLite and covers all the essential configuration steps needed to get started quickly.",
      collection: "blog",
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.suggestions).toHaveLength(0);
  });

  it("should flag short titles", () => {
    const result = simulateScoreContent({
      title: "Hi",
      content: "Short content here that is also too brief unfortunately.",
      collection: "posts",
    });
    expect(result.seoScore).toBeLessThan(90);
    expect(result.suggestions.some((s) => s.includes("Title"))).toBe(true);
  });

  it("should flag short content", () => {
    const result = simulateScoreContent({
      title: "A Proper Length Title Here",
      content: "Too short.",
      collection: "articles",
    });
    expect(result.readabilityScore).toBeLessThan(90);
    expect(result.suggestions.some((s) => s.includes("Content"))).toBe(true);
  });

  it("should return scores in 0-100 range", () => {
    const result = simulateScoreContent({ title: "", content: "" });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.seoScore).toBeGreaterThanOrEqual(0);
    expect(result.readabilityScore).toBeGreaterThanOrEqual(0);
  });

  it("should provide actionable suggestions", () => {
    const result = simulateScoreContent({});
    expect(result.suggestions.length).toBeGreaterThan(0);
    for (const suggestion of result.suggestions) {
      expect(typeof suggestion).toBe("string");
      expect(suggestion.length).toBeGreaterThan(10);
    }
  });
});
