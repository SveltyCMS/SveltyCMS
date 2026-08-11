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

let stopServer: () => Promise<void>;
let apiBaseUrl: string;

// Headers are built lazily after setupBenchmarkServer() — the REAL admin
// session cookie only exists once the server is up and the login completed.
function staticHeaders(): Headers {
  return new Headers([
    ...Object.entries(benchmarkAuthHeaders()),
    ["x-tenant-id", "default"],
    ["connection", "keep-alive"],
  ]);
}

beforeAll(async () => {
  const { stop, baseUrl } = await setupBenchmarkServer();
  stopServer = stop;
  apiBaseUrl = baseUrl;
  await ensureStableTestData();
}, 120000);

afterAll(async () => {
  if (stopServer) {
    await stopServer().catch(() => {});
  }
});

export async function runApiLatencyAudit() {
  await stabilize();

  console.log("\n🚀 Starting Enterprise API Latency Audit (E2E)...\n");

  const RUNS = 2;
  const ITERATIONS = 500;
  const allResults: any[] = [];

  const targetUrl = `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`;

  const fetchConfig: RequestInit = {
    method: "GET",
    headers: staticHeaders(),
    keepalive: true,
  };

  try {
    // ── Cold / full pipeline: unique query busts responseCache so turbo cannot HIT
    console.log("   → Measuring Pipeline Latency (findById cold, cache-busted)...");
    let coldSeq = 0;
    const httpRes = await runBenchmark({
      name: "HTTP: findById @ 8c",
      iterations: ITERATIONS,
      warmupIterations: 100,
      runs: RUNS,
      concurrency: 8,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        coldSeq++;
        // Unique search → unique turbo key → forces full handler path
        const res = await fetch(`${targetUrl}?_c=${coldSeq}`, fetchConfig);
        if (!res.ok) throw new Error(`HTTP Latency failed: ${res.status}`);
        await res.arrayBuffer();
      },
    });
    allResults.push({ ...httpRes, layer: "HTTP", shortLabel: "cold" });

    // Warm turbo auth + responseCache L1 on the stable URL
    let turboHits = 0;
    for (let i = 0; i < 30; i++) {
      const warm = await fetch(targetUrl, fetchConfig);
      const xCache = warm.headers.get("x-cache") || "";
      if (xCache.includes("TURBO")) turboHits++;
      await warm.arrayBuffer();
    }

    // ── Warm TURBO-HIT path ─────────────────────────────────────────────
    console.log(`   → Measuring Turbo HIT findById (warm hits so far: ${turboHits}/30)...`);
    let measuredTurboHits = 0;
    let measuredTotal = 0;
    const turboRes = await runBenchmark({
      name: "HTTP: findById TURBO-HIT @ 8c",
      iterations: ITERATIONS,
      warmupIterations: 100,
      runs: RUNS,
      concurrency: 8,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        measuredTotal++;
        const res = await fetch(targetUrl, fetchConfig);
        if (!res.ok) throw new Error(`Turbo findById failed: ${res.status}`);
        const xCache = res.headers.get("x-cache") || "";
        if (xCache.includes("TURBO")) measuredTurboHits++;
        await res.arrayBuffer();
      },
    });
    allResults.push({ ...turboRes, layer: "TURBO", shortLabel: "turbo" });

    const turboHitRate =
      measuredTotal > 0 ? Math.min(100, (measuredTurboHits / measuredTotal) * 100) : 0;

    printTruthTable({
      title: "SVELTYCMS  —  API LAYER LATENCY",
      subtitle: "Cold full pipeline vs Turbo GET response-cache HIT",
      results: allResults,
    });

    printSummaryTable([
      { key: "HTTP Latency (findById cold)", val: httpRes.avgMs, unit: "ms" },
      { key: "HTTP Latency (TURBO-HIT)", val: turboRes.avgMs, unit: "ms" },
      { key: "TURBO speedup", val: httpRes.avgMs / Math.max(turboRes.avgMs, 0.001), unit: "×" },
      { key: "TURBO hit rate", val: turboHitRate, unit: "%" },
      { key: "Peak Throughput (cold)", val: Math.round(httpRes.rps), unit: "req/s" },
      { key: "Peak Throughput (turbo)", val: Math.round(turboRes.rps), unit: "req/s" },
      {
        key: "Memory RSS Δ",
        val: (httpRes.rssDelta || 0).toFixed(2),
        unit: "MB",
      },
    ]);

    for (const r of allResults) exportResult(r);
    exportMetric("api.latency.http", httpRes.avgMs, "ms");
    exportMetric("api.latency.http_turbo", turboRes.avgMs, "ms");
    exportMetric("api.latency.turbo_hit_rate", turboHitRate, "%");
  } finally {
    // Graceful teardown
  }
}

test("API Latency Enterprise Suite", async () => {
  await runApiLatencyAudit();
}, 450000);
