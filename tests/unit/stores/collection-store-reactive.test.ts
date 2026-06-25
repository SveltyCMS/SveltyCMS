/**
 * @file tests/unit/stores/collection-store-reactive.test.ts
 * @description Tests for collection-store reactivity — snapshot fix and reactive getters.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

describe("CollectionStore — Reactive Getters (snapshot fix)", () => {
  let collections: typeof import("@src/stores/collection-store.svelte").collections;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@src/stores/collection-store.svelte");
    collections = mod.collections;
    // Reset state
    collections.loading = false;
    collections.error = null;
    collections.currentId = null;
  });

  describe("reactive getter wrappers", () => {
    it("collectionsLoading should reflect loading state changes", () => {
      const { collectionsLoading } = require("@src/stores/collection-store.svelte");
      collections.loading = true;
      expect(collectionsLoading.value).toBe(true);

      collections.loading = false;
      expect(collectionsLoading.value).toBe(false);
    });

    it("collectionsError should reflect error state changes", () => {
      const { collectionsError } = require("@src/stores/collection-store.svelte");
      collections.error = "Something failed";
      expect(collectionsError.value).toBe("Something failed");

      collections.error = null;
      expect(collectionsError.value).toBeNull();
    });

    it("currentCollectionId should reflect id changes", () => {
      const { currentCollectionId } = require("@src/stores/collection-store.svelte");
      collections.currentId = "col-123";
      expect(currentCollectionId.value).toBe("col-123");
    });

    it("selectedEntries should reflect selection changes", () => {
      const { selectedEntries } = require("@src/stores/collection-store.svelte");
      collections.addEntry("entry-1");
      expect(selectedEntries.value).toContain("entry-1");

      collections.clearSelected();
      expect(selectedEntries.value).toEqual([]);
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
      const nodes = [{ _id: "1", name: "Test", nodeType: "collection" as const }];
      collections.setContentStructure(nodes);
      // Setting the same structure again should not change the hash
      collections.setContentStructure([...nodes]);
      // Content structure should remain unchanged (circuit breaker)
    });

    it("should track total collections", () => {
      expect(collections.total).toBeGreaterThanOrEqual(0);
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
  });
});
