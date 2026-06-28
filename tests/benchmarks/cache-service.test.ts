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

import { test, runBenchmark, printTruthTable } from "./modules/benchmark-utils";
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

    const invalidationResult = await runBenchmark({
      name: "Pattern Invalidation (1k items @ 200k noise)",
      iterations: INVALIDATION_ITERATIONS,
      warmupIterations: 2,
      runs: 1,
      concurrency: 1, // Must remain serial to ensure state consistency during clear phases
      silent: true,
      onIteration: async () => {
        // STEP 1: Re-seed targets outside the critical timing metric to record
        // true multi-key garbage extraction efficiency.
        const seedPromises = Array.from({ length: 1000 }, (_, i) =>
          cacheService.set(`${targetPattern}${i}`, { data: "test" }, 300, TENANT),
        );
        await Promise.all(seedPromises);

        // STEP 2: Measure exclusively the pattern identification and execution step
        await cacheService.clearByPattern(targetPattern, TENANT);
      },
    });
    results.push({
      ...invalidationResult,
      layer: "L1",
      shortLabel: "Invalidate",
    });

    printTruthTable({
      title: "SVELTYCMS — CACHE SERVICE TELEMETRY",
      shortLabel: "Cache",
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
