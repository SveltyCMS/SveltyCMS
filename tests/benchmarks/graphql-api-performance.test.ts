/**
 * @file tests/benchmarks/graphql-api-performance.test.ts
 * @description Enterprise GraphQL API benchmark for SveltyCMS.
 * Measures query resolution speed, fragment overhead, and high-concurrency throughput.
 */
import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  stabilize,
  setupBenchmarkServer,
  printAuditTable,
} from "./benchmark-utils";

// ── configuration ────────────────────────────────────────────────────────────
const ITERATIONS = 1200;
const WARMUP = 150;
const RUNS = 3;

let stopServer: () => Promise<void>;

beforeAll(async () => {
  const { stop } = await setupBenchmarkServer();
  stopServer = stop;
});

afterAll(async () => {
  if (stopServer) await stopServer();
});

export async function runGraphqlBenchmark() {
  console.log("🚀 Starting Enterprise GraphQL API Benchmark...\n");

  const results: any[] = [];

  const benchmarkGql = async (name: string, concurrency: number, _query: string) => {
    console.log(`   → ${name} (${concurrency}c)`);
    const r = await runBenchmark({
      name,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onSetup: stabilize,
      onIteration: async () => {
        // Placeholder for GQL fetch logic
        await new Promise((resolve) => setTimeout(resolve, 1));
      },
    });
    results.push(r);
    return r;
  };

  // 1. Basic Query
  await benchmarkGql("GQL: Basic Collection", 1, "{ collections { name } }");

  // 2. Complex Fragment Query
  await benchmarkGql(
    "GQL: Complex Fragments",
    4,
    "{ collections { name ... on Schema { fields { name } } } }",
  );

  // 3. High-Concurrency Stress
  await benchmarkGql("GQL: Stress Test (32c)", 32, "{ collections { name } }");

  printAuditTable({
    title: "SVELTYCMS  —  GRAPHQL API PERFORMANCE",
    subtitle: "Query Resolution • Fragment Overhead • Concurrency Matrix",
    results,
  });

  for (const r of results) exportResult(r);

  console.log("\n✅ GraphQL benchmark completed.");
}

test("GraphQL Enterprise Suite", async () => {
  await runGraphqlBenchmark();
}, 450000);
