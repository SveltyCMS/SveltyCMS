/**
 * @file tests/benchmarks/relational-performance.test.ts
 * @description Enterprise relational benchmark for SveltyCMS.
 * Measures join latencies, virtual field resolution, and deep entity mapping.
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

export async function runRelationalBenchmark() {
  console.log("🚀 Starting Enterprise Relational Benchmark...\n");

  const { ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();

  await stabilize();

  const RUNS = 3;
  const ITERATIONS = 400;
  const WARMUP = 40;

  const queries = [
    {
      name: "GraphQL Introspection",
      query: "{ __schema { queryType { fields { name } } } }",
    },
    {
      name: "Relational: Shallow List",
      query: "query { system_users(limit: 5) { _id username } }",
    },
    {
      name: "Relational: Deep Join (Depth 2)",
      query:
        "query { system_users(limit: 5) { _id username audit_logs(limit: 2) { _id action } } }",
    },
  ];

  const concurrencyLevels = [1, 4];
  const allResults: any[] = [];

  logger.level = "silent";

  for (const q of queries) {
    for (const concurrency of concurrencyLevels) {
      const result = await runBenchmark({
        name: `${q.name} @ ${concurrency}c`,
        iterations: ITERATIONS,
        warmupIterations: WARMUP,
        runs: RUNS,
        concurrency,
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          const res = await mockDispatch({
            path: "/graphql",
            method: "POST",
            body: { query: q.query },
          });
          if (res.status !== 200) throw new Error(`GraphQL failed: ${res.status}`);
          await res.text();
        },
      });

      allResults.push(result);
    }
  }

  logger.level = "info";

  printAuditTable({
    title: "SVELTYCMS  —  RELATIONAL & GRAPHQL",
    subtitle: "Nested Resolvers • Virtual Fields • Scaling • 3 runs",
    results: allResults,
  });

  const base = allResults.find((r) => r.name.includes("Shallow List @ 1c")) || allResults[0];
  const deep =
    allResults.find((r) => r.name.includes("Deep Join (Depth 2) @ 4c")) ||
    allResults[allResults.length - 1];

  printSummaryTable([
    { key: "Base Query Latency", val: base.avgMs, unit: "ms" },
    { key: "Deep Join Latency", val: deep.avgMs, unit: "ms" },
    {
      key: "Max GraphQL Throughput",
      val: Math.max(...allResults.map((r) => r.rps)),
      unit: "req/s",
    },
    { key: "Resolver Memory Δ", val: (deep.rssDelta || 0).toFixed(2), unit: "MB" },
  ]);

  exportMetric("logic.relational.avg", deep.avgMs, "ms");
  exportMetric("logic.relational.rps", deep.rps, "req/s");

  for (const r of allResults) exportResult(r);

  console.log("\n✅ Relational GraphQL benchmark completed.");
}

test("Relational GraphQL Performance Suite", async () => {
  await runRelationalBenchmark();
}, 450000);
