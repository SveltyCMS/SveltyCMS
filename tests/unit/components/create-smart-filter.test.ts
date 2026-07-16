/**
 * @file tests/unit/components/create-smart-filter.test.ts
 * @description Unit tests for database-agnostic smart filter helpers.
 */

import { describe, expect, it } from "vitest";
import { StatusTypes, type Schema } from "@src/content/types";
import {
  buildFilterDefinitions,
  encodeNumberRange,
  fieldToFilterDefinition,
  parseNumberRange,
} from "@utils/collection-filter-defs";

describe("create-smart-filter pure helpers", () => {
  describe("fieldToFilterDefinition", () => {
    it("maps status fields to select with CMS status options", () => {
      const def = fieldToFilterDefinition({
        label: "Status",
        db_fieldName: "status",
        widget: { Name: "Input" },
      } as any);

      expect(def.id).toBe("status");
      expect(def.type).toBe("select");
      expect(def.options?.map((o) => o.value)).toContain(StatusTypes.publish);
      expect(def.options?.map((o) => o.value)).toContain(StatusTypes.draft);
      expect(def.safeForFiltering).toBe(true);
    });

    it("maps date widgets and createdAt ids to date controls", () => {
      const byWidget = fieldToFilterDefinition({
        label: "Published On",
        db_fieldName: "published_on",
        widget: { Name: "Date" },
      } as any);
      expect(byWidget.type).toBe("date");

      const byId = fieldToFilterDefinition({
        label: "Updated",
        db_fieldName: "updatedAt",
        widget: { Name: "Input" },
      } as any);
      expect(byId.type).toBe("date");
    });

    it("maps number/price/currency to numberRange", () => {
      for (const name of ["Number", "Price", "Currency", "Rating"]) {
        const def = fieldToFilterDefinition({
          label: name,
          db_fieldName: name.toLowerCase(),
          widget: { Name: name },
        } as any);
        expect(def.type).toBe("numberRange");
      }
    });

    it("maps checkbox to boolean with yes/no options", () => {
      const def = fieldToFilterDefinition({
        label: "Featured",
        db_fieldName: "featured",
        widget: { Name: "Checkbox" },
      } as any);
      expect(def.type).toBe("boolean");
      expect(def.options).toEqual([
        { value: "true", label: "Yes" },
        { value: "false", label: "No" },
      ]);
    });

    it("extracts select widget options", () => {
      const def = fieldToFilterDefinition({
        label: "Category",
        db_fieldName: "category",
        widget: { Name: "Select" },
        options: [
          { value: "news", label: "News" },
          { value: "blog", label: "Blog" },
        ],
      } as any);
      expect(def.type).toBe("select");
      expect(def.options).toEqual([
        { value: "news", label: "News" },
        { value: "blog", label: "Blog" },
      ]);
    });

    it("marks media/richtext widgets as unsafe for filtering", () => {
      const media = fieldToFilterDefinition({
        label: "Hero",
        db_fieldName: "hero",
        widget: { Name: "MediaUpload" },
      } as any);
      expect(media.safeForFiltering).toBe(false);

      const rich = fieldToFilterDefinition({
        label: "Body",
        db_fieldName: "body",
        widget: { Name: "RichText" },
      } as any);
      expect(rich.safeForFiltering).toBe(false);
    });
  });

  describe("buildFilterDefinitions", () => {
    it("returns empty for null collection without system fields", () => {
      expect(buildFilterDefinitions(null, { includeSystemFields: false })).toEqual([]);
    });

    it("includes system fields by default and skips unsafe widgets", () => {
      const collection = {
        _id: "col1",
        fields: [
          { label: "Title", db_fieldName: "title", widget: { Name: "Input" } },
          { label: "Body", db_fieldName: "body", widget: { Name: "RichText" } },
          { label: "Status", db_fieldName: "status", widget: { Name: "Input" } },
        ],
      } as unknown as Schema;

      const defs = buildFilterDefinitions(collection);
      const ids = defs.map((d) => d.id);

      expect(ids).toContain("title");
      expect(ids).not.toContain("body");
      expect(ids).toContain("status");
      expect(ids).toContain("createdAt");
      expect(ids).toContain("updatedAt");
      // status from schema already present — not duplicated
      expect(ids.filter((id) => id === "status")).toHaveLength(1);
    });
  });

  describe("number range encode/decode", () => {
    it("encodes min/max and empty ranges", () => {
      expect(encodeNumberRange("10", "50")).toBe("10:50");
      expect(encodeNumberRange("10", "")).toBe("10:");
      expect(encodeNumberRange("", "50")).toBe(":50");
      expect(encodeNumberRange("", "")).toBe("");
      expect(encodeNumberRange(null, null)).toBe("");
    });

    it("parses colon and bare values", () => {
      expect(parseNumberRange("10:50")).toEqual({ min: "10", max: "50" });
      expect(parseNumberRange("10:")).toEqual({ min: "10", max: "" });
      expect(parseNumberRange(":50")).toEqual({ min: "", max: "50" });
      expect(parseNumberRange("42")).toEqual({ min: "42", max: "" });
      expect(parseNumberRange("")).toEqual({ min: "", max: "" });
      expect(parseNumberRange(null)).toEqual({ min: "", max: "" });
    });
  });
});
