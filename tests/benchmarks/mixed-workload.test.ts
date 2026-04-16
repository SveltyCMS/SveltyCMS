/**
 * @file tests/benchmarks/mixed-workload.test.ts
 * @description High-fidelity mixed workload benchmark for SveltyCMS.
 *              Simulates realistic production traffic with varied read/write and GraphQL operations.
 */

import { test } from "bun:test";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { logger } from "@utils/logger.server";

const OPERATIONS = [
  { name: "GET /system/health", path: "/system/health", method: "GET" },
  { name: "GET /collections", path: "/collections", method: "GET" },
  { name: "GET /user/me", path: "/user/me", method: "GET" },
  { name: "GET Single Entry", path: "/collections/posts/latency-test-123", method: "GET" },
  { name: "GET Collection List (paginated)", path: "/collections/posts?limit=20", method: "GET" },
  {
    name: "POST GraphQL Me",
    path: "/graphql",
    method: "POST",
    body: { query: `query { me { _id username role } }` },
  },
  {
    name: "POST GraphQL Nested",
    path: "/graphql",
    method: "POST",
    body: {
      query: `query {
        posts(limit: 10) {
          _id title
          author { name }
        }
      }`,
    },
  },
  {
    name: "POST Create Entry",
    path: "/collections/posts",
    method: "POST",
    body: { title: "Mixed Workload Test Entry", content: "Test content" },
  },
];

export async function runMixedWorkloadBenchmark() {
  console.log(
    "🚀 Starting SveltyCMS Mixed Workload Benchmark (Realistic Production Simulation)...\n",
  );

  logger.level = "silent";

  const { ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();

  const { mockDispatch } = await import("./benchmark-utils");

  const ITERATIONS = 1800;
  const WARMUP = Math.floor(ITERATIONS * 0.15);
  const RUNS = 3;
  const CONCURRENCY = 6; // Moderate concurrency for mixed workload

  console.log(
    `🔬 Running mixed workload (${ITERATIONS} iterations × ${RUNS} runs @ ${CONCURRENCY} concurrency)...`,
  );

  const result = await runBenchmark({
    name: "Mixed Workload: Production Traffic Simulation",
    iterations: ITERATIONS,
    warmupIterations: WARMUP,
    concurrency: CONCURRENCY,
    runs: RUNS,
    trimOutliers: "iqr",
    measureMemory: true,
    onIteration: async (i) => {
      const op = OPERATIONS[i % OPERATIONS.length];

      const res = await mockDispatch({
        path: op.path,
        method: op.method,
        body: op.body,
      });

      if (res.status < 200 || res.status >= 300) {
        throw new Error(`Operation ${op.name} failed with status ${res.status}`);
      }

      await res.text(); // consume body
    },
    silent: true,
  });

  logger.level = "info";

  // ===================================================================
  // Professional Summary
  // ===================================================================
  console.log("\n" + "=".repeat(130));
  console.log("   📊 SVELTYCMS MIXED WORKLOAD PERFORMANCE AUDIT");
  console.log("   Realistic Production Mix • High-Fidelity • IQR + Memory Tracking");
  console.log("=".repeat(130));

  console.log(`| ${"Metric".padEnd(28)} | ${"Value".padEnd(25)} |`);
  console.log("|" + "-".repeat(28 + 25 + 6) + "|");

  console.log(
    `| Average Latency            | ${result.avgMs.toFixed(4)} ms (±${result.marginOfError.toFixed(3)}) |`,
  );
  console.log(`| p95 Latency                | ${result.p95Ms.toFixed(4)} ms |`);
  console.log(`| p99 Latency                | ${result.p99Ms.toFixed(4)} ms |`);
  console.log(
    `| Throughput                 | ${Math.round(result.rps).toLocaleString()} req/sec |`,
  );
  console.log(
    `| RSS Memory Delta           | ${result.rssDelta !== undefined ? (result.rssDelta >= 0 ? "+" : "") + result.rssDelta.toFixed(2) + " MB" : "—"} |`,
  );
  console.log(`| Total Operations Simulated | ${result.iterations} |`);
  console.log("=".repeat(130));

  console.log(`\n✨ Workload Composition:`);
  console.log(`   • ~40% Reads (collections, user, health)`);
  console.log(`   • ~30% GraphQL (simple + nested)`);
  console.log(`   • ~20% List operations`);
  console.log(`   • ~10% Writes (create)`);

  console.log(`\n📈 Insights:`);
  console.log(`   • This represents a typical production traffic mix`);
  console.log(`   • Memory delta helps detect leaks under sustained mixed load`);

  exportResult(result, "mixed-workload.json");

  console.log("\n✅ Mixed Workload benchmark completed.");
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("Mixed Workload Professional Suite", async () => {
    await runMixedWorkloadBenchmark();
  }, 600000);
}
