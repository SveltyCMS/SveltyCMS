/**
 * @file tests/unit/widgets/desugar-field.test.ts
 * @description Unit tests for schema desugaring (sugar types).
 *
 * Features tested:
 * - Sugar type expansion (color, seo)
 * - Metadata preservation (access, validation, groups)
 * - Sugar key stripping
 * - Nested object/array recursion
 * - Custom sugar type registration
 * - Schema-level desugaring
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  desugarFieldType,
  expandFields,
  desugarSchemaFields,
  registerSugarType,
  isSugarType,
  listSugarTypes,
  getAllSugarKeys,
} from "@src/widgets/desugar-field";
import type { FieldDefinition } from "@src/content/types";

describe("Schema Desugaring — desugarFieldType", () => {
  describe("color sugar type", () => {
    it("should expand { type: 'color' } into an object with hex + alpha fields", () => {
      const result = desugarFieldType({ type: "color" });

      expect(result.type).toBe("object");
      expect(result.fields).toBeDefined();
      const fields = result.fields as Array<Record<string, unknown>>;
      expect(fields).toHaveLength(2); // hex + alpha
      expect(fields[0].name).toBe("hex");
      expect(fields[0].type).toBe("text");
      expect(fields[1].name).toBe("alpha");
      expect(fields[1].type).toBe("number");
    });

    it("should expand { type: 'color', alpha: false } into object with only hex field", () => {
      const result = desugarFieldType({ type: "color", alpha: false });

      const fields = result.fields as Array<Record<string, unknown>>;
      expect(fields).toHaveLength(1);
      expect(fields[0].name).toBe("hex");
    });

    it("should strip the sugar key 'alpha' from the top level", () => {
      const result = desugarFieldType({ type: "color", alpha: true });

      // 'alpha' should NOT appear as a top-level property after desugaring
      expect(result).not.toHaveProperty("alpha");
    });

    it("should strip the 'type' sugar key from the expanded result", () => {
      const result = desugarFieldType({ type: "color" });

      // Expanded field should have type 'object', not 'color'
      expect(result.type).toBe("object");
    });
  });

  describe("seo sugar type", () => {
    it("should expand { type: 'seo' } into an object with meta/OG fields", () => {
      const result = desugarFieldType({ type: "seo" });

      expect(result.type).toBe("object");
      const fields = result.fields as Array<Record<string, unknown>>;
      expect(fields.length).toBeGreaterThanOrEqual(6); // metaTitle, metaDescription, ogTitle, ogDescription, ogImage, canonicalUrl, noindex, nofollow
      expect(fields.some((f) => f.name === "metaTitle")).toBe(true);
      expect(fields.some((f) => f.name === "metaDescription")).toBe(true);
      expect(fields.some((f) => f.name === "ogTitle")).toBe(true);
      expect(fields.some((f) => f.name === "noindex")).toBe(true);
    });

    it("should support ogImageField option", () => {
      const result = desugarFieldType({ type: "seo", ogImageField: "media" });
      const fields = result.fields as Array<Record<string, unknown>>;
      const ogImageField = fields.find((f) => f.name === "ogImage");
      expect(ogImageField).toBeDefined();
      expect(ogImageField!.type).toBe("media");
    });
  });

  describe("metadata preservation", () => {
    it("should preserve access control on desugared fields", () => {
      const result = desugarFieldType({
        type: "color",
        access: { read: ["admin", "editor"], write: ["admin"] },
      });

      expect(result.access).toEqual({ read: ["admin", "editor"], write: ["admin"] });
    });

    it("should preserve validation rules on desugared fields", () => {
      const result = desugarFieldType({
        type: "color",
        required: true,
        validation: { required: true, message: "Color is required" },
      });

      expect(result.required).toBe(true);
      expect(result.validation).toEqual({ required: true, message: "Color is required" });
    });

    it("should preserve groups on desugared fields", () => {
      const result = desugarFieldType({
        type: "seo",
        group: ["design", "seo"],
      });

      expect(result.group).toEqual(["design", "seo"]);
    });

    it("should preserve custom properties on desugared fields", () => {
      const result = desugarFieldType({
        type: "color",
        label: "Brand Color",
        helper: "Choose your primary brand color",
        width: 50,
      });

      expect(result.label).toBe("Brand Color");
      expect(result.helper).toBe("Choose your primary brand color");
      expect(result.width).toBe(50);
    });
  });

  describe("non-sugar types", () => {
    it("should pass through fields without a sugar type unchanged", () => {
      const input = { type: "text", label: "Name" };
      const result = desugarFieldType(input);
      expect(result).toEqual(input);
    });

    it("should pass through unknown type fields unchanged", () => {
      const input = { type: "custom-thing", label: "Custom" };
      const result = desugarFieldType(input);
      expect(result).toEqual(input);
    });

    it("should pass through fields without a type property", () => {
      const input = { label: "Untyped" };
      const result = desugarFieldType(input);
      expect(result).toEqual(input);
    });
  });
});

describe("Schema Desugaring — expandFields", () => {
  it("should recursively expand sugar types in a field array", () => {
    const fields = [
      { type: "text", label: "Title" },
      { type: "color", label: "Accent" },
      { type: "text", label: "Description" },
    ];

    const result = expandFields(fields);

    expect(result).toHaveLength(3);
    expect(result[0].type).toBe("text"); // unchanged
    expect(result[1].type).toBe("object"); // expanded from color
    expect(result[2].type).toBe("text"); // unchanged
  });

  it("should recurse into nested object fields", () => {
    const fields = [
      {
        type: "object",
        label: "Settings",
        fields: [{ type: "color", label: "Theme" }],
      },
    ];

    const result = expandFields(fields);

    expect(result[0].type).toBe("object");
    const nestedFields = result[0].fields as Array<Record<string, unknown>>;
    expect(nestedFields[0].type).toBe("object"); // expanded from color
  });
});

describe("Schema Desugaring — desugarSchemaFields", () => {
  it("should desugar fields in a schema-like array", () => {
    const fields: FieldDefinition[] = [
      { type: "text", label: "Title" } as FieldDefinition,
      { type: "color", label: "Accent" } as FieldDefinition,
    ];

    const result = desugarSchemaFields(fields);

    expect(result).toHaveLength(2);
    expect((result[0] as any).type).toBe("text");
    expect((result[1] as any).type).toBe("object");
  });
});

describe("Schema Desugaring — Sugar Type Registry", () => {
  beforeEach(() => {
    // Clean up custom registrations between tests by re-registering known types
    // Note: The built-in types (color, seo) are already registered at module load.
    // Custom registrations added here persist across tests (singleton registry).
  });

  it("should recognize built-in sugar types", () => {
    expect(isSugarType("color")).toBe(true);
    expect(isSugarType("seo")).toBe(true);
    expect(isSugarType("text")).toBe(false);
    expect(isSugarType("unknown")).toBe(false);
  });

  it("should list built-in sugar types", () => {
    const types = listSugarTypes();
    expect(types).toContain("color");
    expect(types).toContain("seo");
  });

  it("should register custom sugar types", () => {
    registerSugarType({
      type: "rating",
      sugarKeys: ["maxStars"],
      build(field) {
        const max = field.maxStars || 5;
        return {
          type: "object",
          fields: [
            { name: "value", type: "number", inputOptions: { min: 0, max: Number(max) } },
            { name: "label", type: "text" },
          ],
        };
      },
    });

    expect(isSugarType("rating")).toBe(true);

    const result = desugarFieldType({ type: "rating", maxStars: 10, label: "Review" });
    expect(result.type).toBe("object");
    expect(result.label).toBe("Review");
    expect(result).not.toHaveProperty("maxStars");
  });

  it("should collect all sugar keys across registered types", () => {
    const keys = getAllSugarKeys();
    expect(keys).toContain("alpha");
    expect(keys).toContain("preset");
    expect(keys).toContain("ogImageField");
  });
});
