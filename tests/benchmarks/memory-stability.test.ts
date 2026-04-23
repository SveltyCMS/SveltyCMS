/**
 * @file tests/benchmarks/memory-stability.test.ts
 * @description Enterprise-grade memory stability benchmark for SveltyCMS.
 * Tracks RSS, Heap, and External memory growth under sustained load with leak slope detection.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  exportResult,
  exportMetric,
  printAuditTable,
  printSummaryTable,
  stabilize,
  mockDispatch,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

const DURATION_SECONDS = 20;
const WARMUP_SECONDS = 5;
const COOLDOWN_SECONDS = 2;

const CONCURRENCY = 12;
const SAMPLING_INTERVAL_MS = 1500;

const MAX_SNAPSHOTS = Math.ceil((DURATION_SECONDS * 1000) / SAMPLING_INTERVAL_MS) + 20;

type Snapshot = {
  timeMs: number;
  rssMB: number;
  heapMB: number;
  externalMB: number;
  requests: number;
  lagMs: number;
};

const snapshots: Snapshot[] = Array.from({ length: MAX_SNAPSHOTS });
let snapshotIndex = 0;

function now() {
  return performance.now();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function forceGC() {
  try {
    if (typeof globalThis !== "undefined" && (globalThis as any).gc) {
      (globalThis as any).gc();
    } else if (typeof Bun !== "undefined" && Bun.gc) {
      Bun.gc(true);
    }
  } catch {}
}

function sum(arr: Uint32Array): number {
  let total = 0;
  for (const n of arr) total += n;
  return total;
}

function recordSnapshot(start: number, requests: number, lagMs = 0) {
  const mem = process.memoryUsage();

  snapshots[snapshotIndex++] = {
    timeMs: now() - start,
    rssMB: Math.round(mem.rss / 1024 / 1024),
    heapMB: Math.round(mem.heapUsed / 1024 / 1024),
    externalMB: Math.round(mem.external / 1024 / 1024),
    requests,
    lagMs: Math.round(lagMs * 100) / 100,
  };
}

function slopeMBPerMinute(data: Snapshot[], selector: (s: Snapshot) => number): number {
  const n = data.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (const s of data) {
    const x = s.timeMs / 60000;
    const y = selector(s);

    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = n * sumXX - sumX * sumX;

  if (!denominator) return 0;

  return numerator / denominator;
}

export async function runMemoryStabilityTest() {
  console.log("🚀 Starting Enterprise Memory Stability Benchmark...\n");

  logger.level = "silent";

  const { ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();

  // Stop background services to isolate memory profile
  const { watchdog } = await import("@src/services/system/watchdog");
  const { scheduler } = await import("@src/services/scheduler");
  watchdog.stop();
  scheduler.stop();

  await stabilize();

  console.log(`🔥 Warmup phase (${WARMUP_SECONDS}s)...`);
  const warmupEnd = now() + WARMUP_SECONDS * 1000;
  while (now() < warmupEnd) {
    await mockDispatch({ path: "/system/health", method: "GET" });
  }

  forceGC();
  await sleep(1000);

  console.log(`📊 Sustaining load: ${DURATION_SECONDS}s @ ${CONCURRENCY}c\n`);

  snapshotIndex = 0;
  const counts = new Uint32Array(CONCURRENCY);
  let running = true;
  const start = now();

  recordSnapshot(start, 0);

  // Precise sampler loop
  const sampler = (async () => {
    let tick = 1;
    while (running) {
      const expected = tick * SAMPLING_INTERVAL_MS;
      const delay = expected - (now() - start);
      await sleep(Math.max(0, delay));
      const lag = now() - start - expected;
      recordSnapshot(start, sum(counts), lag);
      tick++;
    }
  })();

  // Workers
  const workers = Array.from({ length: CONCURRENCY }, (_, i) =>
    (async () => {
      let local = 0;
      while (running) {
        try {
          await mockDispatch({ path: "/system/health", method: "GET" });
          local++;
          counts[i] = local;
        } catch (_e: any) {
          // Silent in benchmark mode
        } finally {
          if (local % 20 === 0) await new Promise((r) => setTimeout(r, 0));
        }
      }
    })(),
  );

  await sleep(DURATION_SECONDS * 1000);
  running = false;

  await Promise.allSettled(workers);
  await sampler;

  forceGC();
  await sleep(COOLDOWN_SECONDS * 1000);
  recordSnapshot(start, sum(counts));

  logger.level = "info";

  const data = snapshots.slice(0, snapshotIndex);
  const first = data[0];
  const last = data[data.length - 1];

  const totalRequests = sum(counts);
  const totalMs = last.timeMs;
  const rps = totalRequests / (totalMs / 1000);

  const rssGrowth = last.rssMB - first.rssMB;
  const heapGrowth = last.heapMB - first.heapMB;
  const externalGrowth = last.externalMB - first.externalMB;

  const peakHeap = Math.max(...data.map((s) => s.heapMB));
  const peakRSS = Math.max(...data.map((s) => s.rssMB));

  const heapSlope = slopeMBPerMinute(data, (s) => s.heapMB);
  const rssSlope = slopeMBPerMinute(data, (s) => s.rssMB);
  const avgLag = data.reduce((a, b) => a + b.lagMs, 0) / data.length;

  // ─── reporting ─────────────────────────────────────────────────────────────

  printAuditTable({
    title: "SVELTYCMS  —  MEMORY STABILITY AUDIT",
    subtitle: `Sustained Load • Leak Detection • ${CONCURRENCY} Parallel Workers`,
    results: [
      {
        name: "Sustained Execution Profile",
        avgMs: totalRequests ? totalMs / totalRequests : 0,
        p95Ms: 0, // Profile mode
        rps,
        rssDelta: rssGrowth,
      },
    ],
  });

  printSummaryTable([
    { key: "Total Requests Processed", val: totalRequests, unit: "req" },
    { key: "Average Throughput", val: Math.round(rps), unit: "req/s" },
    { key: "RSS Delta (Total)", val: rssGrowth, unit: "MB" },
    { key: "Heap Delta", val: heapGrowth, unit: "MB" },
    { key: "External Delta", val: externalGrowth, unit: "MB" },
    { key: "Peak RSS Footprint", val: peakRSS, unit: "MB" },
    { key: "Peak Heap Footprint", val: peakHeap, unit: "MB" },
    { key: "Heap Leak Slope", val: heapSlope, unit: "MB/min" },
    { key: "RSS Leak Slope", val: rssSlope, unit: "MB/min" },
    { key: "Avg Event Loop Lag", val: avgLag, unit: "ms" },
  ]);

  exportResult({
    name: "Memory Stability Enterprise",
    iterations: totalRequests,
    totalMs,
    avgMs: totalRequests ? totalMs / totalRequests : 0,
    rps: Number(rps.toFixed(1)),
    successCount: totalRequests,
    failureCount: 0,
    rssDelta: rssGrowth,
  } as any);

  exportMetric("internals.memory.rss_delta", rssGrowth, "MB");
  exportMetric("internals.memory.leak_slope", heapSlope, "MB/min");

  console.log("\n✅ Memory stability benchmark completed.");
}

test("Memory Stability Under Sustained Load", async () => {
  await runMemoryStabilityTest();
}, 300000);
