/**
 * @file tests/benchmarks/graphql-api-performance.test.ts
 * @description GraphQL API Performance Audit (Optimized)
 * @summary Measures GraphQL resolver performance and throughput across varied query scenarios.
 *
 * ### Features:
 * - Resolver-level latency profiling
 * - Query complexity throughput analysis
 * - Field-level resolution timing
 * - GraphQL endpoint response benchmarking
 */

import {
  test,
  runBenchmark,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  forceRefreshServer,
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
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
    query: `query { allCollections { _id name } }`,
    shortLabel: "Collections",
    concurrency: 6,
  },
  {
    name: "GQL: Concurrent Load",
    query: `query { allCollections { _id name } __schema { types { name } } }`,
    shortLabel: "Load",
    concurrency: 5,
  },
];

export async function runGraphQLBenchmark() {
  console.log("🚀 Starting GraphQL API Performance Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    const secret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";
    const tenantId = process.env.TENANT_ID || "global";
    const isDebugActive = process.env.BENCHMARK_DEBUG === "true";

    await ensureStableTestData();
    await forceRefreshServer(baseUrl);
    await stabilize(1200);

    // Pre-allocate static, lowercase headers and immutable query payloads outside loop boundaries
    const requestHeaders = {
      "content-type": "application/json",
      "x-test-mode": "true",
      "x-test-secret": TEST_API_SECRET || secret,
      "x-tenant-id": tenantId,
    };

    const targetUrl = `${baseUrl}/api/graphql`;
    const results = [];

    for (let i = 0; i < graphqlScenarios.length; i++) {
      const scenario = graphqlScenarios[i]!;
      console.log(`   → ${scenario.name}...`);

      const payloadString = JSON.stringify({ query: scenario.query });

      const result = await runBenchmark({
        name: scenario.name,
        iterations: 600,
        warmupIterations: 80,
        runs: 3,
        concurrency: scenario.concurrency,
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          if (isDebugActive) {
            console.log(`[Fetch Debug] Query: "${scenario.query}"`);
          }

          const res = await fetch(targetUrl, {
            method: "POST",
            headers: requestHeaders,
            body: payloadString,
          });

          if (!res.ok) {
            const text = await res.text().catch(() => "unreadable buffer payload");
            throw new Error(`GraphQL HTTP ${res.status}: ${text}`);
          }

          // Use arrayBuffer to drain the wire, then parse for validation
          const rawBuffer = await res.arrayBuffer();
          const decoder = new TextDecoder("utf-8");
          const responseString = decoder.decode(rawBuffer);
          const parsedJson = JSON.parse(responseString);

          if (parsedJson.errors && parsedJson.errors.length > 0) {
            throw new Error(`GraphQL Error: ${parsedJson.errors[0].message}`);
          }
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

    printTruthTable({
      title: "SVELTYCMS — GRAPHQL PERFORMANCE AUDIT",
      shortLabel: "GraphQL",
      subtitle: `Resolver Execution • ${getDbType().toUpperCase()}`,
      results,
    });

    printSummaryTable([
      { key: "Health Check", val: results[0]!.avgMs, unit: "ms" },
      { key: "Collection List", val: results[1]!.avgMs, unit: "ms" },
      { key: "Entries Query", val: results[2]!.avgMs, unit: "ms" },
      {
        key: "Peak RPS",
        val: Math.max(...results.map((r) => r.rps || 0)),
        unit: "req/s",
      },
    ]);

    const mainResult = results[1]!;
    exportMetric("api.graphql.avg", mainResult.avgMs, "ms");
    exportMetric("api.graphql.p95", mainResult.p95Ms || mainResult.avgMs, "ms");
    exportMetric("api.graphql.rps", mainResult.rps, "req/s");
  } catch (err: any) {
    logger.error(`GraphQL benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("GraphQL Performance Audit Suite", async () => {
  await runGraphQLBenchmark();
}, 480000);
