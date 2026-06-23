/**
 * @file tests/benchmarks/relational-performance.test.ts
 * @description GraphQL Relational Resolver Benchmark
 * @summary Measures GraphQL resolver performance for shallow and deep relational queries including joins and nested population.
 *
 * ### Features:
 * - Shallow relational query latency (collection listing)
 * - Deep relational query latency (author population via joins)
 * - GraphQL resolver throughput under concurrent load
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
  forceRefreshServer,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runRelationalAudit() {
  // pre-existing unused var removed for TS strict mode
  console.log("🚀 Starting Enterprise Relational Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await forceRefreshServer(baseUrl);
    await stabilize(1500);

    const secret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";

    // Simple shallow query
    const simpleQuery = {
      query: `{
        allCollections {
          _id
          name
        }
      }`,
    };

    // Deeper relational query
    const deepQuery = {
      query: `{
        BenchmarkStable(limit: 5) {
          _id
          title
          author {
            _id
            name
          }
        }
      }`,
    };

    console.log("   → Measuring Shallow Relational Query...");
    const shallow = await runBenchmark({
      name: "Shallow Relational Query",
      iterations: 600,
      warmupIterations: 80,
      runs: 3,
      concurrency: 6,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${baseUrl}/api/graphql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-test-mode": "true",
            "x-test-secret": secret,
          },
          body: JSON.stringify(simpleQuery),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status}: ${body.slice(0, 500)}`);
        }
        await res.json();
      },
    });

    console.log("   → Measuring Deep Relational Query...");
    const deep = await runBenchmark({
      name: "Deep Relational Query",
      iterations: 400,
      warmupIterations: 60,
      runs: 2,
      concurrency: 4,
      trimOutliers: "iqr",
      silent: true,
      onIteration: async () => {
        const res = await fetch(`${baseUrl}/api/graphql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-test-mode": "true",
            "x-test-secret": secret,
          },
          body: JSON.stringify(deepQuery),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await res.json();
      },
    });

    printTruthTable({
      title: "SVELTYCMS — RELATIONAL RESOLVER AUDIT",
      shortLabel: "Relational",
      subtitle: `GraphQL Joins • Deep Population • ${getDbType().toUpperCase()}`,
      results: [
        { ...shallow, shortLabel: "Shallow", layer: "Relational" },
        { ...deep, shortLabel: "Deep", layer: "Relational" },
      ],
    });

    printSummaryTable([
      { key: "Shallow Query Latency", val: shallow.avgMs, unit: "ms" },
      { key: "Deep Query Latency", val: deep.avgMs, unit: "ms" },
      {
        key: "Peak Throughput",
        val: Math.round(shallow.rps || 0),
        unit: "req/s",
      },
      { key: "Rating", val: deep.avgMs < 15 ? "EXCELLENT" : "GOOD", unit: "" },
    ]);

    exportResult(shallow);
    exportResult(deep);
  } catch (err: any) {
    logger.error(`Relational benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Relational Resolver Performance", async () => {
  await runRelationalAudit();
}, 600000);
