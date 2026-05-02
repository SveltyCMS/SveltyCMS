/**
 * @file tests/benchmarks/memory-stability.test.ts
 * @description Enterprise-grade memory stability benchmark for SveltyCMS.
 * Tracks RSS, Heap, and External memory growth under sustained load with leak detection.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
} from "./benchmark-utils";
import { logger } from "@utils/logger.server";

const DURATION_SECONDS = process.env.LONG_RUN === "true" ? 180 : 45;
const SAMPLING_INTERVAL_MS = 2500;

type MemorySnapshot = {
  timeMs: number;
  rssMB: number;
  heapMB: number;
  externalMB: number;
  lagMs: number;
};

let stopServer: (() => Promise<void>) | null = null;
const snapshots: MemorySnapshot[] = [];

async function getMemoryStats(baseUrl: string, forceGC = false) {
  try {
    const res = await fetch(`${baseUrl}/api/system/health${forceGC ? "?gc=true" : ""}`, {
      headers: { "x-test-secret": process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026" },
    });
    const data = await res.json();
    return data.memory || data;
  } catch {
    return { rss: 0, heapUsed: 0, external: 0 };
  }
}

export async function runMemoryStabilityAudit() {
  console.log(`🚀 Starting Memory Stability Audit (${DURATION_SECONDS}s sustained load)...\n`);

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await stabilize(2000);

    // Baseline
    const baseline = await getMemoryStats(baseUrl, true);
    console.log(`📊 Baseline RSS: ${Math.round(baseline.rss / 1024 / 1024)} MB`);

    let running = true;
    let totalRequests = 0;
    const startTime = performance.now();

    // Background sampler
    const sampler = (async () => {
      let tick = 0;
      while (running) {
        const targetTime = tick * SAMPLING_INTERVAL_MS;
        const delay = targetTime - (performance.now() - startTime);
        if (delay > 0) await new Promise(r => setTimeout(r, delay));

        const sampleStart = performance.now();
        const mem = await getMemoryStats(baseUrl);
        const lag = performance.now() - sampleStart;

        snapshots.push({
          timeMs: performance.now() - startTime,
          rssMB: Math.round(mem.rss / 1024 / 1024),
          heapMB: Math.round(mem.heapUsed / 1024 / 1024),
          externalMB: Math.round(mem.external / 1024 / 1024),
          lagMs: lag,
        });
        tick++;
      }
    })();

    // Load generators
    const CONCURRENCY = 12;
    console.log(`🔥 Sustaining load with ${CONCURRENCY} concurrent workers...`);

    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (running) {
        try {
          await fetch(`${baseUrl}/api/system/health`, {
            headers: { "x-test-secret": process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026" },
          });
          totalRequests++;
        } catch {}
      }
    });

    await Promise.race([
      sleep(DURATION_SECONDS * 1000),
      Promise.allSettled([...workers, sampler]),
    ]);

    running = false;
    await Promise.allSettled([...workers, sampler]);

    // Final measurement
    await stabilize(3000);
    const finalMem = await getMemoryStats(baseUrl, true);

    const totalDurationMs = performance.now() - startTime;
    const rps = totalRequests / (totalDurationMs / 1000);

    const rssGrowth = Math.round(finalMem.rss / 1024 / 1024) - Math.round(baseline.rss / 1024 / 1024);
    const heapGrowth = Math.round(finalMem.heapUsed / 1024 / 1024) - Math.round(baseline.heapUsed / 1024 / 1024);

    // Calculate linear regression slope for leak detection
    const heapSlope = calculateHeapSlope(snapshots);

    printTruthTable({
      title: "SVELTYCMS — MEMORY STABILITY AUDIT",
      shortLabel: "Memory",
      subtitle: `${DURATION_SECONDS}s Sustained Load • ${getDbType().toUpperCase()}`,
      results: [{ name: "Memory Profile", layer: "Stability", rps, rssDelta: rssGrowth, heapSlope }],
    });

    printSummaryTable([
      { key: "Total Requests", val: totalRequests, unit: "" },
      { key: "Average RPS", val: Math.round(rps), unit: "req/s" },
      { key: "RSS Growth", val: rssGrowth, unit: "MB" },
      { key: "Heap Growth", val: heapGrowth, unit: "MB" },
      { key: "Leak Slope", val: heapSlope.toFixed(2), unit: "MB/min" },
      { key: "Stability", val: heapSlope < 1.5 ? "EXCELLENT" : heapSlope < 4 ? "STABLE" : "LEAKY", unit: "" },
    ]);

    exportResult({
      name: "Memory Stability",
      totalRequests,
      rps,
      rssDelta: rssGrowth,
      heapDelta: heapGrowth,
      leakSlopeMBPerMin: heapSlope,
    } as any);

  } catch (err: any) {
    logger.error(`Memory stability audit failed: ${err.message}`);
    console.error(err);
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }

  console.log("\n✅ Memory stability audit completed.");
}

function calculateHeapSlope(snapshots: MemorySnapshot[]): number {
  if (snapshots.length < 3) return 0;

  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  const n = snapshots.length;

  for (const s of snapshots) {
    const x = s.timeMs / 60000; // minutes
    const y = s.heapMB;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

test("Memory Stability Enterprise Audit", async () => {
  await runMemoryStabilityAudit();
}, (DURATION_SECONDS + 30) * 1000);
