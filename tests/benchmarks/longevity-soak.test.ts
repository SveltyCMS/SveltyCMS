/**
 * @file tests/benchmarks/longevity-soak.test.ts
 * @description Long-Running Soak Test (Multi-Hour Memory & Resource Stability) [Optimized]
 * @summary Sustained mixed read/write workload over configurable hours with periodic memory/CPU sampling
 * to detect slow leaks (file handles, event listeners, promise chains, buffer growth).
 *
 * Features:
 * - **Full per-bucket series** — `rss` / `heapUsed` / `heapTotal` / `external` / `arrayBuffers` (MB),
 *   host CPU busy %, and per-bucket load (reqs/s, rolling avg + p95, errors). The series is flushed to
 *   `tests/benchmarks/results/<adapter>/soak-series-<profile>-<stamp>.json` after **every** bucket, so an
 *   aborted multi-hour run still leaves an auditable curve, and printed in full at the end.
 * - **Control axis** (`LONG_SOAK_PROFILE=mixed|read-only|idle`) — growth is only attributable with a
 *   control: a retained object graph grows with load, V8 heap commitment and native ceilings grow *to* a
 *   ceiling. `mixed` is the production mix; `read-only` re-points the 10 % write slot at schema
 *   resolution (same request rate, no new rows); `idle` runs **no workload workers** (only the bucket
 *   health probe).
 * - **Noise-aware verdict** — every slope carries a `t` value (slope / standard error) and a verdict is
 *   only issued once the steady window spans ≥ 15 min (≥ 3 observed V8 commitment cycles). Shorter windows
 *   report `INSUFFICIENT WINDOW` instead of a warm-up-dominated `LEAK DETECTED` / `WATCH`, and RSS growth
 *   whose `heapTotal` rises with it is reported as commitment (expected) rather than off-heap retention.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  test,
  setupBenchmarkServer,
  ensureStableTestData,
  forceRefreshServer,
  stabilize,
  printTruthTable,
  printSummaryTable,
  getDbType,
  getResultDbKey,
  ensureBenchmarkResultsDir,
  benchmarkAuthHeaders,
  exportResult,
  exportMetric,
} from "./modules/benchmark-utils";
import { logger } from "@utils/logger";
import "../unit/bun-preload.ts";

const IS_CI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
const SOAK_HOURS = parseFloat(process.env.LONG_SOAK_HOURS || "0.083"); // default 5 min
const SAMPLE_INTERVAL_SEC = Number(process.env.LONG_SOAK_SAMPLE_SEC) || (IS_CI ? 15 : 30);
const CONCURRENCY = 4;

/**
 * Steady-window length below which no leak verdict is issued: the observed V8 commitment
 * cycle in bounded runs is ~2–5 min (`+54 MB` at ~2 min, `+105 MB` at ~4 min), so a window
 * shorter than 3 cycles cannot separate a step from a trend.
 */
const MIN_STEADY_WINDOW_MIN = 15;
/** Warm-up cut: one commitment cycle, capped at 15 % of the run. */
const WARMUP_MIN_CAP = 5;
/** Approximate two-sided 95 % t value for n ≥ 20 samples. */
const T_CRIT = 2.0;
/** Materiality floors (MB/min) — a slope below these is reported, never used for a verdict. */
const HEAP_MATERIAL_MB_MIN = 0.5;
const HEAP_TOTAL_MATERIAL_MB_MIN = 0.5;
const RSS_MATERIAL_MB_MIN = 2.0;
/** RSS ceiling for an adequate window — above this, off-heap growth is worth failing on. */
const RSS_FAIL_MB_MIN = 5.0;

type SoakProfile = "mixed" | "read-only" | "idle";

const PROFILES: readonly SoakProfile[] = ["mixed", "read-only", "idle"] as const;

function resolveProfile(raw: string | undefined): SoakProfile {
  const value = (raw || "mixed").trim().toLowerCase();
  if ((PROFILES as readonly string[]).includes(value)) return value as SoakProfile;
  // Fail loud: silently falling back to `mixed` would mislabel a control run as production load.
  throw new Error(
    `LONG_SOAK_PROFILE="${raw}" is not a soak profile — expected one of: ${PROFILES.join(", ")}`,
  );
}

const PROFILE: SoakProfile = resolveProfile(process.env.LONG_SOAK_PROFILE);

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
  /** Resident set size of the server process — V8 heap + committed native/off-heap pages. */
  rssMB: number;
  /** `heapUsed` — live object graph. A leak signal; commitment shows here as flat oscillation. */
  heapMB: number;
  /** `heapTotal` — V8's committed heap. Steps here are the commitment signature. */
  heapTotalMB: number;
  externalMB: number;
  arrayBuffersMB: number;
  /** Host-wide CPU busy % over the bucket (all processes — includes this load generator). */
  cpuBusyPct: number;
  /** Actual bucket length; the sampler's sleep is only a target. */
  bucketSec: number;
  /** Requests completed during this bucket (workers only — health probes excluded). */
  reqsPerSec: number;
  totalReqs: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  errorCount: number;
};

type SlopeStat = {
  /** MB/min (or the sample field's unit per minute). */
  perMin: number;
  /** Standard error of the slope — the noise floor this host imposes on the fit. */
  se: number;
  /** slope / se; |t| > T_CRIT means the trend is distinguishable from zero. */
  t: number;
  samples: number;
};

type HealthPayload = {
  memory?: Partial<Record<"rss" | "heapUsed" | "heapTotal" | "external" | "arrayBuffers", number>>;
  data?: {
    memory?: Partial<
      Record<"rss" | "heapUsed" | "heapTotal" | "external" | "arrayBuffers", number>
    >;
  };
};

let stopServer: (() => Promise<void>) | null = null;

/**
 * Reads the server's own `process.memoryUsage()` through the health endpoint
 * (`?verbose=true`). Returns `null` when the probe fails — a zero-filled sample would
 * read as a real dip in every series and bias the slopes.
 */
async function getMemoryStats(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<Pick<
  SoakSample,
  "rssMB" | "heapMB" | "heapTotalMB" | "externalMB" | "arrayBuffersMB"
> | null> {
  try {
    const res = await fetch(`${baseUrl}/api/system/health?verbose=true`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(5000),
    });
    const payload = (await res.json()) as HealthPayload;
    const mem = payload.memory || payload.data?.memory || {};
    if (!mem.rss) return null;
    const toMB = (bytes: number | undefined) => (bytes || 0) / 1024 / 1024;
    return {
      rssMB: toMB(mem.rss),
      heapMB: toMB(mem.heapUsed),
      heapTotalMB: toMB(mem.heapTotal),
      externalMB: toMB(mem.external),
      arrayBuffersMB: toMB(mem.arrayBuffers),
    };
  } catch (err) {
    logger.debug(`[Soak] memory probe failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

type CpuTicks = { total: number; idle: number };

/** Host-wide CPU tick totals across all cores — works on every platform (`os.loadavg()` is 0 on Windows). */
function readCpuTicks(): CpuTicks {
  let total = 0;
  let idle = 0;
  for (const cpu of os.cpus()) {
    const t = cpu.times;
    total += t.user + t.nice + t.sys + t.irq + t.idle;
    idle += t.idle;
  }
  return { total, idle };
}

function busyPctSince(prev: CpuTicks, cur: CpuTicks): number {
  const totalDelta = cur.total - prev.total;
  if (totalDelta <= 0) return 0;
  const idleDelta = cur.idle - prev.idle;
  return Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
}

/** Least-squares slope with its standard error — the y-value noise decides whether a slope is real. */
function calcSlopeOn(field: keyof SoakSample, window: SoakSample[]): SlopeStat {
  const n = window.length;
  if (n < 3) return { perMin: 0, se: 0, t: 0, samples: n };
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const s of window) {
    const x = s.elapsedMin;
    const y = s[field] as number;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return { perMin: 0, se: 0, t: 0, samples: n };
  const perMin = (n * sumXY - sumX * sumY) / denominator;
  const meanX = sumX / n;
  const meanY = sumY / n;
  const sxx = sumXX - (sumX * sumX) / n;
  let sse = 0;
  for (const s of window) {
    const x = s.elapsedMin;
    const y = s[field] as number;
    const residual = y - (meanY + perMin * (x - meanX));
    sse += residual * residual;
  }
  const se = sxx > 0 ? Math.sqrt(sse / (n - 2) / sxx) : 0;
  return { perMin, se, t: se > 0 ? perMin / se : 0, samples: n };
}

async function runSoakTest() {
  const hours = SOAK_HOURS;
  const dbType = getDbType().toUpperCase();
  const durationMin = hours * 60;
  console.log(
    `\n🚀 Starting Longevity Soak Test (${hours.toFixed(2)} hours, profile=${PROFILE}, ` +
      `${PROFILE === "idle" ? 0 : CONCURRENCY}c • ${dbType})...\n`,
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
  let missedSamples = 0;

  const startTime = performance.now();
  const durationMs = hours * 3600000;
  const endTime = startTime + durationMs;
  const startedAt = new Date().toISOString();

  // ── Series artifact: flushed after every bucket, so an aborted run still leaves a curve ──
  const seriesPath = path.join(
    ensureBenchmarkResultsDir(),
    `soak-series-${PROFILE}-${startedAt.replace(/[:.]/g, "-")}.json`,
  );
  const seriesHeader = {
    _type: "soak-series",
    profile: PROFILE,
    db: getResultDbKey(),
    startedAt,
    hours,
    sampleIntervalSec: SAMPLE_INTERVAL_SEC,
    concurrency: PROFILE === "idle" ? 0 : CONCURRENCY,
    serverMode: process.env.SVELTY_BENCHMARK_SERVER_MODE || "unknown",
    host: {
      platform: process.platform,
      arch: process.arch,
      cpus: os.cpus().length,
      totalMemGB: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
      node: process.version,
    },
  };
  const writeSeries = (verdict?: string) => {
    try {
      fs.writeFileSync(
        seriesPath,
        JSON.stringify(
          {
            ...seriesHeader,
            missedSamples,
            writeReqs,
            lastSampleMin: samples.length ? samples[samples.length - 1]!.elapsedMin : 0,
            ...(verdict ? { verdict } : {}),
            samples,
          },
          null,
          2,
        ),
      );
    } catch (err) {
      logger.debug(`[Soak] series flush failed: ${err instanceof Error ? err.message : err}`);
    }
  };
  writeSeries();

  // Background load context (roadmap: a soak row must state the machine's background load).
  // Sampled BEFORE the workers start, over 2 s — the idle CPU rate this host runs at.
  const baselineCpuStart = readCpuTicks();
  await new Promise((r) => setTimeout(r, 2000));
  const baselineCpuBusyPct = Number(busyPctSince(baselineCpuStart, readCpuTicks()).toFixed(1));

  // Background memory and telemetry sampler
  const sampler = (async () => {
    let nextSample = startTime;
    let prevReqs = 0;
    let prevSampleTs = startTime;
    let prevCpu = readCpuTicks();
    while (running && performance.now() < endTime) {
      await new Promise((r) => setTimeout(r, Math.max(10, nextSample - performance.now())));
      if (!running || performance.now() >= endTime) break;

      const now = performance.now();
      const bucketSec = Math.max(0.001, (now - prevSampleTs) / 1000);
      const mem = await getMemoryStats(baseUrl, baseHeaders);
      const cpuNow = readCpuTicks();
      if (!mem) {
        missedSamples++;
        prevSampleTs = now;
        prevCpu = cpuNow;
        nextSample = performance.now() + SAMPLE_INTERVAL_SEC * 1000;
        continue;
      }

      const elapsedMin = (now - startTime) / 60000;
      const stats = getReservoirStats();
      const last: SoakSample = {
        elapsedMin: parseFloat(elapsedMin.toFixed(3)),
        rssMB: parseFloat(mem.rssMB.toFixed(2)),
        heapMB: parseFloat(mem.heapMB.toFixed(2)),
        heapTotalMB: parseFloat(mem.heapTotalMB.toFixed(2)),
        externalMB: parseFloat(mem.externalMB.toFixed(2)),
        arrayBuffersMB: parseFloat(mem.arrayBuffersMB.toFixed(2)),
        cpuBusyPct: Number(busyPctSince(prevCpu, cpuNow).toFixed(1)),
        bucketSec: Number(bucketSec.toFixed(1)),
        reqsPerSec: Number(((totalReqs - prevReqs) / bucketSec).toFixed(1)),
        totalReqs,
        avgLatencyMs: parseFloat(stats.avg.toFixed(2)),
        p95LatencyMs: parseFloat(stats.p95.toFixed(2)),
        errorCount,
      };
      samples.push(last);
      writeSeries();

      const h = Math.floor(elapsedMin / 60);
      const m = Math.floor(elapsedMin % 60);
      const s = Math.floor((elapsedMin * 60) % 60);

      process.stdout.write(
        `\r   [${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}] ` +
          `${totalReqs} reqs ${last.reqsPerSec.toFixed(0)}/s | RSS ${last.rssMB.toFixed(1)}MB | HeapUsed ${last.heapMB.toFixed(1)}MB | ` +
          `HeapTotal ${last.heapTotalMB.toFixed(1)}MB | Ext ${last.externalMB.toFixed(1)}MB | CPU ${last.cpuBusyPct.toFixed(0)}% | ` +
          `Avg ${last.avgLatencyMs.toFixed(1)}ms | Errs ${errorCount}`,
      );

      prevReqs = totalReqs;
      prevSampleTs = now;
      prevCpu = cpuNow;
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
  /** Successful creates — the only path that grows the dataset during a soak. */
  let writeReqs = 0;

  // Workload definition with cumulative CDF weights for O(1) selection.
  // Default mix: 35 % health, 25 % list, 20 % item read, 10 % schema, 10 % write.
  const readOps = [
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
  ];
  const writeOp = {
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
      writeReqs++;
      await res.arrayBuffer().catch(() => {});
    },
  };

  // `read-only` promotes the schema read into the write slot: same request rate, no new rows —
  // the control for "growth needs the write path / dataset growth".
  const ops =
    PROFILE === "mixed"
      ? [...readOps, writeOp]
      : readOps.map((op, i) => (i === readOps.length - 1 ? { ...op, cumulativeWeight: 100 } : op));

  function selectOperation(): () => Promise<void> {
    const roll = Math.random() * 100;
    for (let i = 0; i < ops.length; i++) {
      if (roll <= ops[i]!.cumulativeWeight) return ops[i]!.fn;
    }
    return ops[0]!.fn;
  }

  // Concurrent worker loops with jittered yield ticks. `idle` runs none: any growth there
  // cannot be load-driven, which is what attributes growth in the loaded profiles.
  const workers =
    PROFILE === "idle"
      ? []
      : Array.from({ length: CONCURRENCY }, async () => {
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
  // Drop the warm-up (one commitment cycle, capped at 15 % of the run): V8 JIT, schema
  // compilation, LRU/page-cache fill all land there. Then split the steady window into
  // full + tail, so an early plateau can be told from a trend that persists to the end.
  const warmupMin = Math.min(WARMUP_MIN_CAP, Math.max(1, durationMin * 0.15));
  const steadySamples =
    samples.length > 5 ? samples.filter((s) => s.elapsedMin >= warmupMin) : samples;
  const tailSamples =
    steadySamples.length >= 6
      ? steadySamples.slice(Math.floor(steadySamples.length / 2))
      : steadySamples;

  const rssSlope = calcSlopeOn("rssMB", steadySamples);
  const heapSlope = calcSlopeOn("heapMB", steadySamples);
  const heapTotalSlope = calcSlopeOn("heapTotalMB", steadySamples);
  const externalSlope = calcSlopeOn("externalMB", steadySamples);
  const arrayBuffersSlope = calcSlopeOn("arrayBuffersMB", steadySamples);
  const latencySlope = calcSlopeOn("avgLatencyMs", steadySamples);
  const rssTailSlope = calcSlopeOn("rssMB", tailSamples);
  const heapTailSlope = calcSlopeOn("heapMB", tailSamples);
  const heapTotalTailSlope = calcSlopeOn("heapTotalMB", tailSamples);
  const externalTailSlope = calcSlopeOn("externalMB", tailSamples);
  const arrayBuffersTailSlope = calcSlopeOn("arrayBuffersMB", tailSamples);

  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1] || firstSample;
  const elapsedSec = (performance.now() - startTime) / 1000;
  const overallRps = totalReqs / Math.max(elapsedSec, 1);
  const windowMinutes =
    steadySamples.length >= 2
      ? steadySamples[steadySamples.length - 1]!.elapsedMin - steadySamples[0]!.elapsedMin
      : 0;
  const adequateWindow = windowMinutes >= MIN_STEADY_WINDOW_MIN;
  const avgCpuBusyPct = samples.length
    ? samples.reduce((sum, s) => sum + s.cpuBusyPct, 0) / samples.length
    : 0;

  // Load sanity: a falling request rate with a normal p95 is the run winding down, not a hang.
  const midRps = samples.length >= 4 ? samples[Math.floor(samples.length / 2)]!.reqsPerSec : 0;
  const lastRps = lastSample?.reqsPerSec ?? 0;

  // ── Verdict inputs: materiality (MB/min floors) + distinguishability from noise (t) ──
  const heapLeakSignificant =
    heapTailSlope.perMin > HEAP_MATERIAL_MB_MIN && heapTailSlope.t > T_CRIT;
  const heapLeakEgregious = heapTailSlope.perMin > HEAP_MATERIAL_MB_MIN * 3 && heapTailSlope.t > 3;
  const heapLeak = heapLeakSignificant && (adequateWindow || heapLeakEgregious);
  const rssSignificant = rssTailSlope.perMin > RSS_MATERIAL_MB_MIN && rssTailSlope.t > T_CRIT;
  const heapTotalRising =
    heapTotalTailSlope.perMin > HEAP_TOTAL_MATERIAL_MB_MIN && heapTotalTailSlope.t > T_CRIT;
  // Commitment: RSS and heapTotal climb together (V8 claiming pages) — expected, not retention.
  const commitmentLed = heapTotalRising && heapTotalTailSlope.perMin >= rssTailSlope.perMin * 0.5;
  // Off-heap: RSS climbs while V8's committed heap stays flat — native ceilings or a native leak.
  const offHeapLed = rssSignificant && heapTotalTailSlope.perMin < rssTailSlope.perMin * 0.5;
  const rssCooling =
    rssSlope.perMin > 0 && rssTailSlope.perMin < rssSlope.perMin * 0.4 && !offHeapLed;

  const mb = (v: number) => v.toFixed(2);
  let verdict: string;
  if (heapLeak) {
    verdict = `LEAK DETECTED (heapUsed ${mb(heapTailSlope.perMin)} MB/min, t=${heapTailSlope.t.toFixed(1)}${adequateWindow ? "" : ", short window"})`;
  } else if (!adequateWindow) {
    verdict = `INSUFFICIENT WINDOW (steady ${windowMinutes.toFixed(1)}min < ${MIN_STEADY_WINDOW_MIN}min — no leak verdict)`;
  } else if (offHeapLed) {
    verdict = `WATCH (off-heap RSS ${mb(rssTailSlope.perMin)} MB/min, heapTotal flat ${mb(heapTotalTailSlope.perMin)})`;
  } else if (commitmentLed) {
    verdict = `STABLE (V8 commitment: RSS ${mb(rssTailSlope.perMin)} ≈ heapTotal ${mb(heapTotalTailSlope.perMin)} MB/min)`;
  } else if (rssCooling) {
    verdict = "STABLE (Plateau)";
  } else if (heapTailSlope.perMin > HEAP_MATERIAL_MB_MIN) {
    verdict = `WATCH (heapUsed ${mb(heapTailSlope.perMin)} MB/min below noise t=${heapTailSlope.t.toFixed(1)})`;
  } else {
    verdict = "STABLE (No Leak)";
  }
  writeSeries(verdict);

  const soakResult = {
    name:
      PROFILE === "mixed"
        ? `${hours.toFixed(2)}h Longevity Soak`
        : `${hours.toFixed(2)}h Longevity Soak (${PROFILE} control)`,
    avgMs: lastSample?.avgLatencyMs ?? 0,
    p95Ms: lastSample?.p95LatencyMs ?? 0,
    rps: overallRps,
    layer: "Stability",
    shortLabel: "Soak",
    rssDelta: (lastSample?.rssMB ?? 0) - (firstSample?.rssMB ?? 0),
  };

  printTruthTable({
    title: "SVELTYCMS — LONGEVITY SOAK AUDIT",
    shortLabel: "Soak",
    subtitle: `${hours.toFixed(2)}h ${PROFILE} workload • ${dbType}`,
    results: [soakResult],
  });

  // ── Full series (compact, one line per bucket) — the audit trail for a long run ──
  console.log(
    "   min │     RSS │ heapUsed │  heapTot │     ext │    aBuf │ cpu% │ reqs/s │    avg │    p95 │ errs",
  );
  for (const s of samples) {
    console.log(
      `  ${s.elapsedMin.toFixed(1).padStart(4)} │ ` +
        `${s.rssMB.toFixed(1).padStart(7)} │ ${s.heapMB.toFixed(1).padStart(8)} │ ` +
        `${s.heapTotalMB.toFixed(1).padStart(8)} │ ${s.externalMB.toFixed(1).padStart(7)} │ ` +
        `${s.arrayBuffersMB.toFixed(1).padStart(7)} │ ${s.cpuBusyPct.toFixed(0).padStart(4)} │ ` +
        `${s.reqsPerSec.toFixed(0).padStart(6)} │ ${s.avgLatencyMs.toFixed(1).padStart(6)} │ ` +
        `${s.p95LatencyMs.toFixed(1).padStart(6)} │ ${String(s.errorCount).padStart(4)}`,
    );
  }
  console.log(`\n   Series artifact: ${path.relative(process.cwd(), seriesPath)}\n`);

  printSummaryTable(
    [
      { key: "Database Engine", val: dbType, unit: "" },
      { key: "Profile", val: PROFILE, unit: "" },
      { key: "Duration", val: hours.toFixed(2), unit: "hours" },
      { key: "Total Requests", val: totalReqs.toLocaleString(), unit: "" },
      { key: "Writes (dataset growth)", val: writeReqs.toLocaleString(), unit: "" },
      { key: "Overall Throughput", val: Math.round(overallRps), unit: "req/s" },
      { key: "Total Errors", val: errorCount, unit: "" },
      { key: "Missed Samples", val: missedSamples, unit: "" },
      {
        key: "RSS Start → End",
        val: `${(firstSample?.rssMB ?? 0).toFixed(1)} → ${(lastSample?.rssMB ?? 0).toFixed(1)}`,
        unit: "MB",
      },
      {
        key: "HeapUsed Start → End",
        val: `${(firstSample?.heapMB ?? 0).toFixed(1)} → ${(lastSample?.heapMB ?? 0).toFixed(1)}`,
        unit: "MB",
      },
      {
        key: "HeapTotal Start → End",
        val: `${(firstSample?.heapTotalMB ?? 0).toFixed(1)} → ${(lastSample?.heapTotalMB ?? 0).toFixed(1)}`,
        unit: "MB",
      },
      { key: "Steady Window", val: windowMinutes.toFixed(1), unit: "min" },
      {
        key: "RSS Tail Growth (t)",
        val: `${mb(rssTailSlope.perMin)} (${rssTailSlope.t.toFixed(1)})`,
        unit: "MB/min",
      },
      {
        key: "HeapUsed Tail Growth (t)",
        val: `${mb(heapTailSlope.perMin)} (${heapTailSlope.t.toFixed(1)})`,
        unit: "MB/min",
      },
      {
        key: "HeapTotal Tail Growth (t)",
        val: `${mb(heapTotalTailSlope.perMin)} (${heapTotalTailSlope.t.toFixed(1)})`,
        unit: "MB/min",
      },
      { key: "External Tail Growth", val: mb(externalTailSlope.perMin), unit: "MB/min" },
      { key: "ArrayBuffers Tail Growth", val: mb(arrayBuffersTailSlope.perMin), unit: "MB/min" },
      { key: "Latency Drift Rate", val: latencySlope.perMin.toFixed(3), unit: "ms/min" },
      {
        key: "Host CPU Busy (baseline → avg)",
        val: `${baselineCpuBusyPct} → ${avgCpuBusyPct.toFixed(1)}`,
        unit: "%",
      },
      {
        key: "Throughput Mid → Last Bucket",
        val: `${midRps.toFixed(0)} → ${lastRps.toFixed(0)}`,
        unit: "req/s",
      },
      { key: "Stability Verdict", val: verdict, unit: "" },
    ],
    "Longevity Soak Summary",
  );

  exportMetric("soak.total_requests", totalReqs, "reqs");
  exportMetric("soak.writes", writeReqs, "reqs");
  exportMetric("soak.rss_slope_mb_min", parseFloat(rssSlope.perMin.toFixed(4)), "MB/min");
  exportMetric("soak.rss_tail_slope_mb_min", parseFloat(rssTailSlope.perMin.toFixed(4)), "MB/min");
  exportMetric("soak.heap_slope_mb_min", parseFloat(heapSlope.perMin.toFixed(4)), "MB/min");
  exportMetric(
    "soak.heap_tail_slope_mb_min",
    parseFloat(heapTailSlope.perMin.toFixed(4)),
    "MB/min",
  );
  exportMetric(
    "soak.heap_total_slope_mb_min",
    parseFloat(heapTotalSlope.perMin.toFixed(4)),
    "MB/min",
  );
  exportMetric(
    "soak.heap_total_tail_slope_mb_min",
    parseFloat(heapTotalTailSlope.perMin.toFixed(4)),
    "MB/min",
  );
  exportMetric("soak.external_slope_mb_min", parseFloat(externalSlope.perMin.toFixed(4)), "MB/min");
  exportMetric(
    "soak.external_tail_slope_mb_min",
    parseFloat(externalTailSlope.perMin.toFixed(4)),
    "MB/min",
  );
  exportMetric(
    "soak.array_buffers_slope_mb_min",
    parseFloat(arrayBuffersSlope.perMin.toFixed(4)),
    "MB/min",
  );
  exportMetric(
    "soak.array_buffers_tail_slope_mb_min",
    parseFloat(arrayBuffersTailSlope.perMin.toFixed(4)),
    "MB/min",
  );
  exportMetric("soak.rss_tail_slope_t", parseFloat(rssTailSlope.t.toFixed(3)), "t");
  exportMetric("soak.heap_tail_slope_t", parseFloat(heapTailSlope.t.toFixed(3)), "t");
  exportMetric("soak.steady_window_min", parseFloat(windowMinutes.toFixed(2)), "min");
  exportMetric("soak.cpu_busy_pct", parseFloat(avgCpuBusyPct.toFixed(2)), "%");
  exportMetric("soak.latency_slope_ms_min", parseFloat(latencySlope.perMin.toFixed(4)), "ms/min");
  exportMetric("soak.avg_latency_ms", lastSample?.avgLatencyMs ?? 0, "ms");
  exportMetric("soak.p95_latency_ms", lastSample?.p95LatencyMs ?? 0, "ms");

  exportResult(soakResult);

  if (heapLeak) {
    throw new Error(
      `HEAP LEAK DETECTED: heapUsed ${mb(heapTailSlope.perMin)} MB/min in the steady tail ` +
        `(t=${heapTailSlope.t.toFixed(1)} over ${windowMinutes.toFixed(1)}min, steady window from ${warmupMin.toFixed(1)}min) — ` +
        `heapUsed is retaining on the ${PROFILE} profile.`,
    );
  }
  if (adequateWindow && offHeapLed && rssTailSlope.perMin > RSS_FAIL_MB_MIN) {
    throw new Error(
      `OFF-HEAP GROWTH: RSS ${mb(rssTailSlope.perMin)} MB/min over ${windowMinutes.toFixed(1)}min while heapTotal stays ` +
        `flat (${mb(heapTotalTailSlope.perMin)} MB/min, t=${heapTotalTailSlope.t.toFixed(1)}) — native/off-heap retention, ` +
        `not V8 commitment. Re-run with LONG_SOAK_PROFILE=idle to separate load-driven growth from a ceiling that simply fills.`,
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
