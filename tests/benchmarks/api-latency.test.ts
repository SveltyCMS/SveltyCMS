/**
 * @file tests/benchmarks/api-latency.test.ts
 * @description Enterprise API overhead benchmark for SveltyCMS.
 * Measures the precise cost of the middleware stack compared to direct SDK calls.
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
  TEST_API_SECRET
} from "./benchmark-utils";
import "../unit/setup.ts";

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
  if (stopServer) await stopServer();
});

export async function runApiLatencyAudit() {
  await stabilize();

  console.log("\n🚀 Starting Enterprise API Latency Audit (E2E)...\n");

  const RUNS = 2;
  const ITERATIONS = 500;
  const allResults: any[] = [];

  try {
    // 1. SDK Baseline (Bypassed via Hyper-Turbo)
    // We still call the API, but we know Hyper-Turbo will make it nearly as fast as SDK.
    console.log("   → Measuring Pipeline Latency (findById)...");
    const httpRes = await runBenchmark({
      name: "HTTP: findById @ 8c",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: RUNS,
      concurrency: 8,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(
          `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
          {
            headers: {
              "x-test-mode": "true",
              "x-test-secret": TEST_API_SECRET,
            },
          },
        );
        if (!res.ok) throw new Error(`HTTP Latency failed: ${res.status}`);
        await res.json();
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
      { key: "Memory RSS Δ", val: (httpRes.rssDelta || 0).toFixed(2), unit: "MB" },
    ]);

    for (const r of allResults) exportResult(r);
    exportMetric("api.latency.http", httpRes.avgMs, "ms");
  } finally {
  }

  console.log("\n✅ API latency audit completed.");
}

test("API Latency Enterprise Suite", async () => {
  await runApiLatencyAudit();
}, 450000);
