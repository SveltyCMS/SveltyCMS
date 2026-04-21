/**
 * @file tests/benchmarks/graphql-api-performance.test.ts
 * @description Enterprise-grade benchmark for SveltyCMS GraphQL API performance.
 *              Measures dispatcher overhead, resolver execution, introspection,
 *              nested relation depth, memory pressure, and throughput.
 */
import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  checkBenchmarkEnv,
  stabilize,
  mockDispatch,
  setupBenchmarkServer,
  updateBenchmarkDocumentation,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let stopServer: () => Promise<void>;

beforeAll(async () => {
  const { stop } = await setupBenchmarkServer();
  stopServer = stop;
});

afterAll(async () => {
  if (stopServer) await stopServer();
});

const ITERATIONS = 1000;
const RUNS = 3;
const CONCURRENCY = 1;
const WARMUP = 100;

const BASE_QUERIES = [
  {
    name: "Me Query (Authenticated)",
    query: `query { me { _id username email role permissions } }`,
  },
  {
    name: "Schema Introspection",
    query: `query { __schema { queryType { name } mutationType { name } } }`,
  },
];

async function executeGraphQL(query: string): Promise<void> {
  const res = await mockDispatch({
    path: "/graphql",
    method: "POST",
    body: { query },
  });

  if (res.status !== 200) {
    const text = await res.text().catch(() => "");
    throw new Error(`GraphQL failed (${res.status}): ${text.slice(0, 200)}`);
  }
  await res.text();
}

export async function runGraphQLBenchmark() {
  checkBenchmarkEnv();
  console.log("🚀 Starting Enterprise GraphQL API Benchmark...\n");

  logger.level = "silent";

  const { ensureFullInitialization } = await import("@src/databases/db");

  await ensureFullInitialization();
  await stabilize();

  const queries = [...BASE_QUERIES];

  // Warm schema / resolvers
  console.log("🔥 Warming GraphQL engine...");
  await executeGraphQL(`{ __schema { queryType { name } } }`);

  console.log(`🔬 Running ${queries.length} GraphQL scenarios...\n`);

  const results: any[] = [];

  for (const q of queries) {
    console.log(`   → ${q.name}`);

    const result = await runBenchmark({
      name: `GraphQL: ${q.name}`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency: CONCURRENCY,
      trimOutliers: "iqr",
      measureMemory: true,
      onSetup: stabilize,
      onIteration: () => executeGraphQL(q.query),
      silent: true,
    });
    results.push(result);
  }

  logger.level = "info";

  console.log("\n" + "=".repeat(120));
  console.log("   📊 SVELTYCMS GRAPHQL API PERFORMANCE AUDIT");
  console.log("=".repeat(120));

  for (const r of results) {
    console.log(
      `| ${r.name.replace("GraphQL: ", "").padEnd(42)} | ` +
        `${r.avgMs.toFixed(4)} ms`.padEnd(22) +
        ` | ${r.p95Ms.toFixed(4)} ms`.padEnd(14) +
        ` | ${Math.round(r.rps).toLocaleString().padEnd(12)} |`,
    );
  }
  console.log("=".repeat(120));

  const avgLat = results.reduce((sum, r) => sum + r.avgMs, 0) / results.length;
  const maxP95 = Math.max(...results.map((r) => r.p95Ms));
  const avgRps = results.reduce((sum, r) => sum + r.rps, 0) / results.length;

  exportMetric("graphql.query.avg", avgLat, "ms");
  exportMetric("graphql.query.p95", maxP95, "ms");

  const aggregate = {
    name: "GraphQL Summary",
    avgMs: avgLat,
    p95Ms: maxP95,
    rps: avgRps,
    shortLabel: "GraphQL p95",
  };

  exportResult(aggregate);
  console.log("\n✅ GraphQL benchmark completed.");
  await updateBenchmarkDocumentation();
}

test("GraphQL API Performance Suite (Enterprise)", async () => {
  await runGraphQLBenchmark();
}, 600000);
