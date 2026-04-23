/**
 * @file tests\unit\widgets\widget-validation.test.ts
 * @description Tests for the widget validation utility functions.
 */

import { describe, it, expect } from "vitest";
import {
  validateSchemaWidgets,
  validateLayoutWidgets,
  getCollectionWidgetDependencies,
  canSafelyDeactivateWidget,
  getAffectedCollections,
  validateCollectionForRendering,
} from "@src/widgets/widget-validation";
import type { Schema, Layout } from "@src/content/types";

describe("Widget Validation Utilities", () => {
  const mockSchema: Schema = {
    name: "TestCollection",
    fields: [
      { widget: "Input", label: "Title" },
      { widget: { Name: "RichText" }, label: "Content" },
      { label: "NoWidget" }, // Edge case: no widget
    ],
  } as any;

  const mockSchemaWithMissing: Schema = {
    name: "BrokenCollection",
    fields: [
      { widget: "Input", label: "Title" },
      { widget: "NonExistentWidget", label: "Broken" },
    ],
  } as any;

  const mockLayout: Layout = {
    name: "DashboardLayout",
    preferences: [
      { component: "Input", position: 1 },
      { component: "MissingWidget", position: 2 },
    ],
  } as any;

  const activeWidgets = ["Input", "RichText"];

  describe("validateSchemaWidgets", () => {
    it("should return valid when all widgets are active", () => {
      const result = validateSchemaWidgets(mockSchema, activeWidgets);

      expect(result.valid).toBe(true);
      expect(result.missingWidgets).toHaveLength(0);
      expect(result.suggestions).toHaveLength(0);
    });

    it("should return invalid when widgets are missing", () => {
      const result = validateSchemaWidgets(mockSchemaWithMissing, activeWidgets);

      expect(result.valid).toBe(false);
      expect(result.missingWidgets).toEqual(["NonExistentWidget"]);
      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0]).toContain("NonExistentWidget");
    });
  });

  describe("validateLayoutWidgets", () => {
    it("should strip out invalid widgets from layout", () => {
      const result = validateLayoutWidgets(mockLayout, activeWidgets);

      expect(result.valid).toBe(false);
      expect(result.invalidWidgets).toEqual(["MissingWidget"]);
      expect(result.cleanedLayout.preferences).toHaveLength(1);
      expect(result.cleanedLayout.preferences[0].component).toBe("Input");
    });

    it("should return valid if all layout widgets are active", () => {
      const validLayout: Layout = {
        name: "ValidLayout",
        preferences: [{ component: "Input" }],
      } as any;

      const result = validateLayoutWidgets(validLayout, activeWidgets);
      expect(result.valid).toBe(true);
      expect(result.invalidWidgets).toHaveLength(0);
    });
  });

  describe("getCollectionWidgetDependencies", () => {
    it("should correctly extract widget dependencies from a schema", () => {
      const result = getCollectionWidgetDependencies(mockSchema);

      expect(result.totalCount).toBe(2);
      expect(result.widgets).toContain("Input");
      expect(result.widgets).toContain("RichText");
    });

    it("should return empty for schemas with no widgets", () => {
      const emptySchema: Schema = { name: "Empty", fields: [] } as any;
      const result = getCollectionWidgetDependencies(emptySchema);

      expect(result.totalCount).toBe(0);
      expect(result.widgets).toHaveLength(0);
    });
  });

  describe("canSafelyDeactivateWidget", () => {
    it("should return false if widget is used in collections", () => {
      const result = canSafelyDeactivateWidget("Input", [mockSchema], []);

      expect(result.canDeactivate).toBe(false);
      expect(result.usedInCollections).toEqual(["TestCollection"]);
      expect(result.usedInLayouts).toHaveLength(0);
    });

    it("should return false if widget is used in layouts", () => {
      const result = canSafelyDeactivateWidget("Input", [], [mockLayout]);

      expect(result.canDeactivate).toBe(false);
      expect(result.usedInCollections).toHaveLength(0);
      expect(result.usedInLayouts).toEqual(["DashboardLayout"]);
    });

    it("should return true if widget is not used anywhere", () => {
      const result = canSafelyDeactivateWidget("UnusedWidget", [mockSchema], [mockLayout]);

      expect(result.canDeactivate).toBe(true);
      expect(result.usedInCollections).toHaveLength(0);
      expect(result.usedInLayouts).toHaveLength(0);
    });
  });

  describe("getAffectedCollections", () => {
    it("should return schemas that use the widget", () => {
      const result = getAffectedCollections("Input", [mockSchema, mockSchemaWithMissing]);

      expect(result).toEqual(["TestCollection", "BrokenCollection"]);
    });

    it("should return empty if widget is unused", () => {
      const result = getAffectedCollections("UnusedWidget", [mockSchema]);

      expect(result).toEqual([]);
    });
  });

  describe("validateCollectionForRendering", () => {
    it("should allow rendering when all widgets are active", () => {
      const result = validateCollectionForRendering(mockSchema, activeWidgets);

      expect(result.canRender).toBe(true);
      expect(result.missingWidgets).toHaveLength(0);
      expect(result.fieldsWithIssues).toHaveLength(0);
    });

    it("should block rendering and provide field-level details when widgets are missing", () => {
      const result = validateCollectionForRendering(mockSchemaWithMissing, activeWidgets);

      expect(result.canRender).toBe(false);
      expect(result.missingWidgets).toEqual(["NonExistentWidget"]);
      expect(result.fieldsWithIssues).toHaveLength(1);
      expect(result.fieldsWithIssues[0].widget).toBe("NonExistentWidget");
      expect(result.fieldsWithIssues[0].issue).toContain("inactive or missing");
    });
  });
});
