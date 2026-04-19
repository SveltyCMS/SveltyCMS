/**
 * @file tests/benchmarks/memory-stability.test.ts
 * @description Enterprise-grade memory stability benchmark for SveltyCMS.
 * Tracks RSS, Heap, and External memory growth under sustained load with leak slope detection.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import { exportResult, exportMetric } from "./benchmark-utils";
import { logger } from "@utils/logger.server";
import fs from "node:fs/promises";
import path from "node:path";

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

  logger.level = "warn";

  const { ensureFullInitialization } = await import("@src/databases/db");
  await ensureFullInitialization();

  console.log("🛑 Stopping background services to prevent maintenance cycle overhead...");
  const { watchdog } = await import("@src/services/system/watchdog");
  const { scheduler } = await import("@src/services/scheduler");
  watchdog.stop();
  scheduler.stop();

  const { mockDispatch } = await import("./benchmark-utils");

  console.log(`🔥 Warmup phase (${WARMUP_SECONDS}s)...`);
  const warmupEnd = now() + WARMUP_SECONDS * 1000;
  while (now() < warmupEnd) {
    await mockDispatch({ path: "/system/health", method: "GET" });
  }

  forceGC();
  await sleep(1000);

  console.log(`📊 Main test: ${DURATION_SECONDS}s @ concurrency ${CONCURRENCY}\n`);

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
  console.log(`🏁 Spawning ${CONCURRENCY} workers...`);
  const workers = Array.from({ length: CONCURRENCY }, (_, i) =>
    (async () => {
      let local = 0;
      while (running) {
        try {
          await mockDispatch({ path: "/system/health", method: "GET" });
          local++;
          counts[i] = local;
        } catch (e: any) {
          console.warn(`[Worker ${i}] Request failed: ${e.message}`);
          await new Promise((r) => setTimeout(r, 100)); // Backoff on error
        } finally {
          if (local % 10 === 0) await new Promise((r) => setTimeout(r, 0));
        }
      }
      console.log(`✅ Worker ${i} finished. Processed ${local} requests.`);
    })(),
  );

  console.log(`⏳ Waiting for ${DURATION_SECONDS}s...`);
  await sleep(DURATION_SECONDS * 1000);
  console.log(`🛑 Stopping workers...`);
  running = false;

  await Promise.allSettled(workers);
  console.log(`✅ All workers settled.`);
  await sampler;
  console.log(`✅ Sampler settled.`);

  console.log(`🧊 Cooldown (${COOLDOWN_SECONDS}s)...`);
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

  console.log("\n" + "=".repeat(100));
  console.log("📈 ENTERPRISE MEMORY STABILITY REPORT");
  console.log("=".repeat(100));

  console.log(`Requests           : ${totalRequests.toLocaleString()}`);
  console.log(`Duration           : ${(totalMs / 1000).toFixed(1)} sec`);
  console.log(`Average RPS        : ${rps.toFixed(1)}`);

  console.log(`\nMemory Growth`);
  console.log(`RSS Delta          : ${rssGrowth >= 0 ? "+" : ""}${rssGrowth} MB`);
  console.log(`Heap Delta         : ${heapGrowth >= 0 ? "+" : ""}${heapGrowth} MB`);
  console.log(`External Delta     : ${externalGrowth >= 0 ? "+" : ""}${externalGrowth} MB`);

  console.log(`\nPeaks`);
  console.log(`Peak Heap          : ${peakHeap} MB`);
  console.log(`Peak RSS           : ${peakRSS} MB`);

  console.log(`\nLeak Trend`);
  console.log(`Heap Slope         : ${heapSlope.toFixed(2)} MB/min`);
  console.log(`RSS Slope          : ${rssSlope.toFixed(2)} MB/min`);

  console.log(`\nRuntime`);
  console.log(`Avg Event Lag      : ${avgLag.toFixed(2)} ms`);

  if (heapSlope > 5 || rssSlope > 10) {
    console.warn("\n⚠️ Possible sustained leak detected.");
  } else {
    console.log("\n✅ Memory appears stable.");
  }

  exportResult({
    name: "Memory Stability Enterprise",
    iterations: totalRequests,
    totalMs,
    avgMs: totalRequests ? totalMs / totalRequests : 0,
    rps: Number(rps.toFixed(1)),
    successCount: totalRequests,
    failureCount: 0,
  } as any);

  exportMetric("internals.memory.rss_delta", rssGrowth, "MB", {
    heapGrowth,
    externalGrowth,
    heapSlope,
    rssSlope,
    avgLag,
  });

  const resultsDir =
    process.env.RESULTS_DIR || path.join(process.cwd(), "tests/benchmarks/results");
  await fs.mkdir(resultsDir, { recursive: true });

  await fs.writeFile(
    path.join(resultsDir, "memory-stability.json"),
    JSON.stringify(
      {
        name: "Enterprise Memory Stability",
        timestamp: new Date().toISOString(),
        totalRequests,
        durationMs: totalMs,
        rps,
        rssGrowth,
        heapGrowth,
        externalGrowth,
        peakHeap,
        peakRSS,
        heapSlope,
        rssSlope,
        avgLag,
        snapshots: data,
      },
      null,
      2,
    ),
  );

  console.log("\n💾 Report exported.");
  console.log("✅ Benchmark completed.");
}

test("Memory Stability Under Sustained Load", async () => {
  await runMemoryStabilityTest();
}, 300000);
