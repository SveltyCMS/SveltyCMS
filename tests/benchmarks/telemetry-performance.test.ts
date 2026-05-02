/**
 * @file tests/benchmarks/telemetry-performance.test.ts
 * @description Enterprise telemetry performance benchmark for SveltyCMS.
 * Measures the impact of update checks and telemetry data collection.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let stopServer: (() => Promise<void>) | null = null;

async function runTelemetryAudit() {
  console.log("🚀 Starting Enterprise Telemetry Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;

    await ensureStableTestData();
    await stabilize(1000);

    const { telemetryService } = await import("@src/services/telemetry-service");

    const originalLogLevel = logger.level;
    logger.level = "silent";

    // Mock fetch for controlled testing
    const originalFetch = global.fetch;
    global.fetch = (async () =>
      new Response(
        JSON.stringify({ status: "up-to-date", version: "1.0.0" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as any;

    try {
      const results = [];

      // Happy path
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

      // Failure path
      console.log("   → Measuring failure-path telemetry...");
      global.fetch = (async () => new Response("Error", { status: 500 })) as any;

      const errorResult = await runBenchmark({
        name: "Telemetry (Failure Path)",
        iterations: 200,
        warmupIterations: 30,
        runs: 1,
        concurrency: 1,
        measureMemory: true,
        silent: true,
        onIteration: async () => {
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
        { key: "Peak Throughput", val: Math.round(happyResult.rps || 0), unit: "req/s" },
        { key: "Memory Growth", val: (happyResult.rssDelta || 0).toFixed(1), unit: "MB" },
      ]);

      for (const r of results) exportResult(r);

    } finally {
      global.fetch = originalFetch;
      logger.level = originalLogLevel;
    }
  } catch (err: any) {
    logger.error(`Telemetry benchmark failed: ${err.message}`);
    console.error(err);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Telemetry audit completed.");
}

test("Telemetry & Update Performance Audit", async () => {
  await runTelemetryAudit();
}, 480000);
