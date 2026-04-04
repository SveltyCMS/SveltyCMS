/**
 * @file tests/benchmarks/rest-api-performance.ts
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

  try {
    // 1. Initial Health Check
    console.log("📡 Checking server health...");
    const healthCheck = await safeFetch(`${API_BASE_URL}/api/system/health`);
    if (!healthCheck.ok) {
      throw new Error(
        `Server not reachable at ${API_BASE_URL}. Ensure 'bun run preview' is running.`,
      );
    }

    // Use the cookie provided by the matrix runner, or fall back to internal helper
    let authHeaders: Record<string, string> = {};
    if (process.env.AUTH_COOKIE) {
      console.log("🔑 Using external AUTH_COOKIE from matrix runner.");
      authHeaders = { Cookie: process.env.AUTH_COOKIE };
    } else {
      const { prepareAuthenticatedContext } = await import("../integration/helpers/test-setup");
      const authCookie = await prepareAuthenticatedContext();
      authHeaders = { Cookie: authCookie };
    }

    // 1. Public Health Check
    const healthResult = await runBenchmark({
      name: "REST: /api/system/health (Public)",
      iterations: ITERATIONS,
      concurrency: CONCURRENCY,
      onIteration: async () => {
        await safeFetch(`${API_BASE_URL}/api/system/health`);
      },
    });
    exportResult(healthResult);

    // 2. Authenticated Me
    const meResult = await runBenchmark({
      name: "REST: /api/user/me (Auth)",
      iterations: ITERATIONS,
      concurrency: CONCURRENCY,
      onIteration: async () => {
        await safeFetch(`${API_BASE_URL}/api/user/me`, { headers: authHeaders });
      },
    });
    exportResult(meResult);

    // 3. List Collections
    const collectionsResult = await runBenchmark({
      name: "REST: /api/collections (DB)",
      iterations: ITERATIONS,
      concurrency: CONCURRENCY,
      onIteration: async () => {
        await safeFetch(`${API_BASE_URL}/api/collections`, { headers: authHeaders });
      },
    });
    exportResult(collectionsResult);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Benchmark Suite failed:", error);
    process.exit(1);
  }
}

import { test } from "bun:test";

test("REST API Professional Performance Suite", async () => {
  await runRestBenchmarkSuite();
}, 600000);
