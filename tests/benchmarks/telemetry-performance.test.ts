/**
 * @file tests/benchmarks/telemetry-performance.test.ts
 * @description Enterprise telemetry performance benchmark for SveltyCMS.
 * Measures the impact of update checks and telemetry data collection.
 */

import { test, beforeAll, afterAll, mock } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  stabilize,
  printTruthTable,
  printSummaryTable,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let originalEndpoint: string | undefined;

beforeAll(() => {
  originalEndpoint = process.env.TELEMETRY_ENDPOINT;
  process.env.TELEMETRY_ENDPOINT = "http://mock-telemetry.local/v1/update";

  // Mock $app/environment
  mock.module("$app/environment", () => ({
    browser: false,
    dev: false,
    building: false,
    version: "1.0.0-test",
  }));

  // Mock fetch globally
  global.fetch = mock(() =>
    Promise.resolve(
      new Response(JSON.stringify({ status: "up-to-date", version: "1.0.0" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  ) as any;
});

afterAll(() => {
  mock.restore();
  if (originalEndpoint) {
    process.env.TELEMETRY_ENDPOINT = originalEndpoint;
  } else {
    delete process.env.TELEMETRY_ENDPOINT;
  }
});

async function runTelemetryAudit() {
  console.log("🚀 Starting Enterprise Telemetry Audit...\n");

  const { telemetryService } = await import("@src/services/telemetry-service");
  await stabilize();

  const originalLogLevel = logger.level;
  logger.level = "silent";

  try {
    const RUNS = 1;
    const ITERATIONS = 300;
    const results: any[] = [];

    console.log("   → Measuring happy-path telemetry (200 OK)...");
    const happyResult = await runBenchmark({
      name: "Telemetry (Happy Path)",
      iterations: ITERATIONS,
      warmupIterations: 50,
      runs: RUNS,
      concurrency: 1,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        await telemetryService.checkUpdateStatus();
      },
    });
    results.push({ ...happyResult, layer: "Telemetry" });

    // Simulate Failure Path
    console.log("   → Measuring failure-path telemetry (500 Error)...");
    (global.fetch as any).mockImplementation(() =>
      Promise.resolve(new Response("Error", { status: 500 })),
    );

    const errorResult = await runBenchmark({
      name: "Telemetry (Failure Path)",
      iterations: 100,
      warmupIterations: 10,
      runs: 1,
      concurrency: 1,
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        await telemetryService.checkUpdateStatus().catch(() => {});
      },
    });
    results.push({ ...errorResult, layer: "Telemetry" });

    printTruthTable({
      title: "SVELTYCMS  —  TELEMETRY & UPDATE PERFORMANCE",
      subtitle: "Update Check Overhead • JSON Payload Gen • Mocked Transport",
      results,
    });

    printSummaryTable([
      { key: "Telemetry Latency (Happy)", val: happyResult.avgMs, unit: "ms" },
      { key: "Telemetry Latency (Error)", val: errorResult.avgMs, unit: "ms" },
      { key: "Max RPS", val: Math.round(happyResult.rps), unit: "req/s" },
      { key: "Memory RSS Δ", val: (happyResult.rssDelta || 0).toFixed(2), unit: "MB" },
    ]);

    for (const r of results) exportResult(r);
  } finally {
    logger.level = originalLogLevel;
  }

  console.log("\n✅ Telemetry audit completed.");
}

test("Telemetry & Update Performance Audit", async () => {
  await runTelemetryAudit();
}, 450000);
