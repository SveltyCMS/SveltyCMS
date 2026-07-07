/**
 * @file tests/benchmarks/rest-api-performance.test.ts
 * @description Enterprise REST API Performance Benchmark (Optimized)
 * @summary Measures latency, throughput, and correctness of core REST endpoints: health check, schema, CRUD list, and search.
 *
 * ### Features:
 * - System health check endpoint latency
 * - Collection schema retrieval performance
 * - Collection CRUD list and search query throughput
 * - Structured metric export for benchmark matrix correlation
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  ensureStableTestData,
  STABLE_COLLECTION,
  printTruthTable,
  printSummaryTable,
  getDbType,
  forceRefreshServer,
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

const restScenarios = [
  {
    name: "Health Check",
    path: "/api/system/health",
    layer: "System",
  },
  {
    name: "Collection Schema",
    path: `/api/collections/${STABLE_COLLECTION}/schema`,
    layer: "Metadata",
  },
  {
    name: "Collection Find (List)",
    path: `/api/collections/${STABLE_COLLECTION}?limit=20`,
    layer: "CRUD",
  },
  {
    name: "Collection Search",
    path: `/api/collections/${STABLE_COLLECTION}?search=benchmark`,
    layer: "CRUD",
  },
];

async function runRestAudit() {
  console.log(`🚀 Starting Enterprise REST API Audit (${getDbType().toUpperCase()})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData(null);
    await forceRefreshServer(baseUrl);

    // Pre-allocated static headers to eliminate runtime object instantiation penalties
    const requestHeaders = {
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
      "x-tenant-id": "global",
    };

    const results = [];

    for (const scenario of restScenarios) {
      console.log(`   → Benchmarking ${scenario.name}...`);

      const result = await runBenchmark({
        name: scenario.name,
        iterations: 500,
        warmupIterations: 80,
        runs: 2,
        concurrency: (process.env.DB_TYPE ?? "").toLowerCase() === "mongodb" ? 12 : 4, // Reduced for Dockerized DBs in CI
        silent: true,
        onIteration: async () => {
          const res = await fetch(`${baseUrl}${scenario.path}`, {
            method: "GET",
            headers: requestHeaders,
          });

          if (!res.ok) {
            const body = await res.text().catch(() => "<failed to read body>");
            throw new Error(`${scenario.name} failed: ${res.status} - ${body}`);
          }

          // Low-level buffer exhaustion isolates network transfer speed from string allocation
          await res.arrayBuffer();
        },
      });

      results.push({
        ...result,
        layer: scenario.layer,
        shortLabel: scenario.name,
      });
    }

    printTruthTable({
      title: "SVELTYCMS — ENTERPRISE REST API AUDIT",
      shortLabel: "REST",
      subtitle: `Core CRUD Latency • ${getDbType().toUpperCase()}`,
      results,
    });

    printSummaryTable(
      results.map((r) => ({
        key: r.name,
        val: r.avgMs,
        unit: "ms",
      })),
    );

    for (const r of results) exportResult(r);

    // Export structured metrics for matrix
    const listResult = results.find((r) => r.name.includes("List")) || results[0];
    exportMetric("rest.collections.avg", listResult.avgMs, "ms");
    exportMetric("rest.collections.p95", listResult.p95Ms, "ms");
    exportMetric("rest.collections.rps", listResult.rps, "req/s");
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
