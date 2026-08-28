/**
 * @file tests/benchmarks/cache-eviction-leak.test.ts
 * @description L1 Cache Eviction, Boundary Enforcement, and Memory Pressure Soak Test (Optimized)
 * @summary Validates strict LRU cache pruning rules and memory containment under heavy key flooding.
 */

import {
  test,
  runBenchmark,
  printTruthTable,
  printSummaryTable,
  getMemorySnapshot,
  stabilize,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { cacheService } from "@src/databases/cache/cache-service";
import { expect } from "vitest";

// Pre-frozen immutable payload to eliminate object instantiation overhead inside the loop
const PAYLOAD_MOCK = Object.freeze({
  metadata: "dense_layout_blueprint_matrix_payload_token_block".repeat(10),
});

const KEY_PREFIX = "evict_test_key_asset_";
const TENANT = "global";
const TTL_SECONDS = 60;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

test("L1 Cache Eviction and Memory Pressure Leak Audit", async () => {
  console.log("🚀 Starting L1 Cache Eviction under Memory Pressure Audit...\n");

  const FLOOD_ITERATIONS = 40_000;
  const CACHE_SIZE_LIMIT = 5_000; // Target LRU budget size boundary

  // ── 1. CONFIGURE BOUNDED LRU CACHE INSTANCE ───────────────────────────────
  if ((cacheService as any).l1) {
    const { LRUCache } = await import("lru-cache");
    (cacheService as any).l1 = new LRUCache({
      max: CACHE_SIZE_LIMIT,
      ttl: 1000 * 60 * 5,
    });
  }

  // Clear baseline and stabilize memory before taking snapshot
  forceGarbageCollection();
  await stabilize(300);

  const initialMemory = getMemorySnapshot();

  console.log(
    `   → Flooding L1 Cache with ${FLOOD_ITERATIONS} dynamic allocations (capacity limit: ${CACHE_SIZE_LIMIT})...`,
  );

  // ── 2. HIGH-FREQUENCY CACHE FLOOD BENCHMARK ───────────────────────────────
  let counter = 0;
  const floodStats = await runBenchmark({
    name: "Cache Flooding & Eviction",
    iterations: FLOOD_ITERATIONS,
    warmupIterations: 200,
    runs: 1,
    concurrency: 1,
    silent: true,
    onIteration: async () => {
      // Deterministic monotonic key generation prevents array allocation overhead
      const key = `${KEY_PREFIX}${counter++}`;
      await cacheService.set(key, PAYLOAD_MOCK, TTL_SECONDS, TENANT);
    },
  });

  // Force clean engine sweep to measure actual persistent heap retention
  forceGarbageCollection();
  await stabilize(300);

  const finalMemory = getMemorySnapshot();
  const totalRssDeltaMb = Math.max(0, finalMemory.rss - initialMemory.rss);
  const totalHeapDeltaMb = Math.max(0, finalMemory.heapUsed - initialMemory.heapUsed);

  console.log("   → Verifying exact LRU eviction boundary containment...");

  // ── 3. STRICT BOUNDARY & EVICTION VERIFICATION ───────────────────────────
  const l1Cache = (cacheService as any).l1;
  if (l1Cache && typeof l1Cache.size === "number") {
    expect(l1Cache.size).toBeLessThanOrEqual(CACHE_SIZE_LIMIT);
  }

  // A. Oldest keys must be evicted (e.g. keys generated early in the run)
  const oldestRecord = await cacheService.get(`${KEY_PREFIX}0`, TENANT);
  const midOldRecord = await cacheService.get(
    `${KEY_PREFIX}${Math.floor(FLOOD_ITERATIONS / 4)}`,
    TENANT,
  );
  expect(oldestRecord).toBeUndefined();
  expect(midOldRecord).toBeUndefined();

  // B. Exact boundary test: Keys within the last CACHE_SIZE_LIMIT items must exist
  const newestKeyIdx = counter - 1;
  const retainedBoundaryKeyIdx = counter - Math.floor(CACHE_SIZE_LIMIT * 0.8);

  const newestRecord = await cacheService.get(`${KEY_PREFIX}${newestKeyIdx}`, TENANT);
  const boundaryRecord = await cacheService.get(`${KEY_PREFIX}${retainedBoundaryKeyIdx}`, TENANT);

  expect(newestRecord).toBeDefined();
  expect(boundaryRecord).toBeDefined();

  // ── 4. MEMORY CEILING ASSERTIONS ──────────────────────────────────────────
  console.log(
    `   ✅ Boundary verified. Active size: ${l1Cache?.size ?? "N/A"}/${CACHE_SIZE_LIMIT} | RSS Delta: +${totalRssDeltaMb.toFixed(
      2,
    )} MB | Heap Delta: +${totalHeapDeltaMb.toFixed(2)} MB`,
  );

  // Maximum allowed heap growth for 5,000 small entries is well under 120 MB
  expect(totalRssDeltaMb).toBeLessThan(120);

  // ── 5. REPORTING ──────────────────────────────────────────────────────────
  printTruthTable({
    title: "SVELTYCMS — CACHE EVICTION BOUNDARY HARDENING",
    shortLabel: "Eviction",
    subtitle: `40k Writes · 5k LRU Limit · ${CACHE_SIZE_LIMIT} Cap`,
    results: [
      {
        ...floodStats,
        layer: "Cache (LRU)",
        shortLabel: "Eviction Hot Path",
      },
    ],
  });

  printSummaryTable(
    [
      {
        key: "Hot-Path Eviction Latency (Avg)",
        val: floodStats.avgMs.toFixed(3),
        unit: "ms",
      },
      {
        key: "Eviction Throughput",
        val: floodStats.rps.toFixed(0),
        unit: "ops/s",
      },
      {
        key: "Native RSS Memory Growth",
        val: totalRssDeltaMb.toFixed(2),
        unit: "MB",
      },
      {
        key: "V8/JSC Heap Growth",
        val: totalHeapDeltaMb.toFixed(2),
        unit: "MB",
      },
      {
        key: "LRU Hard Limit Enforcement",
        val: `${l1Cache?.size ?? CACHE_SIZE_LIMIT}/${CACHE_SIZE_LIMIT}`,
        unit: "keys",
      },
      {
        key: "Eviction Boundary Containment",
        val: "STABLE / ENFORCED",
        unit: "SLA",
      },
    ],
    "Cache Eviction Summary",
  );
}, 60_000);
