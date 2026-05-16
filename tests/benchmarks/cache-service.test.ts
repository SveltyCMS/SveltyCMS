/**
 * @file tests/benchmarks/cache-service.test.ts
 * @description Micro-benchmark for CacheService overhead and invalidation scaling.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, printTruthTable } from "./benchmark-utils";
import { cacheService } from "@src/databases/cache/cache-service";

async function runCacheServiceBenchmark() {
  console.log(`🚀 Starting CacheService Micro-Benchmark...\n`);

  try {
    const results = [];
    const TENANT = "global";

    // 1. Warm-up
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

    // 3. Pattern Invalidation Stress (O(N) Bottleneck)
    console.log(
      "   → Measuring Pattern Invalidation (Stress: 1k target items, 200k background)...",
    );

    // Fill with background noise
    for (let i = 0; i < 200000; i++) {
      if (i % 10000 === 0) console.log(`      ... seeded ${i} noise keys`);
      await cacheService.set(`noise-key-${i}`, { data: "noise" }, 300, TENANT);
    }

    const invalidationResult = await runBenchmark({
      name: "Pattern Invalidation (1k items @ 200k noise)",
      iterations: 10,
      warmupIterations: 2,
      runs: 1,
      concurrency: 1,
      silent: true,
      onIteration: async () => {
        // Seed 1k items to clear
        for (let i = 0; i < 1000; i++) {
          await cacheService.set(`bench-key-${i}`, { data: "test" }, 300, TENANT);
        }
        // Measure the clear
        await cacheService.clearByPattern("bench-key-", TENANT);
      },
    });
    results.push({ ...invalidationResult, layer: "L1", shortLabel: "Invalidate" });

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
