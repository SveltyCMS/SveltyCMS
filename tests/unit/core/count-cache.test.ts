/**
 * @file tests/unit/core/count-cache.test.ts
 * @description Unit tests for short-lived count cache keying and wrapper hits.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCountCacheKey,
  createCountCachedCrud,
  COUNT_CACHE_TTL_SECONDS,
} from "@src/databases/core/count-cache";
import type {
  BaseEntity,
  DatabaseId,
  ICrudAdapter,
  QueryFilter,
} from "@src/databases/db-interface";
import { CacheCategory } from "@src/databases/cache/types";

const mockGet = vi.fn();
const mockGetSync = vi.fn();
const mockSet = vi.fn();

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    get: (...args: unknown[]) => mockGet(...args),
    getSync: (...args: unknown[]) => mockGetSync(...args),
    set: (...args: unknown[]) => mockSet(...args),
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
      expect.arrayContaining(["count", "count:posts", "collection:posts"]),
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
