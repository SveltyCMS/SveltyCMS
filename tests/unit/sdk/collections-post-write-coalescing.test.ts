/**
 * @file tests/unit/sdk/collections-post-write-coalescing.test.ts
 * @description Coalesced write invalidation must never lose the ids that landed
 * mid-flush. When a second write arrives while a flush is awaiting the response
 * cache, the replayed pass has to carry the new write's `doc:` tag and narrow its
 * L1 point drop to that id. A replay without the id list clears neither `doc:`
 * nor the point tier, so the last write's HTTP body stayed stale for the full
 * TTL.
 *
 * Features tested:
 * - a mid-flush write is replayed with its `doc:<coll>:<id>` tag
 * - the replay keeps the collection-wide list/GraphQL clear (every write is
 *   structural) and narrows the point tier to the replayed ids
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheService } from "@src/databases/cache/cache-service";
import { invalidateCache } from "@src/services/sdk/namespaces/collections/post-write";
import type { DatabaseId } from "@src/databases/db-interface";
import type { Schema } from "@src/content/types";

const state = vi.hoisted(() => ({
  invalidateLocal: vi.fn(),
  /** Gate the in-flight flush so a second write can land mid-pass. */
  gate: null as Promise<void> | null,
  releaseGate: null as (() => void) | null,
  responseCacheCalls: 0,
}));

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    get: vi.fn().mockResolvedValue(undefined),
    getSync: vi.fn().mockReturnValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    clearByTags: vi.fn().mockResolvedValue(undefined),
    clearByPattern: vi.fn().mockResolvedValue(undefined),
    bumpCollectionEpoch: vi.fn().mockReturnValue(1),
  },
}));

vi.mock("@src/services/sdk/namespaces/collections/lazy-services", () => ({
  getResponseCacheLazy: vi.fn(async () => {
    state.responseCacheCalls += 1;
    if (state.gate) await state.gate;
    return {
      invalidateCollection: vi.fn().mockResolvedValue(undefined),
      invalidateAll: vi.fn().mockResolvedValue(undefined),
      invalidateLocal: state.invalidateLocal,
    };
  }),
  getOutboxLazy: vi.fn(),
  getPubSubLazy: vi.fn(),
  getWorkflowServiceLazy: vi.fn(),
}));

describe("collections post-write coalesced writes", () => {
  const schema = { _id: "Posts", name: "Posts" } as Schema;
  const tenantId = "tenant-a" as DatabaseId;

  beforeEach(() => {
    vi.mocked(cacheService.clearByTags).mockClear();
    vi.mocked(cacheService.bumpCollectionEpoch).mockClear();
    state.invalidateLocal.mockClear();
    state.responseCacheCalls = 0;
    state.gate = null;
    state.releaseGate = null;
  });

  it("replays a write that arrives mid-flush with its doc tag intact", async () => {
    state.gate = new Promise<void>((resolve) => {
      state.releaseGate = resolve;
    });

    invalidateCache(schema, tenantId, { writtenId: "a" });
    // Let the first flush start and block inside getResponseCacheLazy.
    await vi.waitFor(() => expect(state.responseCacheCalls).toBe(1));

    // This write lands while the first pass is still awaiting the cache.
    invalidateCache(schema, tenantId, { writtenId: "b" });
    state.releaseGate?.();

    await vi.waitFor(() => expect(cacheService.clearByTags).toHaveBeenCalledTimes(2));

    const clears = vi
      .mocked(cacheService.clearByTags)
      .mock.calls.map((call) => [...(call[0] as string[])]);
    expect(clears[0]).toContain("doc:Posts:a");
    // The replayed write keeps its own document tag.
    expect(clears[1]).toContain("doc:Posts:b");

    // Every pass clears the collection-wide list/GraphQL tags: a cached body
    // embeds the row that was just written.
    for (const tags of clears) {
      expect(tags).toContain("collection:Posts");
      expect(tags).toContain("res:Posts");
      expect(tags).toContain("res:graphql");
    }
    // …and narrows the L1 point drop to the ids of that pass.
    const pointDrops = state.invalidateLocal.mock.calls.map((call) => call[2]);
    expect(pointDrops).toContainEqual({ entryIds: ["a"] });
    expect(pointDrops).toContainEqual({ entryIds: ["b"] });
  });
});
