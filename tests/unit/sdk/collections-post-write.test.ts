/**
 * @file tests/unit/sdk/collections-post-write.test.ts
 * @description Document-write cache invalidation must be tag-scoped: it clears
 * the collection-wide list/count caches (and only the written doc's per-id
 * cache), never a schema model or an O(#docs) pattern scan.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { cacheService } from "@src/databases/cache/cache-service";
import {
  invalidateCache,
  schedulePostWrite,
} from "@src/services/sdk/namespaces/collections/post-write";
import { getWorkflowServiceLazy } from "@src/services/sdk/namespaces/collections/lazy-services";
import {
  forgetWorkflowPresence,
  noteWorkflowPresence,
} from "@src/services/background/workflow-presence";
import { createCountCachedCrud } from "@src/databases/core/cache-module";
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
    forgetWorkflowPresence();
    vi.mocked(getWorkflowServiceLazy).mockClear();
  });

  async function flushInvalidation(): Promise<void> {
    await vi.waitFor(() => {
      expect(cacheService.clearByTags).toHaveBeenCalled();
    });
  }

  it("does not import the workflow service when no definition has been cached", async () => {
    schedulePostWrite(
      {} as never,
      "create",
      { _id: "Posts", name: "Posts" } as Schema,
      "Posts",
      "tenant-a" as DatabaseId,
      "entry-1",
      { title: "Hello" },
      { _id: "user-1" },
      {},
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(getWorkflowServiceLazy).not.toHaveBeenCalled();
  });

  it("imports the workflow service only after a definition was cached", async () => {
    noteWorkflowPresence("Posts", "tenant-a", true);
    vi.mocked(getWorkflowServiceLazy).mockResolvedValue({
      peekWorkflowCache: () => ({ _id: "wf-1" }),
      initializeWorkflow: vi.fn().mockResolvedValue(null),
    } as never);
    schedulePostWrite(
      {} as never,
      "create",
      { _id: "Posts", name: "Posts" } as Schema,
      "Posts",
      "tenant-a" as DatabaseId,
      "entry-1",
      { title: "Hello" },
      { _id: "user-1" },
      {},
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(getWorkflowServiceLazy).toHaveBeenCalledTimes(1);
  });

  it("clears collection tag on schedulePostWrite create to prevent stale lists", async () => {
    schedulePostWrite(
      {} as never,
      "create",
      { _id: "Posts", name: "Posts" } as Schema,
      "Posts",
      "tenant-a" as DatabaseId,
      "entry-new",
      { title: "New Post" },
      { _id: "user-1" },
      {},
    );
    await flushInvalidation();

    const tags = tagSetFromCalls(vi.mocked(cacheService.clearByTags).mock.calls);
    expect(tags).toContain("collection:Posts");
    expect(tags).toContain("doc:Posts:entry-new");
  });

  /**
   * A write always clears the list/GraphQL tags: a cached list body embeds the
   * written row, and any field may be one the list sorts or filters on. Only the
   * point tier is narrowed to the written ids.
   */
  it("clears the list tags for a single-record update and narrows the point tier", async () => {
    schedulePostWrite(
      {} as never,
      "update",
      { _id: "Posts", name: "Posts" } as Schema,
      "Posts",
      "tenant-a" as DatabaseId,
      "entry-upd",
      { title: "Edited" },
      { _id: "user-1" },
      {},
    );
    await flushInvalidation();

    const tags = tagSetFromCalls(vi.mocked(cacheService.clearByTags).mock.calls);
    expect(tags).toContain("collection:Posts");
    expect(tags).toContain("doc:Posts:entry-upd");
    expect(cacheService.bumpCollectionEpoch).toHaveBeenCalledWith("Posts", "tenant-a");
    // Lists/GraphQL are evicted; the point tier is narrowed to the written id so
    // sibling findById turbo hits stay warm.
    expect(invalidateLocal).toHaveBeenCalledWith("Posts", "tenant-a", {
      entryIds: ["entry-upd"],
    });
  });

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

  it("never clears another document's per-id cache while evicting list bodies", async () => {
    const invalidateCalls: Array<{ entryIds?: string[] }> = [];
    invalidateLocal.mockImplementation(
      (_c: string, _t: string, opts?: { entryIds?: Iterable<string> }) => {
        invalidateCalls.push({ entryIds: opts?.entryIds ? [...opts.entryIds] : undefined });
      },
    );
    invalidateCache({ _id: "Posts" } as any, "tenant-a" as any, { writtenId: "abc-123" });
    await flushInvalidation();

    const tags = vi.mocked(cacheService.clearByTags).mock.calls.flatMap((c) => c[0] as string[]);
    expect(tags).toContain("doc:Posts:abc-123");
    // Exactly one doc tag — writes never clear other documents' per-id caches.
    expect(tags.filter((t) => t.startsWith("doc:")).length).toBe(1);
    expect(tags).toContain("count:Posts");
    // List + GraphQL bodies always go: they embed the row that was just written.
    expect(tags).toContain("res:Posts");
    expect(tags).toContain("collection:Posts");
    expect(tags).toContain("res:graphql");
    // L1: lists/GraphQL evicted, point tier narrowed to the written id.
    expect(invalidateCalls.at(-1)?.entryIds).toEqual(["abc-123"]);
    // The collection generation moves so no in-flight L2 refill resurrects a
    // superseded list body. Point reads are epoch-exempt, so siblings stay warm.
    expect(cacheService.bumpCollectionEpoch).toHaveBeenCalledWith("Posts", "tenant-a");
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
