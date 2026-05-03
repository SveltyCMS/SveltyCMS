/**
 * @file tests/benchmarks/graphql-api-performance.test.ts
 * @description GraphQL resolver performance and throughput audit.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

const graphqlScenarios = [
  {
    name: "GQL: System Health",
    query: `query { contentSystemHealth { state version collectionCount } }`,
    shortLabel: "Health",
    concurrency: 1,
  },
  {
    name: "GQL: Collection List",
    query: `query { allCollections { _id name label } }`,
    shortLabel: "Collections",
    concurrency: 6,
  },
  {
    name: "GQL: Entries (Stable Collection)",
    query: `query { BenchmarkStable(pagination: { limit: 10 }) { _id title content } }`,
    shortLabel: "Entries",
    concurrency: 5,
  },
  {
    name: "GQL: Concurrent Load",
    query: `query { allCollections { _id name } BenchmarkStable(pagination: { limit: 5 }) { _id } }`,
    shortLabel: "Concurrent",
    concurrency: 12,
  },
];

export async function runGraphQLBenchmark() {
  console.log("🚀 Starting GraphQL API Performance Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    const secret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";

    await ensureStableTestData();
    await stabilize(1200);

    const results = [];

    for (const scenario of graphqlScenarios) {
      console.log(`   → ${scenario.name}...`);

      const result = await runBenchmark({
        name: scenario.name,
        iterations: 600,
        warmupIterations: 80,
        runs: 3,
        concurrency: scenario.concurrency,
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          const res = await fetch(`${baseUrl}/api/graphql`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-test-mode": "true",
              "x-test-secret": secret,
            },
            body: JSON.stringify({ query: scenario.query }),
          });

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`GraphQL HTTP ${res.status}: ${text}`);
          }

          const json = await res.json();

          if (json.errors?.length) {
            throw new Error(`GraphQL Error: ${json.errors[0].message}`);
          }

          return json;
        },
      });

      const enriched = {
        ...result,
        shortLabel: scenario.shortLabel,
        layer: "GraphQL",
      };

      results.push(enriched);
      exportResult(enriched);
    }

    // Reporting
    printTruthTable({
      title: "SVELTYCMS — GRAPHQL PERFORMANCE AUDIT",
      shortLabel: "GraphQL",
      subtitle: `Resolver Execution • ${getDbType().toUpperCase()}`,
      results,
    });

    printSummaryTable([
      { key: "Health Check", val: results[0].avgMs, unit: "ms" },
      { key: "Collection List", val: results[1].avgMs, unit: "ms" },
      { key: "Entries Query", val: results[2].avgMs, unit: "ms" },
      { key: "Peak RPS", val: Math.max(...results.map((r) => r.rps || 0)), unit: "req/s" },
    ]);

    // Export structured metrics for matrix
    const mainResult = results[1]; // Collection List as baseline
    exportMetric("api.graphql.avg", mainResult.avgMs, "ms");
    exportMetric("api.graphql.p95", mainResult.p95Ms || mainResult.avgMs, "ms");
    exportMetric("api.graphql.rps", mainResult.rps, "req/s");
  } catch (err: any) {
    logger.error(`GraphQL benchmark failed: ${err.message}`);
    console.error(err);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ GraphQL performance audit completed.");
}

test("GraphQL Performance Audit Suite", async () => {
  await runGraphQLBenchmark();
}, 480000);
