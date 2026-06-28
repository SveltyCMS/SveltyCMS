/**
 * @file tests/benchmarks/cache-hit-ratio.test.ts
 * @description Cache Hit Ratio Audit (Optimized)
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

    // Canonical static headers layout
    const baseHeaders = {
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
    };

    const jsonHeaders = {
      ...baseHeaders,
      "content-type": "application/json",
    };

    // Pre-serialized request payloads to protect micro-timing windows
    const coldInvalidateBody = JSON.stringify({
      pattern: "collection:BenchmarkStable:*",
    });
    const bulkInvalidateBody = JSON.stringify({
      pattern: "collection:BenchmarkStable:bench-shared-*",
    });

    // 1. Cold read (cache miss)
    console.log("   → Measuring Cold Read (cache miss)...");
    const coldResult = await runBenchmark({
      name: "Cache Miss (Cold)",
      iterations: 50,
      warmupIterations: 0,
      runs: 2,
      concurrency: 1, // Must be serial to execute isolation invalidation blocks cleanly
      silent: true,
      onIteration: async () => {
        // STEP 1: Invalidate out-of-band to guarantee cache miss
        const purgeRes = await fetch(`${baseUrl}/api/system/cache/invalidate`, {
          method: "POST",
          headers: jsonHeaders,
          body: coldInvalidateBody,
        });
        if (!purgeRes.ok) throw new Error(`Pre-iteration purge failed: ${purgeRes.status}`);
        await purgeRes.arrayBuffer();

        // STEP 2: Measure the pure cost of an isolated backend cache miss
        const res = await fetch(`${baseUrl}${entryPath}`, {
          method: "GET",
          headers: baseHeaders,
        });
        if (!res.ok) throw new Error(`Cold read failed: ${res.status}`);
        await res.arrayBuffer();
      },
    });

    // 2. Warm read (cache hit)
    console.log("   --> Measuring Warm Read (cache hit)...");
    // Warm the cache target explicitly prior to loop entry
    const warmUpRes = await fetch(`${baseUrl}${entryPath}`, {
      headers: baseHeaders,
    });
    await warmUpRes.arrayBuffer();

    const warmResult = await runBenchmark({
      name: "Cache Hit (Warm)",
      iterations: 200,
      warmupIterations: 20,
      runs: 2,
      concurrency: 4, // High concurrent read load profile
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${baseUrl}${entryPath}`, {
          method: "GET",
          headers: baseHeaders,
        });
        if (!res.ok) throw new Error(`Warm read failed: ${res.status}`);
        await res.arrayBuffer();
      },
    });

    // 3. Invalidation speed
    console.log("   --> Measuring Cache Invalidation...");
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
          headers: jsonHeaders,
          body: bulkInvalidateBody,
        });
        if (!res.ok) throw new Error(`Invalidation failed: ${res.status}`);
        await res.arrayBuffer();
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
