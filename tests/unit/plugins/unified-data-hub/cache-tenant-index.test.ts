/**
 * @file tests/unit/plugins/unified-data-hub/cache-tenant-index.test.ts
 * @description v1.5 P4 — tenant-scoped cache key index for O(1) eviction, plus the
 * TTL expiry and max-entry eviction contract of the underlying FastLRU.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearTenantCache,
  getCacheStats,
  getCachedVirtualRead,
  getTenantCacheKeyCount,
  resetVirtualReadCache,
  setCachedVirtualRead,
} from "@plugins/unified-data-hub/server/cache";

function result(connectorId = "c1", staleness: "real-time" | "cache" = "real-time") {
  return { data: [], meta: { connectorId, staleness } } as Parameters<
    typeof setCachedVirtualRead
  >[3];
}

describe("virtual read cache tenant index", () => {
  afterEach(() => {
    resetVirtualReadCache();
  });

  it("tracks keys per tenant and clears without full scan", () => {
    setCachedVirtualRead(
      "tenant-a",
      "vc-1",
      "hash-1",
      {
        data: [],
        meta: { connectorId: "c1", staleness: "real-time" },
      },
      60,
    );
    setCachedVirtualRead(
      "tenant-a",
      "vc-2",
      "hash-2",
      {
        data: [],
        meta: { connectorId: "c1", staleness: "real-time" },
      },
      60,
    );
    setCachedVirtualRead(
      "tenant-b",
      "vc-3",
      "hash-3",
      {
        data: [],
        meta: { connectorId: "c2", staleness: "real-time" },
      },
      60,
    );

    expect(getTenantCacheKeyCount("tenant-a")).toBe(2);
    clearTenantCache("tenant-a");
    expect(getTenantCacheKeyCount("tenant-a")).toBe(0);
    expect(getTenantCacheKeyCount("tenant-b")).toBe(1);
  });

  it("expires an entry once its per-entry TTL elapses", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      setCachedVirtualRead("tenant-a", "vc-1", "hash-1", result(), 60);
      expect(getCachedVirtualRead("tenant-a", "vc-1", "hash-1")).not.toBeNull();

      // Advance past the 60s TTL — the read must miss and drop the entry.
      vi.setSystemTime(new Date("2026-01-01T00:01:01Z"));
      expect(getCachedVirtualRead("tenant-a", "vc-1", "hash-1")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("caps the cache at 2000 entries (LRU eviction)", () => {
    for (let i = 0; i < 2500; i++) {
      setCachedVirtualRead("tenant-a", "vc", `hash-${i}`, result(), 60);
    }
    expect(getCacheStats().entries).toBeLessThanOrEqual(2000);
    expect(getCacheStats().entries).toBeGreaterThan(0);
  });
});
