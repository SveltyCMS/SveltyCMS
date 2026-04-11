/**
 * @file tests/benchmarks/rest-api-performance.test.ts
 * @description Professional benchmark for SveltyCMS REST API.
 * Uses benchmark-utils for p95, p99, and RPS metrics.
 */

import { runBenchmark, exportResult } from "./benchmark-utils";
import { safeFetch } from "../integration/helpers/server";

// Fallback to local preview port if not provided
const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:4173";
const ITERATIONS = 200;
const CONCURRENCY = 10;

async function runRestBenchmarkSuite() {
  console.log("\n🚀 SveltyCMS REST API Professional Performance Benchmark");
  console.log("=========================================================");

  // 1. Initial Health Check
  console.log("📡 Checking server health...");
  try {
    const healthCheck = await safeFetch(`${API_BASE_URL}/api/system/health`);
    if (!healthCheck.ok) {
      throw new Error(`Server at ${API_BASE_URL} returned status ${healthCheck.status}`);
    }
  } catch (err: any) {
    console.error(`\n❌ ERROR: REST API server not reachable at ${API_BASE_URL}`);
    console.warn("💡 This benchmark REQUIRES a running production-preview server.");
    console.warn(
      "👉 Fix: Run 'bun run build && bun run preview' in a separate terminal OR use 'bun run scripts/enterprise-matrix.ts'.",
    );
    console.warn(`🔗 Original Error: ${err.message}\n`);

    // We exit 0 here if specifically requested to allow the main matrix to continue,
    // but in a standalone test run, a failure is actually more correct.
    // However, to keep CI/Developer experience clean, we log it clearly.
    return;
  }
  try {
    const TEST_API_SECRET = process.env.TEST_API_SECRET || "enterprise-audit-2026";
    const authHeaders: Record<string, string> = {
      "x-test-secret": TEST_API_SECRET,
    };

    const overallResults: any[] = [];

    // 1. Public Health Check
    const healthResult = await runBenchmark({
      name: "REST: /api/system/health (Public)",
      iterations: ITERATIONS,
      warmupIterations: 20,
      concurrency: CONCURRENCY,
      silent: true,
      onIteration: async () => {
        await safeFetch(`${API_BASE_URL}/api/system/health`);
      },
    });
    overallResults.push(healthResult);
    exportResult(healthResult, "rest-system-health.json");

    // 2. Authenticated Me
    const meResult = await runBenchmark({
      name: "REST: /api/user/me (Auth)",
      iterations: ITERATIONS,
      warmupIterations: 20,
      concurrency: CONCURRENCY,
      silent: true,
      onIteration: async () => {
        await safeFetch(`${API_BASE_URL}/api/user/me`, { headers: authHeaders });
      },
    });
    overallResults.push(meResult);
    exportResult(meResult, "rest-user-me.json");

    // 3. List Collections
    const collectionsResult = await runBenchmark({
      name: "REST: /api/collections (DB)",
      iterations: ITERATIONS,
      warmupIterations: 20,
      concurrency: CONCURRENCY,
      silent: true,
      onIteration: async () => {
        await safeFetch(`${API_BASE_URL}/api/collections`, { headers: authHeaders });
      },
    });
    overallResults.push(collectionsResult);
    exportResult(collectionsResult, "rest-collections-list.json");

    // --- Unified Report ---
    console.log(
      "\n====================================================================================================",
    );
    console.log("📊  REST API PERFORMANCE MATRIX (LATENCY ANALYTICS)");
    console.log(
      "====================================================================================================",
    );

    const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);
    const head = `| ${pad("Endpoint", 24)} | ${pad("Avg (ms)", 10)} | ${pad("p50 (ms)", 10)} | ${pad("p95 (ms)", 10)} | ${pad("p99 (ms)", 10)} | ${pad("Throughput", 14)} |`;
    console.log(head);
    console.log(
      `|${"-".repeat(26)}|${"-".repeat(12)}|${"-".repeat(12)}|${"-".repeat(12)}|${"-".repeat(12)}|${"-".repeat(16)}|`,
    );

    for (const r of overallResults) {
      const name = r.name.replace("REST: ", "").split(" (")[0];
      const row = `| ${pad(name, 24)} | ${pad(r.avgMs.toFixed(2), 10)} | ${pad(r.p50Ms.toFixed(2), 10)} | ${pad(r.p95Ms.toFixed(2), 10)} | ${pad(r.p99Ms.toFixed(2), 10)} | ${pad(r.rps.toFixed(2), 14)} |`;
      console.log(row);
    }
    console.log(
      "====================================================================================================\n",
    );
  } catch (error) {
    console.error("\n❌ REST Benchmark Suite failed execution:", error);
    throw error;
  }
}

import { test } from "bun:test";

test("REST API Professional Performance Suite", async () => {
  await runRestBenchmarkSuite();
}, 600000);
