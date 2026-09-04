/**
 * @file tests/benchmarks/cache-stability-concurrency.test.ts
 * @description Pre-warm + Turbo-GET + compression regression benchmark (FIX 10).
 *
 * This exercises the production-stability hot paths that the old p95/p99 sampling
 * missed (see FIX 9): atomic increment (FIX 5), request-coalescing fail-open on a
 * dead L2 (FIX 6), the sync-compression size guard (FIX 7/8), and end-to-end cache
 * read latency under concurrency. It asserts p95/p99 stay within budget so a silent
 * regression (unbounded poll, sync zstd on a large body, lost version bump) fails CI.
 *
 * ### Features:
 * - Atomic increment monotonicity under concurrency (no lost version bumps)
 * - LOCK_ERROR fail-open latency (must NOT poll the 1000ms budget on a dead L2)
 * - compressSync size guard (large bodies must not be sync-compressed)
 * - p95/p99 cache read latency budget under concurrent load
 */

import { vi } from "vitest";
import { describe, expect, it } from "vitest";

// Same settings mock as tests/unit/databases/cache-service.test.ts — keeps the
// CacheService from dialing a real Redis / leaking settings factories into other suites.
vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn((key: string) => {
    if (key === "MULTI_TENANT") return false;
    if (key.startsWith("CACHE_TTL_")) return 300;
    if (key === "USE_REDIS") return false;
    return null;
  }),
  getPublicSettingSync: vi.fn((key: string) =>
    key === "SITE_NAME" ? "SveltyCMS Test" : undefined,
  ),
  getPrivateSetting: vi.fn(async () => null),
  getPublicSetting: vi.fn(async () => null),
  loadSettingsCache: vi.fn(async () => ({ loaded: true, private: {}, public: {} })),
  invalidateSettingsCache: vi.fn(async () => {}),
  isCacheLoaded: vi.fn(() => true),
  getAllSettings: vi.fn(async () => ({ public: {}, private: {} })),
}));

const SYNC_MAX_SIZE = 64 * 1024;

describe("Cache stability / concurrency (FIX 10)", () => {
  let service: any;
  let CacheServiceClass: any;

  beforeEach(async () => {
    const module = await import("@src/databases/cache/cache-service?bun-unmock=" + Date.now());
    CacheServiceClass = module.CacheService;
    service = new CacheServiceClass();
    await service.initialize(true);
  });

  describe("FIX 5: atomic increment under concurrency", () => {
    it("never loses a version bump across concurrent increments", async () => {
      const task = () => service.increment("system:content_version", 1);
      const results = await Promise.all(Array.from({ length: 200 }, () => task()));
      const final = await service.get("system:content_version");
      // Every increment must be observed — 200 sequential bumps, no lost update.
      expect(results.length).toBe(200);
      expect(final === undefined || final === 0 || Number(final) === 200).toBe(true);
      expect(Number(final)).toBe(200);
    });
  });

  describe("FIX 6: fail-open when the lock layer errors", () => {
    it("does not burn the 1000ms waitForCache budget on a throwing L2", async () => {
      // Simulate an L2 that ANSWERS ready but whose lock command throws — the
      // exact condition that used to make get() poll a dead winner for ~1s.
      const deadL2 = {
        isOpen: true,
        get: async () => null, // miss
        set: async () => {
          throw new Error("Redis connection failed");
        },
        incrBy: async () => {
          throw new Error("Redis connection failed");
        },
      };
      await service.connectL2ForTest(deadL2, deadL2);

      const started = Date.now();
      const val = await service.get("missing-key-failopen");
      const elapsed = Date.now() - started;
      expect(val).toBeUndefined();
      // Fail-open must return immediately, NOT wait the poll budget.
      expect(elapsed).toBeLessThan(900);
    });
  });

  describe("FIX 7/8: sync-compression size guard", () => {
    it("returns null (serves raw) for bodies above SYNC_MAX_SIZE", async () => {
      const compression = await import("@src/hooks/handle-compression");
      const { compressSync, hasNativeCompression } = compression;
      // lazy-initNativeModules() is fire-and-forget; wait until node:zlib is ready
      // so the small-body branch below is deterministic (not the `!zlib` early-out).
      const deadline = Date.now() + 3000;
      while (!hasNativeCompression() && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25));
      }

      const big = JSON.stringify({ data: "x".repeat(SYNC_MAX_SIZE + 1024) });
      // Must be >1KB (MIN_COMPRESSION_SIZE threshold) but <= SYNC_MAX_SIZE so the
      // guard allows it AND gzip actually shrinks it (~5KB repetitive → small output).
      const small = JSON.stringify({ data: "y".repeat(4096) });
      const bigBs = Buffer.byteLength(big);
      const smallBs = Buffer.byteLength(small);
      expect(bigBs).toBeGreaterThan(SYNC_MAX_SIZE);
      expect(smallBs).toBeLessThanOrEqual(SYNC_MAX_SIZE);
      // Large body → guard hits → null (caller serves uncompressed), REGARDLESS of zlib
      // readiness (the `!zlib` early-out also returns null, so both paths agree).
      expect(compressSync(big, "gzip", bigBs)).toBeNull();
      expect(compressSync(big, "br", bigBs)).toBeNull();
      // With zlib ready, a ~5KB body compresses to less than the original.
      if (hasNativeCompression()) {
        const tiny = compressSync(small, "gzip", smallBs);
        expect(tiny).not.toBeNull();
        if (tiny) expect(tiny.byteLength).toBeLessThan(smallBs);
      } else {
        // native not ready in this env — large-body guard is the contract under test.
        expect(compressSync(small, "gzip", smallBs)).toBeNull();
      }
    });
  });

  describe("FIX 9: L1 latency captured + budgeting with p95/p99", () => {
    it("records L1 hits and reports combined p95/p99 under concurrency", async () => {
      await service.set("lat-key", { v: 1 });
      const latencies: number[] = [];
      const tasks = Array.from({ length: 500 }, async () => {
        const t0 = performance.now();
        await service.get("lat-key"); // L1 hit — previously unmeasured
        latencies.push(performance.now() - t0);
      });
      await Promise.all(tasks);

      const stats = service.getLatencyStats();
      // L1 hits must have been recorded (mix of l1 + l2 buffers → samples > 0).
      expect(stats.samples).toBeGreaterThan(0);
      expect(stats.p95).toBeGreaterThanOrEqual(0);
      expect(stats.p99).toBeGreaterThanOrEqual(0);

      // p95/p99 must be sane (sub-millisecond expected on an L1 hit; loose budget
      // so CI variance / cold runs do not flake). Guard is on ORDER (p99 >= p95)
      // and on a ceiling far above legitimate L1 latency.
      expect(stats.p99).toBeGreaterThanOrEqual(stats.p95);
      expect(stats.p95).toBeLessThan(50);
      expect(stats.p99).toBeLessThan(100);
    });
  });
});
