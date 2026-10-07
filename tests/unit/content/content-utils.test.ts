/**
 * @file tests/unit/content/content-utils.test.ts
 * @description Unit tests for content tree navigation, sorting, sibling validation, and field preparation.
 *
 * Features:
 * - Deterministic category node generation from hierarchical file paths
 * - Stable sorting of content nodes by order and name
 * - Sibling name conflict detection with excludeId self-bypass
 * - Field preparation plan touch checks
 * - Write-path constraint enforcement (null array entry stripping, string truncation)
 */

import { describe, expect, it } from "vitest";
import {
  generateCategoryNodesFromPaths,
  sortContentNodes,
  hasDuplicateSiblingName,
  payloadTouchesCollectionFieldPreparation,
  prepareCollectionFields,
} from "@src/content/content-utils";
import type { Schema } from "@src/content/types";

describe("content-utils unit tests", () => {
  describe("generateCategoryNodesFromPaths", () => {
    it("generates hierarchical category nodes from file paths", () => {
      const files: Schema[] = [
        {
          name: "Posts",
          path: "collection/blog/posts",
          fields: [],
        } as unknown as Schema,
        {
          name: "Authors",
          path: "collection/blog/authors",
          fields: [],
        } as unknown as Schema,
        {
          name: "Settings",
          path: "collection/system/settings",
          fields: [],
        } as unknown as Schema,
      ];

      const categories = generateCategoryNodesFromPaths(files, "tenant_1");

      expect(categories).toHaveLength(2);
      const names = categories.map((c) => c.name);
      expect(names).toContain("Blog");
      expect(names).toContain("System");

      const blogCategory = categories.find((c) => c.name === "Blog");
      expect(blogCategory?.nodeType).toBe("category");
      expect(blogCategory?.icon).toBe("mdi:folder");
      expect(blogCategory?.tenantId).toBe("tenant_1");
    });

    it("handles deeply nested subfolder paths with parentId chaining", () => {
      const files: Schema[] = [
        {
          name: "Audit",
          path: "collection/admin/logs/audit",
          fields: [],
        } as unknown as Schema,
      ];

      const categories = generateCategoryNodesFromPaths(files, null);
      expect(categories).toHaveLength(2);

      const adminCat = categories.find((c) => c.name === "Admin");
      const logsCat = categories.find((c) => c.name === "Logs");

      expect(adminCat).toBeDefined();
      expect(logsCat).toBeDefined();
      expect(logsCat?.parentId).toBe(adminCat?._id);
    });

    it("ignores files without paths or files at the root collection level", () => {
      const files: Schema[] = [
        { name: "NoPath", fields: [] } as unknown as Schema,
        { name: "RootFile", path: "collection/root", fields: [] } as unknown as Schema,
      ];

      const categories = generateCategoryNodesFromPaths(files);
      expect(categories).toHaveLength(0);
    });
  });

  describe("sortContentNodes", () => {
    it("sorts primarily by order ascending", () => {
      const nodes = [
        { name: "C", order: 20 },
        { name: "A", order: 10 },
        { name: "B", order: 15 },
      ];

      const sorted = [...nodes].sort(sortContentNodes);
      expect(sorted.map((n) => n.name)).toEqual(["A", "B", "C"]);
    });

    it("defaults missing order to 999 and breaks ties alphabetically by name", () => {
      const nodes = [
        { name: "Zulu", order: undefined },
        { name: "Alpha", order: undefined },
        { name: "First", order: 1 },
      ];

      const sorted = [...nodes].sort(sortContentNodes);
      expect(sorted.map((n) => n.name)).toEqual(["First", "Alpha", "Zulu"]);
    });
  });

  describe("hasDuplicateSiblingName", () => {
    const existingNodes = [
      { _id: "node_1", name: "Articles", parentId: "folder_a" },
      { _id: "node_2", name: "News", parentId: "folder_a" },
      { _id: "node_3", name: "Articles", parentId: "folder_b" },
    ];

    it("detects duplicate name under the same parent", () => {
      expect(hasDuplicateSiblingName(existingNodes, "folder_a", "Articles")).toBe(true);
      expect(hasDuplicateSiblingName(existingNodes, "folder_a", "News")).toBe(true);
    });

    it("allows the same name under a different parent", () => {
      expect(hasDuplicateSiblingName(existingNodes, "folder_b", "News")).toBe(false);
    });

    it("ignores self when excludeId is provided (for update operations)", () => {
      expect(hasDuplicateSiblingName(existingNodes, "folder_a", "Articles", "node_1")).toBe(false);
      // Still detects if another node has the name
      expect(hasDuplicateSiblingName(existingNodes, "folder_a", "News", "node_1")).toBe(true);
    });
  });

  describe("payloadTouchesCollectionFieldPreparation", () => {
    const schema = {
      fields: [
        { db_fieldName: "content", type: "richtext" },
        { db_fieldName: "summary", type: "text", maxLength: 100 },
        { db_fieldName: "tags", type: "array" },
      ],
    };

    it("returns false if flags are disabled or payload does not touch prep fields", () => {
      expect(payloadTouchesCollectionFieldPreparation({ viewCount: 10 }, schema)).toBe(false);
      expect(
        payloadTouchesCollectionFieldPreparation({ viewCount: 10 }, schema, {
          sanitize: true,
          constraints: true,
        }),
      ).toBe(false);
    });

    it("returns true when payload contains fields targeted by sanitization or constraints", () => {
      expect(
        payloadTouchesCollectionFieldPreparation({ content: "<p>text</p>" }, schema, {
          sanitize: true,
        }),
      ).toBe(true);

      expect(
        payloadTouchesCollectionFieldPreparation({ summary: "short summary" }, schema, {
          constraints: true,
        }),
      ).toBe(true);
    });
  });

  describe("prepareCollectionFields constraints enforcement", () => {
    const schema = {
      fields: [
        { db_fieldName: "title", type: "text", maxLength: 10 },
        { db_fieldName: "items", type: "array" },
      ],
    };

    it("truncates string fields exceeding maxLength when constraints flag is active", () => {
      const data = {
        title: "Very Long Title Exceeding Limit",
        items: ["apple", "banana"],
      };

      const prepared = prepareCollectionFields(data, schema, { constraints: true });
      expect(prepared.title).toBe("Very Long ");
      expect(prepared.items).toEqual(["apple", "banana"]);
    });

    it("strips null and undefined values from array fields", () => {
      const data = {
        title: "Normal",
        items: ["item1", null, "item2", undefined, "item3"],
      };

      const prepared = prepareCollectionFields(data, schema, { constraints: true });
      expect(prepared.items).toEqual(["item1", "item2", "item3"]);
    });

    it("returns original reference unchanged if no constraints or sanitization are active", () => {
      const data = { title: "Title", items: [1, 2] };
      const prepared = prepareCollectionFields(data, schema);
      expect(prepared).toBe(data);
    });
  });
});
