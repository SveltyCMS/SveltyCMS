/**
 * @file tests/benchmarks/openapi-performance.test.ts
 * @description Enterprise OpenAPI benchmark for SveltyCMS.
 * Measures dynamic spec generation and documentation endpoint latencies.
 */
import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
  mockDispatch,
  setupBenchmarkServer,
  printAuditTable,
  printSummaryTable,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let stopServer: () => Promise<void>;

beforeAll(async () => {
  const { stop } = await setupBenchmarkServer();
  stopServer = stop;
});

afterAll(async () => {
  if (stopServer) await stopServer();
});

export async function runOpenApiBenchmark() {
  console.log("🚀 Starting Enterprise OpenAPI Benchmark...\n");

  await stabilize();

  const RUNS = 3;
  const ITER_COLD = 10;
  const ITER_WARM = 200;
  const WARMUP = 50;

  logger.level = "silent";

  // 1. Cold Generation (cache miss simulation)
  // We don't have an easy way to clear just openapi cache without internal access,
  // but we can measure the first few hits.
  const coldResult = await runBenchmark({
    name: "OpenAPI: Cold Generation",
    iterations: ITER_COLD,
    warmupIterations: 0,
    runs: 1,
    concurrency: 1,
    measureMemory: true,
    onIteration: async () => {
      const res = await mockDispatch({ path: "/api/openapi.json" });
      await res.text();
    },
    silent: true,
  });

  await stabilize();

  // 2. Warm Hit (Cached)
  const warmResult = await runBenchmark({
    name: "OpenAPI: Warm Hit (Cached)",
    iterations: ITER_WARM,
    warmupIterations: WARMUP,
    runs: RUNS,
    concurrency: 8,
    trimOutliers: "iqr",
    measureMemory: true,
    onIteration: async () => {
      const res = await mockDispatch({ path: "/api/openapi.json" });
      await res.text();
    },
    silent: true,
  });

  logger.level = "info";

  const speedup = coldResult.avgMs / warmResult.avgMs;

  printAuditTable({
    title: "SVELTYCMS  —  OPENAPI SPEC GENERATION",
    subtitle: "Cold vs Warm Cache • Dynamic Schema Conversion • IQR Trimmed",
    results: [coldResult, warmResult],
  });

  printSummaryTable([
    { key: "Cold Generation Latency", val: coldResult.avgMs, unit: "ms" },
    { key: "Warm Cache Hit Latency", val: warmResult.avgMs, unit: "ms" },
    { key: "Cache Speedup Factor", val: speedup, unit: "x" },
    { key: "Max OpenAPI Throughput", val: Math.round(warmResult.rps), unit: "req/s" },
    { key: "Generation RSS Footprint", val: (coldResult.rssDelta || 0).toFixed(2), unit: "MB" },
  ]);

  exportMetric("api.openapi.cold.avg", coldResult.avgMs, "ms");
  exportMetric("api.openapi.warm.avg", warmResult.avgMs, "ms");
  exportMetric("api.openapi.rps", warmResult.rps, "req/s");

  exportResult(coldResult);
  exportResult(warmResult);

  console.log("\n✅ OpenAPI benchmark completed.");
}

test("OpenAPI Specification Performance", async () => {
  await runOpenApiBenchmark();
}, 400000);
