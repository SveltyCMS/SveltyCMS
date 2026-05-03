/**
 * @file tests/benchmarks/truth-latency.test.ts
 * @description The "Truth Benchmark" suite for SveltyCMS.
 * Validates performance claims by comparing SDK, Middleware, and Real HTTP Stack.
 */

import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  runStochasticLoadTest,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  exportResult,
  exportMetric,
  STABLE_COLLECTION,
  STABLE_ENTRY_ID,
  ensureStableTestData,
} from "./benchmark-utils";

let stopServer: () => Promise<void>;
let apiBaseUrl: string;

beforeAll(async () => {
  const { stop, baseUrl } = await setupBenchmarkServer();
  stopServer = stop;
  apiBaseUrl = baseUrl;

  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();
  await ensureFullInitialization();
  const db = getDb();
  await ensureStableTestData(db!);
});

afterAll(async () => {
  if (stopServer) await stopServer();
});

test("Enterprise Truth Audit: SRE Connectivity Model", async () => {
  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  const { LocalCMS } = await import("@src/services/local-cms");

  await ensureFullInitialization();
  const db = getDb();
  const cms = new LocalCMS(db!);
  const secret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";

  const ITERATIONS = 300;
  const allResults: any[] = [];

  console.log(`\n🕵️  Executing SRE Truth Audit for "${STABLE_COLLECTION}"...\n`);

  try {
    // 1. Logic Baseline (Harness Overhead)
    const logicRes = await runBenchmark({
      name: "Logic Baseline",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: 1,
      silent: true,
      onIteration: async () => {
        // Just return void
      },
    });
    allResults.push({ ...logicRes, layer: "Logic", proves: "JS Harness Overhead" });

    // 2. SDK Layer (Local API - DB + Widgets)
    const sdkRes = await runBenchmark({
      name: "Local SDK (Full)",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: 1,
      silent: true,
      measureMemory: true,
      onIteration: async () => {
        await cms.collections.find(STABLE_COLLECTION as any, {
          _id: STABLE_ENTRY_ID,
          tenantId: "global",
        });
      },
    });
    allResults.push({ ...sdkRes, layer: "SDK", proves: "DB + Widget Engine" });

    // 3. HTTP Layer (Full Middleware + Network)
    const httpRes = await runBenchmark({
      name: "HTTP End-to-End",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: 1,
      silent: true,
      measureMemory: true,
      onIteration: async () => {
        const res = await fetch(
          `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
          {
            headers: {
              "x-test-mode": "true",
              "x-test-secret": secret,
            },
          },
        );
        if (!res.ok) throw new Error(`HTTP Truth failed: ${res.status}`);
        await res.json();
      },
    });
    allResults.push({ ...httpRes, layer: "HTTP", proves: "Full Production Stack" });

    printTruthTable({
      title: "SVELTYCMS — SRE TRUTH AUDIT",
      subtitle: "3-Layer Production Reality Model",
      results: allResults,
    });

    printSummaryTable([
      { key: "Baseline Harness Overhead", val: allResults[0].avgMs, unit: "ms" },
      { key: "SDK Engine Latency", val: allResults[1].avgMs, unit: "ms" },
      { key: "E2E HTTP Latency", val: allResults[2].avgMs, unit: "ms" },
      { key: "Peak HTTP Throughput", val: Math.round(allResults[2].rps), unit: "req/s" },
    ]);

    // 🚀 STOCHASTIC LOAD TEST
    console.log("\n🔥 Ramping Stochastic Load Test (SLA Verification)...");
    const loadTestRes = await runStochasticLoadTest({
      name: "Truth Simulation",
      stages: [
        { duration: 2, target: 10 },
        { duration: 3, target: 30 },
        { duration: 2, target: 10 },
      ],
      thresholds: {
        p95: "< 150.0",
        error_rate: "< 0.05",
      },
      onIteration: async () => {
        const r = await fetch(
          `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
          {
            headers: { "x-test-mode": "true", "x-test-secret": secret },
          },
        );
        if (!r.ok) throw new Error("Load failure");
        await r.json();
      },
    });

    if (!loadTestRes.passedSLA) {
      console.error("\n❌ SLA VIOLATION in Truth Load Test:");
      loadTestRes.violations?.forEach((v: string) => console.error(`   - ${v}`));
      process.exit(1);
    }

    exportMetric("truth.http.p95", httpRes.p95Ms, "ms");
    exportMetric("truth.sdk.avg", sdkRes.avgMs, "ms");

    for (const r of allResults) exportResult(r);
  } finally {
  }

  console.log("\n✅ Truth latency audit completed.");
}, 600000);
