/**
 * @file tests/benchmarks/production-day.test.ts
 * @description Production Day Composite Workload Benchmark (Optimized)
 * @summary Simulates a realistic multi-user workload with a weighted mix of read, list, update, media, and GraphQL operations with per-tier latency telemetry.
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  ensureStableTestData,
  STABLE_COLLECTION,
  STABLE_ENTRY_ID,
  benchmarkAuthHeaders,
  generateRealisticEntry,
  printTruthTable,
  printSummaryTable,
  getDbLabel,
  stabilize,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

const ITERATIONS = 600;
const WARMUP_ITERATIONS = 80;
const CONCURRENCY = 8;

let stopServer: (() => Promise<void>) | null = null;
let apiBaseUrl: string;

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

async function runProductionDayAudit() {
  console.log(`\n🚀 Starting "Production Day in the Life" Composite Audit (${getDbLabel()})...\n`);

  const { stop, baseUrl } = await setupBenchmarkServer();
  stopServer = stop;
  apiBaseUrl = baseUrl;

  try {
    await ensureStableTestData();
    await stabilize(1000);

    const baseHeaders: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
      "x-tenant-id": "global",
      connection: "keep-alive",
    };

    // Pre-allocated static endpoint URLs
    const listUrl = `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}?limit=10`;
    const entryUrl = `${apiBaseUrl}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`;
    const mediaUrl = `${apiBaseUrl}/api/media`;
    const graphqlUrl = `${apiBaseUrl}/api/graphql`;

    const gqlQueryString = JSON.stringify({
      query: `query { entries(collection: "${STABLE_COLLECTION}", limit: 5) { _id title } }`,
    });

    // Pre-generate oversized cyclic payload pools to prevent allocations in hot loops
    const totalCapacity = (ITERATIONS + WARMUP_ITERATIONS) * 2;
    const pregeneratedUpdates = Array.from({ length: totalCapacity }, (_, i) =>
      JSON.stringify(generateRealisticEntry(i, "medium")),
    );

    // Cumulative probability thresholds for O(1) operation dispatch
    const scenarios = [
      { type: "READ_LIST", cumulativeWeight: 40, label: "40% List" },
      { type: "READ_ENTRY", cumulativeWeight: 60, label: "20% View" },
      { type: "UPDATE", cumulativeWeight: 85, label: "25% Patch" },
      { type: "MEDIA", cumulativeWeight: 95, label: "10% Media" },
      { type: "GQL", cumulativeWeight: 100, label: "5% GraphQL" },
    ];

    const opStats: Record<string, OperationStat> = {
      READ_LIST: { count: 0, totalMs: 0, latencies: [] },
      READ_ENTRY: { count: 0, totalMs: 0, latencies: [] },
      UPDATE: { count: 0, totalMs: 0, latencies: [] },
      MEDIA: { count: 0, totalMs: 0, latencies: [] },
      GQL: { count: 0, totalMs: 0, latencies: [] },
    };

    function selectScenario() {
      const roll = Math.random() * 100;
      for (let i = 0; i < scenarios.length; i++) {
        if (roll <= scenarios[i]!.cumulativeWeight) return scenarios[i]!;
      }
      return scenarios[0]!;
    }

    forceGarbageCollection();
    await stabilize(200);

    console.log(
      `   → Running ${ITERATIONS} composite multi-user requests @ ${CONCURRENCY}c concurrency...`,
    );
    let updateCursor = 0;

    const result = await runBenchmark({
      name: "Production Day Composite",
      iterations: ITERATIONS,
      warmupIterations: WARMUP_ITERATIONS,
      runs: 2,
      concurrency: CONCURRENCY,
      thinkTimeMs: [20, 80],
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async (i: number) => {
        const selected = selectScenario();
        const tStart = performance.now();

        // Worker-safe thread headers with per-request tracing ID
        const headers = {
          ...baseHeaders,
          "x-request-id": `day-${i}-${selected.type}`,
        };

        switch (selected.type) {
          case "READ_LIST": {
            const res = await fetch(listUrl, {
              method: "GET",
              headers,
              signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) throw new Error(`List failed: HTTP ${res.status}`);
            await res.arrayBuffer().catch(() => {});
            break;
          }

          case "READ_ENTRY": {
            const res = await fetch(entryUrl, {
              method: "GET",
              headers,
              signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) throw new Error(`View failed: HTTP ${res.status}`);
            await res.arrayBuffer().catch(() => {});
            break;
          }

          case "UPDATE": {
            const bodyPayload = pregeneratedUpdates[updateCursor++ % pregeneratedUpdates.length]!;
            const res = await fetch(entryUrl, {
              method: "PATCH",
              headers,
              body: bodyPayload,
              signal: AbortSignal.timeout(15_000),
            });
            if (!res.ok) {
              const errText = await res.text().catch(() => "");
              throw new Error(`Update failed: HTTP ${res.status} - ${errText}`);
            }
            await res.arrayBuffer().catch(() => {});
            break;
          }

          case "MEDIA": {
            const res = await fetch(mediaUrl, {
              method: "GET",
              headers,
              signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) throw new Error(`Media list failed: HTTP ${res.status}`);
            await res.arrayBuffer().catch(() => {});
            break;
          }

          case "GQL": {
            const res = await fetch(graphqlUrl, {
              method: "POST",
              headers,
              body: gqlQueryString,
              signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) throw new Error(`GraphQL failed: HTTP ${res.status}`);
            await res.arrayBuffer().catch(() => {});
            break;
          }
        }

        const elapsed = performance.now() - tStart;
        const stat = opStats[selected.type]!;
        stat.count++;
        stat.totalMs += elapsed;
        if (stat.latencies.length < 2000) {
          stat.latencies.push(elapsed);
        }
      },
    });

    // ── SUB-OPERATION STATISTICAL EVALUATION ─────────────────────────────────
    const subResults = Object.entries(opStats).map(([type, stat]) => {
      stat.latencies.sort((a, b) => a - b);
      const avg = stat.count > 0 ? stat.totalMs / stat.count : 0;
      const p95 =
        stat.latencies.length > 0
          ? (stat.latencies[Math.floor(stat.latencies.length * 0.95)] ?? avg)
          : 0;

      return {
        name: `Day: ${type}`,
        avgMs: avg,
        p95Ms: p95,
        rps: stat.count / ((result.totalMs || 1) / 1000),
        layer: type,
        shortLabel: type,
      };
    });

    // ── REPORTING & TELEMETRY ───────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — PRODUCTION DAY AUDIT",
      shortLabel: "Day Audit",
      subtitle: `Composite Workload (40% List, 20% View, 25% Patch, 10% Media, 5% GQL) • ${getDbLabel()}`,
      results: [{ ...result, layer: "Composite", shortLabel: "Aggregate" }, ...subResults],
    });

    const listStat = subResults.find((r) => r.shortLabel === "READ_LIST");
    const viewStat = subResults.find((r) => r.shortLabel === "READ_ENTRY");
    const patchStat = subResults.find((r) => r.shortLabel === "UPDATE");
    const mediaStat = subResults.find((r) => r.shortLabel === "MEDIA");
    const gqlStat = subResults.find((r) => r.shortLabel === "GQL");

    printSummaryTable(
      [
        { key: "Database Engine", val: getDbLabel(), unit: "" },
        { key: "Composite Latency (Avg)", val: result.avgMs.toFixed(2), unit: "ms" },
        {
          key: "Composite Latency (p95)",
          val: (result.p95Ms || result.avgMs).toFixed(2),
          unit: "ms",
        },
        { key: "Composite Throughput", val: Math.round(result.rps || 0), unit: "ops/s" },
        { key: "List (40%) Avg", val: listStat?.avgMs.toFixed(2) ?? "0", unit: "ms" },
        { key: "View (20%) Avg", val: viewStat?.avgMs.toFixed(2) ?? "0", unit: "ms" },
        { key: "Patch (25%) Avg", val: patchStat?.avgMs.toFixed(2) ?? "0", unit: "ms" },
        { key: "Media (10%) Avg", val: mediaStat?.avgMs.toFixed(2) ?? "0", unit: "ms" },
        { key: "GraphQL (5%) Avg", val: gqlStat?.avgMs.toFixed(2) ?? "0", unit: "ms" },
        { key: "Memory RSS Δ", val: (result.rssDelta || 0).toFixed(1), unit: "MB" },
        {
          key: "Composite SLA",
          val: result.avgMs < 12 ? "EXCELLENT (<12ms)" : result.avgMs < 25 ? "GOOD" : "SLOW",
          unit: "",
        },
      ],
      "Production Day Summary",
    );

    exportMetric("workflow.production_day.avg_ms", result.avgMs, "ms");
    exportMetric("workflow.production_day.p95_ms", result.p95Ms || result.avgMs, "ms");
    exportMetric("workflow.production_day.rps", Math.round(result.rps || 0), "ops/s");
    if (patchStat) exportMetric("workflow.production_day.patch_avg_ms", patchStat.avgMs, "ms");
    if (listStat) exportMetric("workflow.production_day.list_avg_ms", listStat.avgMs, "ms");

    exportResult(result);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Production Day Lifecycle Suite", async () => {
  await runProductionDayAudit();
}, 600_000);
