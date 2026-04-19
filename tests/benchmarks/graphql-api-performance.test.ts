/**
 * @file tests/benchmarks/graphql-api-performance.test.ts
 * @description Enterprise-grade benchmark for SveltyCMS GraphQL API performance.
 *              Measures dispatcher overhead, resolver execution, introspection,
 *              nested relation depth, memory pressure, and throughput.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  checkBenchmarkEnv,
  stabilize,
  mockDispatch,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

type BenchResult = {
  name: string;
  avgMs: number;
  p95Ms: number;
  rps: number;
  rssDelta?: number;
  marginOfError: number;
};

const ITERATIONS = 1200;
const RUNS = 3;
const CONCURRENCY = 1;
const WARMUP = Math.floor(ITERATIONS * 0.15);

const BASE_QUERIES = [
  {
    name: "Me Query (Authenticated)",
    query: `query { me { _id username email role permissions } }`,
  },
  {
    name: "Collection Stats",
    query: `query { allCollectionStats { name fieldCount relationCount } }`,
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
  const { contentSystem } = await import("@src/content");

  await ensureFullInitialization();
  await stabilize();

  // Dynamic schema discovery
  const collections = contentSystem.getCollections("global") || [];
  const authorCol = collections.find((c) => (c._id || "").toLowerCase().includes("author"));
  const postCol = collections.find((c) => (c._id || "").toLowerCase().includes("post"));

  const queries = [...BASE_QUERIES];

  if (authorCol?.name && postCol?.name) {
    queries.push({
      name: `Nested Relations (${authorCol.name} → ${postCol.name})`,
      query: `query {
        ${authorCol.name}(limit: 5) {
          name bio
          ${postCol.name}(limit: 8) {
            title publishedAt
          }
        }
      }`,
    });
  }

  if (postCol?.name) {
    queries.push({
      name: `Paginated ${postCol.name} List`,
      query: `query {
        ${postCol.name}(limit: 20, offset: 0) {
          _id title
        }
      }`,
    });
  }

  // Warm schema / resolvers
  console.log("🔥 Warming GraphQL engine...");
  await executeGraphQL(`{ __schema { queryType { name } } }`);

  console.log(`🔬 Running ${queries.length} GraphQL scenarios (${ITERATIONS} × ${RUNS})...\n`);

  const results: BenchResult[] = [];

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
    results.push(result as BenchResult);
  }

  logger.level = "info";

  console.log("\n" + "=".repeat(140));
  console.log("   📊 SVELTYCMS GRAPHQL API PERFORMANCE AUDIT");
  console.log("   Resolver Depth • Introspection • Throughput • Memory");
  console.log("=".repeat(140));

  console.log(
    `| ${"Query".padEnd(42)} | ${"Avg".padEnd(22)} | ${"p95".padEnd(14)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(140 - 2) + "|");

  for (const r of results) {
    const rss =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)} MB` : "—";
    console.log(
      `| ${r.name.replace("GraphQL: ", "").padEnd(42)} | ` +
        `${r.avgMs.toFixed(4)} ms (±${r.marginOfError.toFixed(3)})`.padEnd(22) +
        ` | ${r.p95Ms.toFixed(4)} ms`.padEnd(14) +
        ` | ${Math.round(r.rps).toLocaleString().padEnd(12)}` +
        ` | ${rss.padEnd(12)} |`,
    );
  }
  console.log("=".repeat(140));

  // Insights
  const nested =
    results.find((r) => r.name.includes("Nested Relations")) ?? results[results.length - 1];
  console.log(`\n✨ Insights:`);
  console.log(`   • Nested resolver query latency: ${nested.avgMs.toFixed(3)} ms`);
  console.log(`   • Introspection cost scales with schema size`);
  console.log(`   • RSS delta reflects hydration / resolver caching`);

  const avgLat = results.reduce((sum, r) => sum + r.avgMs, 0) / results.length;
  const maxP95 = Math.max(...results.map((r) => r.p95Ms));
  const avgRps = results.reduce((sum, r) => sum + r.rps, 0) / results.length;
  const totalRss = results.reduce((sum, r) => sum + (r.rssDelta || 0), 0);

  exportMetric("graphql.query.avg", avgLat, "ms", { p95: maxP95, rps: avgRps });
  exportMetric("graphql.query.rps", avgRps, "req/s");

  exportResult({
    name: "GraphQL (Average)",
    avgMs: avgLat,
    p95Ms: maxP95,
    rps: avgRps,
    rssDelta: totalRss,
  });

  for (const r of results) exportResult(r);
  console.log("\n✅ GraphQL benchmark completed.");
}

test("GraphQL API Performance Suite (Enterprise)", async () => {
  await runGraphQLBenchmark();
}, 600000);
