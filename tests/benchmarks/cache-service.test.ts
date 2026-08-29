/**
 * @file tests/benchmarks/cache-service.test.ts
 * @description Cache Service Micro-Benchmark (Optimized)
 * @summary Measures L1 cache hit latency and pattern invalidation overhead at scale.
 */

import {
  test,
  runBenchmark,
  computeStatistics,
  exportResult,
  printTruthTable,
  stabilize,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { cacheService } from "@src/databases/cache/cache-service";

// Static shared payloads to prevent V8 allocation churn during setup
const TEST_PAYLOAD = Object.freeze({ data: "test" });
const NOISE_PAYLOAD = Object.freeze({ data: "noise" });
const TENANT = "global";
const TTL_SECONDS = 300;

/** High-speed chunked batch seeder */
async function batchSeed(
  keyPrefix: string,
  count: number,
  payload: Record<string, unknown>,
  batchSize = 5000,
): Promise<void> {
  for (let i = 0; i < count; i += batchSize) {
    const end = Math.min(i + batchSize, count);
    const chunk = Array.from({ length: end - i }, (_, idx) =>
      cacheService.set(`${keyPrefix}${i + idx}`, payload, TTL_SECONDS, TENANT),
    );
    await Promise.all(chunk);
  }
}

async function runCacheServiceBenchmark() {
  console.log(`🚀 Starting CacheService Micro-Benchmark...\n`);

  try {
    const results = [];

    // ── 1. WARMUP CACHE SPACE ───────────────────────────────────────────────
    await batchSeed("key-", 1000, TEST_PAYLOAD, 500);

    // ── 2. L1 HIT BASELINE (DIRECT GET) ────────────────────────────────────
    console.log("   → Measuring L1 Hit (Direct)...");
    const hitResult = await runBenchmark({
      name: "Cache L1 Hit",
      iterations: 20000,
      warmupIterations: 1000,
      runs: 3,
      concurrency: 1,
      silent: true,
      onIteration: async () => {
        const val = await cacheService.get("key-1", TENANT);
        if (!val) throw new Error("Cache miss on warm key");
      },
    });

    results.push({ ...hitResult, layer: "L1", shortLabel: "Hit" });
    exportResult({ ...hitResult, layer: "L1", shortLabel: "Cache Svc" });

    // ── 3. FLAT PATTERN INVALIDATION (200k Background Noise) ───────────────
    console.log("   → Seeding 200k flat background noise keys (batched)...");
    await batchSeed("noise-key-", 200000, NOISE_PAYLOAD, 5000);

    if (typeof (globalThis as any).gc === "function") (globalThis as any).gc();
    await stabilize(200);

    console.log("   → Measuring Flat Pattern Invalidation (1k targets @ 200k noise)...");
    const INVALIDATION_ITERATIONS = 10;
    const targetPattern = "bench-key-";
    const invalidationTimes: number[] = [];

    for (let i = 0; i < INVALIDATION_ITERATIONS; i++) {
      // Re-seed 1k targets outside the timed invalidation span
      const seedBatch = Array.from({ length: 1000 }, (_, k) =>
        cacheService.set(`${targetPattern}${k}`, TEST_PAYLOAD, TTL_SECONDS, TENANT),
      );
      await Promise.all(seedBatch);

      const t0 = performance.now();
      await cacheService.clearByPattern(targetPattern, TENANT);
      invalidationTimes.push(performance.now() - t0);

      // Verify invalidation on first cycle
      if (i === 0) {
        const checkTarget = await cacheService.get(`${targetPattern}0`, TENANT);
        const checkNoise = await cacheService.get("noise-key-0", TENANT);
        if (checkTarget !== null && checkTarget !== undefined) {
          throw new Error("Target key was not evicted by clearByPattern");
        }
        if (!checkNoise) {
          throw new Error("Background noise key was unintentionally evicted");
        }
      }
    }

    const totalInvTimeMs = invalidationTimes.reduce((a, b) => a + b, 0);
    const invRps = totalInvTimeMs > 0 ? invalidationTimes.length / (totalInvTimeMs / 1000) : 0;

    const invalidationResult = computeStatistics(invalidationTimes, invRps, {
      name: "Pattern Invalidation (1k items @ 200k noise)",
      runs: 1,
      concurrency: 1,
    });

    results.push({
      ...invalidationResult,
      layer: "L1",
      shortLabel: "Invalidate (Flat)",
    });
    exportResult({ ...invalidationResult, layer: "L1", shortLabel: "Cache Svc" });

    // ── 4. NAMESPACED PATTERN INVALIDATION ──────────────────────────────────
    console.log("   → Seeding 100k namespaced background noise keys (batched)...");
    await batchSeed("collection:noise:", 100000, NOISE_PAYLOAD, 5000);

    if (typeof (globalThis as any).gc === "function") (globalThis as any).gc();
    await stabilize(200);

    console.log(
      "   → Measuring Namespaced Pattern Invalidation (1k targets @ 100k namespace noise)...",
    );
    const NAMESPACED_PATTERN = "collection:bench:";
    const namespacedTimes: number[] = [];

    for (let i = 0; i < INVALIDATION_ITERATIONS; i++) {
      const seedBatch = Array.from({ length: 1000 }, (_, k) =>
        cacheService.set(`${NAMESPACED_PATTERN}${k}`, TEST_PAYLOAD, TTL_SECONDS, TENANT),
      );
      await Promise.all(seedBatch);

      const t0 = performance.now();
      await cacheService.clearByPattern(NAMESPACED_PATTERN, TENANT);
      namespacedTimes.push(performance.now() - t0);

      // Verify namespaced eviction on first cycle
      if (i === 0) {
        const checkTarget = await cacheService.get(`${NAMESPACED_PATTERN}0`, TENANT);
        const checkNoise = await cacheService.get("collection:noise:0", TENANT);
        if (checkTarget !== null && checkTarget !== undefined) {
          throw new Error("Namespaced target key was not evicted");
        }
        if (!checkNoise) {
          throw new Error("Namespaced noise key was unintentionally evicted");
        }
      }
    }

    const totalNsTimeMs = namespacedTimes.reduce((a, b) => a + b, 0);
    const nsRps = totalNsTimeMs > 0 ? namespacedTimes.length / (totalNsTimeMs / 1000) : 0;

    const namespacedResult = computeStatistics(namespacedTimes, nsRps, {
      name: "Pattern Invalidation (Namespaced 1k @ 100k noise)",
      runs: 1,
      concurrency: 1,
    });

    results.push({
      ...namespacedResult,
      layer: "L1",
      shortLabel: "Invalidate (NS)",
    });
    exportResult({ ...namespacedResult, layer: "L1", shortLabel: "Cache Svc" });

    // ── REPORTING ───────────────────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — CACHE SERVICE TELEMETRY",
      shortLabel: "Cache Svc",
      subtitle: "Internal In-Memory Cache Lookup & Invalidation Latency",
      results,
    });
  } catch (err: any) {
    console.error("Benchmark failed:", err);
    throw err;
  }
}

test("Cache Service Performance Audit", async () => {
  await runCacheServiceBenchmark();
}, 60000);
