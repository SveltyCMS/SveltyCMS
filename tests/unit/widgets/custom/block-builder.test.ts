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
import BlockBuilderWidget, { DEFAULT_BLOCK_PRESETS } from "@widgets/custom/block-builder";
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
});
