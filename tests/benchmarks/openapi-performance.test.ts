/**
 * @file tests/benchmarks/openapi-performance.test.ts
 * @description Enterprise OpenAPI benchmark for SveltyCMS.
 * Measures dynamic spec generation and documentation endpoint latencies.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  printTruthTable,
  printSummaryTable,
  TEST_API_SECRET,
  getDbType,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let server: any;

async function runOpenApiAudit() {
  console.log("🚀 Starting Enterprise OpenAPI Audit...\n");

  const originalLogLevel = logger.level;
  logger.level = "silent";

  try {
    // 1. Setup Server
    server = await setupBenchmarkServer();
    const baseUrl = server.baseUrl;

    // 2. Validate Endpoint
    console.log("🔍 Validating OpenAPI endpoint...");
    const checkRes = await fetch(baseUrl + "/api/openapi.json", {
      headers: { "x-test-secret": TEST_API_SECRET },
    });
    if (checkRes.status !== 200) {
      throw new Error(`OpenAPI endpoint returned ${checkRes.status}`);
    }
    const spec = await checkRes.json();
    if (!spec.openapi) {
      throw new Error("OpenAPI response is not a valid spec");
    }
    console.log(
      `   → Spec version: ${spec.openapi} | Paths: ${Object.keys(spec.paths || {}).length}`,
    );

    const RUNS = 2;
    const ITER_COLD = 10;
    const ITER_WARM = 200;
    const WARMUP = 50;

    // 3. Cold Generation (cache miss simulation)
    const coldResult = await runBenchmark({
      name: "Cold Spec Generation",
      iterations: ITER_COLD,
      warmupIterations: 0,
      runs: 1,
      concurrency: 1,
      measureMemory: true,
      onIteration: async () => {
        const res = await fetch(baseUrl + "/api/openapi.json", {
          headers: { "x-test-secret": TEST_API_SECRET },
        });
        await res.text();
      },
      silent: true,
    });

    // 4. Warm Hit (Cached)
    const warmResult = await runBenchmark({
      name: "Warm Spec Hit (Cached)",
      iterations: ITER_WARM,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency: 8,
      trimOutliers: "iqr",
      measureMemory: true,
      onIteration: async () => {
        const res = await fetch(baseUrl + "/api/openapi.json", {
          headers: { "x-test-secret": TEST_API_SECRET },
        });
        await res.text();
      },
      silent: true,
    });

    const speedup = coldResult.avgMs / warmResult.avgMs;

    printTruthTable({
      title: "SVELTYCMS  —  OPENAPI SPEC GENERATION AUDIT",
      subtitle: `Dynamic Schema Mapping • ${getDbType().toUpperCase()} • IQR Trimmed`,
      results: [
        { ...coldResult, layer: "Cold", overheadPct: 0 },
        { ...warmResult, layer: "Cached", overheadPct: speedup },
      ],
    });

    printSummaryTable([
      { key: "Cold Generation Latency", val: coldResult.avgMs, unit: "ms" },
      { key: "Warm Cache Hit Latency", val: warmResult.avgMs, unit: "ms" },
      { key: "Cache Speedup Factor", val: speedup, unit: "x" },
      { key: "Max OpenAPI Throughput", val: Math.round(warmResult.rps), unit: "req/s" },
      { key: "Stability Rating", val: speedup > 5 ? "EXCELLENT" : "GOOD", unit: "" },
    ]);

    exportResult(warmResult);
    await server.stop();
  } finally {
    logger.level = originalLogLevel;
  }

  console.log("\n✅ OpenAPI audit completed.");
}

test("OpenAPI Enterprise Audit", async () => {
  await runOpenApiAudit();
}, 600000);
