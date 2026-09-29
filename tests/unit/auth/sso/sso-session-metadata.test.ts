/**
 * @file tests/unit/auth/sso/sso-session-metadata.test.ts
 * @description SSO session metadata is kept in memory and written to the distributed cache.
 *
 * ### Features:
 * - set writes `sso:session:{id}` with the session category and a 7-day TTL
 * - a later get on an empty process hydrates from that cache entry
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cacheService } from "@src/databases/cache/cache-service";
import { CacheCategory } from "@src/databases/cache/types";
import {
  deleteSsoSessionMetadata,
  getSsoSessionMetadata,
  setSsoSessionMetadata,
  type SsoSessionMetadata,
} from "@src/databases/auth/sso-session";

const META: SsoSessionMetadata = {
  provider: "google",
  idTokenHint: "hint-token",
  createdAt: "2026-09-29T00:00:00.000Z",
};

describe("SSO session metadata cache", () => {
  beforeEach(() => {
    deleteSsoSessionMetadata("sess-sso-1", "tenant-a");
    vi.mocked(cacheService.set).mockClear();
    vi.mocked(cacheService.get).mockReset();
    vi.mocked(cacheService.get).mockResolvedValue(null);
  });

  it("writes metadata to the distributed cache and serves it from memory", async () => {
    await setSsoSessionMetadata("sess-sso-1", META, "tenant-a");

    expect(cacheService.set).toHaveBeenCalledWith(
      "sso:session:sess-sso-1",
      META,
      7 * 24 * 3600,
      "tenant-a",
      CacheCategory.SESSION,
    );
    await expect(getSsoSessionMetadata("sess-sso-1", "tenant-a")).resolves.toEqual(META);
    expect(cacheService.get).not.toHaveBeenCalled();
  });

  it("hydrates a cold process from the distributed cache", async () => {
    deleteSsoSessionMetadata("sess-sso-1", "tenant-a");
    vi.mocked(cacheService.get).mockResolvedValueOnce(META);

    await expect(getSsoSessionMetadata("sess-sso-1", "tenant-a")).resolves.toEqual(META);
    expect(cacheService.get).toHaveBeenCalledWith(
      "sso:session:sess-sso-1",
      "tenant-a",
      CacheCategory.SESSION,
    );
    vi.mocked(cacheService.get).mockClear();
    await expect(getSsoSessionMetadata("sess-sso-1", "tenant-a")).resolves.toEqual(META);
    expect(cacheService.get).not.toHaveBeenCalled();
  });
});
