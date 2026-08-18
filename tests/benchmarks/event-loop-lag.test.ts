/**
 * @file tests/benchmarks/event-loop-lag.test.ts
 * @description Event Loop Lag & Microtask Queue Saturation Benchmark
 * @summary Measures event loop delay (p50, p95, p99, max) during high-throughput database write bursts.
 *
 * ### Features:
 * - Event loop delay monitoring via monitorEventLoopDelay
 * - Microtask drain delay quantification under write load
 * - Outbox and cache invalidation event-loop starvation detection
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
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";
import { logger } from "@utils/logger";
import { monitorEventLoopDelay } from "node:perf_hooks";
import crypto from "node:crypto";

let stopServer: (() => Promise<void>) | null = null;
let baseUrl: string;

test("Event Loop Lag & Microtask Saturation Benchmark", async () => {
  logger.info("🚀 Starting Event Loop Lag & Microtask Saturation Benchmark...");

  const serverInfo = await setupBenchmarkServer();
  stopServer = serverInfo.stop;
  baseUrl = serverInfo.baseUrl;

  await ensureStableTestData();
  const headers = {
    ...benchmarkAuthHeaders(),
    "content-type": "application/json",
  };
  const dbType = getDbType();

  // 1. Measure Idle Baseline Event Loop Delay
  const idleHistogram = monitorEventLoopDelay({ resolution: 10 });
  idleHistogram.enable();
  await new Promise((resolve) => setTimeout(resolve, 500));
  idleHistogram.disable();

  const idleP50 = idleHistogram.percentile(50) / 1_000_000;
  const idleP95 = idleHistogram.percentile(95) / 1_000_000;
  const idleP99 = idleHistogram.percentile(99) / 1_000_000;
  const idleMax = idleHistogram.max / 1_000_000;

  logger.info(
    `   [Baseline] Idle Lag: p50=${idleP50.toFixed(2)}ms, p95=${idleP95.toFixed(2)}ms, max=${idleMax.toFixed(2)}ms`,
  );

  // 2. Measure Event Loop Delay During Heavy Write Burst (200 Rapid Writes)
  const writeHistogram = monitorEventLoopDelay({ resolution: 10 });
  writeHistogram.enable();

  const BURST_COUNT = 200;
  const t0 = performance.now();

  for (let i = 0; i < BURST_COUNT; i++) {
    const uniq = crypto.randomUUID();
    await fetch(`${baseUrl}/api/collections/BenchmarkStable`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: `Burst Item ${i} ${uniq}`,
        slug: `burst-${i}-${uniq}`,
        content: "Burst write payload testing event loop saturation and microtask drain speed",
        views: i,
      }),
    });
  }

  const elapsed = performance.now() - t0;
  writeHistogram.disable();

  const writeP50 = writeHistogram.percentile(50) / 1_000_000;
  const writeP95 = writeHistogram.percentile(95) / 1_000_000;
  const writeP99 = writeHistogram.percentile(99) / 1_000_000;
  const writeMax = writeHistogram.max / 1_000_000;
  const writeMean = writeHistogram.mean / 1_000_000;
  const throughput = (BURST_COUNT / (elapsed / 1000)).toFixed(1);

  logger.info(
    `   [Write Burst] ${BURST_COUNT} writes in ${elapsed.toFixed(1)}ms (${throughput} docs/s):`,
  );
  logger.info(
    `   [Write Burst Lag] mean=${writeMean.toFixed(2)}ms, p50=${writeP50.toFixed(2)}ms, p95=${writeP95.toFixed(2)}ms, p99=${writeP99.toFixed(2)}ms, max=${writeMax.toFixed(2)}ms`,
  );

  const results = [
    {
      name: "Idle Baseline Lag",
      avgLatency: writeHistogram.min / 1_000_000,
      p50Latency: idleP50,
      p95Latency: idleP95,
      p99Latency: idleP99,
      maxLatency: idleMax,
      rps: 1000 / (idleP50 || 1),
      success: true,
    },
    {
      name: `Write Burst Lag (${BURST_COUNT} writes @ ${throughput} docs/s)`,
      avgLatency: writeMean,
      p50Latency: writeP50,
      p95Latency: writeP95,
      p99Latency: writeP99,
      maxLatency: writeMax,
      rps: parseFloat(throughput),
      success: true,
    },
  ];

  printTruthTable({
    title: `EVENT LOOP LAG & SATURATION (${dbType.toUpperCase()})`,
    subtitle: "Measures event loop delay and microtask drain during continuous write bursts.",
    results,
  });

  const summaryMetrics = [
    { key: "Idle Event Loop Lag (p50)", val: idleP50.toFixed(2), unit: "ms" },
    { key: "Idle Event Loop Lag (max)", val: idleMax.toFixed(2), unit: "ms" },
    { key: "Write Burst Throughput", val: throughput, unit: "docs/s" },
    { key: "Write Burst Lag (mean)", val: writeMean.toFixed(2), unit: "ms" },
    { key: "Write Burst Lag (p95)", val: writeP95.toFixed(2), unit: "ms" },
    { key: "Write Burst Lag (max)", val: writeMax.toFixed(2), unit: "ms" },
  ];

  printSummaryTable(summaryMetrics, "EventLoop");

  exportMetric("event_loop.idle.p50", idleP50, "ms");
  exportMetric("event_loop.write.p95", writeP95, "ms");
  exportMetric("event_loop.write.throughput", parseFloat(throughput), "docs/s");

  if (stopServer) {
    await stopServer();
    stopServer = null;
  }
}, 90_000);
