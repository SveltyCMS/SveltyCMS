/**
 * @file tests/benchmarks/realtime-performance.test.ts
 * @description Enterprise real-time benchmark for SveltyCMS.
 * Measures event bus delivery latency and listener processing overhead.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  runBenchmark,
  exportResult,
  stabilize,
  printTruthTable,
  printSummaryTable,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

export async function runRealtimeAudit() {
  console.log("🚀 Starting Enterprise Real-Time Audit...\n");

  const { eventBus } = await import("@src/services/automation/event-bus");
  await stabilize();

  const originalLogLevel = logger.level;
  logger.level = "silent";

  try {
    const RUNS = 2;
    const ITERATIONS = 1000;
    const WARMUP = 100;
    const LISTENER_COUNTS = [1, 10, 50];
    const results: any[] = [];

    for (const count of LISTENER_COUNTS) {
      console.log(`   → Measuring delivery with ${count} active listeners...`);
      eventBus.clear();

      let receivedCount = 0;
      let resolveBatch: (() => void) | null = null;

      // Register listeners that track receipt
      for (let i = 0; i < count; i++) {
        eventBus.on("content.create" as any, () => {
          receivedCount++;
          if (receivedCount === count && resolveBatch) {
            resolveBatch();
          }
        });
      }

      const stats = await runBenchmark({
        name: `${count} Listeners (E2E)`,
        iterations: ITERATIONS,
        warmupIterations: WARMUP,
        runs: RUNS,
        concurrency: 4,
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          receivedCount = 0;
          const p = new Promise<void>((resolve) => {
            resolveBatch = resolve;
          });

          eventBus.emit("content.create" as any, {
            collection: "benchmark",
            entryId: "123",
            data: { test: true },
            tenantId: "global",
            user: { _id: "admin", username: "admin", role: "admin" } as any,
          });

          await p;
        },
      });

      results.push({ ...stats, layer: `${count} Listeners` });
    }

    const baseline = results[0];
    const heavy = results[results.length - 1];
    const overheadPerListener =
      (heavy.avgMs - baseline.avgMs) / (LISTENER_COUNTS[LISTENER_COUNTS.length - 1] - 1);

    printTruthTable({
      title: "SVELTYCMS  —  REAL-TIME EVENT BUS AUDIT",
      subtitle: `End-to-End Delivery Latency • ${ITERATIONS} Iterations • IQR Trimmed`,
      results,
    });

    printSummaryTable([
      { key: "Single Delivery Latency", val: baseline.avgMs, unit: "ms" },
      { key: "Heavy Delivery Latency (50L)", val: heavy.avgMs, unit: "ms" },
      { key: "Overhead per Listener", val: overheadPerListener, unit: "ms" },
      { key: "Peak Event Throughput", val: Math.round(baseline.rps), unit: "events/s" },
      {
        key: "Bus Efficiency Rating",
        val: overheadPerListener < 0.01 ? "EXCELLENT" : "STABLE",
        unit: "",
      },
    ]);

    exportResult(heavy);
    eventBus.clear();
  } finally {
    logger.level = originalLogLevel;
  }

  console.log("\n✅ Real-time audit completed.");
}

test("Event Bus & Real-Time Delivery", async () => {
  await runRealtimeAudit();
}, 600000);
