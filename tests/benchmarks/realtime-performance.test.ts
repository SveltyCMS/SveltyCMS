/**
 * @file tests/benchmarks/realtime-performance.test.ts
 * @description Enterprise real-time benchmark for SveltyCMS.
 * Measures event bus throughput and notification dispatch latencies.
 */
import { test, beforeAll, afterAll } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  exportMetric,
  stabilize,
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

export async function runRealtimeBenchmark() {
  console.log("🚀 Starting Enterprise Real-Time Benchmark...\n");

  const { eventBus } = await import("@src/services/automation/event-bus");
  await stabilize();

  const RUNS = 3;
  const ITERATIONS = 1500;
  const WARMUP = 150;
  const concurrencyLevels = [1, 8];
  const allResults: any[] = [];

  logger.level = "silent";

  // 1. Event Dispatch (Internal bus latency)
  for (const concurrency of concurrencyLevels) {
    const result = await runBenchmark({
      name: `Event Dispatch @ ${concurrency}c`,
      iterations: ITERATIONS,
      warmupIterations: WARMUP,
      runs: RUNS,
      concurrency,
      trimOutliers: "iqr",
      measureMemory: true,
      silent: true,
      onIteration: async () => {
        // Use the proper emit method signature
        eventBus.emit("content.create" as any, {
          collection: "benchmark",
          entryId: "123",
          data: { test: true },
          tenantId: "global",
          user: { _id: "admin", username: "admin", role: "admin" } as any,
        });
      },
    });
    allResults.push(result);
  }

  logger.level = "info";

  printAuditTable({
    title: "SVELTYCMS  —  REAL-TIME ENGINE",
    subtitle: "Event Bus & Notification Throughput • 3 runs × 1 500 iters",
    results: allResults,
    shortLabel: "Realtime",
  });

  const base = allResults[0];
  const maxRps = Math.max(...allResults.map((r) => r.rps));

  printSummaryTable([
    { key: "Base Dispatch Latency", val: base.avgMs, unit: "ms" },
    { key: "p95 Dispatch Latency", val: base.p95Ms, unit: "ms" },
    { key: "Peak Event Throughput", val: Math.round(maxRps), unit: "events/s" },
    {
      key: "Bus Memory Footprint Δ",
      val: (allResults[allResults.length - 1].rssDelta || 0).toFixed(2),
      unit: "MB",
    },
  ]);

  exportMetric("internals.event_bus.avg", base.avgMs, "ms");
  exportMetric("internals.event_bus.rps", maxRps, "events/s");

  for (const r of allResults) exportResult(r);

  console.log("\n✅ Real-time benchmark completed.");
}

test("WebSocket & Realtime Latency", async () => {
  await runRealtimeBenchmark();
}, 450000);
