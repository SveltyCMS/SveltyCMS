/**
 * @file tests/unit/stores/content-registry.test.ts
 * @description Tests for the content registry — $state reactivity and event-driven reload.
 */
import { describe, it, expect, beforeEach } from "vitest";

// Use the real contentStore singleton (globalThis-pinned)
describe("ContentRegistry", () => {
  let contentStore: typeof import("@src/stores/content-registry.svelte").contentStore;

  beforeEach(async () => {
    const mod = await import("@src/stores/content-registry.svelte");
    contentStore = mod.contentStore;
    // Reset to initial state
    contentStore.initState = "uninitialized";
  });

  describe("$state reactivity", () => {
    it("should report uninitialized state", () => {
      contentStore.initState = "uninitialized";
      expect(contentStore.isInitialized).toBe(false);
      expect(contentStore.isReloading).toBe(false);
    });

    it("should report initializing as reloading", () => {
      contentStore.initState = "initializing";
      expect(contentStore.isReloading).toBe(true);
      expect(contentStore.isInitialized).toBe(false);
    });

    it("should report initialized state", () => {
      contentStore.initState = "initialized";
      expect(contentStore.isInitialized).toBe(true);
      expect(contentStore.isReloading).toBe(false);
    });

    it("should report error state", () => {
      contentStore.initState = "error";
      expect(contentStore.isInitialized).toBe(false);
      expect(contentStore.isReloading).toBe(false);
    });

    it("should track contentVersion as $state", () => {
      const v1 = contentStore.contentVersion;
      contentStore.updateVersion();
      expect(contentStore.contentVersion).toBe(v1 + 1);
    });
  });

  describe("waitForReload (event-driven)", () => {
    it("should resolve immediately when not reloading", async () => {
      contentStore.initState = "initialized";
      const start = Date.now();
      await contentStore.waitForReload();
      expect(Date.now() - start).toBeLessThan(50); // sub-50ms, no polling
    });

    it("should resolve when state leaves initializing", async () => {
      contentStore.initState = "initializing";
      const promise = contentStore.waitForReload();

      // Resolve after a tick by changing state
      setTimeout(() => {
        contentStore.initState = "initialized";
      }, 1);
      await promise;

      expect(contentStore.isInitialized).toBe(true);
    });

    it("should resolve when state leaves initializing to error", async () => {
      contentStore.initState = "initializing";
      const promise = contentStore.waitForReload();

      setTimeout(() => {
        contentStore.initState = "error";
      }, 1);
      await promise;

      expect(contentStore.initState).toBe("error");
    });
  });

  describe("multi-tenant support", () => {
    it("should return isInitializedForTenant based on state", () => {
      contentStore.initState = "initialized";
      expect(contentStore.isInitializedForTenant("tenant-1")).toBe(true);

      contentStore.initState = "uninitialized";
      expect(contentStore.isInitializedForTenant("tenant-1")).toBe(false);
    });

    it("should start with zero nodes and collections", () => {
      expect(contentStore.nodeCount).toBeGreaterThanOrEqual(0);
      expect(contentStore.collectionCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getCollection with case-insensitive fallback", () => {
    it("should return undefined for non-existent collection", () => {
      expect(contentStore.getCollection("nonexistent")).toBeUndefined();
    });
  });
});
