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
  stabilize,
  setupBenchmarkServer,
  printTruthTable,
  ensureStableTestData,
} from "./benchmark-utils";
import { getDb } from "@src/databases/db";

export async function runGraphQLBenchmark() {
  console.log("🚀 Starting GraphQL API Performance Audit...\n");

  const { baseUrl, stop } = await setupBenchmarkServer();
  const secret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";

  // Ensure data exists for GQL queries
  console.log("   Seeding stable test data...");
  await ensureStableTestData(getDb(), "global");

  await stabilize();

  const ITERATIONS = 500;
  const RUNS = 3;
  const allResults: any[] = [];

  const scenarios = [
    {
      name: "GQL: System Health",
      query: `query { contentSystemHealth { state version } }`,
      validate: (json: any) => json.data?.contentSystemHealth?.state !== undefined,
    },
    {
      name: "GQL: Collection Stats (List)",
      query: `query { allCollectionStats { _id name } }`,
      validate: (json: any) => Array.isArray(json.data?.allCollectionStats),
    },
    {
      name: "GQL: Entries (Dynamic Field)",
      // Note: benchmark_stable results in a dynamic field name like Benchmarkstable_benchmar
      query: `query { Benchmarkstable_benchmar(pagination: { limit: 5 }) { _id title } }`,
      validate: (json: any) => Array.isArray(json.data?.Benchmarkstable_benchmar),
    },
    {
      name: "GQL: Concurrent Load (8x)",
      query: `query { allCollectionStats { _id name } }`,
      concurrency: 8,
      validate: (json: any) => Array.isArray(json.data?.allCollectionStats),
    },
  ];

  for (const scenario of scenarios) {
    const result = await runBenchmark({
      name: scenario.name,
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: RUNS,
      concurrency: scenario.concurrency || 1,
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
          body: JSON.stringify({ query: scenario.query }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`GraphQL query failed (${res.status}): ${errText}`);
        }

        const json = await res.json();
        if (json.errors) {
          throw new Error(`GraphQL returned errors: ${JSON.stringify(json.errors[0])}`);
        }

        if (scenario.validate && !scenario.validate(json)) {
          throw new Error(`GraphQL response validation failed for ${scenario.name}`);
        }
      },
    });
    allResults.push(result);
  }

  printTruthTable({
    title: "SVELTYCMS  —  GRAPHQL RESOLVER PERFORMANCE",
    subtitle: "End-to-End Latency • Schema Execution • Concurrent Load",
    results: allResults,
  });

  const base = allResults[1]; // allCollectionStats

  exportMetric("api.graphql.avg", base.avgMs, "ms");
  exportMetric("api.graphql.rps", base.rps, "req/s");

  for (const r of allResults) exportResult(r);

  await stop();
  console.log("\n✅ GraphQL performance audit completed.");
}

test("GraphQL Performance Audit Suite", async () => {
  await runGraphQLBenchmark();
}, 450000);
