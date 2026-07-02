/**
 * @file tests/benchmarks/telemetry-performance.test.ts
 * @description Telemetry & Update Check Performance Benchmark (Optimized)
 * @summary Measures telemetry update check latency and memory impact on both happy-path and failure-path scenarios.
 *
 * ### Features:
 * - Happy-path telemetry update check latency and throughput
 * - Failure-path error handling overhead with mocked 500 responses
 * - Memory growth (RSS delta) measurement during telemetry collection
 */

import {
  test,
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";

let stopServer: (() => Promise<void>) | null = null;

async function runTelemetryAudit() {
  console.log("🚀 Starting Enterprise Telemetry Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;

    await ensureStableTestData();
    await stabilize(1000);

    const { telemetryService } = await import("@src/services/observability/telemetry-service");

    const originalFetch = global.fetch;

    // Pre-allocate structural components outside hot loops to eliminate V8 GC interference
    const happyResponseBody = JSON.stringify({
      status: "up-to-date",
      version: "1.0.0",
    });
    const happyResponseHeaders = { "Content-Type": "application/json" };

    const staticHappyResponse = new Response(happyResponseBody, {
      status: 200,
      headers: happyResponseHeaders,
    });

    const staticErrorResponse = new Response("Error", { status: 500 });

    // Establish allocation-free mock interceptors using pre-generated response graphs
    global.fetch = (async () => staticHappyResponse.clone()) as any;

    try {
      const results = [];

      // 1. Happy path evaluation
      console.log("   → Measuring happy-path telemetry...");
      const happyResult = await runBenchmark({
        name: "Telemetry (Happy Path)",
        iterations: 600,
        warmupIterations: 80,
        runs: 2,
        concurrency: 1,
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          await telemetryService.checkUpdateStatus();
        },
      });
      results.push({ ...happyResult, shortLabel: "Happy", layer: "Telemetry" });

      // 2. Failure path evaluation
      console.log("   → Measuring failure-path telemetry...");
      global.fetch = (async () => staticErrorResponse.clone()) as any;

      const errorResult = await runBenchmark({
        name: "Telemetry (Failure Path)",
        iterations: 200,
        warmupIterations: 30,
        runs: 1,
        concurrency: 1,
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          // Suppress errors consistently to record processing overhead only
          await telemetryService.checkUpdateStatus().catch(() => {});
        },
      });
      results.push({ ...errorResult, shortLabel: "Error", layer: "Telemetry" });

      printTruthTable({
        title: "SVELTYCMS — TELEMETRY & UPDATE PERFORMANCE",
        shortLabel: "Telemetry",
        subtitle: `Update Check • JSON Processing • ${getDbType().toUpperCase()}`,
        results,
      });

      printSummaryTable([
        { key: "Happy Path Latency", val: happyResult.avgMs, unit: "ms" },
        { key: "Error Path Latency", val: errorResult.avgMs, unit: "ms" },
        {
          key: "Peak Throughput",
          val: Math.round(happyResult.rps || 0),
          unit: "req/s",
        },
        {
          key: "Memory Growth",
          val: (happyResult.rssDelta || 0).toFixed(1),
          unit: "MB",
        },
      ]);

      for (const r of results) exportResult(r);
    } finally {
      global.fetch = originalFetch;
    }
  } catch (err: any) {
    logger.error(`Telemetry benchmark failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

test("Telemetry & Update Performance Audit", async () => {
  await runTelemetryAudit();
}, 480000);
