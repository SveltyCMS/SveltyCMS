/**
 * @file tests/benchmarks/api-latency.test.ts
 * @description API Latency Benchmark (Production Optimized)
 * @summary Cold full-pipeline findById + warm TURBO-HIT path after responseCache fill.
 */

import {
  test,
  beforeAll,
  afterAll,
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  STABLE_COLLECTION,
  STABLE_ENTRY_ID,
  ensureStableTestData,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

let stopServer: (() => Promise<void>) | null = null;
let apiBaseUrl: string;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

beforeAll(async () => {
  const { stop, baseUrl } = await setupBenchmarkServer();
  stopServer = stop;
  apiBaseUrl = baseUrl;
  await ensureStableTestData();
}, 120_000);

afterAll(async () => {
  if (stopServer) {
    await stopServer().catch(() => {});
    stopServer = null;
  }
});

export async function runApiLatencyAudit() {
  await stabilize(500);

  console.log("\n🚀 Starting Enterprise API Latency Audit (E2E)...\n");

  const RUNS = 2;
  const ITERATIONS = 500;
  const allResults: any[] = [];

  const targetUrl = `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`;

  // Pre-allocated static headers to prevent allocation overhead in hot loop
  const headers: Record<string, string> = {
    ...benchmarkAuthHeaders(),
    "x-tenant-id": "default",
    "content-type": "application/json",
    connection: "keep-alive",
  };

  try {
    // ── 1. COLD / FULL PIPELINE (CACHE-BUSTED) ──────────────────────────────
    console.log("   → Measuring Pipeline Latency (findById cold, cache-busted)...");
    let coldSeq = 0;

    const httpRes = await runBenchmark({
      name: "HTTP: findById @ 8c (Cold)",
      iterations: ITERATIONS,
      warmupIterations: 100,
      runs: RUNS,
      concurrency: 8,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const seq = coldSeq++;
        const res = await fetch(`${targetUrl}?_c=${seq}`, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) throw new Error(`HTTP Latency failed: ${res.status}`);
        await res.arrayBuffer().catch(() => {});
      },
    });

    allResults.push({ ...httpRes, layer: "HTTP", shortLabel: "cold" });

    // ── 2. PRIME AND VERIFY TURBO CACHE ─────────────────────────────────────
    forceGarbageCollection();
    await stabilize(300);

    let primeHits = 0;
    for (let i = 0; i < 30; i++) {
      const warm = await fetch(targetUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(5000),
      });
      const xCache = warm.headers.get("x-cache") || "";
      if (xCache.toUpperCase().includes("TURBO")) primeHits++;
      await warm.arrayBuffer().catch(() => {});
    }

    console.log(`   → Cache primed. Verified initial TURBO hits: ${primeHits}/30`);

    // ── 3. WARM TURBO-HIT PATH ──────────────────────────────────────────────
    console.log("   → Measuring Steady-State Turbo HIT findById @ 8c...");
    let measuredTurboHits = 0;
    let measuredTotal = 0;

    const turboRes = await runBenchmark({
      name: "HTTP: findById TURBO-HIT @ 8c (Warm)",
      iterations: ITERATIONS,
      warmupIterations: 100,
      runs: RUNS,
      concurrency: 8,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(targetUrl, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) throw new Error(`Turbo findById failed: ${res.status}`);

        const xCache = res.headers.get("x-cache") || "";
        if (xCache.toUpperCase().includes("TURBO")) {
          measuredTurboHits++;
        }
        measuredTotal++;

        await res.arrayBuffer().catch(() => {});
      },
    });

    allResults.push({ ...turboRes, layer: "TURBO", shortLabel: "turbo" });

    // ── 4. REPORTING & METRICS ──────────────────────────────────────────────
    const turboHitRate =
      measuredTotal > 0 ? ((measuredTurboHits / measuredTotal) * 100).toFixed(1) : "100.0";
    const speedup = (httpRes.avgMs / Math.max(turboRes.avgMs, 0.001)).toFixed(2);

    printTruthTable({
      title: "SVELTYCMS — API LAYER LATENCY",
      subtitle: "Cold Full Pipeline vs Turbo GET Response-Cache HIT",
      results: allResults,
    });

    printSummaryTable(
      [
        { key: "Cold Pipeline Latency", val: httpRes.avgMs.toFixed(2), unit: "ms" },
        { key: "Turbo HIT Latency", val: turboRes.avgMs.toFixed(2), unit: "ms" },
        { key: "TURBO Speedup", val: `${speedup}×`, unit: "" },
        { key: "TURBO Hit Rate", val: `${turboHitRate}%`, unit: "" },
        { key: "Cold Throughput", val: Math.round(httpRes.rps), unit: "req/s" },
        { key: "Turbo Throughput", val: Math.round(turboRes.rps), unit: "req/s" },
        {
          key: "Memory RSS Δ",
          val: (httpRes.rssDelta ?? 0).toFixed(2),
          unit: "MB",
        },
      ],
      "API Latency Summary",
    );

    for (const r of allResults) exportResult(r);
    exportMetric("api.latency.http", httpRes.avgMs, "ms");
    exportMetric("api.latency.http_turbo", turboRes.avgMs, "ms");
    exportMetric("api.latency.turbo_hit_rate", parseFloat(turboHitRate) || 100, "%");
    exportMetric("api.latency.speedup", parseFloat(speedup) || 1, "x");
  } catch (err: any) {
    console.error("API Latency Audit failed:", err);
    throw err;
  }
}

test("API Latency Enterprise Suite", async () => {
  await runApiLatencyAudit();
}, 450_000);
