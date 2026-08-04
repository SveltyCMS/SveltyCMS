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
import type { ICrudAdapter } from "@src/databases/db-interface";

const mockGet = vi.fn();
const mockSet = vi.fn();

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    get: (...args: unknown[]) => mockGet(...args),
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
    mockSet.mockReset();
    innerCount.mockReset();
    inner = {
      count: innerCount,
      findPage: vi.fn(),
    } as unknown as ICrudAdapter;
  });

  it("returns cached number without calling inner on hit", async () => {
    mockGet.mockResolvedValue(42);
    const wrapped = createCountCachedCrud(inner);
    const res = await wrapped.count("posts", {}, { tenantId: "t1" });
    expect(res).toEqual({ success: true, data: 42 });
    expect(innerCount).not.toHaveBeenCalled();
  });

  it("calls inner on miss and writes cache", async () => {
    mockGet.mockResolvedValue(undefined);
    innerCount.mockResolvedValue({ success: true, data: 7 });
    mockSet.mockResolvedValue(undefined);

    const wrapped = createCountCachedCrud(inner);
    const res = await wrapped.count(
      "posts",
      { status: "active" },
      { tenantId: "t1", mode: "exact" },
    );

    expect(res.data).toBe(7);
    expect(innerCount).toHaveBeenCalledOnce();
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
