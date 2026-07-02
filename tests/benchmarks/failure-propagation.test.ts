/**
 * @file tests/benchmarks/failure-propagation.test.ts
 * @description Failure Propagation & Fast-Fail Audit (Optimized)
 * @summary Measures the system's ability to reject invalid requests quickly with minimal resource waste.
 *
 * ### Features:
 * - Invalid request rejection latency
 * - Fast-fail path efficiency measurement
 * - Error propagation boundary verification
 * - Resource waste minimization analysis
 */

import {
  test,
  beforeAll,
  afterAll,
  runBenchmark,
  exportResult,
  stabilize,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

let stopServer: () => Promise<void>;
let apiBaseUrl: string;

beforeAll(async () => {
  const { stop, baseUrl } = await setupBenchmarkServer();
  stopServer = stop;
  apiBaseUrl = baseUrl;
}, 120000);

afterAll(async () => {
  if (stopServer) await stopServer().catch(() => {});
});

export async function runFailurePropagationAudit() {
  await stabilize();

  console.log("\n🚀 Starting World Life Data: Failure Propagation Audit...\n");

  const ITERATIONS = 200;
  const RUNS = 1;
  const allResults: any[] = [];

  // Canonical lowercase header structures
  const baseHeaders = {
    "x-test-mode": "true",
    "x-test-secret": TEST_API_SECRET,
    "content-type": "application/json",
  };

  const invalidAuthHeaders = {
    ...baseHeaders,
    "x-test-secret": "WRONG_SECRET",
  };

  // 1. Baseline: Valid Health Check
  console.log("    → Measuring Baseline (Valid Health Check)...");
  const validRes = await runBenchmark({
    name: "Success: Health Check @ 4c",
    iterations: ITERATIONS,
    warmupIterations: 20,
    runs: RUNS,
    concurrency: 4,
    silent: true,
    onIteration: async () => {
      const res = await fetch(`${apiBaseUrl}/api/system/health`, {
        method: "GET",
        headers: baseHeaders,
      });
      if (!res.ok) throw new Error("Health check failed");
      await res.arrayBuffer(); // Low-level socket flush prevents V8 allocation drift
    },
  });
  allResults.push(validRes);

  // 2. Failure Path: Invalid Auth Secret (Early Gateway/Middleware Intercept)
  console.log("    → Measuring Failure Path (Invalid Auth Secret)...");
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
        method: "GET",
        headers: invalidAuthHeaders, // Using hoisted reference to insulate timing loops from allocations
      });
      if (res.ok) throw new Error("Request should have failed early via auth gate");

      // Clear socket buffers directly out of rejection paths to protect connection boundaries
      await res.arrayBuffer().catch(() => {});
    },
  });
  allResults.push(failAuthRes);

  // 3. Failure Path: Invalid Collection (Deeper Application Core Resolution Fallback)
  console.log("    → Measuring Failure Path (Invalid Collection)...");
  const failDataRes = await runBenchmark({
    name: "Failure: 404 Collection @ 4c",
    iterations: ITERATIONS,
    warmupIterations: 20,
    runs: RUNS,
    concurrency: 4,
    silent: true,
    abortOnErrors: false,
    onIteration: async () => {
      const res = await fetch(`${apiBaseUrl}/api/collections/NON_EXISTENT_COLLECTION`, {
        method: "GET",
        headers: baseHeaders,
      });
      if (res.ok) throw new Error("Request should have failed with a 404 handler exception");
      await res.arrayBuffer().catch(() => {});
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
    { key: "Auth Failure Latency (Avg)", val: failAuthRes.avgMs, unit: "ms" },
    { key: "404 Failure Latency (Avg)", val: failDataRes.avgMs, unit: "ms" },
    {
      key: "Fast-Fail Efficiency",
      val: (validRes.avgMs / (failAuthRes.avgMs || 1)).toFixed(2),
      unit: "x",
    },
  ]);

  for (const r of allResults) exportResult(r);
}

test("Failure Propagation World Life Suite", async () => {
  await runFailurePropagationAudit();
}, 450000);
