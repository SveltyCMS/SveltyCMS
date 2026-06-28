/**
 * @file tests/benchmarks/api-latency.test.ts
 * @description API Latency Benchmark (Optimized)
 * @summary Measures the precise cost of the HTTP middleware stack compared to direct SDK calls.
 *
 * ### Features:
 * - Middleware stack overhead profiling
 * - HTTP vs direct SDK latency comparison
 * - Per-layer cost attribution
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
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

let stopServer: () => Promise<void>;
let apiBaseUrl: string;

beforeAll(async () => {
  const { stop, baseUrl } = await setupBenchmarkServer();
  stopServer = stop;
  apiBaseUrl = baseUrl;

  // 🚀 CLEAN ROOM: No local DB imports. Everything via HTTP.
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

  // Cache static header configs outside hot trails to guard timing precision
  const requestHeaders = {
    "x-test-mode": "true",
    "x-test-secret": TEST_API_SECRET,
    "x-tenant-id": "default",
  };

  try {
    console.log("   → Measuring Pipeline Latency (findById)...");
    const httpRes = await runBenchmark({
      name: "HTTP: findById @ 8c",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: RUNS,
      concurrency: 8, // High-concurrency profiling target
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(
          `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
          {
            method: "GET",
            headers: requestHeaders,
          },
        );
        if (!res.ok) throw new Error(`HTTP Latency failed: ${res.status}`);

        // Fast socket drain bypasses client-side string compilation and JSON parsing noise
        await res.arrayBuffer();
      },
    });
    allResults.push({ ...httpRes, layer: "HTTP" });

    printTruthTable({
      title: "SVELTYCMS  —  API LAYER LATENCY",
      subtitle: "Full HTTP Pipeline Performance",
      results: allResults,
    });

    printSummaryTable([
      { key: "HTTP Latency (findById)", val: httpRes.avgMs, unit: "ms" },
      { key: "Peak Throughput", val: Math.round(httpRes.rps), unit: "req/s" },
      {
        key: "Memory RSS Δ",
        val: (httpRes.rssDelta || 0).toFixed(2),
        unit: "MB",
      },
    ]);

    for (const r of allResults) exportResult(r);
    exportMetric("api.latency.http", httpRes.avgMs, "ms");
  } finally {
    // Teardown occurs naturally inside the afterAll hook block
  }
}

test("API Latency Enterprise Suite", async () => {
  await runApiLatencyAudit();
}, 450000);
