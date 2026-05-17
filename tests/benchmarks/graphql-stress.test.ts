/**
 * @file tests/benchmarks/graphql-stress.test.ts
 * @description Enterprise-grade GraphQL Stress & Load Test for SveltyCMS.
 * Real HTTP + realistic queries + high-concurrency profiles + HDR statistics.
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
} from "./benchmark-utils";
import "../unit/bun-preload.ts";

const LOAD_PROFILES = {
  TINY: { total: 2000, concurrency: 20, name: "Tiny (CI)", runs: 2 },
  MEDIUM: { total: 8000, concurrency: 50, name: "Medium (Workstation)", runs: 2 },
  LARGE: { total: 25000, concurrency: 100, name: "Large (Server)", runs: 2 },
} as const;

type LoadLevel = keyof typeof LOAD_PROFILES;

const QUERIES = [
  { name: "Health", query: `query { contentSystemHealth { state version } }` },
  { name: "Collections", query: `query { allCollectionStats { _id name } }` },
  { name: "Entries", query: `query { BenchmarkStable(pagination: { limit: 10 }) { _id title } }` },
];

let stopServer: (() => Promise<void>) | null = null;

async function runProfile(level: LoadLevel) {
  const config = LOAD_PROFILES[level];
  console.log(
    `🚀 GraphQL Stress Profile: ${config.name} (${config.total} reqs @ ${config.concurrency}c)`,
  );

  const server = await setupBenchmarkServer();
  stopServer = server.stop;
  const baseUrl = server.baseUrl;

  await ensureStableTestData();
  await stabilize(1500);

  const secret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";
  if (!secret) console.log("Using default secret");

  const result = await runBenchmark({
    name: `GQL Stress: ${level}`,
    iterations: config.total,
    warmupIterations: Math.floor(config.total * 0.1),
    runs: config.runs,
    concurrency: config.concurrency,
    trimOutliers: "iqr",
    measureMemory: true,
    silent: true,
    onIteration: async (i: number) => {
      const q = QUERIES[i % QUERIES.length];

      const res = await fetch(`${baseUrl}/api/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-mode": "true",
          "x-test-secret": TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026",
          "x-tenant-id": "global",
        },
        body: JSON.stringify({ query: q.query }),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.errors?.length) throw new Error(json.errors[0].message);
    },
  });

  printTruthTable({
    title: "SVELTYCMS — GRAPHQL STRESS AUDIT",
    shortLabel: "GQL Stress",
    subtitle: `${config.name} • ${config.concurrency}c • ${getDbType().toUpperCase()}`,
    results: [{ ...result, layer: "Stress" }],
  });

  printSummaryTable([
    { key: "Average Latency", val: result.avgMs, unit: "ms" },
    { key: "p95 Latency", val: result.p95Ms || result.avgMs, unit: "ms" },
    { key: "Peak Throughput", val: Math.round(result.rps || 0), unit: "req/s" },
    { key: "Memory Growth", val: (result.rssDelta || 0).toFixed(1), unit: "MB" },
  ]);

  exportResult(result);

  if (stopServer) await stopServer();
  stopServer = null;

  return result;
}

test("GraphQL Stress Audit (Enterprise)", async () => {
  const level = (process.env.LOAD_LEVEL as LoadLevel) || "TINY";
  await runProfile(level);
}, 900000);
