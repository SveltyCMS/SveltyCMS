/**
 * @file tests/benchmarks/openapi-performance.test.ts
 * @description Professional benchmark for SveltyCMS OpenAPI Specification.
 * Verifies caching speed and generation overhead.
 */

import { runBenchmark, exportResult } from "./benchmark-utils";
import { safeFetch } from "../integration/helpers/server";

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:4173";
const ITERATIONS = 100;
const CONCURRENCY = 5;

async function runOpenApiBenchmarkSuite() {
  console.log("\n🚀 SveltyCMS OpenAPI Performance Benchmark");
  console.log("==========================================");

  const TEST_API_SECRET = process.env.TEST_API_SECRET || "enterprise-audit-2026";
  const authHeaders = {
    "x-test-secret": TEST_API_SECRET,
    "x-admin-email": "admin@example.com",
  };

  const overallResults: any[] = [];

  // 1. Authenticated OpenAPI JSON (Cached)
  // We expect 100% cache hits here because runBenchmark performs warmup
  const openApiResult = await runBenchmark({
    name: "REST: /api/openapi.json (Auth Cache Hit)",
    iterations: ITERATIONS,
    concurrency: CONCURRENCY,
    silent: false,
    onIteration: async () => {
      const res = await safeFetch(`${API_BASE_URL}/api/openapi.json`, { headers: authHeaders });
      if (!res.ok) throw new Error(`OpenAPI fetch failed: ${res.status}`);
    },
  });
  overallResults.push(openApiResult);
  exportResult(openApiResult, "rest-openapi-hit.json");

  // 2. OpenAPI JSON after Invalidation (Generation Cost)
  // Note: Measuring generation cost requires a single iteration after reset
  console.log("\n🧪 Measuring OpenAPI Generation Cost (Cache Miss)...");

  // Invalidate
  await safeFetch(`${API_BASE_URL}/api/testing`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-secret": TEST_API_SECRET },
    body: JSON.stringify({ action: "reinitialize" }),
  });

  const missResult = await runBenchmark({
    name: "REST: /api/openapi.json (Cache Miss/Gen)",
    iterations: 1, // Only measure the first one
    warmupIterations: 0,
    silent: false,
    onIteration: async () => {
      await safeFetch(`${API_BASE_URL}/api/openapi.json`, { headers: authHeaders });
    },
  });
  overallResults.push(missResult);
  exportResult(missResult, "rest-openapi-miss.json");

  console.log("\n✅ OpenAPI Benchmark Complete.");
}

import { test } from "bun:test";

test("OpenAPI Performance Suite", async () => {
  await runOpenApiBenchmarkSuite();
}, 600000);
