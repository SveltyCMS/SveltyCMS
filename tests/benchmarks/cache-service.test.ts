/**
 * @file tests/benchmarks/cache-service.test.ts
 * @description Cache Service Micro-Benchmark (Optimized)
 * @summary Measures L1 cache hit latency and pattern invalidation overhead at scale
 *
 * ### Features:
 * - L1 cache hit baseline (direct get)
 * - Pattern-based invalidation stress (1k targets @ 200k noise keys)
 * - Cache layer (L1/L2) performance profiling
 */

import {
  test,
  runBenchmark,
  computeStatistics,
  exportResult,
  printTruthTable,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { cacheService } from "@src/databases/cache/cache-service";

async function runCacheServiceBenchmark() {
  console.log(`🚀 Starting CacheService Micro-Benchmark...\n`);

  try {
    const results = [];
    const TENANT = "global";

    // 1. Warm-up cache space
    for (let i = 0; i < 1000; i++) {
      await cacheService.set(`key-${i}`, { data: "test" }, 300, TENANT);
    }

    // 2. L1 Hit Baseline
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
    // Persist under the test's OWN section ("Cache Svc") — sharing "Cache"
    // with cache-performance.test.ts made the section flip between an
    // in-process µs number and an E2E HTTP ms number (bogus +27800% trend).
    exportResult({ ...hitResult, layer: "L1", shortLabel: "Cache Svc" });

    // 3. Pattern Invalidation Stress (O(N) Bottleneck Isolation)
    console.log(
      "   → Measuring Pattern Invalidation (Stress: 1k target items, 200k background)...",
    );

    // Fill with background noise keys
    for (let i = 0; i < 200000; i++) {
      if (i % 50000 === 0) {
        console.log(`      ... seeded ${i} background noise keys`);
      }
      await cacheService.set(`noise-key-${i}`, { data: "noise" }, 300, TENANT);
    }

    const INVALIDATION_ITERATIONS = 10;
    const targetPattern = "bench-key-";

    // 🛡️ HONEST TIMING: re-seed targets BEFORE the timed span — the old code
    // seeded 1,000 keys inside onIteration (a comment claimed it was "outside
    // the critical timing metric", which was false: runBenchmark times the
    // whole callback), inflating "Pattern Invalidation" with the seed cost.
    const invalidationTimes: number[] = [];
    for (let i = 0; i < INVALIDATION_ITERATIONS; i++) {
      const seedPromises = Array.from({ length: 1000 }, (_, k) =>
        cacheService.set(`${targetPattern}${k}`, { data: "test" }, 300, TENANT),
      );
      await Promise.all(seedPromises);

      const t0 = performance.now();
      await cacheService.clearByPattern(targetPattern, TENANT);
      invalidationTimes.push(performance.now() - t0);
    }
    const invalidationResult = computeStatistics(
      invalidationTimes,
      invalidationTimes.length / (invalidationTimes.reduce((a, b) => a + b, 0) / 1000),
      { name: "Pattern Invalidation (1k items @ 200k noise)", runs: 1, concurrency: 1 },
    );
    results.push({
      ...invalidationResult,
      layer: "L1",
      shortLabel: "Invalidate",
    });
    exportResult({ ...invalidationResult, layer: "L1", shortLabel: "Cache Svc" });

    printTruthTable({
      title: "SVELTYCMS — CACHE SERVICE TELEMETRY",
      shortLabel: "Cache Svc",
      subtitle: "Internal Cache Logic Overhead",
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
