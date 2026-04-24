/**
 * @file tests/benchmarks/memory-stability.test.ts
 * @description Enterprise-grade memory stability benchmark for SveltyCMS.
 * Tracks RSS, Heap, and External memory growth under sustained load with leak slope detection.
 */

import { test } from "bun:test";
import "../unit/setup.ts";
import {
  exportResult,
  printTruthTable,
  printSummaryTable,
  setupBenchmarkServer,
  TEST_API_SECRET,
} from "./benchmark-utils";

const DURATION_SECONDS = process.env.LONG_RUN === "true" ? 180 : 30;
const WARMUP_SECONDS = 5;
const COOLDOWN_SECONDS = 3;

const CONCURRENCY = 12;
const SAMPLING_INTERVAL_MS = 2000;

type Snapshot = {
  timeMs: number;
  rssMB: number;
  heapMB: number;
  externalMB: number;
  requests: number;
  lagMs: number;
};

let server: any;
const snapshots: Snapshot[] = [];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getRemoteMemory(baseUrl: string, forceGC = false): Promise<any> {
  const url = `${baseUrl}/api/system/health${forceGC ? "?gc=true" : ""}`;
  const res = await fetch(url, {
    headers: { "x-test-secret": TEST_API_SECRET },
  });
  const data = await res.json();
  return data.memory;
}

export async function runMemoryStabilityAudit() {
  console.log(`🚀 Starting Enterprise Memory Stability Audit (${DURATION_SECONDS}s profile)...\n`);

  server = await setupBenchmarkServer();
  const baseUrl = server.baseUrl;

  console.log(`🔥 Warmup phase (${WARMUP_SECONDS}s)...`);
  const warmupEnd = performance.now() + WARMUP_SECONDS * 1000;
  while (performance.now() < warmupEnd) {
    await fetch(`${baseUrl}/api/system/health`, { headers: { "x-test-secret": TEST_API_SECRET } });
  }

  // Baseline after GC
  const memStart = await getRemoteMemory(baseUrl, true);
  console.log(`📊 Baseline RSS: ${Math.round(memStart.rss / 1024 / 1024)} MB`);

  console.log(`🔥 Sustaining load: ${DURATION_SECONDS}s @ ${CONCURRENCY}c\n`);

  let running = true;
  let totalRequests = 0;
  const start = performance.now();

  // Sampler loop
  const sampler = (async () => {
    let tick = 1;
    while (running) {
      const expected = tick * SAMPLING_INTERVAL_MS;
      const delay = expected - (performance.now() - start);
      await sleep(Math.max(0, delay));

      const tSampleStart = performance.now();
      const mem = await getRemoteMemory(baseUrl);
      const lag = performance.now() - tSampleStart;

      snapshots.push({
        timeMs: performance.now() - start,
        rssMB: Math.round(mem.rss / 1024 / 1024),
        heapMB: Math.round(mem.heapUsed / 1024 / 1024),
        externalMB: Math.round(mem.external / 1024 / 1024),
        requests: totalRequests,
        lagMs: lag,
      });
      tick++;
    }
  })();

  // Workers hitting the full pipeline (e.g. /api/settings/public or /api/system/health)
  // We'll hit health to keep it fast but exercise the full dispatcher
  const workers = Array.from({ length: CONCURRENCY }).map(async () => {
    while (running) {
      try {
        await fetch(`${baseUrl}/api/system/health`, {
          headers: { "x-test-secret": TEST_API_SECRET },
        });
        totalRequests++;
      } catch {
        // Silent
      }
    }
  });

  await sleep(DURATION_SECONDS * 1000);
  running = false;

  await Promise.allSettled([...workers, sampler]);

  // Final measurement after cooldown and GC
  console.log(`❄️  Cooldown phase (${COOLDOWN_SECONDS}s)...`);
  await sleep(COOLDOWN_SECONDS * 1000);
  const memEnd = await getRemoteMemory(baseUrl, true);

  const totalMs = performance.now() - start;
  const rps = totalRequests / (totalMs / 1000);

  const first = snapshots[0] || {
    rssMB: memStart.rss / 1024 / 1024,
    heapMB: memStart.heapUsed / 1024 / 1024,
    timeMs: 0,
  };
  const last = {
    rssMB: memEnd.rss / 1024 / 1024,
    heapMB: memEnd.heapUsed / 1024 / 1024,
    timeMs: totalMs,
  };

  const rssGrowth = last.rssMB - first.rssMB;
  const heapGrowth = last.heapMB - first.heapMB;

  // Calculate slope manually from snapshots
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;
  const n = snapshots.length;
  for (const s of snapshots) {
    const x = s.timeMs / 60000;
    const y = s.heapMB;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const heapSlope = n > 1 ? (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) : 0;

  printTruthTable({
    title: "SVELTYCMS  —  MEMORY STABILITY AUDIT",
    subtitle: `Full Pipeline • Child Process Profiling • ${DURATION_SECONDS}s Sustain`,
    results: [
      {
        name: "Enterprise Production Profile",
        layer: "Node/Build",
        avgMs: totalMs / totalRequests,
        p75Ms: 0,
        p90Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
        p999Ms: 0,
        rps,
        overheadPct: heapSlope,
      },
    ],
  });

  printSummaryTable([
    { key: "Total Load Processed", val: totalRequests, unit: "req" },
    { key: "Production Throughput", val: Math.round(rps), unit: "req/s" },
    { key: "RSS Delta (Final)", val: rssGrowth, unit: "MB" },
    { key: "Heap Delta (Final)", val: heapGrowth, unit: "MB" },
    { key: "Leak Slope (Heap)", val: heapSlope, unit: "MB/min" },
    {
      key: "Stability Rating",
      val: heapSlope < 2 ? "EXCELLENT" : heapSlope < 5 ? "STABLE" : "LEAKY",
      unit: "",
    },
  ]);

  exportResult({
    name: "Memory Stability",
    iterations: totalRequests,
    totalMs,
    avgMs: totalMs / totalRequests,
    rps,
    rssDelta: rssGrowth,
  } as any);

  await server.stop();
  console.log("\n✅ Memory stability audit completed.");
}

test(
  "Memory Stability Enterprise Audit",
  async () => {
    await runMemoryStabilityAudit();
  },
  (DURATION_SECONDS + 20) * 1000,
);
