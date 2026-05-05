/**
 * @file tests/benchmarks/api-latency.test.ts
 * @description Enterprise API overhead benchmark for SveltyCMS.
 * Measures the precise cost of the middleware stack compared to direct SDK calls.
 */

import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
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
} from "./benchmark-utils";

let stopServer: () => Promise<void>;
let apiBaseUrl: string;

beforeAll(async () => {
  const { stop, baseUrl } = await setupBenchmarkServer();
  stopServer = stop;
  apiBaseUrl = baseUrl;

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  const db = getDb();
  if (!db) throw new Error("DB Initialization Failed");
  await ensureStableTestData(db);
}, 120000);

afterAll(async () => {
  if (stopServer) await stopServer();
});

export async function runApiLatencyAudit() {
  const { getDb } = await import("@src/databases/db");
  const { LocalCMS } = await import("@src/services/sdk");

  const db = getDb();
  if (!db) throw new Error("Database adapter not initialized for benchmark");
  const cms = new LocalCMS(db);

  await stabilize();

  console.log("\n🚀 Starting Enterprise API Latency Audit (E2E)...\n");

  const RUNS = 2;
  const ITERATIONS = 500;
  const allResults: any[] = [];

  try {
    // 1. SDK Baseline (Local CMS)
    console.log("   → Measuring SDK Baseline (findById)...");
    const sdkRes = await runBenchmark({
      name: "SDK: findById @ 1c",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: RUNS,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        await cms.collections.find(STABLE_COLLECTION as any, {
          _id: STABLE_ENTRY_ID,
          tenantId: "global",
        });
      },
    });
    allResults.push({ ...sdkRes, layer: "SDK" });

    // 2. HTTP E2E (Full Pipeline)
    console.log("   → Measuring HTTP E2E (findById)...");
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
      subtitle: "Local SDK vs Full HTTP Pipeline • IQR trimmed",
      results: allResults,
    });

    const overhead = Math.max(0, httpRes.avgMs - sdkRes.avgMs);

    printSummaryTable([
      { key: "SDK Latency (findById)", val: sdkRes.avgMs, unit: "ms" },
      { key: "HTTP Latency (findById)", val: httpRes.avgMs, unit: "ms" },
      { key: "Full Pipeline Overhead", val: overhead.toFixed(2), unit: "ms" },
      { key: "Peak Throughput", val: Math.round(httpRes.rps), unit: "req/s" },
      { key: "Memory RSS Δ", val: (httpRes.rssDelta || 0).toFixed(2), unit: "MB" },
    ]);

    for (const r of allResults) exportResult(r);
    exportMetric("api.latency.sdk", sdkRes.avgMs, "ms");
    exportMetric("api.latency.http", httpRes.avgMs, "ms");
  } finally {
  }

  console.log("\n✅ API latency audit completed.");
}

test("API Latency Enterprise Suite", async () => {
  await runApiLatencyAudit();
}, 450000);
