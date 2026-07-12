/**
 * @file tests/unit/plugins/unified-data-hub/cache-tenant-index.test.ts
 * @description v1.5 P4 — tenant-scoped cache key index for O(1) eviction.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  clearTenantCache,
  getTenantCacheKeyCount,
  resetVirtualReadCache,
  setCachedVirtualRead,
} from "@plugins/unified-data-hub/server/cache";

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
});
