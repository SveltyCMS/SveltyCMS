/**
 * @file tests/benchmarks/relational-performance.test.ts
 * @description Benchmark for SveltyCMS Relational Queries and Populations.
 * Tests JOINs (GraphQL), Deep Nesting (Depth 2-3), and Relational Filtering (REST).
 */

import { runBenchmark, exportResult } from "./benchmark-utils";
import { getApiBaseUrl, safeFetch } from "../integration/helpers/server";

const API_BASE_URL = getApiBaseUrl();
const ITERATIONS = 100;
const CONCURRENCY = 5;

// Collection IDs from setup-benchmarks.ts
const POSTS_COLLECTION_ID = "00000000000000000000000000000002";

async function runRelationalBenchmarkSuite() {
  console.log("\n🚀 SveltyCMS Relational Performance Benchmark");
  console.log("=============================================");

  try {
    const TEST_API_SECRET = process.env.TEST_API_SECRET || "enterprise-audit-2026";
    const authHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-test-secret": TEST_API_SECRET,
    };

    const overallResults: any[] = [];

    // 1. GraphQL: Population (Authors -> Posts)
    const gqlPopulationResult = await runBenchmark({
      name: "Relational: GraphQL Population (Depth 1)",
      iterations: ITERATIONS,
      concurrency: CONCURRENCY,
      silent: true,
      onIteration: async () => {
        const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            query: "query { Authors { Name Posts { Title } } }",
          }),
        });
        if (!res.ok) throw new Error(`GraphQL Population failed: ${res.status}`);
      },
    });
    overallResults.push(gqlPopulationResult);
    exportResult(gqlPopulationResult, "relational-graphql-population.json");

    // 2. GraphQL: Nested Relation (Depth 2: Authors -> Posts -> Author)
    const gqlNestedResult = await runBenchmark({
      name: "Relational: GraphQL Nested (Depth 2)",
      iterations: ITERATIONS,
      concurrency: CONCURRENCY,
      silent: true,
      onIteration: async () => {
        const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            query: "query { Authors { Name Posts { Title Author { Name } } } }",
          }),
        });
        if (!res.ok) throw new Error(`GraphQL Nested failed: ${res.status}`);
      },
    });
    overallResults.push(gqlNestedResult);
    exportResult(gqlNestedResult, "relational-graphql-nested.json");

    // 3. REST: Relational Search (Filter by related field via aggregation)
    // Note: This relies on the widget's aggregation logic
    const restRelationalSearchResult = await runBenchmark({
      name: "Relational: REST Search (Aggregated Filter)",
      iterations: ITERATIONS,
      concurrency: CONCURRENCY,
      silent: true,
      onIteration: async () => {
        // Search posts where Author's name matches "Author"
        const filter = JSON.stringify({ "Author.Name": { $regex: "Author", $options: "i" } });
        const res = await safeFetch(
          `${API_BASE_URL}/api/collections/${POSTS_COLLECTION_ID}?filter=${encodeURIComponent(filter)}`,
          {
            headers: authHeaders,
          },
        );
        if (!res.ok) throw new Error(`REST Relational Search failed: ${res.status}`);
      },
    });
    overallResults.push(restRelationalSearchResult);
    exportResult(restRelationalSearchResult, "relational-rest-search.json");

    // --- Summary Matrix ---
    console.log(
      "\n====================================================================================================",
    );
    console.log("📊  RELATIONAL PERFORMANCE MATRIX (JOIN & POPULATION ANALYTICS)");
    console.log(
      "====================================================================================================",
    );

    const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
    const head = `| ${pad("Query Type", 24)} | ${pad("Avg (ms)", 10)} | ${pad("p50 (ms)", 10)} | ${pad("p95 (ms)", 10)} | ${pad("p99 (ms)", 10)} | ${pad("Throughput", 14)} |`;
    console.log(head);
    console.log(
      `|${"-".repeat(26)}|${"-".repeat(12)}|${"-".repeat(12)}|${"-".repeat(12)}|${"-".repeat(12)}|${"-".repeat(16)}|`,
    );

    for (const r of overallResults) {
      const row = `| ${pad(r.name.replace("Relational: ", ""), 24)} | ${pad(r.avgMs.toFixed(2), 10)} | ${pad(r.p50Ms.toFixed(2), 10)} | ${pad(r.p95Ms.toFixed(2), 10)} | ${pad(r.p99Ms.toFixed(2), 10)} | ${pad(r.rps.toFixed(2), 14)} |`;
      console.log(row);
    }
    console.log(
      "====================================================================================================\n",
    );
  } catch (error) {
    console.error("\n❌ Relational Benchmark Suite failed:", error);
    throw error;
  }
}

import { test } from "bun:test";

test("Relational Performance Suite", async () => {
  await runRelationalBenchmarkSuite();
}, 600000);
