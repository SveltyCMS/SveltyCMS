/**
 * @file tests/unit/sdk/collections-post-write.test.ts
 * @description Document-write cache invalidation must be tag-scoped: it clears
 * the collection-wide list/count caches (and only the written doc's per-id
 * cache), never a schema model or an O(#docs) pattern scan.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { cacheService } from "@src/databases/cache/cache-service";
import { invalidateCache } from "@src/services/sdk/namespaces/collections/post-write";

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    clearByTags: vi.fn().mockResolvedValue(undefined),
    clearByPattern: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    // Required since epoch persistence was added to invalidateCache (post-write.ts:119).
    // bumpCollectionEpoch increments the collection generation so weak ETags 304-miss
    // on the next GET — missing it causes a TypeError at runtime.
    bumpCollectionEpoch: vi.fn().mockReturnValue(1),
  },
}));

// Isolate post-write from the response-cache + outbox/pubsub side services.
vi.mock("@src/services/sdk/namespaces/collections/lazy-services", () => ({
  getResponseCacheLazy: vi.fn().mockResolvedValue({
    invalidateCollection: vi.fn().mockResolvedValue(undefined),
    invalidateAll: vi.fn().mockResolvedValue(undefined),
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
  });

  async function flushInvalidation(): Promise<void> {
    await vi.waitFor(() => {
      expect(cacheService.clearByTags).toHaveBeenCalled();
    });
  }

  it("clears collection + count tags, never schema/content_structure", async () => {
    invalidateCache({ _id: "Posts" } as any, "tenant-a" as any);
    await flushInvalidation();

    const tags = vi.mocked(cacheService.clearByTags).mock.calls.flatMap((c) => c[0] as string[]);
    // Collection-wide list + count caches are cleared by tag (O(#matched)).
    expect(tags).toContain("collection:Posts");
    expect(tags).toContain("count:Posts");
    // Must NOT evict schema models / content structure.
    expect(tags.some((t) => t.includes("content_structure"))).toBe(false);
    expect(tags.some((t) => t.startsWith("schema"))).toBe(false);
    // No O(#docs) pattern scan for the collection namespace on the write path.
    const patterns = vi.mocked(cacheService.clearByPattern).mock.calls.map((c) => String(c[0]));
    expect(patterns.some((p) => p.startsWith("collection:"))).toBe(false);
    // Epoch must be bumped synchronously so weak ETags 304-miss on the next GET.
    expect(cacheService.bumpCollectionEpoch).toHaveBeenCalledWith("Posts", "tenant-a");
  });

  it("surgically clears ONLY the written doc's per-id tag", async () => {
    invalidateCache({ _id: "Posts" } as any, "tenant-a" as any, { writtenId: "abc-123" });
    await flushInvalidation();

    const tags = vi.mocked(cacheService.clearByTags).mock.calls.flatMap((c) => c[0] as string[]);
    expect(tags).toContain("doc:Posts:abc-123");
    // Exactly one doc tag — writes never clear other documents' per-id caches.
    expect(tags.filter((t) => t.startsWith("doc:")).length).toBe(1);
  });

  it("clears every written doc tag for a coalesced bulk write", async () => {
    invalidateCache({ _id: "Posts" } as any, "tenant-a" as any, {
      writtenIds: ["a", "b", "c"],
    });
    await flushInvalidation();

    const tags = vi.mocked(cacheService.clearByTags).mock.calls.flatMap((c) => c[0] as string[]);
    for (const id of ["a", "b", "c"]) expect(tags).toContain(`doc:Posts:${id}`);
  });
});
