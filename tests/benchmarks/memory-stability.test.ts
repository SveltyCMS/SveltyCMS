/**
 * @file tests/benchmarks/memory-stability.test.ts
 * @description Memory Stability Benchmark (Optimized)
 * @summary Tracks RSS, heap, and external memory growth under sustained load with automated leak detection.
 *
 * ### Features:
 * - RSS, heap, and external memory tracking
 * - Sustained load memory growth profiling
 * - Automated memory leak detection
 * - Periodic sampling with trend analysis
 */

import "../unit/bun-preload.ts";
import {
  test,
  exportResult,
  setupBenchmarkServer,
  ensureStableTestData,
  forceRefreshServer,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import { logger } from "@utils/logger";

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

async function getMemoryStats(baseUrl: string, forceGC = false, signal?: AbortSignal) {
  try {
    const res: any = await fetch(
      `${baseUrl}/api/system/health?verbose=true${forceGC ? "&gc=true" : ""}`,
      {
        headers: { "x-test-secret": TEST_API_SECRET },
        signal,
      },
    );
    const data = await res.json();
    return data.memory || { rss: 0, heapUsed: 0, external: 0 };
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
    await forceRefreshServer(baseUrl);
    await stabilize(2000);

    const controllers = new Set<AbortController>();

    // Baseline Assessment (with explicit GC invocation)
    const baselineController = new AbortController();
    const baselineId = setTimeout(() => baselineController.abort(), 5000);
    const baseline = await getMemoryStats(baseUrl, true, baselineController.signal);
    clearTimeout(baselineId);
    console.log(`📊 Baseline RSS: ${Math.round(baseline.rss / 1024 / 1024)} MB`);

    let running = true;
    let totalRequests = 0;
    let failedRequests = 0;
    const startTime = performance.now();

    // Background sampler
    const sampler = (async () => {
      // oxlint-disable-next-line eslint/no-unreachable-loop
      for (let tick = 0; running; tick++) {
        const targetTime = tick * SAMPLING_INTERVAL_MS;
        const delay = targetTime - (performance.now() - startTime);
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));

        const sampleStart = performance.now();
        const controller = new AbortController();
        controllers.add(controller);
        const tid = setTimeout(() => controller.abort(), 5000);

        try {
          const mem = await getMemoryStats(baseUrl, false, controller.signal);
          const lag = performance.now() - sampleStart;

          snapshots.push({
            timeMs: performance.now() - startTime,
            rssMB: Math.round(mem.rss / 1024 / 1024),
            heapMB: Math.round(mem.heapUsed / 1024 / 1024),
            externalMB: Math.round(mem.external / 1024 / 1024),
            lagMs: lag,
          });
        } finally {
          clearTimeout(tid);
          controllers.delete(controller);
        }
      }
    })();

    // Load generators
    const CONCURRENCY = 8;
    console.log(`🔥 Sustaining load with ${CONCURRENCY} concurrent workers...`);

    const workers = Array.from({ length: CONCURRENCY }, async (_, i) => {
      // oxlint-disable-next-line eslint/no-unreachable-loop
      while (running) {
        const controller = new AbortController();
        controllers.add(controller);
        const tid = setTimeout(() => controller.abort(), 5000);

        try {
          const res: any = await fetch(`${baseUrl}/api/system/health`, {
            headers: { "x-test-secret": TEST_API_SECRET },
            signal: controller.signal,
          });

          await res.arrayBuffer();

          if (res.ok) {
            totalRequests++;
          } else {
            failedRequests++;
          }
        } catch {
          failedRequests++;
        } finally {
          clearTimeout(tid);
          controllers.delete(controller);
        }

        // Prevent event loop starvation and socket pool saturation
        await new Promise(setImmediate);
      }
      if (process.env.BENCHMARK_DEBUG === "true") console.log(`[Worker ${i}] Finished.`);
    });

    await Promise.race([sleep(DURATION_SECONDS * 1000), Promise.allSettled([...workers, sampler])]);

    running = false;
    // Tear down remaining active connections
    Array.from(controllers).forEach((c) => c.abort());

    console.log(
      `⏹ Load stopped at ${Math.round(performance.now() - startTime)}ms. Draining workers...`,
    );

    const drainStart = performance.now();
    await Promise.race([
      Promise.allSettled([...workers, sampler]),
      sleep(5000).then(() =>
        console.log("⚠️ Hard timeout reached during worker drain. Forcing continuation."),
      ),
    ]);
    console.log(`✅ All workers drained in ${Math.round(performance.now() - drainStart)}ms.`);

    // Cool-down period before final GC check
    await stabilize(3000);
    const finalController = new AbortController();
    const finalId = setTimeout(() => finalController.abort(), 5000);
    const finalMem = await getMemoryStats(baseUrl, true, finalController.signal);
    clearTimeout(finalId);

    const totalDurationMs = performance.now() - startTime;
    const rps = totalRequests / (totalDurationMs / 1000);

    const rssGrowth = (finalMem.rss - baseline.rss) / 1024 / 1024;
    const heapGrowth = (finalMem.heapUsed - baseline.heapUsed) / 1024 / 1024;

    // Calculate slope safely
    const heapSlope = calculateHeapSlope(snapshots);

    printTruthTable({
      title: "SVELTYCMS — MEMORY STABILITY AUDIT",
      shortLabel: "Memory",
      subtitle: `${DURATION_SECONDS}s Sustained Load • ${getDbType().toUpperCase()}`,
      results: [
        {
          name: "Memory Profile",
          layer: "Stability",
          rps,
          rssDelta: rssGrowth,
          heapSlope,
        },
      ],
    });

    printSummaryTable([
      { key: "Success Requests", val: totalRequests, unit: "" },
      { key: "Failed Requests", val: failedRequests, unit: "" },
      { key: "Average RPS", val: Math.round(rps), unit: "req/s" },
      { key: "RSS Growth", val: rssGrowth.toFixed(2), unit: "MB" },
      { key: "Heap Growth", val: heapGrowth.toFixed(2), unit: "MB" },
      { key: "Leak Slope", val: heapSlope.toFixed(2), unit: "MB/min" },
      {
        key: "Stability",
        val:
          failedRequests > totalRequests * 0.05
            ? "UNSTABLE (FAILURES)"
            : heapSlope < 1.5 && heapGrowth < 10
              ? "EXCELLENT"
              : heapSlope < 4
                ? "STABLE"
                : "LEAKY",
        unit: "",
      },
    ]);

    exportResult({
      name: "Memory Stability",
      totalRequests,
      failedRequests,
      rps,
      rssDelta: rssGrowth,
      heapDelta: heapGrowth,
      leakSlopeMBPerMin: heapSlope,
    } as any);
  } catch (err: any) {
    logger.error(`Memory stability audit failed: ${err.message}`);
    console.error(err);
    throw err;
  } finally {
    if (stopServer) {
      await stopServer().catch(() => {});
      stopServer = null;
    }
  }
}

function calculateHeapSlope(snapshots: MemorySnapshot[]): number {
  if (snapshots.length < 3) return 0;

  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;
  const n = snapshots.length;

  for (const s of snapshots) {
    const x = s.timeMs / 60000; // minutes
    const y = s.heapMB;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const divisor = n * sumXX - sumX * sumX;
  // Guard clause against perfect vertical lines or single point iterations
  if (divisor === 0) return 0;

  return (n * sumXY - sumX * sumY) / divisor;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

test(
  "Memory Stability Enterprise Audit",
  async () => {
    await runMemoryStabilityAudit();
  },
  600 * 1000,
);
