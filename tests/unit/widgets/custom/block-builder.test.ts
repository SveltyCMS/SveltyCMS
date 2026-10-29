/**
 * @file tests/unit/widgets/custom/block-builder.test.ts
 * @description Unit tests for the polymorphic BlockBuilder widget.
 *
 * Tests:
 * - Default presets and widget metadata
 * - Valibot validation schema for polymorphic blocks
 * - Min/max block boundary enforcement
 * - Required block handling
 */

import { describe, expect, it, vi } from "vitest";
vi.mock("@src/paraglide/messages", async () => (await import("../test-utils")).WIDGET_MESSAGES);
import BlockBuilderWidget, {
  DEFAULT_BLOCK_PRESETS,
  DEFAULT_PAGE_BLUEPRINTS,
  generateAiLayout,
} from "@widgets/custom/block-builder";
import { parse } from "valibot";

// Mock Svelte store
vi.mock("@src/stores/widget-store.svelte", () => ({
  widgets: {
    widgetFunctions: {},
    widgets: {},
  },
}));

describe("BlockBuilder Widget", () => {
  it("should initialize with default presets and metadata", () => {
    const instance = BlockBuilderWidget({ label: "Page Layout" });

    expect(instance.widget.Name).toBe("BlockBuilder");
    expect(instance.widget.Icon).toBe("mdi:view-dashboard-outline");
    expect(instance.widget.defaults?.min).toBe(0);
    expect(instance.widget.defaults?.addLabel).toBe("Add Block");
    expect(instance.widget.defaults?.blocks).toEqual(DEFAULT_BLOCK_PRESETS);
    expect(DEFAULT_BLOCK_PRESETS.length).toBeGreaterThanOrEqual(6);
  });

  describe("Valibot Validation Schema", () => {
    const instance = BlockBuilderWidget({ label: "Layout" });
    const getSchema = instance.widget.validationSchema as (field: any) => any;

    it("should accept valid polymorphic blocks array", () => {
      const schema = getSchema({
        label: "Layout",
        widget: instance.widget,
        db_fieldName: "layout",
      });

      const validBlocks = [
        {
          _id: "block_1",
          _type: "hero",
          data: { headline: "Welcome", buttonText: "Click me" },
        },
        {
          _id: "block_2",
          _type: "text",
          data: { content: "Prose content..." },
          collapsed: true,
        },
      ];

      expect(() => parse(schema, validBlocks)).not.toThrow();
    });

    it("should reject blocks missing _id or _type", () => {
      const schema = getSchema({
        label: "Layout",
        widget: instance.widget,
        db_fieldName: "layout",
      });

      const invalidBlock = [
        {
          _id: "block_1",
          // missing _type
          data: {},
        },
      ];

      expect(() => parse(schema, invalidBlock)).toThrow();
    });

    it("should enforce min block boundary", () => {
      const schema = getSchema({
        label: "Layout",
        widget: instance.widget,
        db_fieldName: "layout",
        min: 2,
      });

      const singleBlock = [
        {
          _id: "b1",
          _type: "hero",
          data: {},
        },
      ];

      expect(() => parse(schema, singleBlock)).toThrow(/Must have at least 2 blocks/);
    });

    it("should enforce max block boundary", () => {
      const schema = getSchema({
        label: "Layout",
        widget: instance.widget,
        db_fieldName: "layout",
        max: 1,
      });

      const twoBlocks = [
        { _id: "b1", _type: "hero", data: {} },
        { _id: "b2", _type: "text", data: {} },
      ];

      expect(() => parse(schema, twoBlocks)).toThrow(/Cannot have more than 1 blocks/);
    });

    it("should enforce required if configured", () => {
      const schema = getSchema({
        label: "Layout",
        widget: instance.widget,
        db_fieldName: "layout",
        required: true,
      });

      expect(() => parse(schema, [])).toThrow(/At least one block is required/);
    });
  });

  describe("Expanded Presets & Component Architecture", () => {
    it("should include modern conversion blocks (pricing, stats, logo-cloud)", () => {
      const types = DEFAULT_BLOCK_PRESETS.map((p) => p.type);
      expect(types).toContain("pricing");
      expect(types).toContain("stats");
      expect(types).toContain("logo-cloud");
      expect(types).toContain("hero");
      expect(types).toContain("features");
      expect(types).toContain("testimonial");
      expect(types).toContain("faq");
    });

    it("should properly configure pricing block fields and default data", () => {
      const pricing = DEFAULT_BLOCK_PRESETS.find((p) => p.type === "pricing");
      expect(pricing).toBeDefined();
      expect(pricing?.label).toBe("Pricing Tiers");
      expect(pricing?.fields?.some((f) => f.name === "tier1_price")).toBe(true);
      expect(pricing?.fields?.some((f) => f.name === "tier2_price")).toBe(true);
      expect(pricing?.defaultData?.tier1_price).toBe("$0");
    });

    it("should properly configure stats block fields and default data", () => {
      const stats = DEFAULT_BLOCK_PRESETS.find((p) => p.type === "stats");
      expect(stats).toBeDefined();
      expect(stats?.label).toBe("Key Metrics & Stats");
      expect(stats?.fields?.some((f) => f.name === "stat1_value")).toBe(true);
      expect(stats?.defaultData?.stat1_value).toBe("99.99%");
    });
  });

  describe("Starter Page Blueprints", () => {
    it("should provide curated production blueprints with valid schema", () => {
      expect(DEFAULT_PAGE_BLUEPRINTS.length).toBeGreaterThanOrEqual(5);

      for (const bp of DEFAULT_PAGE_BLUEPRINTS) {
        expect(bp.id).toBeTruthy();
        expect(bp.name).toBeTruthy();
        expect(bp.description).toBeTruthy();
        expect(bp.category).toMatch(/^(landing|marketing|content|conversion)$/);
        expect(Array.isArray(bp.blocks)).toBe(true);
        expect(bp.blocks.length).toBeGreaterThan(0);

        for (const b of bp.blocks) {
          expect(b.type).toBeTruthy();
          expect(b.data).toBeDefined();
        }
      }
    });

    it("should include saas-launch blueprint with high-converting sequence", () => {
      const saas = DEFAULT_PAGE_BLUEPRINTS.find((b) => b.id === "saas-launch");
      expect(saas).toBeDefined();
      const types = saas?.blocks.map((b) => b.type);
      expect(types).toContain("hero");
      expect(types).toContain("features");
      expect(types).toContain("pricing");
      expect(types).toContain("cta");
    });
  });

  describe("Prompt-to-Layout AI Generator", () => {
    it("should generate structured layout from prompt with SaaS & pricing intent", () => {
      const layout = generateAiLayout(
        "Launch our new SaaS cloud platform with transparent pricing and social proof",
        DEFAULT_BLOCK_PRESETS,
      );

      expect(layout.length).toBeGreaterThan(0);
      const types = layout.map((b) => b._type);
      expect(types).toContain("hero");
      expect(types).toContain("pricing");
      expect(types).toContain("features");
      expect(types).toContain("cta");

      // Verify every instance is well-formed
      for (const block of layout) {
        expect(block._id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        );
        expect(block.data).toBeDefined();
        expect(block.collapsed).toBe(false);
      }
    });

    it("should generate FAQ block when requested in prompt", () => {
      const layout = generateAiLayout(
        "Build a help center and FAQ page for customer onboarding",
        DEFAULT_BLOCK_PRESETS,
      );

      const types = layout.map((b) => b._type);
      expect(types).toContain("faq");
    });

    it("should generate a fallback layout for minimal or generic prompt", () => {
      const layout = generateAiLayout("Random custom page", DEFAULT_BLOCK_PRESETS);
      expect(layout.length).toBeGreaterThan(0);
      for (const block of layout) {
        expect(block._id).toBeTruthy();
        expect(block._type).toBeTruthy();
      }
    });
  });
});
