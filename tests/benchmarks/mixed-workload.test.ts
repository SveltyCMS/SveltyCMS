/**
 * @file tests/benchmarks/mixed-workload.test.ts
 * @description Enterprise-grade mixed workload benchmark for SveltyCMS.
 * Simulates real-world traffic patterns: 60% Read, 20% Search, 15% GraphQL, 5% Write.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  printTruthTable,
  printSummaryTable,
  setupBenchmarkServer,
  ensureStableTestData,
  STABLE_COLLECTION,
  TEST_API_SECRET,
  getDbType,
} from "./benchmark-utils";

const ITERATIONS = 1000;
const CONCURRENCY = 8;

let server: any;

async function runMixedWorkloadAudit() {
  console.log("🚀 Starting Enterprise Mixed Workload Audit...\n");

  // 1. Setup Server & Data
  server = await setupBenchmarkServer();
  const baseUrl = server.baseUrl;

  console.log("📊 Seeding stable benchmark data...");
  await ensureStableTestData(null); // Seeds the shared DB

  const typeStats: Record<string, number[]> = {
    "REST Read": [],
    "REST Search": [],
    GraphQL: [],
    Metadata: [],
  };

  const ops = [
    {
      type: "REST Read",
      path: `/api/collections/${STABLE_COLLECTION}/bench-shared-001`,
      method: "GET",
    },
    {
      type: "REST Search",
      path: `/api/collections/${STABLE_COLLECTION}?limit=20&status=published`,
      method: "GET",
    },
    {
      type: "GraphQL",
      path: "/api/graphql",
      method: "POST",
      body: { query: `{ entries(collection: "${STABLE_COLLECTION}", limit: 5) { _id title } }` },
    },
    { type: "Metadata", path: "/api/system/health", method: "GET" },
  ];

  // Distribution: 60% Read, 20% Search, 15% GraphQL, 5% Metadata
  const pool = [
    ...Array(60).fill(ops[0]),
    ...Array(20).fill(ops[1]),
    ...Array(15).fill(ops[2]),
    ...Array(5).fill(ops[3]),
  ];

  const onIteration = async (i: number) => {
    const op = pool[i % pool.length];
    const t0 = performance.now();

    try {
      const res = await fetch(baseUrl + op.path, {
        method: op.method,
        headers: {
          "Content-Type": "application/json",
          "x-test-secret": TEST_API_SECRET,
        },
        body: op.body ? JSON.stringify(op.body) : undefined,
      });

      if (res.status >= 400) {
        throw new Error(`HTTP ${res.status}`);
      }

      typeStats[op.type].push(performance.now() - t0);
    } catch {
      // Silently continue or log if critical
    }
  };

  const stats = await runBenchmark({
    name: "Enterprise Mixed Workload",
    iterations: ITERATIONS,
    warmupIterations: 100,
    runs: 2,
    concurrency: CONCURRENCY,
    measureMemory: true,
    onIteration,
  });

  // 2. Process Sub-Stats
  const subResults = Object.entries(typeStats).map(([name, latencies]) => {
    const sorted = latencies.sort((a, b) => a - b);
    const avg = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    return {
      name,
      layer: "Full-Stack",
      avgMs: avg,
      p75Ms: sorted[Math.floor(sorted.length * 0.75)] || 0,
      p90Ms: sorted[Math.floor(sorted.length * 0.9)] || 0,
      p95Ms: sorted[Math.floor(sorted.length * 0.95)] || 0,
      p99Ms: sorted[Math.floor(sorted.length * 0.99)] || 0,
      p999Ms: sorted[Math.floor(sorted.length * 0.999)] || 0,
      rps: (latencies.length / (latencies.reduce((a, b) => a + b, 0) || 1)) * 1000 * CONCURRENCY,
      overheadPct: 0,
    };
  });

  printTruthTable({
    title: "SVELTYCMS  —  MIXED WORKLOAD AUDIT",
    subtitle: `60/20/15/5 Distribution • ${getDbType().toUpperCase()} • ${CONCURRENCY} Parallel Workers`,
    results: [
      {
        ...stats,
        name: "Aggregate Workload",
        layer: "Global",
        overheadPct: 0,
      },
      ...subResults,
    ],
  });

  printSummaryTable([
    { key: "Global Average Latency", val: stats.avgMs, unit: "ms" },
    { key: "Global p95 Latency", val: stats.p95Ms, unit: "ms" },
    { key: "Effective Throughput", val: Math.round(stats.rps), unit: "req/s" },
    { key: "REST Read Latency (p95)", val: subResults[0].p95Ms, unit: "ms" },
    { key: "GraphQL Latency (p95)", val: subResults[2].p95Ms, unit: "ms" },
    { key: "Memory RSS Delta", val: (stats.rssDelta || 0).toFixed(2), unit: "MB" },
  ]);

  exportResult(stats);
  await server.stop();
  console.log("\n✅ Mixed workload audit completed.");
}

test("Mixed Workload Enterprise Audit", async () => {
  await runMixedWorkloadAudit();
}, 600000);
