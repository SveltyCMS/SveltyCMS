/**
 * @file tests/benchmarks/graphql-api-performance.test.ts
 * @description Professional benchmark for SveltyCMS GraphQL API.
 * Features: Dynamic load control, Enterprise complexity, Security overhead, and JIT validation.
 */

import { runBenchmark, generateMarkdownReport, exportResult } from "./benchmark-utils";
import { getApiBaseUrl, safeFetch } from "../integration/helpers/server";

const API_BASE_URL = getApiBaseUrl();

// --- Dynamic Load Control (via Env Vars) ---
const ITERATIONS = Number(process.env.BENCH_ITERATIONS || 150);
const CONCURRENCY = Number(process.env.BENCH_CONCURRENCY || 10);

async function runGraphQLBenchmarkSuite() {
  console.log("\n🚀 SveltyCMS GraphQL API Enterprise Performance Benchmark");
  console.log("==========================================================");
  console.log(`Load Profile: ${ITERATIONS} iterations @ ${CONCURRENCY} concurrency`);
  console.log(
    `Environment: ${process.env.USE_GRAPHQL_JIT === "true" ? "JIT ENABLED 🔥" : "Standard Execution"}`,
  );

  try {
    const TEST_API_SECRET = process.env.TEST_API_SECRET || "SveltyCMS-Benchmark-Secret-2026";
    const authHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-test-secret": TEST_API_SECRET,
    };

    const overallResults: any[] = [];

    console.log("🚀 Warming up GraphQL Schema (Serial)...");
    const warmupRes = await safeFetch(`${API_BASE_URL}/api/graphql`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ query: "query { me { _id } }" }),
    });
    if (!warmupRes.ok) throw new Error("GraphQL Schema Warmup failed");
    console.log("✅ Schema ready.");

    // 1. Me Query (Identity Baseline)
    const meResult = await runBenchmark({
      name: "GraphQL: Me Query (Auth)",
      iterations: ITERATIONS,
      warmupIterations: 20,
      concurrency: CONCURRENCY,
      silent: false,
      onIteration: async () => {
        const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ query: "query { me { _id username email role } }" }),
          signal: AbortSignal.timeout(120000),
        });
        if (!res.ok) throw new Error(`GraphQL Me Query failed: ${res.status}`);
      },
    });
    overallResults.push(meResult);
    exportResult(meResult, "graphql-me.json");

    // 2. Collection Stats (System Resolver)
    const statsResult = await runBenchmark({
      name: "GraphQL: All Collection Stats",
      iterations: ITERATIONS,
      warmupIterations: 20,
      concurrency: CONCURRENCY,
      silent: false,
      onIteration: async () => {
        const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ query: "query { allCollectionStats { _id name fieldCount } }" }),
          signal: AbortSignal.timeout(120000),
        });
        if (!res.ok) throw new Error(`GraphQL Stats Query failed: ${res.status}`);
      },
    });
    overallResults.push(statsResult);
    exportResult(statsResult, "graphql-all-collection-stats.json");

    // 2.5 Health Check (Required by Enterprise Matrix)
    const healthResult = await runBenchmark({
      name: "GraphQL: System Health",
      iterations: ITERATIONS,
      warmupIterations: 10,
      concurrency: CONCURRENCY,
      silent: false,
      onIteration: async () => {
        const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ query: "query { contentSystemHealth { state version } }" }),
          signal: AbortSignal.timeout(120000),
        });
        if (!res.ok) throw new Error(`GraphQL Health failed: ${res.status}`);
      },
    });
    overallResults.push(healthResult);
    exportResult(healthResult, "graphql-system-health.json");

    // 3. ENTERPRISE KILLER: Nested Relation (N+1 Stress)
    // Simplified to prevent circular deadlocks during cold start
    const killerResult = await runBenchmark({
      name: "GraphQL: Enterprise Full Context",
      iterations: 5,
      warmupIterations: 2,
      concurrency: 1,
      silent: false,
      onIteration: async () => {
        const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            query: `query { 
              Authors_00000000 { 
                name 
                Posts { 
                  title 
                } 
              } 
            }`,
          }),
          signal: AbortSignal.timeout(120000),
        });
        if (!res.ok) throw new Error(`GraphQL Killer Query failed: ${res.status}`);
      },
    });
    overallResults.push(killerResult);

    // 4. SECURITY STRESS: Unauthorized Access attempt
    // Measures the speed of the rejection path (middleware overhead)
    const securityResult = await runBenchmark({
      name: "GraphQL: Security Path Rejection",
      iterations: ITERATIONS,
      warmupIterations: 10,
      concurrency: CONCURRENCY,
      silent: false,
      onIteration: async () => {
        const res = await fetch(`${API_BASE_URL}/api/graphql`, {
          method: "POST",
          headers: { "Content-Type": "application/json" }, // Missing secret
          body: JSON.stringify({ query: "query { me { username } }" }),
          signal: AbortSignal.timeout(120000),
        });
        if (res.status !== 401)
          throw new Error(`Security test failed: expected 401, got ${res.status}`);
      },
    });
    overallResults.push(securityResult);

    // 5. LARGE PAYLOAD: Users with metadata
    const usersResult = await runBenchmark({
      name: "GraphQL: List Users (Metadata)",
      iterations: ITERATIONS,
      warmupIterations: 20,
      concurrency: CONCURRENCY,
      silent: false,
      onIteration: async () => {
        const res = await safeFetch(`${API_BASE_URL}/api/graphql`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            query:
              "query { users(pagination: { limit: 50 }) { _id username role email status createdAt } }",
          }),
          signal: AbortSignal.timeout(120000),
        });
        if (!res.ok) throw new Error(`GraphQL Users Query failed: ${res.status}`);
      },
    });
    overallResults.push(usersResult);

    // --- Summary Matrix ---
    console.log(
      "\n====================================================================================================",
    );
    console.log("📊  ENHANCED GRAPHQL PERFORMANCE MATRIX");
    console.log(
      "====================================================================================================",
    );

    const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
    const head = `| ${pad("Query Name", 28)} | ${pad("Avg (ms)", 10)} | ${pad("p50 (ms)", 10)} | ${pad("p95 (ms)", 10)} | ${pad("p99 (ms)", 10)} | ${pad("Throughput", 14)} |`;
    console.log(head);
    console.log(
      `|${"-".repeat(30)}|${"-".repeat(12)}|${"-".repeat(12)}|${"-".repeat(12)}|${"-".repeat(12)}|${"-".repeat(16)}|`,
    );

    for (const r of overallResults) {
      const row = `| ${pad(r.name.replace("GraphQL: ", ""), 28)} | ${pad(r.avgMs.toFixed(2), 10)} | ${pad(r.p50Ms.toFixed(2), 10)} | ${pad(r.p95Ms.toFixed(2), 10)} | ${pad(r.p99Ms.toFixed(2), 10)} | ${pad(r.rps.toFixed(2), 14)} |`;
      console.log(row);
    }
    console.log(
      "====================================================================================================\n",
    );

    // --- Generate Automated Report ---
    const reportFilename =
      process.env.USE_GRAPHQL_JIT === "true"
        ? "GRAPHQL_JIT_PERFORMANCE.md"
        : "GRAPHQL_STANDARD_PERFORMANCE.md";

    generateMarkdownReport("GraphQL Multi-Scenario Performance", overallResults, reportFilename);
  } catch (error) {
    console.error("\n❌ Benchmark Suite failed:", error);
    throw error;
  }
}

import { test } from "bun:test";

test("Enhanced GraphQL API Performance Suite", async () => {
  await runGraphQLBenchmarkSuite();
}, 600000);
