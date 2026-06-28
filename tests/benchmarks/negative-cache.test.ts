/**
 * @file tests/benchmarks/negative-cache.test.ts
 * @description Negative Cache Performance Benchmark (Optimized)
 * @summary Measures Bloom-filter style missing-key cache speedup for repeated misses
 *
 * ### Features:
 * - First miss (DB roundtrip) baseline across multiple unique missing keys
 * - Cached miss (negative cache hit) comparison with multi-key distribution
 * - Speedup verification for repeated lookups
 */

import { LocalCMS } from "@src/services/sdk";
import { test, expect, runBenchmark, printTruthTable } from "./modules/benchmark-utils";
import type { DatabaseId } from "@src/content/types";

test("Negative Cache Performance Audit", async () => {
  const { ensureFullInitialization, getDb } = await import("@src/databases/db");
  await ensureFullInitialization();
  const db = getDb();
  if (!db) throw new Error("Database initialization failed");
  const cms = new LocalCMS(db);

  const TENANT = "bench-tenant" as DatabaseId;
  const COLLECTION = "benchmarkstable" as DatabaseId;

  console.log("🚀 Starting Negative Cache Benchmark...");

  const results: any[] = [];

  // Pre-generate a static lookup matrix of unseeded keys to prevent string generation penalties inside iterations
  const COLD_ITERATIONS = 20;
  const coldMissingKeys = Array.from(
    { length: COLD_ITERATIONS },
    (_, i) => `cold-missing-id-${i}` as DatabaseId,
  );

  // 1. First Miss (DB Hit) Baseline
  console.log("   → Measuring Cold Misses (DB Roundtrip)...");
  const firstMiss = await runBenchmark({
    name: "First Miss (DB)",
    iterations: COLD_ITERATIONS,
    warmupIterations: 2,
    runs: 1,
    onIteration: async (i: number) => {
      const targetKey = coldMissingKeys[i] ?? coldMissingKeys[0];
      // Let the harness native handler capture rejection errors directly without local try/catch bloat
      await cms.collections.findById(COLLECTION, targetKey, {
        tenantId: TENANT,
        bypassCache: true,
        disableErrors: true,
      });
    },
  });
  results.push({ ...firstMiss, label: "Cold Miss (DB)" });

  // 2. Subsequent Misses (Negative Cache Hit)
  console.log("   → Measuring Cached Misses (Negative Cache)...");

  const HOT_ITERATIONS = 10000;
  const hotMissingKeys = Array.from({ length: 100 }, (_, i) => `hot-missing-id-${i}` as DatabaseId);

  // Seed / Warm up the negative cache for our hot targets ahead of time
  for (const targetKey of hotMissingKeys) {
    await cms.collections.findById(COLLECTION, targetKey, { tenantId: TENANT });
  }

  const cachedMiss = await runBenchmark({
    name: "Cached Miss (Negative Cache)",
    iterations: HOT_ITERATIONS,
    warmupIterations: 120,
    runs: 2,
    onIteration: async (i: number) => {
      // Loop over our pool of warmed missing keys to avoid JIT literal optimizations
      const targetKey = hotMissingKeys[i % hotMissingKeys.length];
      await cms.collections.findById(COLLECTION, targetKey, {
        tenantId: TENANT,
      });
    },
  });
  results.push({ ...cachedMiss, label: "Hot Miss (Cache)" });

  // Report Processing
  printTruthTable({
    title: "NEGATIVE CACHE PERFORMANCE AUDIT",
    subtitle: "Verifying 404-Miss Latency Gains",
    results: results.map((r) => ({
      ...r,
      shortLabel: r.label,
      avg: r.avgMs,
      p95: r.p95Ms,
      rps: r.rps,
    })),
    layerMode: false,
  });

  // Verification Assertions
  expect(cachedMiss.avgMs).toBeLessThan(firstMiss.avgMs);
  console.log(`\n✅ Negative Cache Speedup: ${(firstMiss.avgMs / cachedMiss.avgMs).toFixed(1)}x`);
}, 60000);
