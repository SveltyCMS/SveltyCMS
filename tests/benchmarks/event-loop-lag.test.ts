/**
 * @file tests/benchmarks/event-loop-lag.test.ts
 * @description Event Loop Lag & Microtask Queue Saturation Benchmark (Optimized)
 * @summary Measures event loop delay (p50, p95, p99, max) and microtask drain speed under concurrent write bursts.
 */

import {
  test,
  setupBenchmarkServer,
  ensureStableTestData,
  exportMetric,
  printTruthTable,
  printSummaryTable,
  getDbType,
  benchmarkAuthHeaders,
  stabilize,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";
import { monitorEventLoopDelay } from "node:perf_hooks";
import crypto from "node:crypto";

const BURST_COUNT = 200;
const CONCURRENT_WORKERS = 16;
const HISTOGRAM_RESOLUTION_MS = 5;

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

test("Event Loop Lag & Microtask Saturation Benchmark", async () => {
  logger.info("🚀 Starting Event Loop Lag & Microtask Saturation Benchmark...");

  let stopServer: (() => Promise<void>) | null = null;

  try {
    const serverInfo = await setupBenchmarkServer();
    stopServer = serverInfo.stop;
    const baseUrl = serverInfo.baseUrl;

    await ensureStableTestData();
    await stabilize(300);

    const headers: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
      connection: "keep-alive",
    };
    const dbType = getDbType();
    const endpoint = `${baseUrl}/api/collections/BenchmarkStable`;

    // ── 1. MEASURE IDLE BASELINE EVENT LOOP DELAY ───────────────────────────
    forceGarbageCollection();
    const idleHistogram = monitorEventLoopDelay({ resolution: HISTOGRAM_RESOLUTION_MS });
    idleHistogram.enable();

    // Sample idle loop delay across 1,000ms window
    await new Promise((resolve) => setTimeout(resolve, 1000));
    idleHistogram.disable();

    const idleP50 = idleHistogram.percentile(50) / 1_000_000;
    const idleP95 = idleHistogram.percentile(95) / 1_000_000;
    const idleP99 = idleHistogram.percentile(99) / 1_000_000;
    const idleMax = idleHistogram.max / 1_000_000;
    const idleMean = idleHistogram.mean / 1_000_000;

    logger.info(
      `   [Baseline] Idle Lag: mean=${idleMean.toFixed(2)}ms, p50=${idleP50.toFixed(2)}ms, p95=${idleP95.toFixed(2)}ms, max=${idleMax.toFixed(2)}ms`,
    );

    // ── 2. PRE-COMPUTE WRITE BURST PAYLOADS ─────────────────────────────────
    const runId = crypto.randomUUID().slice(0, 8);
    const payloads = Array.from({ length: BURST_COUNT }, (_, i) =>
      JSON.stringify({
        title: `Burst Item ${i} ${runId}`,
        slug: `burst-${runId}-${i}`,
        content: "Burst write payload testing event loop saturation and microtask drain speed",
        views: i,
      }),
    );

    // ── 3. MEASURE EVENT LOOP DELAY UNDER SATURATED PARALLEL LOAD ───────────
    forceGarbageCollection();
    await stabilize(100);

    const writeHistogram = monitorEventLoopDelay({ resolution: HISTOGRAM_RESOLUTION_MS });
    writeHistogram.enable();

    let writeCursor = 0;
    let successfulWrites = 0;
    const t0 = performance.now();

    // Sliding window parallel worker queue to saturate event loop / network channels
    const workers = Array.from({ length: CONCURRENT_WORKERS }, async () => {
      while (true) {
        const idx = writeCursor++;
        if (idx >= BURST_COUNT) break;

        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers,
            body: payloads[idx],
            signal: AbortSignal.timeout(15000),
          });

          await res.arrayBuffer().catch(() => {});
          if (res.ok) successfulWrites++;
        } catch {
          // Tracked in success rate
        }
      }
    });

    await Promise.all(workers);
    const elapsed = performance.now() - t0;
    writeHistogram.disable();

    // ── 4. STATISTICAL EVALUATION ───────────────────────────────────────────
    const writeP50 = writeHistogram.percentile(50) / 1_000_000;
    const writeP95 = writeHistogram.percentile(95) / 1_000_000;
    const writeP99 = writeHistogram.percentile(99) / 1_000_000;
    const writeMax = writeHistogram.max / 1_000_000;
    const writeMean = writeHistogram.mean / 1_000_000;
    const throughput = (successfulWrites / (elapsed / 1000)).toFixed(1);

    logger.info(
      `   [Write Burst] ${successfulWrites}/${BURST_COUNT} writes in ${elapsed.toFixed(1)}ms (${throughput} docs/s):`,
    );
    logger.info(
      `   [Write Burst Lag] mean=${writeMean.toFixed(2)}ms, p50=${writeP50.toFixed(2)}ms, p95=${writeP95.toFixed(2)}ms, p99=${writeP99.toFixed(2)}ms, max=${writeMax.toFixed(2)}ms`,
    );

    const results = [
      {
        name: "Idle Baseline Lag",
        avgLatency: idleMean,
        p50Latency: idleP50,
        p95Latency: idleP95,
        p99Latency: idleP99,
        maxLatency: idleMax,
        rps: 1000 / Math.max(idleMean, 0.001),
        layer: "Baseline",
      },
      {
        name: `Write Burst Lag (${successfulWrites} writes @ ${CONCURRENT_WORKERS}c)`,
        avgLatency: writeMean,
        p50Latency: writeP50,
        p95Latency: writeP95,
        p99Latency: writeP99,
        maxLatency: writeMax,
        rps: parseFloat(throughput),
        layer: successfulWrites === BURST_COUNT ? "✅ Saturated" : "⚠️ Partial",
      },
    ];

    printTruthTable({
      title: `EVENT LOOP LAG & SATURATION (${dbType.toUpperCase()})`,
      shortLabel: "EventLoop",
      subtitle: `${BURST_COUNT} Writes @ ${CONCURRENT_WORKERS}c Parallel Burst`,
      results: results as any[],
    });

    const summaryMetrics = [
      { key: "Database Engine", val: dbType.toUpperCase(), unit: "" },
      { key: "Idle Event Loop Lag (mean)", val: idleMean.toFixed(2), unit: "ms" },
      { key: "Idle Event Loop Lag (p95)", val: idleP95.toFixed(2), unit: "ms" },
      { key: "Burst Throughput", val: throughput, unit: "docs/s" },
      { key: "Burst Event Loop Lag (mean)", val: writeMean.toFixed(2), unit: "ms" },
      { key: "Burst Event Loop Lag (p95)", val: writeP95.toFixed(2), unit: "ms" },
      { key: "Burst Event Loop Lag (p99)", val: writeP99.toFixed(2), unit: "ms" },
      { key: "Max Lag Spike", val: writeMax.toFixed(2), unit: "ms" },
      { key: "Write Success Rate", val: `${successfulWrites}/${BURST_COUNT}`, unit: "" },
    ];

    printSummaryTable(summaryMetrics, "EventLoop");

    exportMetric("event_loop.idle.mean_ms", idleMean, "ms");
    exportMetric("event_loop.idle.p95_ms", idleP95, "ms");
    exportMetric("event_loop.write.mean_ms", writeMean, "ms");
    exportMetric("event_loop.write.p95_ms", writeP95, "ms");
    exportMetric("event_loop.write.max_ms", writeMax, "ms");
    exportMetric("event_loop.write.throughput", parseFloat(throughput), "docs/s");
  } catch (err: any) {
    logger.error(`Event loop benchmark failed: ${err.message}`);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}, 90_000);
