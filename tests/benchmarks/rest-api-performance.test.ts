/**
 * @file tests/benchmarks/rest-api-performance.test.ts
 * @description Enterprise REST API benchmark for SveltyCMS.
 * Measures latency and throughput for core REST endpoints (Auth, Collections, Health).
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

let server: any;

async function runRestApiAudit() {
  console.log("🚀 Starting Enterprise REST API Audit...\n");

  const originalLogLevel = logger.level;
  logger.level = "silent";

  try {
    // 1. Setup Server & Data
    server = await setupBenchmarkServer();
    const baseUrl = server.baseUrl;

    console.log("📊 Seeding stable benchmark data...");
    await ensureStableTestData(null);

    const endpoints = [
      { name: "Health Check", path: "/api/system/health", method: "GET" },
      { name: "Collection List", path: "/api/collections", method: "GET" },
      {
        name: "Entry Retrieval",
        path: `/api/collections/${STABLE_COLLECTION}/bench-shared-001`,
        method: "GET",
      },
    ];

    const results: any[] = [];
    const RUNS = 2;
    const ITERATIONS = 500;
    const CONCURRENCY = 8;

    for (const ep of endpoints) {
      console.log(`   → Measuring ${ep.name}...`);

      const stats = await runBenchmark({
        name: ep.name,
        iterations: ITERATIONS,
        warmupIterations: 50,
        runs: RUNS,
        concurrency: CONCURRENCY,
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          const res = await fetch(baseUrl + ep.path, {
            method: ep.method,
            headers: {
              "x-test-secret": TEST_API_SECRET,
            },
          });

          if (res.status !== 200) {
            const text = await res.text();
            throw new Error(`HTTP ${res.status}: ${text}`);
          }
          await res.text();
        },
      });

      results.push({ ...stats, layer: "Full Stack" });
    }

    printTruthTable({
      title: "SVELTYCMS  —  REST API PERFORMANCE AUDIT",
      subtitle: `${getDbType().toUpperCase()} • ${ITERATIONS} Iterations • ${CONCURRENCY} Parallel Workers`,
      results,
    });

    const health = results[0];
    const retrieval = results[2];

    printSummaryTable([
      { key: "Health Check Latency", val: health.avgMs, unit: "ms" },
      { key: "Entry Read Latency", val: retrieval.avgMs, unit: "ms" },
      { key: "Peak REST Throughput", val: Math.max(...results.map((r) => r.rps)), unit: "req/s" },
      { key: "API Efficiency Rating", val: retrieval.avgMs < 20 ? "EXCELLENT" : "GOOD", unit: "" },
    ]);

    for (const r of results) exportResult(r);
    await server.stop();
  } finally {
    logger.level = originalLogLevel;
  }

  console.log("\n✅ REST API audit completed.");
}

test("REST API Enterprise Audit", async () => {
  await runRestApiAudit();
}, 600000);
