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
    collections.setContentStructure([]);
    collections.selectedEntries = [];
  });

  describe("singleton state", () => {
    it("loading should reflect loading state changes", () => {
      collections.loading = true;
      expect(collections.loading).toBe(true);

      collections.loading = false;
      expect(collections.loading).toBe(false);
    });

    it("error should reflect error state changes", () => {
      collections.error = "Something failed";
      expect(collections.error).toBe("Something failed");

      collections.error = null;
      expect(collections.error).toBeNull();
    });

    it("currentId should reflect id changes", () => {
      collections.currentId = "col-123";
      expect(collections.currentId).toBe("col-123");
    });

    it("selectedEntries should reflect selection changes", () => {
      collections.addEntry("entry-1");
      expect(collections.selectedEntries).toContain("entry-1");

      collections.clearSelected();
      expect(collections.selectedEntries).toEqual([]);
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

    it("rejects a stale remote echo until it confirms the pending draft", () => {
      const firstChange = [
        { _id: "one", name: "One", nodeType: "collection", order: 0 },
        { _id: "two", name: "Two", nodeType: "collection", order: 1 },
      ] as never[];
      const latestDraft = [
        { _id: "one", name: "One", nodeType: "collection", order: 1 },
        { _id: "two", name: "Two", nodeType: "collection", order: 0 },
      ] as never[];

      collections.setDraftContentStructure(latestDraft);

      expect(collections.applyRemoteContentStructure(firstChange)).toBe(false);
      expect(collections.contentStructure).toBe(latestDraft);
      expect(collections.applyRemoteContentStructure(latestDraft)).toBe(true);
      expect(collections.contentStructure).toBe(latestDraft);
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

  describe("change detection (AUD-016)", () => {
    it("ignores key order for the same data", () => {
      collections.setInitialSnapshot({ title: "Impressum", slug: "impressum" });

      expect(collections.compareWithCurrent({ slug: "impressum", title: "Impressum" })).toBe(false);
      expect(collections.hasChanges).toBe(false);
    });

    it("ignores key order inside nested objects", () => {
      collections.setInitialSnapshot({ seo: { title: "T", description: "D" } });

      expect(collections.compareWithCurrent({ seo: { description: "D", title: "T" } })).toBe(false);
    });

    it("stays clean when a widget normalises a value on mount", () => {
      // The form opens with `isFeatured: null`; the Checkbox widget writes `false`
      // back. That is not a user edit, so the entry must stay clean.
      collections.setInitialSnapshot({ title: "Impressum", isFeatured: null });

      expect(collections.compareWithCurrent({ title: "Impressum", isFeatured: false })).toBe(false);
      expect(collections.hasChanges).toBe(false);
    });

    it("still reports a real edit", () => {
      collections.setInitialSnapshot({ title: "Impressum" });
      collections.markInteracted();

      expect(collections.compareWithCurrent({ title: "Impressum QA" })).toBe(true);
      expect(collections.hasChanges).toBe(true);
    });

    it("treats array order as data", () => {
      collections.setInitialSnapshot({ tags: ["a", "b"] });
      collections.markInteracted();

      expect(collections.compareWithCurrent({ tags: ["b", "a"] })).toBe(true);
    });

    it("resets the interaction gate when a new snapshot is taken", () => {
      collections.setInitialSnapshot({ title: "A" });
      collections.markInteracted();
      collections.setInitialSnapshot({ title: "B" });

      expect(collections.compareWithCurrent({ title: "B" })).toBe(false);
      expect(collections.interacted).toBe(false);
    });

    /**
     * Change detection runs on every keystroke (`syncFieldToStore`). Serialising
     * the entry to compare it is O(size) *and* allocates a fresh string per call;
     * the first version of this fix cost ~38 ms per keystroke on a 49 KB entry.
     *
     * Asserting the shape (no serialisation on the comparison path) is stable in
     * a way a millisecond budget is not: a timing bound flakes under load without
     * telling you anything the call count does not.
     */
    it("does not serialise the entry on every comparison", () => {
      const large = { title: "Impressum", content: "x".repeat(50_000) };
      collections.setInitialSnapshot(large);
      collections.markInteracted();

      const stringify = vi.spyOn(JSON, "stringify");
      try {
        for (let index = 0; index < 100; index++) collections.compareWithCurrent(large);

        expect(stringify).not.toHaveBeenCalled();
      } finally {
        stringify.mockRestore();
      }
    });
  });
});
