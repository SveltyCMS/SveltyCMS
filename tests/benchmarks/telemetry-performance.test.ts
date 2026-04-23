/**
 * @file tests/benchmarks/telemetry-performance.test.ts
 * @description Enterprise telemetry benchmark for SveltyCMS.
 */
import { test, beforeAll, mock } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
  printAuditTable,
  printSummaryTable,
} from "./benchmark-utils";

// Mock SvelteKit modules to prevent leaks in benchmark environment
mock.module("$app/environment", () => ({
  building: false,
  dev: false,
}));

beforeAll(() => {
  // Mock global fetch for telemetry endpoints
  (global as any).fetch = mock(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          latest_version: "1.0.0",
          has_vulnerability: false,
        }),
        { status: 200 },
      ),
    ),
  );
  process.env.TELEMETRY_ENDPOINT = "http://mock-telemetry.example.com";
});

export async function runTelemetryBenchmark() {
  console.log("🚀 Starting Enterprise Telemetry Benchmark...\n");

  const { telemetryService } = await import("@src/services/telemetry-service");
  await stabilize();

  const ITERATIONS = 1000;
  const RUNS = 3;

  const result = await runBenchmark({
    name: "Telemetry Payload Generation",
    iterations: ITERATIONS,
    warmupIterations: 50,
    runs: RUNS,
    concurrency: 1,
    measureMemory: true,
    silent: true,
    onIteration: async () => {
      await telemetryService.checkUpdateStatus();
    },
  });

  printAuditTable({
    title: "SVELTYCMS  —  TELEMETRY SYSTEM",
    subtitle: "Payload Generation • Signing • Update Checks",
    results: [result],
  });

  printSummaryTable([
    { key: "Payload Generation Latency", val: result.avgMs, unit: "ms" },
    { key: "p95 Generation Latency", val: result.p95Ms, unit: "ms" },
    { key: "Peak Generation RPS", val: Math.round(result.rps), unit: "req/s" },
    { key: "Telemetry Memory Δ", val: (result.rssDelta || 0).toFixed(2), unit: "MB" },
  ]);

  exportMetric("telemetry.payload_gen.avg", result.avgMs, "ms");
  exportResult(result);

  console.log("\n✅ Telemetry benchmark completed.");
}

test("Telemetry Service Performance", async () => {
  await runTelemetryBenchmark();
}, 60000);
