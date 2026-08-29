/**
 * @file tests/unit/utils/client-license-cache.test.ts
 * @description Unit tests for client-side single-flight license cache and request coalescing.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { getClientLicenseStatus, resetClientLicenseCache } from "@src/utils/client-license-cache";

describe("Client License Cache", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetClientLicenseCache();
  });

  it("coalesces concurrent requests for the same extension into a single in-flight fetch", async () => {
    let fetchCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      await new Promise((r) => setTimeout(r, 10));
      return {
        json: async () => ({ active: true, hasLicense: true, daysRemaining: null }),
      } as any;
    });

    // 3 concurrent calls for the same widget
    const [res1, res2, res3] = await Promise.all([
      getClientLicenseStatus("dashboard", "perf-coalesce"),
      getClientLicenseStatus("dashboard", "perf-coalesce"),
      getClientLicenseStatus("dashboard", "perf-coalesce"),
    ]);

    expect(res1.active).toBe(true);
    expect(res2.active).toBe(true);
    expect(res3.active).toBe(true);
    // Single in-flight request fired (no thundering herd)
    expect(fetchCount).toBe(1);
  });

  it("serves subsequent requests from memory cache without new fetch", async () => {
    let fetchCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return {
        json: async () => ({ active: true, hasLicense: false, daysRemaining: 14 }),
      } as any;
    });

    const first = await getClientLicenseStatus("dashboard", "cache-test-1");
    expect(first.daysRemaining).toBe(14);
    expect(fetchCount).toBe(1);

    const second = await getClientLicenseStatus("dashboard", "cache-test-1");
    expect(second.daysRemaining).toBe(14);
    // Served from in-memory cache
    expect(fetchCount).toBe(1);
  });

  it("fails open on network error to prevent locking users out", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network Error"));

    const fallback = await getClientLicenseStatus("dashboard", "network-down-widget");
    expect(fallback.active).toBe(true);
    expect(fallback.hasLicense).toBe(true);
  });
});
