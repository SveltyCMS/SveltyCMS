/**
 * @file tests/unit/utils/batch-loader-timed-prime.test.ts
 * @description Complements batch-loader.test.ts: pins the timed-cache branches
 * of the allocation-lean BatchLoader cache (bare-promise values at TTL 0,
 * timed wrapper at cacheTtlMs > 0).
 *
 * Features:
 * - prime() entries honor cacheTtlMs expiry (timed wrapper evicted on stale read)
 * - prime() with TTL 0 stores a request-scoped entry that never expires
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { BatchLoader } from "@utils/server/batch-loader";

afterEach(() => {
  vi.useRealTimers();
});

describe("BatchLoader timed prime", () => {
  it("prime entries honor cacheTtlMs expiry (timed wrapper path)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    const fn = vi.fn(async (keys: readonly string[]) => keys.map((k) => `v:${k}`));
    const loader = new BatchLoader(fn, { cacheTtlMs: 100 });

    loader.prime("a", "va");
    await expect(loader.load("a")).resolves.toBe("va");
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(150);
    await expect(loader.load("a")).resolves.toBe("v:a"); // expired → batchFn refetch
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("prime entries never expire when TTL is disabled (bare-promise path)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });

    const fn = vi.fn(async (keys: readonly string[]) => keys.map((k) => `v:${k}`));
    const loader = new BatchLoader(fn);

    loader.prime("a", "va");
    vi.advanceTimersByTime(600_000); // 10 minutes later
    await expect(loader.load("a")).resolves.toBe("va");
    expect(fn).not.toHaveBeenCalled();
  });
});
