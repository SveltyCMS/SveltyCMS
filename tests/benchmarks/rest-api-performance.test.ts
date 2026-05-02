/**
 * @file tests/benchmarks/rest-api-performance.test.ts
 * @description Enterprise REST API benchmark for SveltyCMS.
 * Measures latency, throughput, and correctness of core REST endpoints.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  STABLE_COLLECTION,
  printTruthTable,
  printSummaryTable,
  TEST_API_SECRET,
  getDbType,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

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
  }
];

async function runRestAudit() {
  console.log(`🚀 Starting Enterprise REST API Audit (${getDbType().toUpperCase()})...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData(null);

    const results = [];

    for (const scenario of restScenarios) {
      console.log(`   → Benchmarking ${scenario.name}...`);
      
      const result = await runBenchmark({
        name: scenario.name,
        iterations: 500,
        warmupIterations: 80,
        runs: 2,
        concurrency: 12,
        silent: true,
        onIteration: async () => {
          const res = await fetch(`${baseUrl}${scenario.path}`, {
            headers: {
              "x-test-mode": "true",
              "x-test-secret": TEST_API_SECRET,
            }
          });
          if (!res.ok) throw new Error(`${scenario.name} failed: ${res.status}`);
          await res.text();
        }
      });

      results.push({ ...result, layer: scenario.layer, shortLabel: scenario.name });
    }

    printTruthTable({
      title: "SVELTYCMS — ENTERPRISE REST API AUDIT",
      shortLabel: "REST",
      subtitle: `Core CRUD Latency • ${getDbType().toUpperCase()}`,
      results,
    });

    printSummaryTable(results.map(r => ({
      key: r.name,
      val: r.avgMs,
      unit: "ms"
    })));

    for (const r of results) exportResult(r);

  } catch (err: any) {
    logger.error(`REST audit failed: ${err.message}`);
    console.error(err);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ REST API audit completed.");
}

test("Enterprise REST API Performance", async () => {
  await runRestAudit();
}, 600_000);
