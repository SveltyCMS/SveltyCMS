/**
 * @file tests/unit/collectionbuilder/collectionbuilder-utils.test.ts
 * @description Unit tests for collection builder utility functions.
 *
 * Validates tree traversal, slug generation, and deduplication logic.
 */

import { describe, it, expect } from "vitest";
import {
  getDescendantIds,
  uniquePathForCategory,
} from "@src/routes/(app)/config/collectionbuilder/collectionbuilder-utils";

describe("Collection Builder Utilities", () => {
  describe("getDescendantIds", () => {
    it("returns the category ID itself when no children", () => {
      const flat = [{ _id: "cat-1", parentId: undefined }];
      expect(getDescendantIds("cat-1", flat)).toEqual(["cat-1"]);
    });

    it("returns category + direct children", () => {
      const flat = [
        { _id: "cat-1", parentId: undefined },
        { _id: "col-a", parentId: "cat-1" },
        { _id: "col-b", parentId: "cat-1" },
      ];
      const result = getDescendantIds("cat-1", flat);
      expect(result).toContain("cat-1");
      expect(result).toContain("col-a");
      expect(result).toContain("col-b");
    });

    it("traverses 3 levels deep", () => {
      const flat = [
        { _id: "cat-1", parentId: undefined },
        { _id: "cat-2", parentId: "cat-1" },
        { _id: "col-x", parentId: "cat-2" },
      ];
      expect(getDescendantIds("cat-1", flat).length).toBe(3);
    });

    it("does not include unrelated nodes", () => {
      const flat = [
        { _id: "cat-1", parentId: undefined },
        { _id: "cat-2", parentId: undefined },
        { _id: "col-a", parentId: "cat-1" },
      ];
      expect(getDescendantIds("cat-1", flat)).not.toContain("cat-2");
    });

    it("handles empty flat list", () => {
      expect(getDescendantIds("nonexistent", [])).toEqual(["nonexistent"]);
    });
  });

  describe("uniquePathForCategory", () => {
    it("generates a clean path from name", () => {
      expect(uniquePathForCategory("Blog Posts")).toBe("/blog-posts");
    });

    it("removes special characters", () => {
      expect(uniquePathForCategory("Hello! World? #2024")).toBe("/hello-world-2024");
    });

    it("deduplicates against existing paths", () => {
      expect(uniquePathForCategory("Blog", new Set(["/blog"]))).toBe("/blog-1");
    });

    it("increments counter for multiple duplicates", () => {
      expect(uniquePathForCategory("Blog", new Set(["/blog", "/blog-1"]))).toBe("/blog-2");
    });

    it("returns '/category' for empty name", () => {
      expect(uniquePathForCategory("")).toBe("/category");
    });
  });
});
