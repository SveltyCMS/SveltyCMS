/**
 * @file tests/unit/databases/credential-auth-cache.test.ts
 * @description Whitebox proofs for credential auth cache helpers against **real** CacheService.
 *
 * setup.ts may mock cache-service for other suites. We install a live facade that
 * points at a real CacheService instance so this file never uses cacheMock as the
 * only proof — works alone and inside the full databases directory run.
 *
 * Note: Bun's vitest shim may not provide vi.hoisted — use a plain module holder.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";

/** Shared holder — populated in beforeAll with a real CacheService. */
const real: { service: any; CacheService: any } = {
  service: null,
  CacheService: null,
};

vi.mock("@src/databases/cache/cache-service", () => {
  const facade = new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "CacheService") return real.CacheService;
        const svc = real.service;
        if (!svc) return undefined;
        const val = (svc as any)[prop];
        return typeof val === "function" ? val.bind(svc) : val;
      },
    },
  );
  return {
    get CacheService() {
      return real.CacheService;
    },
    cacheService: facade,
    default: facade,
  };
});

describe("credential-auth-cache (real CacheService)", () => {
  beforeAll(async () => {
    const mod = await import("@src/databases/cache/cache-service?bun-unmock=" + Date.now());
    real.CacheService = mod.CacheService;
    real.service = new mod.CacheService();
    await real.service.initialize({ USE_REDIS: false } as any);
  });

  beforeEach(async () => {
    await real.service.invalidateAll();
  });

  it("websiteTokenCacheKey / apiKeyCacheKey use hash prefixes", async () => {
    const { websiteTokenCacheKey, apiKeyCacheKey } =
      await import("@src/databases/auth/credential-auth-cache");
    expect(websiteTokenCacheKey("abc123")).toBe("apitoken:abc123");
    expect(apiKeyCacheKey("xyz")).toBe("apikey:xyz");
  });

  it("websiteTokenAuthTags include token-scoped invalidation tag", async () => {
    const { websiteTokenAuthTags } = await import("@src/databases/auth/credential-auth-cache");
    expect(websiteTokenAuthTags("tok-1")).toEqual(
      expect.arrayContaining(["auth", "website-token", "website-token:tok-1"]),
    );
  });

  it("setWebsiteTokenAuthCache round-trips via real L1 getSync", async () => {
    const { setWebsiteTokenAuthCache, getWebsiteTokenAuthCacheSync } =
      await import("@src/databases/auth/credential-auth-cache");

    const entry = { user: { _id: "token:1" }, tenantId: "t1" };
    await setWebsiteTokenAuthCache("hash1", entry, "tok-1", "t1");

    expect(getWebsiteTokenAuthCacheSync("hash1", "t1")).toEqual(entry);
    expect(getWebsiteTokenAuthCacheSync("hash1", "t2")).toBeNull();
  });

  it("recordWebsiteTokenAuthMiss marks negative bloom hit", async () => {
    const { recordWebsiteTokenAuthMiss, isWebsiteTokenAuthNegativeHit } =
      await import("@src/databases/auth/credential-auth-cache");

    recordWebsiteTokenAuthMiss("bad-hash", "global");
    expect(isWebsiteTokenAuthNegativeHit("bad-hash", "global")).toBe(true);
  });

  it("set clears negative bloom so a prior miss can be populated", async () => {
    const {
      recordWebsiteTokenAuthMiss,
      isWebsiteTokenAuthNegativeHit,
      setWebsiteTokenAuthCache,
      getWebsiteTokenAuthCacheSync,
    } = await import("@src/databases/auth/credential-auth-cache");

    recordWebsiteTokenAuthMiss("recover-hash", "t1");
    expect(isWebsiteTokenAuthNegativeHit("recover-hash", "t1")).toBe(true);

    await setWebsiteTokenAuthCache(
      "recover-hash",
      { user: { _id: "u" }, tenantId: "t1" },
      "tok-r",
      "t1",
    );
    expect(isWebsiteTokenAuthNegativeHit("recover-hash", "t1")).toBe(false);
    expect(getWebsiteTokenAuthCacheSync("recover-hash", "t1")).toEqual({
      user: { _id: "u" },
      tenantId: "t1",
    });
  });

  it("invalidateWebsiteTokenAuth clears positive cache by tag and hash key", async () => {
    const { setWebsiteTokenAuthCache, getWebsiteTokenAuthCacheSync, invalidateWebsiteTokenAuth } =
      await import("@src/databases/auth/credential-auth-cache");

    await setWebsiteTokenAuthCache(
      "stored-hash",
      { user: { _id: "u9" }, tenantId: "tenant-a" },
      "tok-9",
      "tenant-a",
    );
    expect(getWebsiteTokenAuthCacheSync("stored-hash", "tenant-a")).not.toBeNull();

    await invalidateWebsiteTokenAuth("tok-9", "tenant-a", "stored-hash");
    expect(getWebsiteTokenAuthCacheSync("stored-hash", "tenant-a")).toBeNull();
  });

  it("api key cache set + invalidate works on real CacheService", async () => {
    const { setApiKeyAuthCache, getApiKeyAuthCacheSync, invalidateApiKeyAuth } =
      await import("@src/databases/auth/credential-auth-cache");

    await setApiKeyAuthCache("key-hash", { user: { _id: "api:1" }, tenantId: "t1" }, "key-1", "t1");
    expect(getApiKeyAuthCacheSync("key-hash", "t1")).toEqual({
      user: { _id: "api:1" },
      tenantId: "t1",
    });

    await invalidateApiKeyAuth("key-1", "t1", "key-hash");
    expect(getApiKeyAuthCacheSync("key-hash", "t1")).toBeNull();
  });

  it("exports SESSION-aligned TTL constant", async () => {
    const { CREDENTIAL_AUTH_CACHE_TTL_S } =
      await import("@src/databases/auth/credential-auth-cache");
    // Short positive-cache TTL (seconds) — balances SESSION category with fast revocation
    expect(CREDENTIAL_AUTH_CACHE_TTL_S).toBe(60);
  });
});
