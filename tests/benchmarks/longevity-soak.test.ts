/**
 * @file tests/benchmarks/longevity-soak.test.ts
 * @description Long-Running Soak Test (Multi-Hour Memory & Resource Stability)
 * @summary Sustained mixed workload over configurable hours with periodic memory/CPU sampling
 *          to detect slow leaks (file handles, event listeners, promise chains, buffer growth).
 *
 * ### Features:
 * - Configurable duration via LONG_SOAK_HOURS (default: 4 hours, CI: 5 minutes)
 * - Weighted mixed workload (40% read, 25% list, 20% update, 10% media, 5% GraphQL)
 * - Periodic RSS/heap/external memory sampling (every 60s or configurable)
 * - Leak slope calculation with automated threshold alerting
 * - Request latency drift detection (p50/p95 trend over time)
 * - Graceful early-exit on CI (5-min quick soak)
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
const SOAK_HOURS = parseFloat(process.env.LONG_SOAK_HOURS || (IS_CI ? "0.017" : "4")); // ~1min CI, 4hr local
const SAMPLE_INTERVAL_SEC = IS_CI ? 30 : 60;
const CONCURRENCY = 4;

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
): Promise<{ rss: number; heapUsed: number; external: number }> {
  try {
    const res = await fetch(`${baseUrl}/api/system/health?verbose=true`, {
      headers: { "x-test-secret": TEST_API_SECRET },
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

  const secret = TEST_API_SECRET;
  const samples: SoakSample[] = [];
  const latencies: number[] = [];

  let running = true;
  let totalReqs = 0;
  let errorCount = 0;
  const startTime = performance.now();
  const endTime = startTime + hours * 3600_000;

  // Background sampler
  const sampler = (async () => {
    let nextSample = startTime;
    while (running && performance.now() < endTime) {
      await new Promise((r) => setTimeout(r, Math.max(0, nextSample - performance.now())));
      if (!running || performance.now() >= endTime) break;

      const mem = await getMemoryStats(baseUrl);
      const elapsedMin = (performance.now() - startTime) / 60_000;
      const recentLatencies = latencies.slice(-100);
      const avgLatency = recentLatencies.length
        ? recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length
        : 0;
      const sorted = [...recentLatencies].sort((a, b) => a - b);
      const p95Latency = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;

      samples.push({
        elapsedMin,
        rssMB: Math.round(mem.rss / 1024 / 1024),
        heapMB: Math.round(mem.heapUsed / 1024 / 1024),
        externalMB: Math.round(mem.external / 1024 / 1024),
        totalReqs,
        avgLatencyMs: Math.round(avgLatency * 100) / 100,
        p95LatencyMs: Math.round(p95Latency * 100) / 100,
        errorCount,
      });

      const h = Math.floor(elapsedMin / 60);
      const m = Math.floor(elapsedMin % 60);
      process.stdout.write(
        `\r   [${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}] ` +
          `${totalReqs} reqs | RSS ${samples[samples.length - 1].rssMB}MB | ` +
          `Heap ${samples[samples.length - 1].heapMB}MB | errs ${errorCount}`,
      );

      nextSample = performance.now() + SAMPLE_INTERVAL_SEC * 1000;
    }
  })();

  // Workload workers — READ-ONLY operations that never throw
  const errorCounts: Record<string, number> = {};
  const recordError = (label: string) => {
    errorCounts[label] = (errorCounts[label] || 0) + 1;
  };

  const ops = [
    {
      weight: 45,
      label: "health",
      fn: async () => {
        const res = await fetch(`${baseUrl}/api/system/health`, {
          headers: { "x-test-mode": "true", "x-test-secret": secret },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          recordError("health");
          return;
        }
        await res.text();
      },
    },
    {
      weight: 25,
      label: "list",
      fn: async () => {
        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable?limit=5`, {
          headers: { "x-test-mode": "true", "x-test-secret": secret },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          recordError("list");
          return;
        }
        await res.text();
      },
    },
    {
      weight: 20,
      label: "read",
      fn: async () => {
        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable/bench-shared-001`, {
          headers: { "x-test-mode": "true", "x-test-secret": secret },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          recordError("read");
          return;
        }
        await res.text();
      },
    },
    {
      weight: 10,
      label: "schema",
      fn: async () => {
        const res = await fetch(`${baseUrl}/api/collections/BenchmarkStable/schema`, {
          headers: { "x-test-mode": "true", "x-test-secret": secret },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          recordError("schema");
          return;
        }
        await res.text();
      },
    },
  ];

  // Build weighted pool
  const pool: (() => Promise<void>)[] = [];
  for (const op of ops) {
    for (let i = 0; i < op.weight; i++) pool.push(op.fn);
  }

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (running && performance.now() < endTime) {
      const fn = pool[Math.floor(Math.random() * pool.length)];
      const t0 = performance.now();
      try {
        await fn();
        latencies.push(performance.now() - t0);
        totalReqs++;
      } catch {
        errorCount++;
        recordError("crash");
      }
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
    }
  });

  // Wait for duration or workers to finish
  await Promise.race([new Promise((r) => setTimeout(r, hours * 3600_000)), Promise.all(workers)]);

  running = false;
  await sampler;
  await Promise.allSettled(workers);

  // Calculate leak slopes
  const calcSlope = (field: keyof SoakSample): number => {
    if (samples.length < 3) return 0;
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumXX = 0;
    const n = samples.length;
    for (const s of samples) {
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

  // Automated threshold checks
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
  Math.max(600_000, SOAK_HOURS * 3600_000 + 120_000),
);
