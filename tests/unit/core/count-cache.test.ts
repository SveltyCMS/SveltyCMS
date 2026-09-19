/**
 * @file tests/unit/core/count-cache.test.ts
 * @description Unit tests for short-lived count cache keying, wrapper hits, and
 *              the superset tag sets producers/invalidators must agree on.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCountCacheKey,
  buildCountCacheTags,
  createCountCachedCrud,
  COUNT_CACHE_TTL_SECONDS,
} from "@src/databases/core/count-cache";
import { buildCollectionCacheTags } from "@src/databases/core/collection-name";
import {
  expectClearedCovers,
  expectedCollectionCacheTags,
  expectTagOverlap,
  tagSetFromCalls,
} from "../helpers/collection-cache-tags";
import { BaseAdapter } from "@src/databases/core/base-adapter";
import type {
  BaseEntity,
  DatabaseId,
  IBatchAdapter,
  ICrudAdapter,
  QueryFilter,
} from "@src/databases/db-interface";
import { CacheCategory } from "@src/databases/cache/types";

const mockGet = vi.fn();
const mockGetSync = vi.fn();
const mockSet = vi.fn();
const mockClearByTags = vi.fn();

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    get: (...args: unknown[]) => mockGet(...args),
    getSync: (...args: unknown[]) => mockGetSync(...args),
    set: (...args: unknown[]) => mockSet(...args),
    clearByTags: (...args: unknown[]) => mockClearByTags(...args),
  },
}));

describe("buildCountCacheKey", () => {
  it("includes collection, mode, and filter hash", () => {
    const a = buildCountCacheKey("posts", { status: "active" }, { mode: "exact" });
    const b = buildCountCacheKey("posts", { status: "draft" }, { mode: "exact" });
    const c = buildCountCacheKey("posts", { status: "active" }, { mode: "estimate" });
    expect(a).toMatch(/^count:posts:exact:/);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("buildCountCacheTags", () => {
  it("tags both the as-passed name and the normalised physical name", () => {
    expect(buildCountCacheTags("posts")).toEqual(
      expectedCollectionCacheTags("posts", { countBucket: true }),
    );
  });

  it("adds the bare (unprefixed) spelling for a physical input, deduped", () => {
    // Superset by design: the normaliser is one-way, so a physical-only
    // invalidator can only reach logical-spelled entries if the producer also
    // emitted the bare spelling.
    const tags = buildCountCacheTags("collection_posts");
    expect(tags).toEqual(expectedCollectionCacheTags("collection_posts", { countBucket: true }));
    expect(new Set(tags).size).toBe(tags.length);
  });

  it("keeps a dashed logical id reachable from either spelling", () => {
    expect(buildCountCacheTags("blog-posts")).toEqual(
      expectedCollectionCacheTags("blog-posts", { countBucket: true }),
    );
  });

  it("never emits the meaningless empty spelling", () => {
    expect(buildCountCacheTags("")).toEqual(expectedCollectionCacheTags("", { countBucket: true }));
    expect(buildCountCacheTags("collection_")).toEqual(
      expectedCollectionCacheTags("collection_", { countBucket: true }),
    );
  });

  it("handles the literal id 'collection' without duplicating tags", () => {
    const tags = buildCountCacheTags("collection");
    expect(tags).toEqual(expectedCollectionCacheTags("collection", { countBucket: true }));
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe("createCountCachedCrud", () => {
  const innerCount = vi.fn();
  let inner: ICrudAdapter;

  beforeEach(() => {
    mockGet.mockReset();
    mockGetSync.mockReset();
    mockSet.mockReset();
    innerCount.mockReset();
    inner = {
      count: innerCount,
      findPage: vi.fn(),
    } as unknown as ICrudAdapter;
  });

  it("returns cached number without calling inner on hit", async () => {
    mockGetSync.mockReturnValue(42);
    const wrapped = createCountCachedCrud(inner);
    const res = await wrapped.count("posts", {}, { tenantId: "t1" as DatabaseId });
    expect(res).toEqual({ success: true, data: 42 });
    expect(innerCount).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
    // getSync takes exactly 2 runtime args (key, tenantId) — never a category.
    expect(mockGetSync).toHaveBeenCalledTimes(1);
    expect(mockGetSync).toHaveBeenCalledWith(expect.stringContaining("count:posts:auto:"), "t1");
  });

  it("calls inner on miss and writes cache", async () => {
    mockGetSync.mockReturnValue(null);
    mockGet.mockResolvedValue(undefined);
    innerCount.mockResolvedValue({ success: true, data: 7 });
    mockSet.mockResolvedValue(undefined);

    const wrapped = createCountCachedCrud(inner);
    const res = await wrapped.count("posts", { status: "active" } as QueryFilter<BaseEntity>, {
      tenantId: "t1" as DatabaseId,
      mode: "exact",
    });

    if (!res.success) throw new Error("expected count to succeed");
    expect(res.data).toBe(7);
    expect(innerCount).toHaveBeenCalledOnce();
    // Async get takes exactly 3 runtime args (key, tenantId, category).
    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining("count:posts:exact:"),
      "t1",
      CacheCategory.CONTENT,
    );
    expect(mockSet).toHaveBeenCalledWith(
      expect.stringContaining("count:posts:exact:"),
      7,
      COUNT_CACHE_TTL_SECONDS,
      "t1",
      expect.anything(),
      expect.arrayContaining(expectedCollectionCacheTags("posts", { countBucket: true })),
    );
  });

  it("bypasses cache when bypassCache is set", async () => {
    innerCount.mockResolvedValue({ success: true, data: 3 });
    const wrapped = createCountCachedCrud(inner);
    await wrapped.count("posts", {}, { bypassCache: true });
    expect(mockGet).not.toHaveBeenCalled();
    expect(innerCount).toHaveBeenCalledOnce();
  });
});

/**
 * Mongo crud/media invalidate through BaseAdapter.invalidateQueryCache with the
 * collection name they were called with — which for list/count reads is the
 * physical spelling. Tag-intersection only (cache module mocked, no DB).
 */
describe("BaseAdapter.invalidateQueryCache tag scope", () => {
  class CacheProbe extends BaseAdapter {
    get batch(): IBatchAdapter {
      return {} as IBatchAdapter;
    }
    get crud(): ICrudAdapter {
      return {} as ICrudAdapter;
    }
  }

  async function clearedTagsFor(collection: string): Promise<Set<string>> {
    mockClearByTags.mockClear();
    await new CacheProbe().invalidateQueryCache(collection, "tenant-a");
    expect(mockClearByTags).toHaveBeenCalled();
    return tagSetFromCalls(mockClearByTags.mock.calls);
  }

  beforeEach(() => {
    mockSet.mockReset();
    mockClearByTags.mockReset().mockResolvedValue(undefined);
  });

  it("clears the tag superset, so a physical-only name reaches logical-spelled entries", async () => {
    const cleared = await clearedTagsFor("collection_posts");
    // Tags a producer using the logical id "posts" registers. The pre-fix single
    // spelling clear (`collection:collection_posts`) missed all of them, leaving
    // list/count entries stale until TTL.
    expectClearedCovers(expectedCollectionCacheTags("posts"), cleared);
    expect(mockClearByTags).toHaveBeenCalledWith(expect.any(Array), "tenant-a");
  });

  it("degrades safely for a dashed id: physical clear intersects the physical producer", async () => {
    const cleared = await clearedTagsFor("blog-posts");
    const producerTags = new Set(buildCollectionCacheTags("collection_blogposts"));
    // The dash-loss degradation: the clear must still reach the bare spelling the
    // physical producer emits (and vice versa) — never a silent miss.
    expectTagOverlap(producerTags, cleared, expectedCollectionCacheTags("collection_blogposts"));
  });
});
