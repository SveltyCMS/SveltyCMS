/**
 * @file tests/benchmarks/longevity-soak.test.ts
 * @description Long-Running Soak Test (Multi-Hour Memory & Resource Stability) [Optimized]
 * @summary Sustained mixed read/write workload over configurable hours with periodic memory/CPU sampling
 * to detect slow leaks (file handles, event listeners, promise chains, buffer growth).
 */

import {
  test,
  setupBenchmarkServer,
  ensureStableTestData,
  forceRefreshServer,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  benchmarkAuthHeaders,
  exportResult,
  exportMetric,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

const IS_CI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const SOAK_HOURS = parseFloat(process.env.LONG_SOAK_HOURS || "0.083"); // default 5 min
const SAMPLE_INTERVAL_SEC = IS_CI ? 15 : 30;
const CONCURRENCY = 4;

// Fixed-size circular buffer for O(1) latency tracking without heap growth
const LATENCY_RESERVOIR_SIZE = 1000;
const latencyReservoir = new Float64Array(LATENCY_RESERVOIR_SIZE);
let reservoirIndex = 0;
let reservoirCount = 0;

function recordLatency(ms: number) {
  latencyReservoir[reservoirIndex] = ms;
  reservoirIndex = (reservoirIndex + 1) % LATENCY_RESERVOIR_SIZE;
  if (reservoirCount < LATENCY_RESERVOIR_SIZE) reservoirCount++;
}

function getReservoirStats(): { avg: number; p95: number } {
  if (reservoirCount === 0) return { avg: 0, p95: 0 };

  const currentSize = reservoirCount;
  let sum = 0;
  for (let i = 0; i < currentSize; i++) {
    sum += latencyReservoir[i];
  }

  const sorted = [...latencyReservoir.subarray(0, currentSize)].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(currentSize * 0.95)] ?? sorted[sorted.length - 1];

  return { avg: sum / currentSize, p95 };
}

type SoakSample = {
  elapsedMin: number;
  rssMB: number;
  heapMB: number;
  externalMB: number;
  totalReqs: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  errorCount: number;
};

let stopServer: (() => Promise<void>) | null = null;

async function getMemoryStats(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<{ rss: number; heapUsed: number; external: number }> {
  try {
    const res = await fetch(`${baseUrl}/api/system/health?verbose=true`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(5000),
    });
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

async function runSoakTest() {
  const hours = SOAK_HOURS;
  const dbType = getDbType().toUpperCase();
  console.log(
    `\n🚀 Starting Longevity Soak Test (${hours.toFixed(2)} hours, ${CONCURRENCY}c • ${dbType})...\n`,
  );

  const server = await setupBenchmarkServer();
  stopServer = server.stop;
  const baseUrl = server.baseUrl;

  await ensureStableTestData();
  await forceRefreshServer(baseUrl);
  await stabilize(1000);

  const baseHeaders: Record<string, string> = {
    ...benchmarkAuthHeaders(),
    "content-type": "application/json",
    connection: "keep-alive",
  };

  const samples: SoakSample[] = [];
  let running = true;
  let totalReqs = 0;
  let errorCount = 0;

  const startTime = performance.now();
  const durationMs = hours * 3600000;
  const endTime = startTime + durationMs;

  // Background memory and telemetry sampler
  const sampler = (async () => {
    let nextSample = startTime;
    while (running && performance.now() < endTime) {
      await new Promise((r) => setTimeout(r, Math.max(10, nextSample - performance.now())));
      if (!running || performance.now() >= endTime) break;

      const mem = await getMemoryStats(baseUrl, baseHeaders);
      const elapsedMin = (performance.now() - startTime) / 60000;
      const stats = getReservoirStats();

      samples.push({
        elapsedMin,
        rssMB: parseFloat(mem.rss.toFixed(2)),
        heapMB: parseFloat(mem.heapUsed.toFixed(2)),
        externalMB: parseFloat(mem.external.toFixed(2)),
        totalReqs,
        avgLatencyMs: parseFloat(stats.avg.toFixed(2)),
        p95LatencyMs: parseFloat(stats.p95.toFixed(2)),
        errorCount,
      });

      const h = Math.floor(elapsedMin / 60);
      const m = Math.floor(elapsedMin % 60);
      const s = Math.floor((elapsedMin * 60) % 60);
      const last = samples[samples.length - 1]!;

      process.stdout.write(
        `\r   [${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}] ` +
          `${totalReqs} reqs | RSS ${last.rssMB.toFixed(1)}MB | Heap ${last.heapMB.toFixed(1)}MB | ` +
          `Avg ${last.avgLatencyMs.toFixed(1)}ms | Errs ${errorCount}`,
      );

      nextSample = performance.now() + SAMPLE_INTERVAL_SEC * 1000;
    }
  })();

  const errorCounts: Record<string, number> = {};
  const recordError = (label: string) => {
    errorCounts[label] = (errorCounts[label] || 0) + 1;
    errorCount++;
  };

  // Pre-calculated target endpoints
  const healthUrl = `${baseUrl}/api/system/health`;
  const listUrl = `${baseUrl}/api/collections/BenchmarkStable?limit=5`;
  const itemUrl = `${baseUrl}/api/collections/BenchmarkStable/20000000-0000-4000-8000-000000000001`;
  const schemaUrl = `${baseUrl}/api/collections/BenchmarkStable/schema`;
  const mutationUrl = `${baseUrl}/api/collections/BenchmarkStable`;

  let mutationId = 0;

  // Workload definition with cumulative CDF weights for O(1) selection
  const ops = [
    {
      cumulativeWeight: 35,
      fn: async () => {
        const res = await fetch(healthUrl, {
          method: "GET",
          headers: baseHeaders,
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return recordError("health");
        await res.arrayBuffer().catch(() => {});
      },
    },
    {
      cumulativeWeight: 60,
      fn: async () => {
        const res = await fetch(listUrl, {
          method: "GET",
          headers: baseHeaders,
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return recordError("list");
        await res.arrayBuffer().catch(() => {});
      },
    },
    {
      cumulativeWeight: 80,
      fn: async () => {
        const res = await fetch(itemUrl, {
          method: "GET",
          headers: baseHeaders,
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return recordError("read");
        await res.arrayBuffer().catch(() => {});
      },
    },
    {
      cumulativeWeight: 90,
      fn: async () => {
        const res = await fetch(schemaUrl, {
          method: "GET",
          headers: baseHeaders,
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return recordError("schema");
        await res.arrayBuffer().catch(() => {});
      },
    },
    {
      cumulativeWeight: 100,
      fn: async () => {
        const id = ++mutationId;
        const res = await fetch(mutationUrl, {
          method: "POST",
          headers: baseHeaders,
          body: JSON.stringify({
            _id: crypto.randomUUID(),
            title: `Soak Item ${id}`,
            count: id,
          }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok && res.status !== 201) return recordError("write");
        await res.arrayBuffer().catch(() => {});
      },
    },
  ];

  function selectOperation(): () => Promise<void> {
    const roll = Math.random() * 100;
    for (let i = 0; i < ops.length; i++) {
      if (roll <= ops[i].cumulativeWeight) return ops[i].fn;
    }
    return ops[0].fn;
  }

  // Concurrent worker loops with jittered yield ticks
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (running && performance.now() < endTime) {
      const fn = selectOperation();
      const t0 = performance.now();
      try {
        await fn();
        recordLatency(performance.now() - t0);
        totalReqs++;
      } catch {
        recordError("crash");
      }
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 40));
    }
  });

  // Wait for soak duration to elapse
  await new Promise((r) => setTimeout(r, durationMs));
  running = false;

  await sampler;
  await Promise.allSettled(workers);
  console.log("\n");

  // ── STATISTICAL REGRESSION ANALYSIS (LEAK DETECTION) ──────────────────────
  // Drop initial warm-up samples (first 25% or up to 4) where V8 JIT, schemas,
  // & LRU cache initialize. Then split the steady window into full + tail so we
  // can distinguish warm-up/plateau (early growth, flat tail) from a real leak
  // (sustained growth in the tail).
  const warmupDropCount = Math.min(Math.floor(samples.length * 0.25), 4);
  const steadySamples = samples.length > 5 ? samples.slice(warmupDropCount) : samples;

  const calcSlopeOn = (field: keyof SoakSample, window: SoakSample[]): number => {
    if (window.length < 3) return 0;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    const n = window.length;
    for (let i = 0; i < n; i++) {
      const s = window[i]!;
      const x = s.elapsedMin;
      const y = s[field] as number;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }
    const denominator = n * sumXX - sumX * sumX;
    return denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
  };

  const tailSamples =
    steadySamples.length >= 6
      ? steadySamples.slice(Math.floor(steadySamples.length / 2))
      : steadySamples;

  const rssSlope = calcSlopeOn("rssMB", steadySamples);
  const heapSlope = calcSlopeOn("heapMB", steadySamples);
  const latencySlope = calcSlopeOn("avgLatencyMs", steadySamples);
  const rssTailSlope = calcSlopeOn("rssMB", tailSamples);
  const heapTailSlope = calcSlopeOn("heapMB", tailSamples);

  const firstSample = samples[0] || { rssMB: 0, heapMB: 0, avgLatencyMs: 0, p95LatencyMs: 0 };
  const lastSample = samples[samples.length - 1] || firstSample;
  const elapsedSec = (performance.now() - startTime) / 1000;
  const overallRps = totalReqs / Math.max(elapsedSec, 1);

  const soakResult = {
    name: `${hours.toFixed(2)}h Longevity Soak`,
    avgMs: lastSample.avgLatencyMs,
    p95Ms: lastSample.p95LatencyMs,
    rps: overallRps,
    layer: "Stability",
    shortLabel: "Soak",
    rssDelta: lastSample.rssMB - firstSample.rssMB,
  };

  printTruthTable({
    title: "SVELTYCMS — LONGEVITY SOAK AUDIT",
    shortLabel: "Soak",
    subtitle: `${hours.toFixed(2)}h Mixed Workload • ${dbType}`,
    results: [soakResult],
  });

  const maxAllowedHeapSlope = hours < 0.2 ? 6.0 : 1.0;
  const maxAllowedRssSlope = hours < 0.2 ? 30.0 : 5.0;
  const STABLE_HEAP_SLOPE = 0.5;
  const STABLE_RSS_SLOPE = 2.0;

  // Plateau: the steady-state tail is cooling (growing <40% as fast as the full
  // window) — typical of V8 heap reservation / SQLite page-cache fill, not a leak.
  const rssCooling = rssSlope > 0 && rssTailSlope < rssSlope * 0.4;
  const heapCooling = heapSlope > 0 && heapTailSlope < heapSlope * 0.4;

  const verdict =
    heapTailSlope < STABLE_HEAP_SLOPE && rssTailSlope < STABLE_RSS_SLOPE
      ? "STABLE (No Leak)"
      : (rssCooling || heapCooling) &&
          heapTailSlope < maxAllowedHeapSlope &&
          rssTailSlope < maxAllowedRssSlope
        ? "STABLE (Plateau)"
        : heapTailSlope < maxAllowedHeapSlope
          ? "WATCH"
          : "LEAK DETECTED";

  printSummaryTable(
    [
      { key: "Database Engine", val: dbType, unit: "" },
      { key: "Duration", val: hours.toFixed(2), unit: "hours" },
      { key: "Total Requests", val: totalReqs.toLocaleString(), unit: "" },
      { key: "Overall Throughput", val: Math.round(overallRps), unit: "req/s" },
      { key: "Total Errors", val: errorCount, unit: "" },
      {
        key: "RSS Start → End",
        val: `${firstSample.rssMB.toFixed(1)} → ${lastSample.rssMB.toFixed(1)}`,
        unit: "MB",
      },
      {
        key: "Heap Start → End",
        val: `${firstSample.heapMB.toFixed(1)} → ${lastSample.heapMB.toFixed(1)}`,
        unit: "MB",
      },
      { key: "RSS Growth Rate", val: rssSlope.toFixed(3), unit: "MB/min" },
      { key: "RSS Tail Growth Rate", val: rssTailSlope.toFixed(3), unit: "MB/min" },
      { key: "Heap Growth Rate", val: heapSlope.toFixed(3), unit: "MB/min" },
      { key: "Heap Tail Growth Rate", val: heapTailSlope.toFixed(3), unit: "MB/min" },
      { key: "Latency Drift Rate", val: latencySlope.toFixed(3), unit: "ms/min" },
      { key: "Stability Verdict", val: verdict, unit: "" },
    ],
    "Longevity Soak Summary",
  );

  exportMetric("soak.total_requests", totalReqs, "reqs");
  exportMetric("soak.rss_slope_mb_min", parseFloat(rssSlope.toFixed(4)), "MB/min");
  exportMetric("soak.rss_tail_slope_mb_min", parseFloat(rssTailSlope.toFixed(4)), "MB/min");
  exportMetric("soak.heap_slope_mb_min", parseFloat(heapSlope.toFixed(4)), "MB/min");
  exportMetric("soak.heap_tail_slope_mb_min", parseFloat(heapTailSlope.toFixed(4)), "MB/min");
  exportMetric("soak.latency_slope_ms_min", parseFloat(latencySlope.toFixed(4)), "ms/min");
  exportMetric("soak.avg_latency_ms", lastSample.avgLatencyMs, "ms");
  exportMetric("soak.p95_latency_ms", lastSample.p95LatencyMs, "ms");

  exportResult(soakResult);

  if (heapTailSlope > maxAllowedHeapSlope) {
    throw new Error(
      `HEAP LEAK DETECTED: ${heapTailSlope.toFixed(3)} MB/min steady-state (tail) growth exceeds ${maxAllowedHeapSlope} MB/min threshold over ${hours}h`,
    );
  }
  if (rssTailSlope > maxAllowedRssSlope) {
    throw new Error(
      `RSS LEAK DETECTED: ${rssTailSlope.toFixed(3)} MB/min steady-state (tail) growth exceeds ${maxAllowedRssSlope} MB/min threshold over ${hours}h`,
    );
  }
}

test(
  "Longevity Soak — Memory & Resource Stability",
  async () => {
    try {
      await runSoakTest();
    } finally {
      if (stopServer) {
        await stopServer().catch(() => {});
        stopServer = null;
      }
    }
  },
  Math.max(600_000, Math.round(SOAK_HOURS * 3600000 + 180_000)),
);
