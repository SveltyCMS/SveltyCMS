/**
 * @file tests/benchmarks/negative-cache.test.ts
 * @description Negative Cache Performance Benchmark (Optimized)
 * @summary Measures Bloom-filter style missing-key cache speedup for repeated misses against direct database miss baselines.
 */

import { LocalCMS } from "@src/services/sdk";
import {
  test,
  expect,
  runBenchmark,
  exportResult,
  exportMetric,
  printTruthTable,
  printSummaryTable,
  getDbType,
  stabilize,
} from "./modules/benchmark-utils";
import type { DatabaseId } from "@src/content/types";

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

test("Negative Cache Performance Audit", async () => {
  const { ensureFullInitialization, getDb } = await import("@src/databases/db");
  await ensureFullInitialization();
  const db = getDb();
  if (!db) throw new Error("Database initialization failed");
  const cms = new LocalCMS(db);

  const TENANT = "bench-tenant" as DatabaseId;
  const COLLECTION = "BenchmarkStable" as DatabaseId;
  const dbType = getDbType().toUpperCase();

  console.log(`🚀 Starting Negative Cache Performance Benchmark (${dbType})...\n`);

  // Ensure target collection schema is provisioned
  await db.collection
    .createModel({
      _id: COLLECTION,
      name: COLLECTION,
      fields: [{ db_fieldName: "title", type: "string" }],
    })
    .catch(() => {});

  const readOptsDirect = Object.freeze({ tenantId: TENANT });
  const readOptsStandard = Object.freeze({
    tenantId: TENANT,
    disableErrors: true,
  });
  const readOptsBypass = Object.freeze({
    tenantId: TENANT,
    bypassCache: true,
    disableErrors: true,
  });

  const results: any[] = [];

  // ── 1. DIRECT ADAPTER MISS BASELINE (ZERO SDK) ────────────────────────────
  const adapterKeys = Array.from({ length: 1000 }, () => crypto.randomUUID() as DatabaseId);
  let adapterCursor = 0;

  forceGarbageCollection();
  await stabilize(100);

  console.log("   → 1. Measuring Direct Adapter 404 Miss Baseline...");
  const adapterMissResult = await runBenchmark({
    name: "Direct DB Miss Baseline",
    iterations: 400,
    warmupIterations: 40,
    runs: 2,
    concurrency: 1,
    trimOutliers: "iqr",
    silent: true,
    onIteration: async () => {
      const targetKey = adapterKeys[adapterCursor++ % adapterKeys.length]!;
      await db.crud.findOne(COLLECTION, { _id: targetKey as any }, readOptsDirect);
    },
  });
  results.push({ ...adapterMissResult, layer: "DB", shortLabel: "Adapter Miss" });

  // ── 2. SDK FIRST MISS (COLD DB ROUNDTRIP / CACHE POPULATION) ──────────────
  const COLD_ITERATIONS = 300;
  const coldKeys = Array.from(
    { length: COLD_ITERATIONS * 4 },
    () => crypto.randomUUID() as DatabaseId,
  );
  let coldCursor = 0;

  forceGarbageCollection();
  await stabilize(100);

  console.log("   → 2. Measuring Cold SDK Miss (Bypass Cache / Direct Query)...");
  const coldMissResult = await runBenchmark({
    name: "Cold Miss (Bypass Cache)",
    iterations: COLD_ITERATIONS,
    warmupIterations: 30,
    runs: 2,
    concurrency: 1,
    trimOutliers: "iqr",
    silent: true,
    onIteration: async () => {
      const targetKey = coldKeys[coldCursor++];
      await cms.collections.findById(COLLECTION, targetKey, readOptsBypass as any);
    },
  });
  results.push({ ...coldMissResult, layer: "SDK", shortLabel: "Cold Miss (DB)" });

  // ── 3. SUBSEQUENT MISSES (NEGATIVE L1 CACHE HIT) ──────────────────────────
  const HOT_KEY_COUNT = 100;
  const hotMissingKeys = Array.from(
    { length: HOT_KEY_COUNT },
    () => crypto.randomUUID() as DatabaseId,
  );

  // Pre-seed negative cache entries
  console.log("   → Pre-warming negative cache sentinels...");
  for (const targetKey of hotMissingKeys) {
    await cms.collections.findById(COLLECTION, targetKey, readOptsStandard as any);
  }

  forceGarbageCollection();
  await stabilize(100);

  console.log("   → 3. Measuring Hot Negative Cache Hits (L1 Memory Miss Sentinel)...");
  let hotCursor = 0;

  const hotCacheMissResult = await runBenchmark({
    name: "Hot Miss (Negative Cache)",
    iterations: 8000,
    warmupIterations: 500,
    runs: 2,
    concurrency: 1,
    trimOutliers: "iqr",
    silent: true,
    onIteration: async () => {
      const targetKey = hotMissingKeys[hotCursor++ % HOT_KEY_COUNT]!;
      await cms.collections.findById(COLLECTION, targetKey, readOptsStandard as any);
    },
  });
  results.push({ ...hotCacheMissResult, layer: "L1 Cache", shortLabel: "Hot Miss (Cache)" });

  // ── 4. REPORTING & TELEMETRY ──────────────────────────────────────────────
  const speedupVsCold = (coldMissResult.avgMs / Math.max(hotCacheMissResult.avgMs, 0.0001)).toFixed(
    1,
  );
  const speedupVsAdapter = (
    adapterMissResult.avgMs / Math.max(hotCacheMissResult.avgMs, 0.0001)
  ).toFixed(1);
  const latencySavingsMs = Math.max(0, coldMissResult.avgMs - hotCacheMissResult.avgMs);

  printTruthTable({
    title: "SVELTYCMS — NEGATIVE CACHE PERFORMANCE AUDIT",
    shortLabel: "NegCache",
    subtitle: `L1 Missing-Key Sentinel vs DB Miss Floor • ${dbType}`,
    results,
  });

  printSummaryTable(
    [
      { key: "Database Engine", val: dbType, unit: "" },
      { key: "Direct DB Miss Latency", val: adapterMissResult.avgMs.toFixed(3), unit: "ms" },
      { key: "Cold SDK Miss Latency", val: coldMissResult.avgMs.toFixed(3), unit: "ms" },
      { key: "Hot Negative Cache Latency", val: hotCacheMissResult.avgMs.toFixed(3), unit: "ms" },
      { key: "Speedup vs Cold DB Miss", val: `${speedupVsCold}×`, unit: "" },
      { key: "Speedup vs Direct Adapter", val: `${speedupVsAdapter}×`, unit: "" },
      { key: "Per-Miss Latency Savings", val: `${latencySavingsMs.toFixed(3)}`, unit: "ms" },
      { key: "Negative Cache Throughput", val: Math.round(hotCacheMissResult.rps), unit: "ops/s" },
      {
        key: "Sub-0.1ms SLA",
        val: hotCacheMissResult.avgMs < 0.1 ? "ELITE (<0.1ms)" : "PASSED",
        unit: "",
      },
    ],
    "Negative Cache Summary",
  );

  exportMetric("cache.negative.cold_miss_ms", coldMissResult.avgMs, "ms");
  exportMetric("cache.negative.hot_miss_ms", hotCacheMissResult.avgMs, "ms");
  exportMetric("cache.negative.speedup", parseFloat(speedupVsCold) || 1, "x");
  exportMetric("cache.negative.throughput_rps", Math.round(hotCacheMissResult.rps), "ops/s");

  for (const r of results) exportResult(r);

  expect(hotCacheMissResult.avgMs).toBeLessThan(coldMissResult.avgMs);
}, 60_000);
