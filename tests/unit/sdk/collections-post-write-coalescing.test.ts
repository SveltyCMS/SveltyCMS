/**
 * @file tests/unit/sdk/collections-post-write-coalescing.test.ts
 * @description Coalesced point-write invalidation must not be replayed as a
 * structural clear. When a second point write lands while a flush is awaiting
 * the response cache, the replayed pass has to keep the new write's `doc:` tag
 * and its surgical L1 invalidation. A structural replay clears neither `doc:`
 * nor `res:all`, so the last point write's HTTP body stayed stale for the full
 * TTL.
 *
 * Features tested:
 * - a mid-flush point write is replayed as a point write with `doc:<coll>:<id>`
 * - the replay never escalates to collection-wide list tags or an epoch bump
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

describe("collections post-write coalesced point writes", () => {
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

  it("replays a point write that arrives mid-flush with its doc tag intact", async () => {
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
    // The replayed point write keeps its own document tag.
    expect(clears[1]).toContain("doc:Posts:b");

    // A point burst must not escalate to a collection-wide list clear.
    const allTags = clears.flat();
    expect(allTags).not.toContain("collection:Posts");
    expect(allTags).not.toContain("res:Posts");
    expect(allTags).not.toContain("res:graphql");
    expect(cacheService.bumpCollectionEpoch).not.toHaveBeenCalled();
    // …and keeps the surgical L1 invalidation for the replayed id.
    expect(state.invalidateLocal.mock.calls.at(-1)?.[2]).toEqual({ entryIds: ["b"] });
  });
});
