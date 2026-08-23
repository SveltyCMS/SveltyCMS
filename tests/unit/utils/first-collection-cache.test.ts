/**
 * @file tests/unit/utils/first-collection-cache.test.ts
 * @description Unit tests for the first-collection redirect cache and its
 * invalidation (fresh installs must never be redirected to a stale collection
 * path from an earlier setup run in the same process).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetFirstCollectionRedirectUrl = vi.fn();

vi.mock("@src/content/index.server", () => ({
  contentSystem: {
    getFirstCollectionRedirectUrl: (...args: unknown[]) =>
      mockGetFirstCollectionRedirectUrl(...args),
  },
}));

describe("first-collection redirect cache", () => {
  let mod: typeof import("@src/utils/server/collection-utils.server");

  beforeEach(async () => {
    vi.resetModules();
    mockGetFirstCollectionRedirectUrl.mockReset();
    mod = await import("@src/utils/server/collection-utils.server");
  });

  it("caches the resolved path for a language and re-uses it", async () => {
    mockGetFirstCollectionRedirectUrl.mockResolvedValue("/en/collection/pages");

    const first = await mod.getCachedFirstCollectionPath("en" as never);
    const second = await mod.getCachedFirstCollectionPath("en" as never);

    expect(first).toBe("/en/collection/pages");
    expect(second).toBe("/en/collection/pages");
    // One resolution, one cache hit.
    expect(mockGetFirstCollectionRedirectUrl).toHaveBeenCalledTimes(1);
  });

  it("does not cache a null result (no collections yet)", async () => {
    mockGetFirstCollectionRedirectUrl.mockResolvedValue(null);

    const first = await mod.getCachedFirstCollectionPath("en" as never);
    const second = await mod.getCachedFirstCollectionPath("en" as never);

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(mockGetFirstCollectionRedirectUrl).toHaveBeenCalledTimes(2);
  });

  it("invalidates the cache so the next call re-resolves from the live registry", async () => {
    mockGetFirstCollectionRedirectUrl.mockResolvedValueOnce("/en/collection/pages");

    const cached = await mod.getCachedFirstCollectionPath("en" as never);
    expect(cached).toBe("/en/collection/pages");

    // Setup re-run / reset: the old first collection no longer exists.
    mod.invalidateFirstCollectionPathCache();
    mockGetFirstCollectionRedirectUrl.mockResolvedValueOnce("/en/collection/blog");

    const fresh = await mod.getCachedFirstCollectionPath("en" as never);
    expect(fresh).toBe("/en/collection/blog");
    expect(mockGetFirstCollectionRedirectUrl).toHaveBeenCalledTimes(2);
  });

  it("keeps tenant-scoped and global cache entries separate", async () => {
    mockGetFirstCollectionRedirectUrl.mockResolvedValue("/en/collection/pages");

    const global = await mod.getCachedFirstCollectionPath("en" as never);
    const tenant = await mod.getCachedFirstCollectionPath("en" as never, "acme");

    expect(global).toBe("/en/collection/pages");
    expect(tenant).toBe("/en/collection/pages");
    // Two distinct cache keys → two resolutions.
    expect(mockGetFirstCollectionRedirectUrl).toHaveBeenCalledTimes(2);

    mod.invalidateFirstCollectionPathCache();

    mockGetFirstCollectionRedirectUrl.mockResolvedValue("/en/collection/acme-pages");
    const tenantFresh = await mod.getCachedFirstCollectionPath("en" as never, "acme");
    expect(tenantFresh).toBe("/en/collection/acme-pages");
  });
});
