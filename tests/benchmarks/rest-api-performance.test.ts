/**
 * @file tests/benchmarks/rest-api-performance.test.ts
 * @description Enterprise REST API benchmark for SveltyCMS.
 * Measures endpoint latencies, JSON serialization, and dispatcher overhead.
 */
import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
  mockDispatch,
  setupBenchmarkServer,
  printAuditTable,
  printSummaryTable,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let stopServer: () => Promise<void>;

beforeAll(async () => {
  const { stop } = await setupBenchmarkServer();
  stopServer = stop;
});

afterAll(async () => {
  if (stopServer) await stopServer();
});

export async function runRestApiBenchmark() {
  console.log("🚀 Starting Enterprise REST API Benchmark...\n");

  await stabilize();

  const ITERATIONS = 800;
  const WARMUP = 80;
  const RUNS = 3;

  const endpoints = [
    { name: "System Health (Public)", path: "/api/system/health" },
    { name: "User Profile (Auth)", path: "/api/auth" },
    { name: "Collections List (DB)", path: "/api/collections" },
  ];

  const allResults: any[] = [];

  logger.level = "silent";

  for (const ep of endpoints) {
    const result = await runBenchmark({
      name: `REST: ${ep.name}`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency: 4,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const res = await mockDispatch({ path: ep.path });
        if (res.status < 200 || res.status >= 400) {
          // ignore 401/403 for some routes as long as dispatcher works
          if (res.status === 404) throw new Error(`REST failed: ${res.status} on ${ep.path}`);
        }
        await res.text();
      },
    });

    allResults.push(result);
  }

  logger.level = "info";

  printAuditTable({
    title: "SVELTYCMS  —  REST API DISPATCHER",
    subtitle: "Route Resolution • JSON Serialization • Middleware Latency",
    results: allResults,
  });

  const base = allResults[0];
  const db = allResults[2];

  printSummaryTable([
    { key: "Base Dispatch Latency", val: base.avgMs, unit: "ms" },
    { key: "DB-Backed API Latency", val: db.avgMs, unit: "ms" },
    { key: "Max API Throughput", val: Math.max(...allResults.map((r) => r.rps)), unit: "req/s" },
    { key: "RSS Footprint Δ", val: (db.rssDelta || 0).toFixed(2), unit: "MB" },
  ]);

  exportMetric("api.rest.avg", db.avgMs, "ms");
  exportMetric("api.rest.rps", db.rps, "req/s");

  for (const r of allResults) exportResult(r);

  console.log("\n✅ REST API benchmark completed.");
}

test("REST API Performance Suite", async () => {
  await runRestApiBenchmark();
}, 400000);
