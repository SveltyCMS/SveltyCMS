/**
 * @file tests/benchmarks/memory-stability.test.ts
 * @description Memory Stability Benchmark (Optimized)
 * @summary Tracks RSS, heap, and external memory growth under sustained mixed load with automated regression leak detection.
 */

import "../unit/bun-preload.ts";
import {
  test,
  exportResult,
  exportMetric,
  setupBenchmarkServer,
  ensureStableTestData,
  forceRefreshServer,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  benchmarkAuthHeaders,
} from "./modules/benchmark-utils";
import { logger } from "@utils/logger";

const DURATION_SECONDS = process.env.LONG_RUN === "true" ? 180 : 45;
const SAMPLING_INTERVAL_MS = 2000;
const CONCURRENCY = 8;

type MemorySnapshot = {
  timeMs: number;
  rssMB: number;
  heapMB: number;
  externalMB: number;
  lagMs: number;
};

let stopServer: (() => Promise<void>) | null = null;
const snapshots: MemorySnapshot[] = [];

function forceGarbageCollection() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
}

async function getMemoryStats(
  baseUrl: string,
  headers: Record<string, string>,
  forceGC = false,
  signal?: AbortSignal,
): Promise<{ rss: number; heapUsed: number; external: number }> {
  try {
    const res = await fetch(
      `${baseUrl}/api/system/health?verbose=true${forceGC ? "&gc=true" : ""}`,
      {
        headers,
        signal: signal || AbortSignal.timeout(5000),
      },
    );
    const data = (await res.json()) as any;
    const mem = data.memory || data.data?.memory || {};
    return {
      rss: (mem.rss || 0) / 1024 / 1024,
      heapUsed: (mem.heapUsed || 0) / 1024 / 1024,
      external: (mem.external || 0) / 1024 / 1024,
    };
  } catch {
    return { rss: 0, heapUsed: 0, external: 0 };
  }
}

function calculateSlope(snaps: MemorySnapshot[], field: keyof MemorySnapshot): number {
  if (snaps.length < 3) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  const n = snaps.length;

  for (let i = 0; i < n; i++) {
    const s = snaps[i]!;
    const x = s.timeMs / 60000; // time in minutes
    const y = s[field] as number;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const divisor = n * sumXX - sumX * sumX;
  if (divisor === 0) return 0;

  return (n * sumXY - sumX * sumY) / divisor;
}

export async function runMemoryStabilityAudit() {
  const dbType = getDbType().toUpperCase();
  console.log(
    `🚀 Starting Memory Stability Audit (${DURATION_SECONDS}s sustained load • ${dbType})...\n`,
  );

  try {
    const server = await setupBenchmarkServer();
    stopServer = server.stop;
    const baseUrl = server.baseUrl;

    await ensureStableTestData();
    await forceRefreshServer(baseUrl);
    await stabilize(1500);

    const baseHeaders: Record<string, string> = {
      ...benchmarkAuthHeaders(),
      "content-type": "application/json",
      connection: "keep-alive",
    };

    // ── 1. BASELINE MEMORY AUDIT ────────────────────────────────────────────
    forceGarbageCollection();
    await stabilize(200);

    const baseline = await getMemoryStats(baseUrl, baseHeaders, true);
    console.log(
      `📊 Baseline Memory: RSS ${baseline.rss.toFixed(1)} MB | Heap ${baseline.heapUsed.toFixed(1)} MB`,
    );

    const shutdownController = new AbortController();
    let running = true;
    let totalRequests = 0;
    let failedRequests = 0;
    const startTime = performance.now();

    // ── 2. BACKGROUND TELEMETRY SAMPLER ─────────────────────────────────────
    const sampler = (async () => {
      for (let tick = 0; running; tick++) {
        const targetTime = tick * SAMPLING_INTERVAL_MS;
        const delay = targetTime - (performance.now() - startTime);
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        if (!running) break;

        const sampleStart = performance.now();
        const mem = await getMemoryStats(baseUrl, baseHeaders, false, shutdownController.signal);
        const lag = performance.now() - sampleStart;

        snapshots.push({
          timeMs: performance.now() - startTime,
          rssMB: parseFloat(mem.rss.toFixed(3)),
          heapMB: parseFloat(mem.heapUsed.toFixed(3)),
          externalMB: parseFloat(mem.external.toFixed(3)),
          lagMs: parseFloat(lag.toFixed(2)),
        });
      }
    })();

    // ── 3. SUSTAINED MIXED LOAD GENERATOR ───────────────────────────────────
    console.log(`🔥 Sustaining mixed workload with ${CONCURRENCY} concurrent workers...`);

    const healthUrl = `${baseUrl}/api/system/health`;
    const listUrl = `${baseUrl}/api/collections/BenchmarkStable?limit=10`;
    const itemUrl = `${baseUrl}/api/collections/BenchmarkStable/20000000-0000-4000-8000-000000000001`;
    const mutateUrl = `${baseUrl}/api/collections/BenchmarkStable`;

    let mutationSeq = 0;

    const endpoints = [
      {
        weight: 40,
        run: () => fetch(healthUrl, { headers: baseHeaders, signal: shutdownController.signal }),
      },
      {
        weight: 70,
        run: () => fetch(listUrl, { headers: baseHeaders, signal: shutdownController.signal }),
      },
      {
        weight: 90,
        run: () => fetch(itemUrl, { headers: baseHeaders, signal: shutdownController.signal }),
      },
      {
        weight: 100,
        run: () => {
          const id = ++mutationSeq;
          return fetch(mutateUrl, {
            method: "POST",
            headers: baseHeaders,
            body: JSON.stringify({
              _id: crypto.randomUUID(),
              title: `Memory Load ${id}`,
              count: id,
            }),
            signal: shutdownController.signal,
          });
        },
      },
    ];

    const workers = Array.from({ length: CONCURRENCY }, async () => {
      while (running) {
        const roll = Math.random() * 100;
        let selectedOp = endpoints[0]!.run;
        for (let i = 0; i < endpoints.length; i++) {
          if (roll <= endpoints[i]!.weight) {
            selectedOp = endpoints[i]!.run;
            break;
          }
        }

        try {
          const res = await selectedOp();
          await res.arrayBuffer().catch(() => {});

          if (res.ok || res.status === 201) {
            totalRequests++;
          } else {
            failedRequests++;
          }
        } catch {
          if (running) failedRequests++;
        }

        // Fast yield prevents event loop exhaustion
        await new Promise((r) => setTimeout(r, 5 + Math.random() * 10));
      }
    });

    // Run for requested duration
    await new Promise((r) => setTimeout(r, DURATION_SECONDS * 1000));
    running = false;
    shutdownController.abort();

    await sampler;
    await Promise.allSettled(workers);

    // ── 4. POST-LOAD STABILIZATION & GC VERIFICATION ────────────────────────
    console.log("   → Load finished. Stabilizing and sampling post-load memory state...");
    await stabilize(2500);

    const finalMem = await getMemoryStats(baseUrl, baseHeaders, true);
    const totalDurationMs = performance.now() - startTime;
    const rps = totalRequests / (totalDurationMs / 1000);

    const rssGrowth = finalMem.rss - baseline.rss;
    const heapGrowth = finalMem.heapUsed - baseline.heapUsed;

    const heapSlope = calculateSlope(snapshots, "heapMB");
    const rssSlope = calculateSlope(snapshots, "rssMB");

    // ── 5. REPORTING & TELEMETRY ────────────────────────────────────────────
    printTruthTable({
      title: "SVELTYCMS — MEMORY STABILITY AUDIT",
      shortLabel: "Memory",
      subtitle: `${DURATION_SECONDS}s Sustained Load • ${dbType}`,
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

    const isStable = failedRequests <= totalRequests * 0.05 && heapSlope < 2.0 && heapGrowth < 15.0;

    printSummaryTable(
      [
        { key: "Database Engine", val: dbType, unit: "" },
        { key: "Duration", val: DURATION_SECONDS, unit: "s" },
        { key: "Success Requests", val: totalRequests.toLocaleString(), unit: "" },
        { key: "Failed Requests", val: failedRequests, unit: "" },
        { key: "Average Throughput", val: Math.round(rps), unit: "req/s" },
        {
          key: "RSS Start → End",
          val: `${baseline.rss.toFixed(1)} → ${finalMem.rss.toFixed(1)}`,
          unit: "MB",
        },
        {
          key: "Heap Start → End",
          val: `${baseline.heapUsed.toFixed(1)} → ${finalMem.heapUsed.toFixed(1)}`,
          unit: "MB",
        },
        {
          key: "RSS Net Growth",
          val: `${rssGrowth >= 0 ? "+" : ""}${rssGrowth.toFixed(2)}`,
          unit: "MB",
        },
        {
          key: "Heap Net Growth",
          val: `${heapGrowth >= 0 ? "+" : ""}${heapGrowth.toFixed(2)}`,
          unit: "MB",
        },
        { key: "Heap Leak Slope", val: heapSlope.toFixed(3), unit: "MB/min" },
        { key: "RSS Leak Slope", val: rssSlope.toFixed(3), unit: "MB/min" },
        {
          key: "Stability Rating",
          val: isStable ? "EXCELLENT (No Leak)" : heapSlope < 4.0 ? "ACCEPTABLE" : "LEAK DETECTED",
          unit: "",
        },
      ],
      "Memory Stability Summary",
    );

    exportMetric("memory.stability.rps", Math.round(rps), "req/s");
    exportMetric("memory.stability.rss_growth_mb", parseFloat(rssGrowth.toFixed(3)), "MB");
    exportMetric("memory.stability.heap_growth_mb", parseFloat(heapGrowth.toFixed(3)), "MB");
    exportMetric("memory.stability.heap_slope_mb_min", parseFloat(heapSlope.toFixed(4)), "MB/min");
    exportMetric("memory.stability.rss_slope_mb_min", parseFloat(rssSlope.toFixed(4)), "MB/min");

    exportResult({
      name: "Memory Stability",
      totalRequests,
      failedRequests,
      rps,
      rssDelta: rssGrowth,
      heapDelta: heapGrowth,
      leakSlopeMBPerMin: heapSlope,
    } as any);

    if (heapSlope > 3.0) {
      throw new Error(
        `HEAP LEAK DETECTED: ${heapSlope.toFixed(3)} MB/min growth over ${DURATION_SECONDS}s`,
      );
    }
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

test("Memory Stability Enterprise Audit", async () => {
  await runMemoryStabilityAudit();
}, 600_000);
