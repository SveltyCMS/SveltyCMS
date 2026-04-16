/**
 * @file tests/benchmarks/graphql-api-performance.test.ts
 * @description High-fidelity benchmark for SveltyCMS GraphQL API performance using the unified dispatcher.
 *              Measures real resolver execution, relation resolution, and introspection under load.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { logger } from "@utils/logger.server";

const QUERIES = [
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
  {
    name: "Nested Relations (Authors → Posts)",
    query: `query {
      Authors_00000000(limit: 5) {
        name bio
        Posts(limit: 8) {
          title publishedAt
          author { name }
        }
      }
    }`,
  },
  {
    name: "Paginated Collection List",
    query: `query {
      Posts(limit: 20, offset: 0) {
        _id title
      }
    }`,
  },
];

export async function runGraphQLBenchmark() {
  console.log("🚀 Starting High-Fidelity GraphQL API Performance Benchmark...\n");

  logger.level = "silent";

  const { ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();

  // Warm up schema and resolvers
  console.log("🔥 Warming up GraphQL schema...");
  const { mockDispatch } = await import("./benchmark-utils");

  await mockDispatch({
    path: "/graphql",
    method: "POST",
    body: { query: "{ __schema { queryType { name } } }" },
  });

  const ITERATIONS = 1200;
  const WARMUP = Math.floor(ITERATIONS * 0.15);
  const RUNS = 3;

  console.log(`\n🔬 Running GraphQL benchmarks (${ITERATIONS} iterations × ${RUNS} runs)...`);

  const results: any[] = [];

  for (const q of QUERIES) {
    console.log(`   → ${q.name}`);

    const result = await runBenchmark({
      name: `GraphQL: ${q.name}`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      concurrency: 1, // pure latency measurement
      runs: RUNS,
      trimOutliers: "iqr",
      measureMemory: true,
      onIteration: async () => {
        const res = await mockDispatch({
          path: "/graphql",
          method: "POST",
          body: { query: q.query },
        });

        if (res.status !== 200) {
          const text = await res.text().catch(() => "");
          throw new Error(`GraphQL query failed: ${res.status} - ${text.slice(0, 200)}`);
        }

        await res.text(); // consume body
      },
      silent: true,
    });

    results.push(result);
  }

  logger.level = "info";

  // ===================================================================
  // Professional Summary
  // ===================================================================
  console.log("\n" + "=".repeat(135));
  console.log("   📊 SVELTYCMS GRAPHQL API PERFORMANCE AUDIT");
  console.log("   High-Fidelity • Realistic Queries • IQR Trimming • 95% Confidence");
  console.log("=".repeat(135));

  console.log(
    `| ${"Query".padEnd(42)} | ${"Avg Latency".padEnd(22)} | ${"p95".padEnd(14)} | ${"RPS".padEnd(12)} | ${"RSS Δ".padEnd(12)} |`,
  );
  console.log("|" + "-".repeat(42 + 22 + 14 + 12 + 12 + 6) + "|");

  for (const r of results) {
    const rssDelta =
      r.rssDelta !== undefined ? `${r.rssDelta >= 0 ? "+" : ""}${r.rssDelta.toFixed(2)} MB` : "—";

    console.log(
      `| ${r.name.replace("GraphQL: ", "").padEnd(42)} | ` +
        `${r.avgMs.toFixed(4)} ms (±${r.marginOfError.toFixed(3)})`.padEnd(22) +
        ` | ` +
        `${r.p95Ms.toFixed(4)} ms`.padEnd(14) +
        ` | ` +
        `${Math.round(r.rps).toLocaleString()}`.padEnd(12) +
        ` | ` +
        `${rssDelta.padEnd(12)} |`,
    );
  }
  console.log("=".repeat(135));

  console.log(`\n✨ GraphQL Insights:`);
  console.log(`   • Nested relation queries (Authors → Posts) demonstrate resolver depth overhead`);
  console.log(`   • Introspection latency reflects the scale of the generated schema`);
  console.log(`   • Memory delta tracks object hydration and resolver caching impact`);

  // Export all results
  results.forEach((r) => exportResult(r));

  console.log("\n✅ GraphQL API benchmark completed.");
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("GraphQL API Performance Suite (High-Fidelity)", async () => {
    await runGraphQLBenchmark();
  }, 600000);
}
