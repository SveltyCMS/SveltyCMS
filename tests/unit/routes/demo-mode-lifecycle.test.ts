/**
 * @file tests/unit/routes/demo-mode-lifecycle.test.ts
 * @description Unit tests for demo mode lifecycle, tenant isolation, and first-collection order preservation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  compareCollectionSchemas,
  getFirstCollectionSchema,
  isUserFacingCollectionSchema,
  getCollectionRedirectPathFromSchema,
} from "@src/content/first-collection";
import type { Schema } from "@src/content/types";

describe("Demo Mode & First Collection Lifecycle", () => {
  let contentStore: typeof import("@src/stores/content-registry.svelte").contentStore;

  beforeEach(async () => {
    const mod = await import("@src/stores/content-registry.svelte");
    contentStore = mod.contentStore;
    contentStore.initState = "uninitialized";
  });

  describe("Preset Order Preservation Across Restarts", () => {
    it("should sort schemas by explicit order ahead of alphabetical file name", () => {
      // Simulates scanned files loaded alphabetically: authors.js, categories.js, posts.js
      const rawScannedSchemas: Schema[] = [
        { _id: "authors", name: "Authors", order: 2, fields: [] },
        { _id: "categories", name: "Categories", order: 1, fields: [] },
        { _id: "posts", name: "Posts", order: 0, fields: [] },
      ];

      const sorted = [...rawScannedSchemas].sort(compareCollectionSchemas);

      expect(sorted[0]._id).toBe("posts");
      expect(sorted[1]._id).toBe("categories");
      expect(sorted[2]._id).toBe("authors");
    });

    it("should resolve posts as the first collection schema", () => {
      const schemas: Schema[] = [
        { _id: "authors", name: "Authors", order: 2, fields: [] },
        { _id: "categories", name: "Categories", order: 1, fields: [] },
        { _id: "posts", name: "Posts", order: 0, fields: [] },
      ];

      const first = getFirstCollectionSchema(schemas);
      expect(first).not.toBeNull();
      expect(first?._id).toBe("posts");

      const redirectPath = getCollectionRedirectPathFromSchema(first!, "en");
      expect(redirectPath).toBe("/en/collection/posts");
    });

    it("should filter out system collections from first collection selection", () => {
      const schemas: Schema[] = [
        { _id: "redirects", name: "Redirects", order: 0, fields: [] },
        { _id: "404_logs", name: "404 Logs", order: 0, fields: [] },
        { _id: "plugin_auth", name: "Auth Plugin", order: 0, fields: [] },
        { _id: "Menu", name: "Menu", order: 0, fields: [] },
        { _id: "posts", name: "Posts", order: 1, fields: [] },
      ];

      expect(isUserFacingCollectionSchema(schemas[0])).toBe(false);
      expect(isUserFacingCollectionSchema(schemas[1])).toBe(false);
      expect(isUserFacingCollectionSchema(schemas[2])).toBe(false);
      expect(isUserFacingCollectionSchema(schemas[3])).toBe(false);
      expect(isUserFacingCollectionSchema(schemas[4])).toBe(true);

      const first = getFirstCollectionSchema(schemas);
      expect(first?._id).toBe("posts");
    });
  });

  describe("Tenant Isolation in Content Registry", () => {
    it("should isolate collections between demo tenants", () => {
      const tenant1Schemas: Schema[] = [
        { _id: "t1_posts", name: "T1 Posts", order: 0, fields: [] },
      ];
      const tenant2Schemas: Schema[] = [
        { _id: "t2_articles", name: "T2 Articles", order: 0, fields: [] },
      ];

      contentStore.setCollections("tenant-1", tenant1Schemas);
      contentStore.setCollections("tenant-2", tenant2Schemas);

      const t1First = contentStore.getSmartFirstCollection("tenant-1");
      const t2First = contentStore.getSmartFirstCollection("tenant-2");

      expect(t1First?._id).toBe("t1_posts");
      expect(t2First?._id).toBe("t2_articles");

      expect(contentStore.getCollection("t1_posts", "tenant-1")).toBeDefined();
      expect(contentStore.getCollection("t1_posts", "tenant-2")).toBeUndefined();
    });
  });
});
