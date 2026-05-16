/**
 * @file tests/benchmarks/failure-propagation.test.ts
 * @description World Life Data: Failure Propagation & Fast-Fail Audit.
 * Measures the system's ability to reject invalid requests quickly (Fail-Fast).
 */

import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  stabilize,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  TEST_API_SECRET,
} from "./benchmark-utils";

let stopServer: () => Promise<void>;
let apiBaseUrl: string;

beforeAll(async () => {
  const { stop, baseUrl } = await setupBenchmarkServer();
  stopServer = stop;
  apiBaseUrl = baseUrl;
}, 120000);

afterAll(async () => {
  if (stopServer) await stopServer();
});

export async function runFailurePropagationAudit() {
  await stabilize();

  console.log("\n🚀 Starting World Life Data: Failure Propagation Audit...\n");

  const ITERATIONS = 200;
  const RUNS = 1;
  const allResults: any[] = [];

  const headers = {
    "x-test-mode": "true",
    "x-test-secret": TEST_API_SECRET,
    "Content-Type": "application/json",
  };

  // 1. Baseline: Valid Health Check
  console.log("   → Measuring Baseline (Valid Health Check)...");
  const validRes = await runBenchmark({
    name: "Success: Health Check @ 4c",
    iterations: ITERATIONS,
    warmupIterations: 20,
    runs: RUNS,
    concurrency: 4,
    silent: true,
    onIteration: async () => {
      const res = await fetch(`${apiBaseUrl}/api/system/health`, { headers });
      if (!res.ok) throw new Error("Health check failed");
      await res.json();
    },
  });
  allResults.push(validRes);

  // 2. Failure Path: Invalid Auth Secret (Triggers early middleware rejection)
  console.log("   → Measuring Failure Path (Invalid Auth Secret)...");
  const failAuthRes = await runBenchmark({
    name: "Failure: Invalid Auth @ 4c",
    iterations: ITERATIONS,
    warmupIterations: 20,
    runs: RUNS,
    concurrency: 4,
    silent: true,
    abortOnErrors: false,
    onIteration: async () => {
      const res = await fetch(`${apiBaseUrl}/api/user`, {
        headers: { ...headers, "x-test-secret": "WRONG_SECRET" },
      });
      if (res.ok) throw new Error("Request should have failed");
      // DO NOT THROW HERE - we want to return the result of the benchmark measurement
      // runBenchmark handles the timing. We just need to ensure the iteration logic
      // doesn't bubble an error to the test runner.
    },
  });
  allResults.push(failAuthRes);

  // 3. Failure Path: Invalid Collection (Triggers deeper logic failure)
  console.log("   → Measuring Failure Path (Invalid Collection)...");
  const failDataRes = await runBenchmark({
    name: "Failure: 404 Collection @ 4c",
    iterations: ITERATIONS,
    warmupIterations: 20,
    runs: RUNS,
    concurrency: 4,
    silent: true,
    abortOnErrors: false,
    onIteration: async () => {
      const res = await fetch(`${apiBaseUrl}/api/collections/NON_EXISTENT_COLLECTION`, { headers });
      if (res.ok) throw new Error("Request should have failed");
    },
  });
  allResults.push(failDataRes);

  printTruthTable({
    title: "SVELTYCMS  —  FAILURE PROPAGATION AUDIT",
    subtitle: "Success Latency vs Fast-Fail Latency • Error Path Analysis",
    results: allResults,
  });

  printSummaryTable([
    { key: "Success Latency (Avg)", val: validRes.avgMs, unit: "ms" },
    { key: "Auth Failure Latency (Avg)", val: failAuthRes.failAvgMs || 0, unit: "ms" },
    { key: "404 Failure Latency (Avg)", val: failDataRes.failAvgMs || 0, unit: "ms" },
    {
      key: "Fast-Fail Efficiency",
      val: (validRes.avgMs / (failAuthRes.failAvgMs || 1)).toFixed(2),
      unit: "x",
    },
  ]);

  for (const r of allResults) exportResult(r);

  console.log("\n✅ Failure propagation audit completed.");
}

test("Failure Propagation World Life Suite", async () => {
  await runFailurePropagationAudit();
}, 450000);
