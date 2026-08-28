/**
 * @file tests/benchmarks/mixed-workload.test.ts
 * @description Mixed Workload Benchmark (Optimized)
 * @summary Simulates real-world traffic with a weighted mix of reads, searches, GraphQL queries, and metadata requests with per-operation telemetry.
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  ensureStableTestData,
  forceRefreshServer,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

const ITERATIONS = 1200;
const CONCURRENCY = 8;

let stopServer: (() => Promise<void>) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

interface OperationStat {
  count: number;
  totalMs: number;
  latencies: number[];
}

async function runMixedWorkloadAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Enterprise Mixed Workload Audit (${CONCURRENCY}c • ${dbType})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await forceRefreshServer(baseUrl);
    await stabilize(1000);

    const baseHeaders: Record<string, string> = {
      "content-type": "application/json",
      ...benchmarkAuthHeaders(),
      connection: "keep-alive",
    };

    // Pre-allocated operations with pre-serialized GraphQL bodies
    const operations = [
      {
        type: "REST Read",
        cumulativeWeight: 60,
        url: `${baseUrl}/api/collections/BenchmarkStable/20000000-0000-4000-8000-000000000001`,
        method: "GET",
        body: undefined,
      },
      {
        type: "REST Search",
        cumulativeWeight: 80,
        url: `${baseUrl}/api/collections/BenchmarkStable?limit=20&status=published`,
        method: "GET",
        body: undefined,
      },
      {
        type: "GraphQL",
        cumulativeWeight: 95,
        url: `${baseUrl}/api/graphql`,
        method: "POST",
        body: JSON.stringify({ query: "{ BenchmarkStable(limit: 5) { _id title } }" }),
      },
      {
        type: "Metadata",
        cumulativeWeight: 100,
        url: `${baseUrl}/api/system/health`,
        method: "GET",
        body: undefined,
      },
    ];

    // Per-operation latency tracking buffers
    const opStats: Record<string, OperationStat> = {
      "REST Read": { count: 0, totalMs: 0, latencies: [] },
      "REST Search": { count: 0, totalMs: 0, latencies: [] },
      GraphQL: { count: 0, totalMs: 0, latencies: [] },
      Metadata: { count: 0, totalMs: 0, latencies: [] },
    };

    function selectOperation() {
      const roll = Math.random() * 100;
      for (let i = 0; i < operations.length; i++) {
        if (roll <= operations[i]!.cumulativeWeight) return operations[i]!;
      }
      return operations[0]!;
    }

    forceGarbageCollection();
    await stabilize(200);

    console.log(
      `   → Running ${ITERATIONS} mixed requests (60% Read / 20% Search / 15% GQL / 5% Health)...`,
    );

    const result = await runBenchmark({
      name: "Mixed Workload",
      iterations: ITERATIONS,
      warmupIterations: 150,
      runs: 2,
      concurrency: CONCURRENCY,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        const op = selectOperation();
        const tStart = performance.now();

        const res = await fetch(op.url, {
          method: op.method,
          headers: baseHeaders,
          body: op.body,
          signal: AbortSignal.timeout(10_000),
        });

        if (!res.ok) throw new Error(`Mixed workload failed [${op.type}]: HTTP ${res.status}`);

        // Zero-allocation response drain
        await res.arrayBuffer().catch(() => {});
        const elapsed = performance.now() - tStart;

        const stat = opStats[op.type]!;
        stat.count++;
        stat.totalMs += elapsed;
        if (stat.latencies.length < 2000) {
          stat.latencies.push(elapsed);
        }
      },
    });

    // ── PER-OPERATION STATISTICAL AGGREGATION ────────────────────────────────
    const subResults = Object.entries(opStats).map(([type, stat]) => {
      stat.latencies.sort((a, b) => a - b);
      const avg = stat.count > 0 ? stat.totalMs / stat.count : 0;
      const p95 =
        stat.latencies.length > 0
          ? (stat.latencies[Math.floor(stat.latencies.length * 0.95)] ?? avg)
          : 0;

      return {
        name: `Mix: ${type}`,
        avgMs: avg,
        p95Ms: p95,
        rps: stat.count / ((result.totalMs || 1) / 1000),
        layer: type,
        shortLabel: type,
      };
    });

    // ── REPORTING & TELEMETRY ───────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — MIXED WORKLOAD AUDIT",
      shortLabel: "Mixed",
      subtitle: `60/20/15/5 Distribution • ${CONCURRENCY}c • ${dbType}`,
      results: [{ ...result, layer: "Full Stack", shortLabel: "Aggregate" }, ...subResults],
    });

    const readStat = subResults.find((r) => r.shortLabel === "REST Read");
    const searchStat = subResults.find((r) => r.shortLabel === "REST Search");
    const gqlStat = subResults.find((r) => r.shortLabel === "GraphQL");
    const metaStat = subResults.find((r) => r.shortLabel === "Metadata");

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Aggregate Latency (Avg)", val: result.avgMs.toFixed(2), unit: "ms" },
        {
          key: "Aggregate Latency (p95)",
          val: (result.p95Ms || result.avgMs).toFixed(2),
          unit: "ms",
        },
        { key: "Total Throughput", val: Math.round(result.rps || 0), unit: "req/s" },
        { key: "REST Read (60%) Avg", val: readStat?.avgMs.toFixed(2) ?? "0", unit: "ms" },
        { key: "REST Search (20%) Avg", val: searchStat?.avgMs.toFixed(2) ?? "0", unit: "ms" },
        { key: "GraphQL (15%) Avg", val: gqlStat?.avgMs.toFixed(2) ?? "0", unit: "ms" },
        { key: "Metadata (5%) Avg", val: metaStat?.avgMs.toFixed(2) ?? "0", unit: "ms" },
        { key: "Memory RSS Δ", val: (result.rssDelta || 0).toFixed(1), unit: "MB" },
        {
          key: "Service SLA",
          val: result.avgMs < 8 ? "ELITE (<8ms)" : result.avgMs < 15 ? "GOOD" : "SLOW",
          unit: "",
        },
      ],
      "Mixed Workload Summary",
    );

    exportMetric("mixed.throughput_rps", Math.round(result.rps || 0), "req/s");
    exportMetric("mixed.latency_avg_ms", result.avgMs, "ms");
    exportMetric("mixed.latency_p95_ms", result.p95Ms || result.avgMs, "ms");
    if (readStat) exportMetric("mixed.read_avg_ms", readStat.avgMs, "ms");
    if (searchStat) exportMetric("mixed.search_avg_ms", searchStat.avgMs, "ms");
    if (gqlStat) exportMetric("mixed.graphql_avg_ms", gqlStat.avgMs, "ms");

    exportResult(result);
  } catch (err: any) {
    logger.error(`Mixed workload benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Mixed Workload Enterprise Audit", async () => {
  await runMixedWorkloadAudit();
}, 600_000);
