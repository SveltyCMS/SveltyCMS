/**
 * @file tests/benchmarks/openapi-performance.test.ts
 * @description Professional benchmark for SveltyCMS dynamic OpenAPI 3.1 spec generation and caching.
 */

import { test } from "bun:test";
import { runBenchmark, exportResult } from "./benchmark-utils";
import { getApiBaseUrl, safeFetch, waitForServer } from "../integration/helpers/server";

const API_BASE_URL = process.env.API_BASE_URL || getApiBaseUrl();

export async function runOpenApiBenchmark() {
  console.log("🚀 Starting SveltyCMS OpenAPI Spec Export Performance Benchmark...\n");

  await waitForServer();

  const TEST_API_SECRET = process.env.TEST_API_SECRET || "SveltyCMS-Benchmark-Secret-2026";
  const authHeaders = {
    "x-test-secret": TEST_API_SECRET,
    "x-test-mode": "true",
  };

  // 1. Cold / Fresh Generation (cache miss)
  console.log("📄 Measuring Cold OpenAPI Generation...");
  const coldResult = await runBenchmark({
    name: "OpenAPI: Cold Generation",
    iterations: 30, // Keep lower because it's expensive
    warmupIterations: 3,
    concurrency: 2,
    onIteration: async () => {
      const res = await safeFetch(`${API_BASE_URL}/api/openapi.json?force=true`, {
        headers: authHeaders,
      });
      if (!res.ok) throw new Error(`OpenAPI cold generation failed: ${res.status}`);
      await res.json();
    },
    silent: true,
  });

  // 2. Cached Hit (hot path)
  console.log("📄 Measuring Cached OpenAPI Hit...");
  const cachedResult = await runBenchmark({
    name: "OpenAPI: Cached Hit",
    iterations: 250,
    warmupIterations: 30,
    concurrency: 16,
    onIteration: async () => {
      const res = await safeFetch(`${API_BASE_URL}/api/openapi.json`, { headers: authHeaders });
      if (!res.ok) throw new Error(`OpenAPI cached request failed: ${res.status}`);
      await res.text();
    },
    silent: true,
  });

  // Summary
  console.log("\n" + "=".repeat(95));
  console.log("📄 OPENAPI SPEC PERFORMANCE SUMMARY");
  console.log("=".repeat(95));

  const table = [
    {
      Scenario: "Cold Generation",
      "Avg (ms)": coldResult.avgMs.toFixed(2),
      "p95 (ms)": coldResult.p95Ms.toFixed(2),
      RPS: Math.round(coldResult.rps),
    },
    {
      Scenario: "Cached Hit",
      "Avg (ms)": cachedResult.avgMs.toFixed(3),
      "p95 (ms)": cachedResult.p95Ms.toFixed(3),
      RPS: Math.round(cachedResult.rps),
    },
  ];

  console.table(table);
  console.log("=".repeat(95));

  console.log(`\n📊 OpenAPI cold generation overhead: ${coldResult.avgMs.toFixed(2)} ms`);
  console.log(
    `   Cached hit latency: ${cachedResult.avgMs.toFixed(3)} ms (${(coldResult.avgMs / cachedResult.avgMs).toFixed(1)}x faster)`,
  );

  exportResult(coldResult);
  exportResult(cachedResult);
}

if (!process.env.SVELTY_AUDIT_ACTIVE) {
  test("OpenAPI Export Performance Suite", async () => {
    await runOpenApiBenchmark();
  }, 600000);
}
