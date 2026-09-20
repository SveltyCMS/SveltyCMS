/**
 * @file tests/unit/sdk/collections-post-write.test.ts
 * @description Document-write cache invalidation must be tag-scoped: it clears
 * the collection-wide list/count caches (and only the written doc's per-id
 * cache), never a schema model or an O(#docs) pattern scan.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { cacheService } from "@src/databases/cache/cache-service";
import { invalidateCache } from "@src/services/sdk/namespaces/collections/post-write";
import { createCountCachedCrud } from "@src/databases/core/count-cache";
import {
  expectClearedCovers,
  expectedCollectionCacheTags,
  expectTagOverlap,
  tagSetFromCalls,
} from "../helpers/collection-cache-tags";
import type { DatabaseId, ICrudAdapter } from "@src/databases/db-interface";
import type { Schema } from "@src/content/types";

const { invalidateLocal } = vi.hoisted(() => ({ invalidateLocal: vi.fn() }));

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
  getResponseCacheLazy: vi.fn().mockResolvedValue({
    invalidateCollection: vi.fn().mockResolvedValue(undefined),
    invalidateAll: vi.fn().mockResolvedValue(undefined),
    invalidateLocal,
  }),
  getOutboxLazy: vi.fn(),
  getPubSubLazy: vi.fn(),
  getWorkflowServiceLazy: vi.fn(),
}));

describe("collections post-write invalidation", () => {
  beforeEach(() => {
    vi.mocked(cacheService.clearByTags).mockClear();
    vi.mocked(cacheService.clearByPattern).mockClear();
    vi.mocked(cacheService.bumpCollectionEpoch).mockClear();
    invalidateLocal.mockClear();
  });

  async function flushInvalidation(): Promise<void> {
    await vi.waitFor(() => {
      expect(cacheService.clearByTags).toHaveBeenCalled();
    });
  }

  it("clears collection + count tags, never schema/content_structure", async () => {
    invalidateCache({ _id: "Posts" } as any, "tenant-a" as any);
    await flushInvalidation();

    const tags = tagSetFromCalls(vi.mocked(cacheService.clearByTags).mock.calls);
    // Collection-wide list + count caches are cleared by tag (O(#matched)) for
    // both accepted spellings — the as-passed schema id and the physical name.
    expectClearedCovers(expectedCollectionCacheTags("Posts"), tags);
    // Must NOT evict schema models / content structure.
    expect([...tags].filter((t) => t.includes("content_structure"))).toEqual([]);
    expect([...tags].filter((t) => t.startsWith("schema"))).toEqual([]);
    // No O(#docs) pattern scan for the collection namespace on the write path.
    const patterns = vi.mocked(cacheService.clearByPattern).mock.calls.map((c) => String(c[0]));
    expect(patterns.some((p) => p.startsWith("collection:"))).toBe(false);
    // Epoch must be bumped synchronously so weak ETags 304-miss on the next GET.
    expect(cacheService.bumpCollectionEpoch).toHaveBeenCalledWith("Posts", "tenant-a");
  });

  it("surgically clears ONLY the written doc's per-id tag", async () => {
    let seenEntryIds: string[] = [];
    invalidateLocal.mockImplementation(
      (_c: string, _t: string, opts?: { entryIds?: Iterable<string> }) => {
        seenEntryIds = opts?.entryIds ? [...opts.entryIds] : [];
      },
    );
    invalidateCache({ _id: "Posts" } as any, "tenant-a" as any, { writtenId: "abc-123" });
    await flushInvalidation();

    const tags = vi.mocked(cacheService.clearByTags).mock.calls.flatMap((c) => c[0] as string[]);
    expect(tags).toContain("doc:Posts:abc-123");
    // Exactly one doc tag — writes never clear other documents' per-id caches.
    expect(tags.filter((t) => t.startsWith("doc:")).length).toBe(1);
    // Point-reads are tagged `doc:` only — `res:Posts` would evict sibling findById hits.
    expect(tags).not.toContain("res:Posts");
    expect(seenEntryIds).toEqual(["abc-123"]);
  });

  it("clears every written doc tag for a coalesced bulk write", async () => {
    invalidateCache({ _id: "Posts" } as any, "tenant-a" as any, {
      writtenIds: ["a", "b", "c"],
    });
    await flushInvalidation();

    const tags = vi.mocked(cacheService.clearByTags).mock.calls.flatMap((c) => c[0] as string[]);
    for (const id of ["a", "b", "c"]) expect(tags).toContain(`doc:Posts:${id}`);
  });

  /**
   * Stale-total regression guard: count-cache tags entries with BOTH the
   * as-passed spelling and the normalised physical table name (`collection_posts`
   * for schema id `posts`), and the write path clears the same pair. If the two
   * tag sets ever stop intersecting, a create/delete leaves `totalItems` stale
   * for the full count TTL. Pure tag intersection — no DB required.
   */
  it("count tags intersect the write-path clear for both collection spellings", async () => {
    invalidateCache({ _id: "posts" } as unknown as Schema, "tenant-a" as DatabaseId);
    await flushInvalidation();

    const cleared = tagSetFromCalls(vi.mocked(cacheService.clearByTags).mock.calls);
    // Both spellings a count producer may be called with — the schema id and the
    // physical table name the read path caches under — must have every contract
    // tag reachable from the write-path clear. The physical-spelled producer also
    // carries the bare tags, so a physical-only invalidator (Mongo crud →
    // BaseAdapter.invalidateQueryCache) reaches it via the logical spelling too —
    // the lossy normaliser degrades to a wider clear, never a miss.
    for (const spelling of ["posts", "collection_posts"]) {
      vi.mocked(cacheService.set).mockClear();
      const wrapped = createCountCachedCrud({
        count: vi.fn().mockResolvedValue({ success: true, data: 1 }),
      } as unknown as ICrudAdapter);
      await wrapped.count(spelling, {}, { tenantId: "tenant-a" as DatabaseId, mode: "exact" });

      const lastSet = vi.mocked(cacheService.set).mock.calls.at(-1);
      if (!lastSet) throw new Error(`count-cache did not register an entry for ${spelling}`);
      const produced = new Set<string>(lastSet[5]);

      expectTagOverlap(produced, cleared, expectedCollectionCacheTags(spelling));
    }
  });
});
