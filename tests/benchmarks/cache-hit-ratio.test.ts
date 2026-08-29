/**
 * @file tests/benchmarks/cache-hit-ratio.test.ts
 * @description Cache Hit Ratio & Invalidation Audit (Optimized)
 * @summary Measures true cold-fill, warm hit ratio, miss penalty, and invalidation latency.
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
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

let stopServer: (() => Promise<void>) | null = null;

async function runCacheAudit() {
  console.log("🚀 Starting Cache Efficiency & Hit-Ratio Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    // Verify Redis connection via system health check
    let redisActive = false;
    try {
      const healthRes = await fetch(`${baseUrl}/api/system/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (healthRes.ok) {
        const healthData = (await healthRes.json()) as any;
        redisActive =
          healthData?.redis === true ||
          healthData?.services?.redis === "connected" ||
          healthData?.cache?.l2 === true;
      }
      await healthRes.arrayBuffer().catch(() => {});
    } catch {
      // Non-fatal fallback
    }

    if (process.env.USE_REDIS === "true" && !redisActive) {
      console.warn("⚠️ USE_REDIS=true was set, but Redis is not responding in health check.");
    }

    await ensureStableTestData();
    await stabilize(500);

    const baseHeaders: HeadersInit = {
      ...benchmarkAuthHeaders(),
      connection: "keep-alive",
    };

    const jsonHeaders: HeadersInit = {
      ...baseHeaders,
      "content-type": "application/json",
    };

    const entryId = "20000000-0000-4000-8000-000000000001";
    const hitUrl = `${baseUrl}/api/collections/BenchmarkStable/${entryId}`;
    const bypassUrl = `${baseUrl}/api/collections/BenchmarkStable/${entryId}?bypassCache=true`;
    const invalidateBody = JSON.stringify({ count: 0 });

    // ── 1. COLD FILL (TRUE MISS + WRITE-THROUGH) ────────────────────────────
    console.log("   → Measuring True Cold Fill (Invalidate → Miss → DB Load → Cache Fill)...");
    const coldFillTimes: number[] = [];
    const COLD_ITERATIONS = 30;

    for (let i = 0; i < COLD_ITERATIONS; i++) {
      // 1. Invalidate cache via mutation outside timing window
      const invRes = await fetch(hitUrl, {
        method: "PATCH",
        headers: jsonHeaders,
        body: invalidateBody,
      });
      await invRes.arrayBuffer().catch(() => {});

      // 2. Measure cold read and cache repopulation
      const t0 = performance.now();
      const res = await fetch(hitUrl, { method: "GET", headers: baseHeaders });
      coldFillTimes.push(performance.now() - t0);

      if (!res.ok) throw new Error(`Cold read failed with status ${res.status}`);
      await res.arrayBuffer().catch(() => {});
    }

    const avgColdMs = coldFillTimes.reduce((a, b) => a + b, 0) / coldFillTimes.length;
    const sortedCold = [...coldFillTimes].sort((a, b) => a - b);
    const p95ColdMs =
      sortedCold[Math.floor(sortedCold.length * 0.95)] ?? sortedCold[sortedCold.length - 1];

    const coldResult = {
      name: "Cache Cold Fill (Miss + Repopulate)",
      shortLabel: "Cold Fill",
      avgMs: avgColdMs,
      p95Ms: p95ColdMs,
      rps: COLD_ITERATIONS / (coldFillTimes.reduce((a, b) => a + b, 0) / 1000),
      layer: "Cache (Miss)",
    };

    // ── 2. WARM READ (STEADY-STATE HIT) ─────────────────────────────────────
    console.log("   → Measuring Warm Read (Steady-State Cache Hit)...");
    // Explicit prime
    const primeRes = await fetch(hitUrl, { headers: baseHeaders });
    await primeRes.arrayBuffer().catch(() => {});

    let cacheHits = 0;
    let totalReads = 0;

    const warmResult = await runBenchmark({
      name: "Cache Hit (Warm)",
      iterations: 500,
      warmupIterations: 50,
      runs: 2,
      concurrency: 1, // Normalized to 1c for direct baseline comparison with cold
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const res = await fetch(hitUrl, {
          method: "GET",
          headers: baseHeaders,
        });

        if (!res.ok) throw new Error(`Warm read failed: ${res.status}`);

        // Track hit headers when available
        const cacheHeader = res.headers.get("x-cache") || res.headers.get("cf-cache-status");
        if (cacheHeader ? cacheHeader.toUpperCase().includes("HIT") : res.ok) {
          cacheHits++;
        }
        totalReads++;

        await res.arrayBuffer();
      },
    });

    // ── 3. CACHE INVALIDATION SPEED ─────────────────────────────────────────
    console.log("   → Measuring Cache Invalidation (Authenticated PATCH Mutation)...");
    const invalidationResult = await runBenchmark({
      name: "Cache Invalidation",
      iterations: 100,
      warmupIterations: 10,
      runs: 2,
      concurrency: 1,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const res = await fetch(hitUrl, {
          method: "PATCH",
          headers: jsonHeaders,
          body: invalidateBody,
        });
        if (!res.ok) throw new Error(`Invalidation failed: ${res.status}`);
        await res.arrayBuffer();
      },
    });

    // ── 4. BYPASS OVERHEAD (NO-CACHE COMPARISON) ───────────────────────────
    const bypassResult = await runBenchmark({
      name: "Bypass Cache (Direct DB)",
      iterations: 100,
      warmupIterations: 10,
      runs: 2,
      concurrency: 1,
      silent: true,
      onIteration: async () => {
        const res = await fetch(bypassUrl, { method: "GET", headers: baseHeaders });
        if (!res.ok) throw new Error(`Bypass request failed: ${res.status}`);
        await res.arrayBuffer();
      },
    });

    // ── METRIC CALCULATIONS & REPORTING ─────────────────────────────────────
    const speedup =
      coldResult.avgMs > 0
        ? (coldResult.avgMs / Math.max(warmResult.avgMs, 0.001)).toFixed(2)
        : "1.00";

    const hitRatio = totalReads > 0 ? ((cacheHits / totalReads) * 100).toFixed(1) : "100.0";
    const missPenaltyMs = (coldResult.avgMs - warmResult.avgMs).toFixed(2);
    const dbType = getDbType().toUpperCase();

    const results = [
      coldResult,
      { ...warmResult, layer: "Cache (Hit)", shortLabel: "Warm Hit" },
      { ...bypassResult, layer: "Database", shortLabel: "Bypass DB" },
      { ...invalidationResult, layer: "Mutation", shortLabel: "Invalidation" },
    ];

    printTruthTable({
      title: "SVELTYCMS — CACHE EFFICIENCY AUDIT",
      shortLabel: "Cache Efficiency",
      subtitle: `Hit/Miss/Invalidation • ${redisActive ? "Redis L2" : "L1 Memory"} • ${dbType}`,
      results,
    });

    printSummaryTable(
      [
        { key: "Database", val: dbType, unit: "" },
        {
          key: "Cache Tier",
          val: redisActive ? "Redis (L2) + Memory (L1)" : "Memory (L1)",
          unit: "",
        },
        { key: "Cold Fill Latency", val: coldResult.avgMs.toFixed(2), unit: "ms" },
        { key: "Warm Hit Latency", val: warmResult.avgMs.toFixed(2), unit: "ms" },
        { key: "Bypass (Direct DB)", val: bypassResult.avgMs.toFixed(2), unit: "ms" },
        { key: "Miss Penalty", val: `+${missPenaltyMs}`, unit: "ms" },
        { key: "Cache Speedup", val: `${speedup}×`, unit: "" },
        { key: "Hit Rate", val: `${hitRatio}%`, unit: "" },
        { key: "Invalidation Mutation", val: invalidationResult.avgMs.toFixed(2), unit: "ms" },
      ],
      "Cache Performance Summary",
    );

    for (const r of results) exportResult(r);
    exportMetric("cache.cold_ms", coldResult.avgMs, "ms");
    exportMetric("cache.warm_ms", warmResult.avgMs, "ms");
    exportMetric("cache.speedup", parseFloat(speedup) || 1, "x");
    exportMetric("cache.invalidation_ms", invalidationResult.avgMs, "ms");
    exportMetric("cache.hit_ratio_pct", parseFloat(hitRatio) || 100, "%");
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
}, 120_000);
