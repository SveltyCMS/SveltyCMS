/**
 * @file tests/benchmarks/rest-api-performance.test.ts
 * @description Enterprise REST API Performance Benchmark (Optimized)
 * @summary Measures latency, throughput, and correctness of core REST endpoints: health check, schema, single read, list, and search.
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
  printTruthTable,
  printSummaryTable,
  getDbType,
  forceRefreshServer,
  benchmarkAuthHeaders,
  stabilize,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

const restScenarios = [
  {
    name: "System Health Check",
    shortLabel: "Health Check",
    path: "/api/system/health",
    layer: "System",
  },
  {
    name: "Collection Schema Metadata",
    shortLabel: "Schema",
    path: `/api/collections/${STABLE_COLLECTION}/schema`,
    layer: "Metadata",
  },
  {
    name: "Single Document Read",
    shortLabel: "Point Read",
    path: `/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
    layer: "CRUD (Get)",
  },
  {
    name: "Collection Find (List Limit 20)",
    shortLabel: "List (20)",
    path: `/api/collections/${STABLE_COLLECTION}?limit=20`,
    layer: "CRUD (List)",
  },
  {
    name: "Collection Search Query",
    shortLabel: "Search",
    path: `/api/collections/${STABLE_COLLECTION}?search=benchmark`,
    layer: "CRUD (Search)",
  },
];

async function runRestAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(`🚀 Starting Enterprise REST API Audit (${dbType})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData(null);
    await forceRefreshServer(baseUrl);
    await stabilize(1000);

    const requestHeaders: Record<string, string> = {
      "content-type": "application/json",
      ...benchmarkAuthHeaders(),
      "x-tenant-id": "global",
      connection: "keep-alive",
    };

    const isMongo = dbType.includes("MONGO");
    const targetConcurrency = isMongo ? 12 : 4;
    const results = [];

    for (let s = 0; s < restScenarios.length; s++) {
      const scenario = restScenarios[s]!;
      const requestUrl = `${baseUrl}${scenario.path}`;

      forceGarbageCollection();
      await stabilize(150);

      console.log(`   → Benchmarking ${scenario.name}...`);

      const result = await runBenchmark({
        name: scenario.name,
        iterations: 500,
        warmupIterations: 80,
        runs: 2,
        concurrency: targetConcurrency,
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          const res = await fetch(requestUrl, {
            method: "GET",
            headers: requestHeaders,
            signal: AbortSignal.timeout(10_000),
          });

          if (!res.ok) {
            const body = await res.text().catch(() => "<failed to read body>");
            throw new Error(`${scenario.name} failed: HTTP ${res.status} - ${body}`);
          }

          // Zero-allocation buffer drain
          await res.arrayBuffer().catch(() => {});
        },
      });

      const enriched = {
        ...result,
        layer: scenario.layer,
        shortLabel: scenario.shortLabel,
      };

      results.push(enriched);
      exportResult(enriched);
    }

    // ── REPORTING & TELEMETRY ───────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — ENTERPRISE REST API AUDIT",
      shortLabel: "REST",
      subtitle: `Core CRUD & Metadata Latency • ${targetConcurrency}c • ${dbType}`,
      results,
    });

    const healthRes = results.find((r) => r.shortLabel === "Health Check")!;
    const schemaRes = results.find((r) => r.shortLabel === "Schema")!;
    const readRes = results.find((r) => r.shortLabel === "Point Read")!;
    const listRes = results.find((r) => r.shortLabel === "List (20)")!;
    const searchRes = results.find((r) => r.shortLabel === "Search")!;

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Health Check Latency", val: healthRes.avgMs.toFixed(2), unit: "ms" },
        { key: "Schema Metadata Latency", val: schemaRes.avgMs.toFixed(2), unit: "ms" },
        { key: "Point Read Latency (Avg)", val: readRes.avgMs.toFixed(2), unit: "ms" },
        {
          key: "Point Read Latency (p95)",
          val: (readRes.p95Ms || readRes.avgMs).toFixed(2),
          unit: "ms",
        },
        { key: "List (20 items) Latency", val: listRes.avgMs.toFixed(2), unit: "ms" },
        {
          key: "List (20 items) p95",
          val: (listRes.p95Ms || listRes.avgMs).toFixed(2),
          unit: "ms",
        },
        { key: "Search Query Latency", val: searchRes.avgMs.toFixed(2), unit: "ms" },
        {
          key: "Peak REST Throughput",
          val: Math.round(Math.max(...results.map((r) => r.rps || 0))),
          unit: "req/s",
        },
        {
          key: "REST API SLA",
          val: readRes.avgMs < 5 && listRes.avgMs < 12 ? "EXCELLENT" : "GOOD",
          unit: "",
        },
      ],
      "REST API Summary",
    );

    exportMetric("rest.health.avg_ms", healthRes.avgMs, "ms");
    exportMetric("rest.schema.avg_ms", schemaRes.avgMs, "ms");
    exportMetric("rest.point_read.avg_ms", readRes.avgMs, "ms");
    exportMetric("rest.point_read.p95_ms", readRes.p95Ms || readRes.avgMs, "ms");
    exportMetric("rest.list.avg_ms", listRes.avgMs, "ms");
    exportMetric("rest.list.p95_ms", listRes.p95Ms || listRes.avgMs, "ms");
    exportMetric("rest.search.avg_ms", searchRes.avgMs, "ms");
    exportMetric("rest.peak_rps", Math.round(Math.max(...results.map((r) => r.rps || 0))), "req/s");
  } catch (err: any) {
    logger.error(`REST audit failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Enterprise REST API Performance", async () => {
  await runRestAudit();
}, 600_000);
