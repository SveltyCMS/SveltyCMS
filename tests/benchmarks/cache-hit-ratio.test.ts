/**
 * @file tests/benchmarks/cache-hit-ratio.test.ts
 * @description Cache Hit Ratio Audit
 * @summary Measures Redis cache efficiency including hit rate, miss penalty, invalidation speed, and cold/warm fill.
 *
 * ### Features:
 * - Hit rate and miss penalty measurement
 * - Cache invalidation speed profiling
 * - Cold start vs warm fill comparison
 * - Redis-backed cache efficiency analysis
 */
import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  printTruthTable,
  printSummaryTable,
  getDbType,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

let stopServer: (() => Promise<void>) | null = null;

async function runCacheAudit() {
  // pre-existing unused var removed for TS strict mode
  console.log("🚀 Starting Cache Efficiency Audit...\n");

  try {
    const useRedis = process.env.USE_REDIS === "true";
    if (!useRedis) {
      console.log("⏭️ Redis not enabled — cache hit ratio test requires Redis. Skipping.");
      return;
    }

    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(1000);

    const entryPath = "/api/collections/BenchmarkStable/bench-shared-001";
    const headers = {
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
    };

    // 1. Cold read (cache miss)
    console.log("   → Measuring Cold Read (cache miss)...");
    const coldResult = await runBenchmark({
      name: "Cache Miss (Cold)",
      iterations: 50,
      warmupIterations: 0,
      runs: 2,
      concurrency: 1,
      silent: true,
      onIteration: async () => {
        // Invalidate cache before each read to force miss
        await fetch(`${baseUrl}/api/system/cache/invalidate`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ pattern: `collection:BenchmarkStable:*` }),
        }).catch(() => {});
        const res = await fetch(`${baseUrl}${entryPath}`, { headers });
        if (!res.ok) throw new Error(`Cold read failed: ${res.status}`);
        await res.json();
      },
    });

    // 2. Warm read (cache hit)
    console.log("   → Measuring Warm Read (cache hit)...");
    // Prime the cache first
    await fetch(`${baseUrl}${entryPath}`, { headers });

    const warmResult = await runBenchmark({
      name: "Cache Hit (Warm)",
      iterations: 200,
      warmupIterations: 20,
      runs: 2,
      concurrency: 4,
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${baseUrl}${entryPath}`, { headers });
        if (!res.ok) throw new Error(`Warm read failed: ${res.status}`);
        await res.json();
      },
    });

    // 3. Invalidation speed
    console.log("   → Measuring Cache Invalidation...");
    const invalidationResult = await runBenchmark({
      name: "Cache Invalidation",
      iterations: 100,
      warmupIterations: 10,
      runs: 2,
      concurrency: 1,
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${baseUrl}/api/system/cache/invalidate`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            pattern: `collection:BenchmarkStable:bench-shared-*`,
          }),
        });
        if (!res.ok) throw new Error(`Invalidation failed: ${res.status}`);
        await res.json();
      },
    });

    const speedup =
      coldResult.avgMs > 0
        ? (coldResult.avgMs / Math.max(warmResult.avgMs, 0.001)).toFixed(1)
        : "N/A";

    const results = [coldResult, warmResult, invalidationResult];

    printTruthTable({
      title: "SVELTYCMS — CACHE EFFICIENCY AUDIT",
      shortLabel: "Cache Efficiency",
      subtitle: `Redis Hit/Miss/Invalidation • ${getDbType().toUpperCase()}`,
      results,
    });

    printSummaryTable([
      { key: "Cold Read (Miss)", val: coldResult.avgMs, unit: "ms" },
      { key: "Warm Read (Hit)", val: warmResult.avgMs, unit: "ms" },
      { key: "Cache Speedup", val: speedup, unit: "x" },
      { key: "Invalidation Speed", val: invalidationResult.avgMs, unit: "ms" },
    ]);

    for (const r of results) exportResult(r);
    exportMetric("cache.cold_ms", coldResult.avgMs, "ms");
    exportMetric("cache.warm_ms", warmResult.avgMs, "ms");
    exportMetric("cache.speedup", parseFloat(speedup as string) || 0, "x");
    exportMetric("cache.invalidation_ms", invalidationResult.avgMs, "ms");
  } catch (err: any) {
    console.error(`Cache audit failed: ${err.message}`);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Cache Hit/Miss Ratio & Invalidation Audit", async () => {
  await runCacheAudit();
}, 120000);
