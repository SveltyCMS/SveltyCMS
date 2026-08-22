/**
 * @file tests/unit/sdk/collections-post-write.test.ts
 * @description Document-write cache invalidation must not evict schema models.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { cacheService } from "@src/databases/cache/cache-service";
import { invalidateCache } from "@src/services/sdk/namespaces/collections/post-write";

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    clearByPattern: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("collections post-write invalidation", () => {
  beforeEach(() => {
    vi.mocked(cacheService.clearByPattern).mockClear();
  });

  async function flushInvalidation(): Promise<void> {
    await vi.waitFor(() => {
      expect(cacheService.clearByPattern).toHaveBeenCalled();
    });
  }

  it("does not purge cms:content_structure on entry mutations", async () => {
    invalidateCache({ _id: "Posts" } as any, "tenant-a" as any);
    await flushInvalidation();

    const patterns = vi.mocked(cacheService.clearByPattern).mock.calls.map((c) => String(c[0]));
    expect(patterns.some((p) => p.includes("content_structure"))).toBe(false);
    expect(patterns).toContain("collection:Posts:");
    expect(patterns).toContain("/api/collections/Posts*");
  });

  it("adds a lowercase API pattern only when the schema id is mixed-case", async () => {
    invalidateCache({ _id: "posts" } as any, "tenant-a" as any);
    await flushInvalidation();

    const patterns = vi.mocked(cacheService.clearByPattern).mock.calls.map((c) => String(c[0]));
    expect(patterns).toContain("/api/collections/posts*");
    expect(patterns.filter((p) => p.startsWith("/api/collections/")).length).toBe(1);
  });
});
