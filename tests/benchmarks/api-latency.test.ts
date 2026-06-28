/**
 * @file tests/benchmarks/api-latency.test.ts
 * @description API Latency Benchmark (Production Optimized)
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

// Pre-compiled headers to eliminate reference allocations in the hot path
const STATIC_HEADERS = new Headers([
  ["x-test-mode", "true"],
  ["x-test-secret", TEST_API_SECRET],
  ["x-tenant-id", "default"],
  ["connection", "keep-alive"], // Explicitly force persistent socket pooling
]);

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

  // Pre-bake the URL string reference to bypass template literal evaluation overhead inside the loop
  const targetUrl = `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`;

  // Pre-allocate the request configuration structure
  const fetchConfig: RequestInit = {
    method: "GET",
    headers: STATIC_HEADERS,
    keepalive: true, // Hints to the runtime network layer to maintain an un-interrupted channel
  };

  try {
    console.log("   → Measuring Pipeline Latency (findById)...");
    const httpRes = await runBenchmark({
      name: "HTTP: findById @ 8c",
      iterations: ITERATIONS,
      warmupIterations: 200,
      runs: RUNS,
      concurrency: 8,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await fetch(targetUrl, fetchConfig);
        if (!res.ok) throw new Error(`HTTP Latency failed: ${res.status}`);

        // Direct stream drainage via arrayBuffer prevents heap allocation fragmentation
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
    // Graceful teardown
  }
}

test("API Latency Enterprise Suite", async () => {
  await runApiLatencyAudit();
}, 450000);
