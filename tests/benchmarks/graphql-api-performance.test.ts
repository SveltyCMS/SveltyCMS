/**
 * @file tests/benchmarks/graphql-api-performance.ts
 * @description Professional benchmark for SveltyCMS GraphQL API.
 * Uses benchmark-utils for p95, p99, and RPS metrics.
 */

import { runBenchmark, exportResult } from "./benchmark-utils";
import { getApiBaseUrl, safeFetch } from "../integration/helpers/server";

const API_BASE_URL = getApiBaseUrl();
const ITERATIONS = 150;
const CONCURRENCY = 10;

async function runGraphQLBenchmarkSuite() {
  console.log("\n🚀 SveltyCMS GraphQL API Professional Performance Benchmark");
  console.log("==========================================================");

  try {
    const TEST_API_SECRET = process.env.TEST_API_SECRET || "enterprise-audit-2026";
    const authHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-test-secret": TEST_API_SECRET,
    };

    const overallResults: any[] = [];

    console.log("🚀 SveltyCMS GraphQL API Performance Matrix Initializing...");

    // 1. Me Query (Authenticated)
    const meResult = await runBenchmark({
      name: "GraphQL: Me Query (Auth)",
      iterations: ITERATIONS,
      warmupIterations: 20,
      concurrency: CONCURRENCY,
      silent: true,
      onIteration: async () => {
        const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ query: "query { me { _id username email role } }" }),
        });
        if (!res.ok) throw new Error(`GraphQL Me Query failed: ${res.status}`);
      },
    });
    overallResults.push(meResult);
    exportResult(meResult, "graphql-me.json");

    // 2. System Health (GraphQL)
    const healthResult = await runBenchmark({
      name: "GraphQL: System Health",
      iterations: ITERATIONS,
      warmupIterations: 20,
      concurrency: CONCURRENCY,
      silent: true,
      onIteration: async () => {
        const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            query: "query { contentSystemHealth { state version collectionCount } }",
          }),
        });
        if (!res.ok) throw new Error(`GraphQL Health Query failed: ${res.status}`);
      },
    });
    overallResults.push(healthResult);
    exportResult(healthResult, "graphql-system-health.json");

    // 3. Collection Stats (System Resolver)
    const statsResult = await runBenchmark({
      name: "GraphQL: All Collection Stats",
      iterations: ITERATIONS,
      warmupIterations: 20,
      concurrency: CONCURRENCY,
      silent: true,
      onIteration: async () => {
        const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ query: "query { allCollectionStats { _id name fieldCount } }" }),
        });
        if (!res.ok) throw new Error(`GraphQL Stats Query failed: ${res.status}`);
      },
    });
    overallResults.push(statsResult);
    exportResult(statsResult, "graphql-collection-stats.json");

    // 4. List Users (Users Resolver)
    const usersResult = await runBenchmark({
      name: "GraphQL: List Users",
      iterations: ITERATIONS,
      warmupIterations: 20,
      concurrency: CONCURRENCY,
      silent: true,
      onIteration: async () => {
        const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            query: "query { users(pagination: { limit: 5 }) { _id username role } }",
          }),
        });
        if (!res.ok) throw new Error(`GraphQL Users Query failed: ${res.status}`);
      },
    });
    overallResults.push(usersResult);
    exportResult(usersResult, "graphql-list-users.json");

    // 5. Media List (Media Resolver)
    const mediaResult = await runBenchmark({
      name: "GraphQL: Media Images",
      iterations: ITERATIONS,
      warmupIterations: 20,
      concurrency: CONCURRENCY,
      silent: true,
      onIteration: async () => {
        const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            query: "query { mediaImages(pagination: { limit: 10 }) { _id url } }",
          }),
        });
        if (!res.ok) throw new Error(`GraphQL Media Query failed: ${res.status}`);
      },
    });
    overallResults.push(mediaResult);
    exportResult(mediaResult, "graphql-media-images.json");

    // 6. Nested Relation (N+1 Stress - Detailed)
    const nestedResult = await runBenchmark({
      name: "GraphQL: Nested Relation",
      iterations: 50,
      warmupIterations: 10,
      concurrency: 5,
      silent: true,
      onIteration: async () => {
        const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            query: `query { 
              Authors { 
                Name 
                Posts { 
                  Title 
                  Author { Name } 
                } 
              } 
            }`,
          }),
        });
        if (!res.ok) throw new Error(`GraphQL Nested Query failed: ${res.status}`);
      },
    });
    overallResults.push(nestedResult);
    exportResult(nestedResult, "graphql-nested-relation.json");

    // --- Summary Matrix ---
    console.log(
      "\n====================================================================================================",
    );
    console.log("📊  GRAPHQL RESOLVER PERFORMANCE MATRIX (BOTTLENECK ANALYSIS)");
    console.log(
      "====================================================================================================",
    );

    const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
    const head = `| ${pad("Query Name", 24)} | ${pad("Avg (ms)", 10)} | ${pad("p50 (ms)", 10)} | ${pad("p95 (ms)", 10)} | ${pad("p99 (ms)", 10)} | ${pad("Throughput", 14)} |`;
    console.log(head);
    console.log(
      `|${"-".repeat(26)}|${"-".repeat(12)}|${"-".repeat(12)}|${"-".repeat(12)}|${"-".repeat(12)}|${"-".repeat(16)}|`,
    );

    for (const r of overallResults) {
      const row = `| ${pad(r.name.replace("GraphQL: ", ""), 24)} | ${pad(r.avgMs.toFixed(2), 10)} | ${pad(r.p50Ms.toFixed(2), 10)} | ${pad(r.p95Ms.toFixed(2), 10)} | ${pad(r.p99Ms.toFixed(2), 10)} | ${pad(r.rps.toFixed(2), 14)} |`;
      console.log(row);
    }
    console.log(
      "====================================================================================================\n",
    );
  } catch (error) {
    console.error("\n❌ Benchmark Suite failed:", error);
    throw error;
  }
}

import { test } from "bun:test";

test("GraphQL API Professional Performance Suite", async () => {
  await runGraphQLBenchmarkSuite();
}, 600000);
