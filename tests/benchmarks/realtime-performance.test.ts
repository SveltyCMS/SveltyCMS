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
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

let stopServer: (() => Promise<void>) | null = null;

export async function runRealtimeAudit() {
  console.log("🚀 Starting Enterprise Real-Time Audit...\n");

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;

    await ensureStableTestData();
    await stabilize(1000);

    const { eventBus } = await import("@src/services/automation/event-bus");

    const LISTENER_COUNTS = [1, 10, 50];
    const results = [];

    for (const listenerCount of LISTENER_COUNTS) {
      console.log(`   → Testing with ${listenerCount} listeners...`);

      // Clear previous listeners
      eventBus.clear();

      let received = 0;
      const listeners: any[] = [];

      // Register listeners
      for (let i = 0; i < listenerCount; i++) {
        const listener = () => { received++; };
        eventBus.on("content.create" as any, listener);
        listeners.push(listener);
      }

      const result = await runBenchmark({
        name: `${listenerCount} Listeners`,
        iterations: 800,
        warmupIterations: 80,
        runs: 2,
        concurrency: 1, // Event bus is typically single-threaded
        trimOutliers: "iqr",
        measureMemory: true,
        silent: true,
        onIteration: async () => {
          received = 0;

          eventBus.emit("content.create" as any, {
            collection: "benchmark",
            entryId: "realtime-test",
            tenantId: "global",
          });

          // Wait for all listeners to fire
          let attempts = 0;
          while (received < listenerCount && attempts < 100) {
            await new Promise(r => setTimeout(r, 1));
            attempts++;
          }

          if (received < listenerCount) {
            throw new Error(`Not all listeners fired (${received}/${listenerCount})`);
          }
        },
      });

      results.push({
        ...result,
        shortLabel: `${listenerCount}L`,
        layer: "Event Bus",
      });
    }

    const baseline = results[0];
    const heavy = results[results.length - 1];
    const lastCount = LISTENER_COUNTS[LISTENER_COUNTS.length - 1];
    const overheadPerListener = (heavy.avgMs - baseline.avgMs) / (lastCount - 1);

    printTruthTable({
      title: "SVELTYCMS — REAL-TIME EVENT BUS AUDIT",
      shortLabel: "Realtime",
      subtitle: `Delivery Latency • Listener Scaling • ${getDbType().toUpperCase()}`,
      results,
    });

    printSummaryTable([
      { key: "Single Listener", val: baseline.avgMs, unit: "ms" },
      { key: "50 Listeners", val: heavy.avgMs, unit: "ms" },
      { key: "Overhead / Listener", val: overheadPerListener.toFixed(3), unit: "ms" },
      { key: "Peak Throughput", val: Math.round(baseline.rps || 0), unit: "events/s" },
      { key: "Rating", val: heavy.avgMs < 2 ? "EXCELLENT" : heavy.avgMs < 5 ? "GOOD" : "DEGRADED", unit: "" },
    ]);

    exportResult(heavy);

  } catch (err: any) {
    logger.error(`Real-time benchmark failed: ${err.message}`);
    console.error(err);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Real-time audit completed.");
}

test("Event Bus & Real-Time Delivery", async () => {
  await runRealtimeAudit();
}, 480000);
