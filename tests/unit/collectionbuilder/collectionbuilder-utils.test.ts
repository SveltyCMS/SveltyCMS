/**
 * @file tests/unit/collectionbuilder/collectionbuilder-utils.test.ts
 * @description Unit tests for collection builder utility functions.
 *
 * Validates tree traversal, slug generation, and deduplication logic.
 */

import { describe, it, expect } from "vitest";
import {
  findDuplicateDatabaseFieldNames,
  getDescendantIds,
  parseIdList,
  parseJsonArray,
  parseOperations,
  uniquePathForCategory,
  validateMinimumCollectionFields,
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

  describe("parseJsonArray", () => {
    it("parses a JSON array", () => {
      expect(parseJsonArray('["a","b"]')).toEqual(["a", "b"]);
    });

    it("returns null for invalid JSON or non-arrays", () => {
      expect(parseJsonArray("not-json")).toBeNull();
      expect(parseJsonArray('{"a":1}')).toBeNull();
      expect(parseJsonArray(null)).toBeNull();
    });
  });

  describe("parseIdList", () => {
    it("accepts uuid and slug ids", () => {
      expect(parseIdList(["cat-1", "posts.abc"])).toEqual(["cat-1", "posts.abc"]);
    });

    it("rejects empty strings, traversal, and oversized lists", () => {
      expect(parseIdList(["../etc"])).toBeNull();
      expect(parseIdList([""])).toBeNull();
      expect(parseIdList(null)).toBeNull();
      expect(parseIdList(Array.from({ length: 201 }, () => "a"))).toBeNull();
    });
  });

  describe("parseOperations", () => {
    it("accepts a valid create operation", () => {
      const parsed = parseOperations([
        { type: "create", node: { path: "/blog", name: "Blog", nodeType: "category" } },
      ]);
      expect(parsed).toHaveLength(1);
      expect(parsed?.[0].type).toBe("create");
    });

    it("rejects unknown types and nodes without a path", () => {
      expect(parseOperations([{ type: "explode", node: { path: "/x" } }])).toBeNull();
      expect(parseOperations([{ type: "create", node: { name: "X" } }])).toBeNull();
      expect(parseOperations("nope")).toBeNull();
    });
  });

  describe("findDuplicateDatabaseFieldNames", () => {
    it("returns empty array when all field names are unique", () => {
      const fields = [
        { db_fieldName: "title", widget: "input" },
        { db_fieldName: "description", widget: "textarea" },
        { db_fieldName: "price", widget: "number" },
      ];
      expect(findDuplicateDatabaseFieldNames(fields)).toEqual([]);
    });

    it("detects case-insensitive duplicate db_fieldName values", () => {
      const fields = [
        { db_fieldName: "title", widget: "input" },
        { db_fieldName: "Title", widget: "input" },
        { db_fieldName: "slug", widget: "slug" },
      ];
      expect(findDuplicateDatabaseFieldNames(fields)).toEqual(["title"]);
    });

    it("handles fallback to name property", () => {
      const fields = [
        { name: "author", widget: "input" },
        { db_fieldName: "author", widget: "relation" },
      ];
      expect(findDuplicateDatabaseFieldNames(fields)).toEqual(["author"]);
    });

    it("returns multiple duplicate keys when several fields collide", () => {
      const fields = [
        { db_fieldName: "tag", widget: "input" },
        { db_fieldName: "tag", widget: "input" },
        { db_fieldName: "category", widget: "select" },
        { db_fieldName: "category", widget: "select" },
      ];
      const duplicates = findDuplicateDatabaseFieldNames(fields);
      expect(duplicates).toContain("tag");
      expect(duplicates).toContain("category");
    });
  });

  describe("validateMinimumCollectionFields duplicate collision guard", () => {
    it("fails validation when fields share database identifiers", () => {
      const fields = [
        { db_fieldName: "email", widget: "input" },
        { db_fieldName: "email", widget: "email" },
      ];
      const result = validateMinimumCollectionFields(fields);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain('Duplicate database field name: "email"');
      }
    });

    it("passes validation when all fields are properly formed and distinct", () => {
      const fields = [
        { db_fieldName: "first_name", widget: "input" },
        { db_fieldName: "last_name", widget: "input" },
      ];
      const result = validateMinimumCollectionFields(fields);
      expect(result.ok).toBe(true);
    });
  });
});
