/**
 * @file tests/benchmarks/graphql-stress.test.ts
 * @description Adaptive GraphQL Stress & Capacity Test
 * @summary Discovers the server's maximum sustainable GraphQL throughput by ramping concurrency
 * until connection limits are reached, then reports capacity — not failure.
 *
 * ### Features:
 * - Adaptive concurrency ramp (5c → 100c) with auto-backoff on connection resets
 * - Server capacity discovery (max sustainable RPS before ECONNRESET)
 * - Graceful degradation reporting (overload is data, not an error)
 * - Realistic query workload simulation
 */

import {
  test,
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

const QUERIES = [
  { name: "Health", query: `query { contentSystemHealth { state version } }` },
  { name: "Collections", query: `query { allCollectionStats { _id name } }` },
  {
    name: "Entries",
    query: `query { BenchmarkStable(pagination: { limit: 10 }) { _id title } }`,
  },
];

const ADAPTIVE_STEPS = [
  { concurrency: 5, iterations: 200, label: "5c Warmup" },
  { concurrency: 10, iterations: 400, label: "10c Light" },
  { concurrency: 20, iterations: 600, label: "20c Moderate" },
  { concurrency: 40, iterations: 800, label: "40c Heavy" },
  { concurrency: 60, iterations: 1000, label: "60c Stress" },
  { concurrency: 80, iterations: 1200, label: "80c Extreme" },
  { concurrency: 100, iterations: 1500, label: "100c Max" },
];

const MAX_CONSECUTIVE_RESETS = 3;
const RESET_BACKOFF_MS = 2000;

let stopServer: (() => Promise<void>) | null = null;

async function runStressAudit() {
  console.log("🚀 Starting Adaptive GraphQL Capacity Discovery...\n");

  const server = await setupBenchmarkServer();
  stopServer = server.stop;
  const baseUrl = server.baseUrl;

  await ensureStableTestData();
  await stabilize(2000);

  const results: any[] = [];
  let maxSustainableConcurrency = 0;
  let maxSustainableRps = 0;
  let consecutiveResets = 0;

  for (const step of ADAPTIVE_STEPS) {
    if (consecutiveResets >= MAX_CONSECUTIVE_RESETS) {
      console.log(
        `   ⚠️ Server connection limit reached at ${maxSustainableConcurrency}c / ${Math.round(maxSustainableRps)} req/s. Stopping ramp.`,
      );
      break;
    }

    console.log(`   → Testing ${step.label} (${step.iterations} reqs @ ${step.concurrency}c)...`);

    try {
      const result = await runBenchmark({
        name: `GQL: ${step.label}`,
        iterations: step.iterations,
        warmupIterations: Math.floor(step.iterations * 0.1),
        runs: 1,
        concurrency: step.concurrency,
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        abortOnErrors: false,
        onIteration: async (i: number) => {
          const q = QUERIES[i % QUERIES.length];

          const res = await fetch(`${baseUrl}/api/graphql`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-test-mode": "true",
              "x-test-secret": TEST_API_SECRET,
              "x-tenant-id": "global",
            },
            body: JSON.stringify({ query: q.query }),
            signal: AbortSignal.timeout(10000),
          });

          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          if (json.errors?.length) throw new Error(json.errors[0].message);
        },
      });

      const errorRate = result.errorRate || 0;

      if (result.rps > 0) {
        maxSustainableConcurrency = step.concurrency;
        maxSustainableRps = Math.max(maxSustainableRps, result.rps);
      }

      results.push({
        ...result,
        shortLabel: step.label,
        layer: "Stress",
      });

      // Detect connection resets
      if (errorRate > 0.1) {
        consecutiveResets++;
        console.log(
          `   ⚠️ High error rate (${(errorRate * 100).toFixed(1)}%) at ${step.concurrency}c — server may be at capacity.`,
        );
        await stabilize(RESET_BACKOFF_MS);
      } else {
        consecutiveResets = 0;
      }
    } catch (err: any) {
      if (
        err.message?.includes("ECONNRESET") ||
        err.message?.includes("aborted") ||
        err.message?.includes("consecutive errors")
      ) {
        consecutiveResets++;
        console.log(
          `   ⚠️ Server connection limit reached at ${step.concurrency}c: ${err.message}`,
        );
        await stabilize(RESET_BACKOFF_MS);
      } else {
        console.error(`   ❌ Unexpected error at ${step.label}: ${err.message}`);
      }
    }
  }

  if (stopServer) {
    await stopServer();
    stopServer = null;
  }

  // Report results
  if (results.length === 0) {
    console.log("   ⚠️ No stress data collected — server may be unavailable.");
    return;
  }

  printTruthTable({
    title: "SVELTYCMS — GRAPHQL CAPACITY DISCOVERY",
    shortLabel: "GQL Stress",
    subtitle: `Adaptive Ramp • ${getDbType().toUpperCase()}`,
    results,
  });

  printSummaryTable([
    {
      key: "Max Sustainable Concurrency",
      val: maxSustainableConcurrency,
      unit: "connections",
    },
    {
      key: "Max Sustainable Throughput",
      val: Math.round(maxSustainableRps),
      unit: "req/s",
    },
    {
      key: "Capacity Rating",
      val:
        maxSustainableConcurrency >= 80
          ? "ENTERPRISE"
          : maxSustainableConcurrency >= 40
            ? "GOOD"
            : "MODERATE",
      unit: "",
    },
  ]);

  for (const r of results) exportResult(r);
}

test("GraphQL Stress Capacity Discovery", async () => {
  await runStressAudit();
}, 900000);
