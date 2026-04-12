/**
 * @file tests/benchmarks/openapi-performance.test.ts
 * @description Professional benchmark for SveltyCMS OpenAPI Specification generation and caching.
 * Measures cache-hit performance vs regeneration cost after invalidation.
 */

import { test } from "bun:test";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { safeFetch } from "../integration/helpers/server";

const API_BASE_URL = process.env.API_BASE_URL || "http://127.0.0.1:4173";
const TEST_API_SECRET = process.env.TEST_API_SECRET || "enterprise-audit-2026";

const authHeaders = {
  "x-test-secret": TEST_API_SECRET,
  "x-admin-email": "admin@example.com",
};

async function stabilize() {
  if (typeof Bun !== "undefined") Bun.gc(true);
  await new Promise((r) => setTimeout(r, 25));
}

test("OpenAPI Performance Suite (Cache Hit vs Generation)", async () => {
  console.log("🚀 Starting SveltyCMS OpenAPI Performance Benchmark...\n");

  // Verify server is reachable
  const healthCheck = await safeFetch(`${API_BASE_URL}/api/openapi.json`).catch(() => null);
  if (!healthCheck?.ok) {
    throw new Error(
      `❌ Server not responding at ${API_BASE_URL}. Make sure preview/dev server is running.`,
    );
  }

  await stabilize();

  const ITER_HIT = 1200; // High iterations for fast cache hits
  const ITER_MISS = 25; // Fewer for expensive generation
  const WARMUP = 80;

  // ========================
  // 1. Cache Hit (Hot Path - Most Common Case)
  // ========================
  console.log("⚡ Measuring Cached OpenAPI Delivery (Cache Hit)...");

  const hitResult = await runBenchmark({
    name: "OpenAPI: Cache Hit (/api/openapi.json)",
    iterations: ITER_HIT,
    warmupIterations: WARMUP,
    concurrency: 8, // Moderate concurrency for realistic load
    onIteration: async () => {
      const res = await safeFetch(`${API_BASE_URL}/api/openapi.json`, {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.text(); // Consume body to simulate real usage
    },
  });

  await stabilize();

  // ========================
  // 2. Cache Miss / Generation Cost (After Invalidation)
  // ========================
  console.log("📉 Measuring OpenAPI Generation Cost (Cache Miss after invalidation)...");

  const missResult = await runBenchmark({
    name: "OpenAPI: Cache Miss + Generation",
    iterations: ITER_MISS,
    warmupIterations: 3,
    concurrency: 1, // Serial for fair generation cost measurement
    onIteration: async () => {
      // Trigger full reinitialization (invalidates cache)
      await safeFetch(`${API_BASE_URL}/api/testing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-secret": TEST_API_SECRET,
        },
        body: JSON.stringify({ action: "reinitialize" }),
      });

      // Immediately fetch — this should force regeneration
      const res = await safeFetch(`${API_BASE_URL}/api/openapi.json`, {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.text();
    },
  });

  await stabilize();

  // ========================
  // Summary & Analysis
  // ========================
  console.log("\n" + "=".repeat(90));
  console.log("📊 OPENAPI PERFORMANCE SUMMARY");
  console.log("=".repeat(90));

  console.table([
    {
      Scenario: "Cache Hit",
      "Avg (ms)": hitResult.avgMs.toFixed(4),
      "p95 (ms)": hitResult.p95Ms.toFixed(4),
      RPS: Math.round(hitResult.rps),
      Concurrency: "8",
    },
    {
      Scenario: "Generation (Miss)",
      "Avg (ms)": missResult.avgMs.toFixed(3),
      "p95 (ms)": missResult.p95Ms.toFixed(3),
      RPS: Math.round(missResult.rps),
      Concurrency: "1",
    },
  ]);

  const speedup = (missResult.avgMs / hitResult.avgMs).toFixed(1);
  console.log(`\n🚀 Cache Hit Speedup: ${speedup}x faster than generation`);
  console.log(
    `   Typical production impact: ${(hitResult.avgMs * 1000).toFixed(1)} µs per request`,
  );

  // Export results
  exportResult(hitResult, "openapi-cache-hit.json");
  exportResult(missResult, "openapi-generation-miss.json");

  console.log(`\n💾 Results exported successfully.`);
}, 600000);
