/**
 * @file tests/benchmarks/longevity-soak.test.ts
 * @description Long-Running Soak Test (Multi-Hour Memory & Resource Stability) [Optimized]
 * @summary Sustained mixed workload over configurable hours with periodic memory/CPU sampling
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
  TEST_API_SECRET,
} from "./modules/benchmark-utils";
import "../unit/bun-preload.ts";

const IS_CI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const SOAK_HOURS = parseFloat(process.env.LONG_SOAK_HOURS || "0.083"); // default 5 min, override with LONG_SOAK_HOURS
const SAMPLE_INTERVAL_SEC = IS_CI ? 30 : 60;
const CONCURRENCY = 4;

// Use a fixed size circular buffer to keep latency tracking memory profile entirely O(1)
const LATENCY_RESERVOIR_SIZE = 500;
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
  const p95 = sorted[Math.floor(currentSize * 0.95)] || 0;

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
    const data = await res.json();
    const mem = data.memory || data.data?.memory || {};
    return {
      rss: mem.rss || 0,
      heapUsed: mem.heapUsed || 0,
      external: mem.external || 0,
    };
  } catch {
    return { rss: 0, heapUsed: 0, external: 0 };
  }
}

async function runSoakTest() {
  const hours = SOAK_HOURS;
  console.log(
    `\n🚀 Starting Longevity Soak Test (${hours.toFixed(1)} hours, ${CONCURRENCY}c)...\n`,
  );

  const server = await setupBenchmarkServer();
  stopServer = server.stop;
  const baseUrl = server.baseUrl;

  await ensureStableTestData();
  await forceRefreshServer(baseUrl);
  await stabilize(2000);

  // Canonical lowercase static header references
  const baseHeaders = {
    "x-test-mode": "true",
    "x-test-secret": TEST_API_SECRET,
  };

  const healthCheckHeaders = {
    "x-test-secret": TEST_API_SECRET,
  };

  const samples: SoakSample[] = [];
  let running = true;
  let totalReqs = 0;
  let errorCount = 0;

  const startTime = performance.now();
  const endTime = startTime + hours * 3600000;

  // Background sampler
  const sampler = (async () => {
    let nextSample = startTime;
    while (running && performance.now() < endTime) {
      await new Promise((r) => setTimeout(r, Math.max(0, nextSample - performance.now())));
      if (!running || performance.now() >= endTime) break;

      const mem = await getMemoryStats(baseUrl, healthCheckHeaders);
      const elapsedMin = (performance.now() - startTime) / 60000;

      const stats = getReservoirStats();

      samples.push({
        elapsedMin,
        rssMB: Math.round(mem.rss / 1024 / 1024),
        heapMB: Math.round(mem.heapUsed / 1024 / 1024),
        externalMB: Math.round(mem.external / 1024 / 1024),
        totalReqs,
        avgLatencyMs: Math.round(stats.avg * 100) / 100,
        p95LatencyMs: Math.round(stats.p95 * 100) / 100,
        errorCount,
      });

      const h = Math.floor(elapsedMin / 60);
      const m = Math.floor(elapsedMin % 60);
      process.stdout.write(
        `\r   [${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}] ` +
          `${totalReqs} reqs | RSS ${samples[samples.length - 1]!.rssMB}MB | ` +
          `Heap ${samples[samples.length - 1]!.heapMB}MB | errs ${errorCount}`,
      );

      nextSample = performance.now() + SAMPLE_INTERVAL_SEC * 1000;
    }
  })();

  const errorCounts: Record<string, number> = {};
  const recordError = (label: string) => {
    errorCounts[label] = (errorCounts[label] || 0) + 1;
  };

  // Reuse uniform configuration templates across fetch iterations
  const ops = [
    {
      weight: 45,
      fn: async () => {
        const res = await fetch(`${baseUrl}/api/system/health`, {
          method: "GET",
          headers: baseHeaders,
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return recordError("health");
        await res.arrayBuffer();
      },
    },
    {
      weight: 25,
      fn: async () => {
        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable?limit=5`, {
          method: "GET",
          headers: baseHeaders,
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return recordError("list");
        await res.arrayBuffer();
      },
    },
    {
      weight: 20,
      fn: async () => {
        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable/bench-shared-001`, {
          method: "GET",
          headers: baseHeaders,
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return recordError("read");
        await res.arrayBuffer();
      },
    },
    {
      weight: 10,
      fn: async () => {
        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable/schema`, {
          method: "GET",
          headers: baseHeaders,
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) return recordError("schema");
        await res.arrayBuffer();
      },
    },
  ];

  const pool: (() => Promise<void>)[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    for (let w = 0; w < op.weight; w++) pool.push(op.fn);
  }
  const poolLength = pool.length;

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (running && performance.now() < endTime) {
      const fn = pool[Math.floor(Math.random() * poolLength)]!;
      const t0 = performance.now();
      try {
        await fn();
        recordLatency(performance.now() - t0);
        totalReqs++;
      } catch {
        errorCount++;
        recordError("crash");
      }
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
    }
  });

  await Promise.race([new Promise((r) => setTimeout(r, hours * 3600000)), Promise.all(workers)]);

  running = false;
  await sampler;
  await Promise.allSettled(workers);

  const calcSlope = (field: keyof SoakSample): number => {
    if (samples.length < 3) return 0;
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumXX = 0;
    const n = samples.length;
    for (let i = 0; i < n; i++) {
      const s = samples[i]!;
      const x = s.elapsedMin;
      const y = s[field] as number;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  };

  const rssSlope = calcSlope("rssMB");
  const heapSlope = calcSlope("heapMB");
  const latencySlope = calcSlope("avgLatencyMs");

  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];

  printTruthTable({
    title: "SVELTYCMS — LONGEVITY SOAK AUDIT",
    shortLabel: "Soak",
    subtitle: `${hours.toFixed(1)}h Mixed Workload • ${getDbType().toUpperCase()}`,
    results: [
      {
        name: `${hours.toFixed(0)}h Soak`,
        avgMs: lastSample?.avgLatencyMs || 0,
        p95Ms: lastSample?.p95LatencyMs || 0,
        rps: totalReqs / (hours * 3600),
        layer: "Stability",
        rssDelta: (lastSample?.rssMB || 0) - (firstSample?.rssMB || 0),
      },
    ],
  });

  printSummaryTable([
    { key: "Duration", val: hours.toFixed(1), unit: "hours" },
    { key: "Total Requests", val: totalReqs, unit: "" },
    { key: "Errors", val: errorCount, unit: "" },
    {
      key: "RSS Start → End",
      val: `${firstSample?.rssMB || 0} → ${lastSample?.rssMB || 0}`,
      unit: "MB",
    },
    { key: "RSS Leak Slope", val: rssSlope.toFixed(3), unit: "MB/min" },
    { key: "Heap Leak Slope", val: heapSlope.toFixed(3), unit: "MB/min" },
    { key: "Latency Drift", val: latencySlope.toFixed(3), unit: "ms/min" },
    {
      key: "Verdict",
      val: heapSlope < 0.1 && rssSlope < 0.5 ? "STABLE" : heapSlope < 0.5 ? "WATCH" : "LEAK",
      unit: "",
    },
  ]);

  if (heapSlope > 1.0) {
    throw new Error(`HEAP LEAK DETECTED: ${heapSlope.toFixed(3)} MB/min growth over ${hours}h`);
  }
  if (rssSlope > 5.0) {
    throw new Error(`RSS LEAK DETECTED: ${rssSlope.toFixed(3)} MB/min growth over ${hours}h`);
  }
  if (latencySlope > 0.5) {
    console.warn(
      `⚠️  Latency drift detected: ${latencySlope.toFixed(3)} ms/min (possible resource saturation)`,
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
  Math.max(600000, SOAK_HOURS * 3600000 + 120000),
);
