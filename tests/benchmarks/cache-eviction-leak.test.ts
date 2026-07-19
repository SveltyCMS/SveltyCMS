/**
 * @file tests/benchmarks/cache-eviction-leak.test.ts
 * @description L1 Cache Eviction, Boundary Enforcement, and Memory Pressure Soak Test.
 * @summary Validates LRU cache pruning rules under intense memory threshold ceilings.
 */
import {
  test,
  runBenchmark,
  printTruthTable,
  printSummaryTable,
  getMemorySnapshot,
} from "./benchmark-utils";
import { cacheService } from "@src/databases/cache/cache-service";
import { expect } from "vitest";

test("L1 Cache Eviction and Memory Pressure Leak Audit", async () => {
  console.log("🚀 Starting L1 Cache Eviction under Memory Pressure Audit...\n");

  const FLOOD_ITERATIONS = 40000;
  const CACHE_SIZE_LIMIT = 5000; // Target LRU budget size boundary

  // Set cache instance limits programmatically if supported, or verify baseline ceilings
  if ((cacheService as any).l1) {
    const { LRUCache } = await import("lru-cache");
    (cacheService as any).l1 = new LRUCache({ max: CACHE_SIZE_LIMIT, ttl: 1000 * 60 * 5 });
  }

  const initialMemory = getMemorySnapshot();
  const cacheKeys = Array.from(
    { length: FLOOD_ITERATIONS },
    (_, i) => `evict_test_key_asset_descriptor_${i}`,
  );
  const payloadMock = { metadata: "dense_layout_blueprint_matrix_payload_token_block".repeat(10) };

  console.log(`   → Flooding L1 Cache with ${FLOOD_ITERATIONS} dynamic allocation descriptors...`);

  const floodStats = await runBenchmark({
    name: "Cache Flooding & Eviction",
    iterations: FLOOD_ITERATIONS,
    warmupIterations: 100,
    runs: 1,
    concurrency: 1,
    onIteration: async (i: number) => {
      const targetKey = cacheKeys[i]!;
      // Forces consecutive database caching writes
      await cacheService.set(targetKey, payloadMock, 60, "global");
    },
  });

  if (typeof Bun !== "undefined" && typeof Bun.gc === "function") {
    Bun.gc(true);
  }
  const finalMemory = getMemorySnapshot();
  const totalRssDeltaMb = finalMemory.rss - initialMemory.rss;

  console.log("   → Checking cache eviction containment boundaries...");

  // Verify that oldest records have been evicted safely from memory arrays
  const oldestRecord = await cacheService.get(cacheKeys[0]!, "global");
  expect(oldestRecord).toBeUndefined(); // Should be pruned by LRU algorithm

  // Verify recent items are fully preserved
  const newestRecord = await cacheService.get(cacheKeys[FLOOD_ITERATIONS - 1]!, "global");
  expect(newestRecord).toBeDefined();

  // 🛡️ MEMORY RETENTION CEILING REPLICABILITY GATE
  console.log(`   ✅ Cache pruning verified. RSS Growth: ${totalRssDeltaMb.toFixed(2)} MB`);
  expect(totalRssDeltaMb).toBeLessThan(120); // Must conform to < 120MB standard budget allocation (adjusted for test runner overhead)

  printTruthTable({
    title: "SVELTYCMS — CACHE EVICTION BOUNDARY HARDENING",
    shortLabel: "Eviction",
    results: [{ ...floodStats, layer: "Cache", shortLabel: "Eviction" }],
  });

  printSummaryTable([
    { key: "Eviction Hot Path Processing Latency", val: floodStats.avgMs, unit: "ms" },
    { key: "Total Native Memory Growth Footprint", val: totalRssDeltaMb, unit: "MB" },
    { key: "Cache Boundary Eviction Containment", val: "STABLE / ENFORCED", unit: "SLA" },
  ]);
}, 45000);
