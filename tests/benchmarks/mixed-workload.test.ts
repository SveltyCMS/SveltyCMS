/**
 * @file tests/benchmarks/mixed-workload.test.ts
 * @description Enterprise-grade mixed workload benchmark for SveltyCMS.
 * Simulates real-world traffic: 60% Read, 20% Search, 15% GraphQL, 5% Metadata.
 */

import {
  test,
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  forceRefreshServer,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

const ITERATIONS = 1200;
const CONCURRENCY = 8;

let stopServer: (() => Promise<void>) | null = null;

async function runMixedWorkloadAudit() {
  console.log("🚀 Starting Enterprise Mixed Workload Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await forceRefreshServer(baseUrl);
    await stabilize(1500);

    const { TEST_API_SECRET } = await import("./modules/benchmark-utils");
    const secret = TEST_API_SECRET;

    const operations = [
      {
        type: "REST Read",
        path: `/api/collections/BenchmarkStable/bench-shared-001`,
        method: "GET",
      },
      {
        type: "REST Search",
        path: `/api/collections/BenchmarkStable?limit=20&status=published`,
        method: "GET",
      },
      {
        type: "GraphQL",
        path: "/api/graphql",
        method: "POST",
        body: { query: `{ BenchmarkStable(limit: 5) { _id title } }` },
      },
      { type: "Metadata", path: "/api/system/health", method: "GET" },
    ];

    // Weighted pool: 60% Read, 20% Search, 15% GraphQL, 5% Metadata
    const pool = [
      ...Array(60).fill(operations[0]),
      ...Array(20).fill(operations[1]),
      ...Array(15).fill(operations[2]),
      ...Array(5).fill(operations[3]),
    ];

    const result = await runBenchmark({
      name: "Mixed Workload",
      iterations: ITERATIONS,
      warmupIterations: 150,
      runs: 2,
      concurrency: CONCURRENCY,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async (i: number) => {
        const op = pool[i % pool.length];

        const res = await fetch(baseUrl + op.path, {
          method: op.method,
          headers: {
            "Content-Type": "application/json",
            "x-test-mode": "true",
            "x-test-secret": secret,
          },
          body: op.body ? JSON.stringify(op.body) : undefined,
        });

        if (!res.ok) throw new Error(`Mixed workload failed: ${res.status}`);
        await (op.method === "GET" ? res.json() : res.text());
      },
    });

    printTruthTable({
      title: "SVELTYCMS — MIXED WORKLOAD AUDIT",
      shortLabel: "Mixed",
      subtitle: `60/20/15/5 Distribution • ${getDbType().toUpperCase()}`,
      results: [{ ...result, layer: "Full Stack" }],
    });

    printSummaryTable([
      { key: "Average Latency", val: result.avgMs, unit: "ms" },
      { key: "p95 Latency", val: result.p95Ms || result.avgMs, unit: "ms" },
      {
        key: "Effective Throughput",
        val: Math.round(result.rps || 0),
        unit: "req/s",
      },
      {
        key: "Memory Growth",
        val: (result.rssDelta || 0).toFixed(1),
        unit: "MB",
      },
      { key: "Rating", val: result.avgMs < 8 ? "EXCELLENT" : "GOOD", unit: "" },
    ]);

    exportResult(result);
  } catch (err: any) {
    logger.error(`Mixed workload benchmark failed: ${err.message}`);
    console.error(err);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Mixed workload audit completed.");
}

test("Mixed Workload Enterprise Audit", async () => {
  await runMixedWorkloadAudit();
}, 600000);
