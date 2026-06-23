/**
 * @file tests/benchmarks/admin-ux-vitality.test.ts
 * @description Admin UX Vitality Benchmark
 * @summary Forms and widget registry performance via real HTTP endpoints.
 *
 * ### Features:
 * - Schema resolution with 8-field collection via HTTP
 * - Widget registry lookup via collection listing
 * - Tests the same code paths a real admin user triggers
 */

import {
  test,
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  stabilize,
  printTruthTable,
  printSummaryTable,
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

let stopServer: (() => Promise<void>) | null = null;

async function runUXAudit() {
  console.log("🚀 Starting Admin UX Vitality Audit (HTTP)...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await stabilize(1000);

    const headers = {
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET,
    };

    const results = [];

    // 1. Schema resolution — triggers widget lookups for each field
    console.log("   → Measuring Schema Resolution (8 fields, bench_index_pressure)...");
    const schemaResult = await runBenchmark({
      name: "Schema Resolution (8f)",
      iterations: 500,
      warmupIterations: 50,
      runs: 2,
      concurrency: 4,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${baseUrl}/api/collections/bench_index_pressure/schema`, {
          headers,
        });
        if (!res.ok) throw new Error(`Schema failed: ${res.status}`);
        await res.json();
      },
    });
    results.push({ ...schemaResult, layer: "HTTP", shortLabel: "Schema-8f" });

    // 2. Collection listing — tests widget registry + schema loading
    console.log("   → Measuring Collection Listing (widget registry)...");
    const listResult = await runBenchmark({
      name: "Collection List (11 cols)",
      iterations: 500,
      warmupIterations: 50,
      runs: 2,
      concurrency: 4,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${baseUrl}/api/collections`, { headers });
        if (!res.ok) throw new Error(`List failed: ${res.status}`);
        await res.json();
      },
    });
    results.push({ ...listResult, layer: "HTTP", shortLabel: "List-11" });

    printTruthTable({
      title: "SVELTYCMS  —  ADMIN UX VITALITY AUDIT",
      subtitle: "Schema Resolution · Widget Registry · HTTP",
      results,
    });

    printSummaryTable([
      { key: "Schema Resolution (8f)", val: schemaResult.avgMs, unit: "ms" },
      { key: "Collection List (11 cols)", val: listResult.avgMs, unit: "ms" },
      {
        key: "UX Performance Tier",
        val: schemaResult.avgMs < 10 ? "PLATINUM" : "GOLD",
        unit: "",
      },
    ]);

    for (const r of results) exportResult(r);
  } catch (err: any) {
    console.error("❌ UX audit failed:", err.message);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Admin Dashboard Vitality Simulation", async () => {
  await runUXAudit();
}, 300000);
