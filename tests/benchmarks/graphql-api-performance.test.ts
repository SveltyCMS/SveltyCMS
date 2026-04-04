/**
 * @file tests/benchmarks/graphql-api-performance.ts
 * @description Professional benchmark for SveltyCMS GraphQL API.
 * Uses benchmark-utils for p95, p99, and RPS metrics.
 */

import { runBenchmark, exportResult } from "./benchmark-utils";
import { prepareAuthenticatedContext } from "../integration/helpers/test-setup";
import { getApiBaseUrl, safeFetch } from "../integration/helpers/server";

const API_BASE_URL = getApiBaseUrl();
const ITERATIONS = 150;
const CONCURRENCY = 10;

async function runGraphQLBenchmarkSuite() {
  console.log("\n🚀 SveltyCMS GraphQL API Professional Performance Benchmark");
  console.log("==========================================================");

  try {
    const authCookie = await prepareAuthenticatedContext();
    const authHeaders = {
      "Content-Type": "application/json",
      Cookie: authCookie,
    };

    // 1. Me Query (Authenticated)
    const meResult = await runBenchmark({
      name: "GraphQL: Me Query (Auth)",
      iterations: ITERATIONS,
      concurrency: CONCURRENCY,
      onIteration: async () => {
        await safeFetch(`${API_BASE_URL}/api/graphql`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ query: "query { me { _id username email role } }" }),
        });
      },
    });
    exportResult(meResult);

    // 2. System Health (GraphQL)
    const healthResult = await runBenchmark({
      name: "GraphQL: System Health",
      iterations: ITERATIONS,
      concurrency: CONCURRENCY,
      onIteration: async () => {
        await safeFetch(`${API_BASE_URL}/api/graphql`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            query: "query { contentManagerHealth { state version collectionCount } }",
          }),
        });
      },
    });
    exportResult(healthResult);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Benchmark Suite failed:", error);
    process.exit(1);
  }
}

import { test } from "bun:test";

test("GraphQL API Professional Performance Suite", async () => {
  await runGraphQLBenchmarkSuite();
}, 600000);
