/**
 * @file tests/benchmarks/benchmark-utils.ts
 * @description Professional, high-fidelity benchmarking utilities for SveltyCMS.
 *              Supports latency & throughput modes, rich statistics, and easy integration.
 */

import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  stdDev: number;
  marginOfError: number; // 95% confidence margin
  rssDelta?: number; // Optional memory RSS delta
  rps: number;
  successCount: number;
  failureCount: number;
  timestamp: string;
  phases?: any[]; // For multi-phase benchmarks
  [key: string]: any; // Allow custom metadata
}

export interface BenchmarkOptions {
  name: string;
  iterations: number;
  warmupIterations?: number;
  concurrency?: number; // 1 = latency, >1 = throughput test
  runs?: number; // Multiple independent runs for stability
  useNanoseconds?: boolean;
  trimOutliers?: boolean | "iqr"; // "iqr" = Interquartile Range based trimming
  onIteration: (index: number) => Promise<void> | void;
  onWarmup?: (index: number) => Promise<void> | void;
  onSetup?: () => Promise<void> | void;
  onTeardown?: () => Promise<void> | void;
  silent?: boolean;
  measureMemory?: boolean;
}

/** Stabilize runtime (GC + yield) */
export async function stabilize(): Promise<void> {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
  await new Promise((r) => setTimeout(r, 60)); // yield to let system settle
}

/** Robust concurrent execution pool (semaphore style) */
async function executePool(
  concurrency: number,
  total: number,
  fn: (i: number) => Promise<void> | void,
): Promise<void> {
  const executing = new Set<Promise<unknown>>();

  for (let i = 0; i < total; i++) {
    const p = Promise.resolve().then(() => fn(i));
    executing.add(p);
    p.finally(() => executing.delete(p));

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
}

export async function runBenchmark(options: BenchmarkOptions): Promise<BenchmarkResult> {
  const {
    name,
    iterations,
    warmupIterations = Math.floor(iterations * 0.15),
    concurrency = 1,
    runs = 1,
    useNanoseconds = typeof Bun !== "undefined",
    trimOutliers = true,
    onIteration,
    onWarmup,
    onSetup,
    onTeardown,
    silent = false,
    measureMemory = false,
  } = options;

  if (!silent) {
    console.log(`\n🚀 Benchmark: ${name} (${runs} run${runs > 1 ? "s" : ""})`);
    console.log(
      `   Iterations: ${iterations} | Concurrency: ${concurrency} | Warmup: ${warmupIterations}`,
    );
  }

  if (onSetup) await onSetup();

  const allResults: BenchmarkResult[] = [];

  for (let run = 1; run <= runs; run++) {
    if (runs > 1 && !silent) console.log(`   Run ${run}/${runs}...`);

    // Warmup phase (always serial)
    if (warmupIterations > 0) {
      const warmupFn = onWarmup || onIteration;
      if (!silent) process.stdout.write(`   🔥 Warming up... `);
      await executePool(1, warmupIterations, warmupFn);
      if (!silent) process.stdout.write(`Done.\n`);
      await stabilize();
    }

    // Measurement phase
    const latencies: number[] = [];
    let successCount = 0;
    let failureCount = 0;
    const memStart = measureMemory ? process.memoryUsage() : null;

    const getTime = useNanoseconds
      ? () => Number((Bun as any).nanoseconds()) / 1_000_000
      : () => performance.now();

    const startTotal = getTime();

    await executePool(concurrency, iterations, async (i) => {
      const start = getTime();
      try {
        await onIteration(i);
        latencies.push(getTime() - start);
        successCount++;
      } catch (err) {
        failureCount++;
        if (failureCount === 1 && !silent) {
          console.error(`\n❌ First error in benchmark '${name}':`, err);
        }
      }
    });

    const totalMs = getTime() - startTotal;
    if (onTeardown) await onTeardown();

    // --- Statistics ---
    latencies.sort((a, b) => a - b);

    let processed = latencies;
    if (trimOutliers) {
      if (trimOutliers === "iqr" && latencies.length > 20) {
        // Robust Interquartile Range based trimming
        const q1 = latencies[Math.floor(latencies.length * 0.25)];
        const q3 = latencies[Math.floor(latencies.length * 0.75)];
        const iqr = q3 - q1;
        const low = q1 - 1.5 * iqr;
        const high = q3 + 1.5 * iqr;
        processed = latencies.filter((v) => v >= low && v <= high);
      } else if (latencies.length > 30) {
        // Fallback or default: 2% trim from each end
        const trim = Math.floor(latencies.length * 0.02);
        processed = latencies.slice(trim, latencies.length - trim);
      }
    }

    const avgMs = processed.reduce((a, b) => a + b, 0) / processed.length || 0;
    const minMs = processed[0] || 0;
    const maxMs = processed[processed.length - 1] || 0;
    const p50Ms = processed[Math.floor(processed.length * 0.5)] || 0;
    const p95Ms = processed[Math.floor(processed.length * 0.95)] || 0;
    const p99Ms = processed[Math.floor(processed.length * 0.99)] || 0;

    const squareDiffs = processed.map((v) => (v - avgMs) ** 2);
    const variance = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length || 0;
    const stdDev = Math.sqrt(variance);

    // Margin of Error (95% confidence interval)
    const marginOfError = (stdDev * 1.96) / Math.sqrt(processed.length);

    const rps = totalMs > 0 ? (successCount / totalMs) * 1000 : 0;

    const result: BenchmarkResult = {
      name: runs > 1 ? `${name} (run ${run})` : name,
      iterations,
      totalMs: Number(totalMs.toFixed(2)),
      avgMs: Number(avgMs.toFixed(4)),
      minMs: Number(minMs.toFixed(4)),
      maxMs: Number(maxMs.toFixed(4)),
      p50Ms: Number(p50Ms.toFixed(4)),
      p95Ms: Number(p95Ms.toFixed(4)),
      p99Ms: Number(p99Ms.toFixed(4)),
      stdDev: Number(stdDev.toFixed(4)),
      marginOfError: Number(marginOfError.toFixed(4)),
      rps: Number(rps.toFixed(1)),
      successCount,
      failureCount,
      timestamp: new Date().toISOString(),
      rssDelta: memStart ? (process.memoryUsage().rss - memStart.rss) / 1024 / 1024 : undefined,
    };

    allResults.push(result);
    if (!silent) {
      printReport(result, process.memoryUsage(), memStart);
    }

    await stabilize();
  }

  // Aggregate multiple runs
  if (runs > 1) {
    const aggregate = computeAggregate(allResults, name);
    if (!silent) {
      console.log(`\n📊 AGGREGATE across ${runs} runs:`);
      printReport(aggregate);
    }
    return aggregate;
  }

  if (allResults[0].successCount === 0 && iterations > 0) {
    throw new Error(
      `Benchmark '${name}' failed completely (${iterations} iterations, 0 successes).`,
    );
  }

  return allResults[0];
}

function computeAggregate(results: BenchmarkResult[], baseName: string): BenchmarkResult {
  const n = results.length;
  const avgStdDev = results.reduce((s, r) => s + r.stdDev, 0) / n;
  return {
    ...results[0],
    name: `${baseName} (aggregate)`,
    avgMs: results.reduce((s, r) => s + r.avgMs, 0) / n,
    totalMs: results.reduce((s, r) => s + r.totalMs, 0) / n,
    p50Ms: results.reduce((s, r) => s + r.p50Ms, 0) / n,
    p95Ms: results.reduce((s, r) => s + r.p95Ms, 0) / n,
    p99Ms: results.reduce((s, r) => s + r.p99Ms, 0) / n,
    stdDev: avgStdDev,
    marginOfError: (avgStdDev * 1.96) / Math.sqrt(results[0].iterations),
    rps: results.reduce((s, r) => s + r.rps, 0) / n,
    successCount: Math.round(results.reduce((s, r) => s + r.successCount, 0) / n),
    failureCount: Math.round(results.reduce((sum, r) => sum + r.failureCount, 0) / n),
  };
}

function printReport(r: BenchmarkResult, memAfter?: any, memBefore?: any) {
  const table = [
    { Metric: "Average Latency", Value: `${r.avgMs} ms (±${r.marginOfError} MoE)` },
    { Metric: "p50 (Median)", Value: `${r.p50Ms} ms` },
    { Metric: "p95", Value: `${r.p95Ms} ms` },
    { Metric: "p99", Value: `${r.p99Ms} ms` },
    { Metric: "Min / Max", Value: `${r.minMs} / ${r.maxMs} ms` },
    { Metric: "Std Deviation", Value: `${r.stdDev} ms` },
    { Metric: "Throughput", Value: `${r.rps.toLocaleString()} req/sec` },
    {
      Metric: "Success Rate",
      Value: `${((r.successCount / r.iterations) * 100).toFixed(2)}% (${r.successCount}/${r.iterations})`,
    },
  ];

  if (memAfter && memBefore) {
    const rssDelta = ((memAfter.rss - memBefore.rss) / 1024 / 1024).toFixed(2);
    table.push({ Metric: "RSS Delta", Value: `${rssDelta} MB` });
  }

  console.table(table);
  console.log(`🏁 Total time: ${r.totalMs.toFixed(1)} ms\n`);
}

/**
 * Exports results to a JSON file. Now supports partial results (e.g. suites/phases).
 */
export function exportResult(result: Partial<BenchmarkResult> & { name: string }, filename?: any) {
  const dir = process.env.RESULTS_DIR || path.join(process.cwd(), "tests/benchmarks/results");
  fs.mkdirSync(dir, { recursive: true });

  const safeName = result.name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-");

  // If filename is not a string (e.g. from forEach), use safeName
  const finalFilename = typeof filename === "string" ? filename : `${safeName}.json`;
  const filePath = path.join(dir, finalFilename);

  fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
}

/**
 * Common safeguard to ensure benchmarks run with mocks disabled.
 */
export function checkBenchmarkEnv() {
  if (process.env.BUN_TEST_MOCKS !== "false") {
    console.warn(
      "\n⚠️  [BENCHMARK] Warning: BUN_TEST_MOCKS is not set to 'false'. Results may be biased by mocks.\n",
    );
  }
}

/**
 * Shared Local Dispatcher Mock for REST/API benchmarks.
 */
export async function mockDispatch(
  pathOrEvent: string | { path: string; method?: string; body?: any; [key: string]: any },
  method: string = "GET",
) {
  const { handleApiRequests } = await import("@src/hooks/handle-api-requests");

  let path = typeof pathOrEvent === "string" ? pathOrEvent : pathOrEvent.path;
  const targetMethod = typeof pathOrEvent === "string" ? method : pathOrEvent.method || "GET";
  const body = typeof pathOrEvent === "string" ? undefined : pathOrEvent.body;
  const tenantId = typeof pathOrEvent === "string" ? "global" : pathOrEvent.tenantId || "global";

  if (!path.startsWith("/")) path = "/" + path;
  const url = `http://localhost/api${path}`;

  const event: any = {
    url: new URL(url),
    request: new Request(url, {
      method: targetMethod,
      headers: { "x-tenant-id": tenantId },
      body: body ? JSON.stringify(body) : undefined,
    }),
    locals: { tenantId, user: { _id: "admin", role: "admin" } },
    cookies: { get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} },
    getClientAddress: () => "127.0.0.1",
    platform: {},
    params: {},
    route: { id: "/api/[...path]" },
  };

  return handleApiRequests({ event, resolve: async () => new Response("OK") });
}
