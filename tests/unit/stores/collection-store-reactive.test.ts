/**
 * @file tests/unit/stores/collection-store-reactive.test.ts
 * @description Tests for collection-store reactivity — snapshot fix and reactive getters.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("CollectionStore — Reactive Getters (snapshot fix)", () => {
  let collections: typeof import("@src/stores/collection-store.svelte.ts").collections;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@src/stores/collection-store.svelte.ts");
    collections = mod.collections;
    // Reset ALL mutable singleton state — mode/active/all/contentStructure are
    // order-dependent between tests in this file (and other suites importing the
    // same module graph).
    collections.loading = false;
    collections.error = null;
    collections.currentId = null;
    collections.mode = "view";
    collections.active = null;
    collections.activeValue = {};
    collections.all = {};
    collections.contentStructure = [];
    collections.selectedEntries = [];
  });

  describe("reactive getter wrappers", () => {
    it("collectionsLoading should reflect loading state changes", async () => {
      const mod = await import("@src/stores/collection-store.svelte.ts");
      collections.loading = true;
      expect(mod.collectionsLoading.value).toBe(true);

      collections.loading = false;
      expect(mod.collectionsLoading.value).toBe(false);
    });

    it("collectionsError should reflect error state changes", async () => {
      const mod = await import("@src/stores/collection-store.svelte.ts");
      collections.error = "Something failed";
      expect(mod.collectionsError.value).toBe("Something failed");

      collections.error = null;
      expect(mod.collectionsError.value).toBeNull();
    });

    it("currentCollectionId should reflect id changes", async () => {
      const mod = await import("@src/stores/collection-store.svelte.ts");
      collections.currentId = "col-123";
      expect(mod.currentCollectionId.value).toBe("col-123");
    });

    it("selectedEntries should reflect selection changes", async () => {
      const mod = await import("@src/stores/collection-store.svelte.ts");
      collections.addEntry("entry-1");
      expect(mod.selectedEntries.value).toContain("entry-1");

      collections.clearSelected();
      expect(mod.selectedEntries.value).toEqual([]);
    });
  });

  describe("collection singleton methods", () => {
    it("setMode should change mode state", () => {
      collections.setMode("edit");
      expect(collections.mode).toBe("edit");
    });

    it("setCollectionValue should set active value with default status", () => {
      collections.setCollectionValue({ name: "Test" });
      expect(collections.activeValue).toHaveProperty("name", "Test");
    });

    it("deduplication should prevent redundant content structure updates", () => {
      const nodes = [
        {
          _id: "1",
          name: "Test",
          nodeType: "collection" as const,
          order: 0,
          translations: [] as any[],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ] as any[];
      collections.setContentStructure(nodes);
      const structureAfterFirst = collections.contentStructure;
      // Setting the same structure again should be a no-op (fingerprint circuit-breaker)
      collections.setContentStructure([...nodes]);
      expect(collections.contentStructure).toBe(structureAfterFirst);
    });

    it("should track total as a number", () => {
      // total is computed from Object.keys(all).length
      expect(typeof collections.total).toBe("number");
      // The collection store's `all` is populated by load functions,
      // not by setContentStructure (which updates contentStructure).
      // In the test environment, `all` remains empty.
      expect(collections.total).toBe(0);
    });

    it("selected entries management", () => {
      collections.addEntry("e1");
      collections.addEntry("e2");
      expect(collections.hasSelected).toBe(true);

      collections.removeEntry("e1");
      expect(collections.selectedEntries).toEqual(["e2"]);

      collections.clearSelected();
      expect(collections.hasSelected).toBe(false);
    });

    it("patchActiveSchema updates active collection without resetting mode", () => {
      collections.setMode("edit");
      collections.setCollection({
        _id: "posts",
        name: "Posts",
        fields: [{ db_fieldName: "title" } as never],
      } as never);
      collections.setCollectionValue({ title: "Hello" });

      collections.patchActiveSchema({
        _id: "posts",
        name: "Posts",
        fields: [{ db_fieldName: "title" } as never, { db_fieldName: "slug" } as never],
      } as never);

      expect(collections.mode).toBe("edit");
      expect(collections.activeValue).toMatchObject({ title: "Hello" });
      expect(collections.active?.fields).toHaveLength(2);
    });
  });
});
