/**
 * @file tests/unit/databases/credential-auth-cache.test.ts
 * @description Unit tests for bearer credential auth cache helpers.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    getSync: vi.fn(),
    setWithCategory: vi.fn(),
    delete: vi.fn(),
    clearByTags: vi.fn(),
    isNegativeHit: vi.fn(),
    recordMiss: vi.fn(),
  },
}));

describe("credential-auth-cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("websiteTokenCacheKey prefixes apitoken hash", async () => {
    const { websiteTokenCacheKey } = await import("@src/databases/auth/credential-auth-cache");
    expect(websiteTokenCacheKey("abc123")).toBe("apitoken:abc123");
  });

  it("setWebsiteTokenAuthCache uses SESSION category and tags", async () => {
    const { setWebsiteTokenAuthCache, websiteTokenAuthTags } =
      await import("@src/databases/auth/credential-auth-cache");
    const { cacheService } = await import("@src/databases/cache/cache-service");
    const { CacheCategory } = await import("@src/databases/cache/types");

    const entry = { user: { _id: "token:1" }, tenantId: "t1" };
    await setWebsiteTokenAuthCache("hash1", entry, "tok-1", "t1");

    expect(cacheService.setWithCategory).toHaveBeenCalledWith(
      "apitoken:hash1",
      entry,
      CacheCategory.SESSION,
      "t1",
      60,
      websiteTokenAuthTags("tok-1"),
    );
  });

  it("invalidateWebsiteTokenAuth clears tags and hash key", async () => {
    const { invalidateWebsiteTokenAuth } =
      await import("@src/databases/auth/credential-auth-cache");
    const { cacheService } = await import("@src/databases/cache/cache-service");

    await invalidateWebsiteTokenAuth("tok-9", "tenant-a", "stored-hash");

    expect(cacheService.clearByTags).toHaveBeenCalledWith(["website-token:tok-9"], "tenant-a");
    expect(cacheService.delete).toHaveBeenCalledWith("apitoken:stored-hash", "tenant-a");
  });

  it("recordWebsiteTokenAuthMiss uses cacheService negative bloom", async () => {
    const { recordWebsiteTokenAuthMiss } =
      await import("@src/databases/auth/credential-auth-cache");
    const { cacheService } = await import("@src/databases/cache/cache-service");

    recordWebsiteTokenAuthMiss("bad-hash", "global");
    expect(cacheService.recordMiss).toHaveBeenCalledWith("apitoken:bad-hash", "global");
  });
});
