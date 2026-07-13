/**
 * @file tests/unit/content/content-refresh-sidebar.test.ts
 * @description Verifies client SSE refresh syncs both contentStore and collectionStore sidebar tree.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

describe("contentSystem.refresh sidebar bridge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("syncs collectionStore.contentStructure after SSE-driven refresh", async () => {
    vi.stubGlobal("window", {});

    const nodes = [
      {
        _id: "cat-1",
        name: "Blog",
        path: "/blog",
        nodeType: "category",
        source: "builder",
        order: 0,
      },
    ];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: { contentNodes: nodes } }),
      }),
    );

    const { contentStore } = await import("@stores/content-registry.svelte");
    const syncSpy = vi.spyOn(contentStore, "sync");

    const collectionStore = await import("@src/stores/collection-store.svelte");
    const structureSpy = vi.spyOn(collectionStore, "setContentStructure");

    const { contentSystem } = await import("@src/content/index");
    await contentSystem.refresh("global");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(syncSpy).toHaveBeenCalledWith(nodes);
    expect(structureSpy).toHaveBeenCalledWith(nodes);
  });
});
