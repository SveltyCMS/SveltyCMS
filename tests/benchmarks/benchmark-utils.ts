/**
 * @file tests/benchmarks/benchmark-utils.ts
 * @description Professional, high-fidelity benchmarking utilities for SveltyCMS.
 * Supports latency & throughput modes, rich statistics, and easy integration.
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
  metrics?: Record<string, any>; // Standardized numeric metrics
  [key: string]: any; // Allow custom metadata
}

/** Standardised metric format for orchestrator consumption */
export interface SystemMetric {
  name: string;
  value: number;
  unit: string;
  _type: "numeric-metric";
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface BenchmarkOptions {
  name: string;
  iterations: number;
  warmupIterations?: number;
  concurrency?: number; // 1 = latency, >1 = throughput test
  runs?: number; // Multiple independent runs for stability
  useNanoseconds?: boolean;
  trimOutliers?: boolean | "iqr"; // "iqr" = Interquartile Range based trimming
  /** If true, exceptions in onIteration count as timed successes, not failures. Useful for isolation testing. */
  tolerateErrors?: boolean;
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

/**
 * Robust concurrent execution semaphore.
 * Prevents Promise.race overhead by managing a fixed worker set.
 */
class AsyncSemaphore {
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise((r) => this.queue.push(r));
  }

  release(): void {
    this.active--;
    if (this.queue.length > 0) {
      this.active++;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

/** Robust concurrent execution pool (semaphore style) */
async function executePool(
  concurrency: number,
  total: number,
  fn: (i: number) => Promise<void> | void,
): Promise<void> {
  const semaphore = new AsyncSemaphore(concurrency);
  const tasks: Promise<void>[] = [];

  for (let i = 0; i < total; i++) {
    await semaphore.acquire();
    const p = (async () => {
      try {
        await fn(i);
      } finally {
        semaphore.release();
      }
    })();
    tasks.push(p);
  }

  await Promise.all(tasks);
}

export async function runBenchmark(options: BenchmarkOptions): Promise<BenchmarkResult> {
  const {
    name,
    iterations,
    warmupIterations = Math.floor(iterations * 0.15),
    concurrency = 1,
    runs = 1,
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

    const getTime = () => performance.now(); // High-precision fractional ms

    const startTotal = getTime();

    await executePool(concurrency, iterations, async (i) => {
      const start = getTime();
      try {
        await onIteration(i);
        const duration = getTime() - start;
        latencies.push(duration);
        successCount++;

        // Brief cooldown to avoid event loop starvation in high concurrency
        if (concurrency > 1 && i % 50 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }
      } catch (err) {
        if (options.tolerateErrors) {
          const duration = getTime() - start;
          latencies.push(duration);
          successCount++;
        } else {
          failureCount++;
          if (failureCount === 1 && !silent) {
            console.error(`\n❌ First error in benchmark '${name}':`, err);
          }
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
  const dbType = process.env.DB_TYPE || "unknown";
  const baseDir = process.env.RESULTS_DIR || path.join(process.cwd(), "tests/benchmarks/results");

  // 🚀 FIX: Prevent double-nesting if baseDir already ends with dbType
  const dir = baseDir.endsWith(dbType) ? baseDir : path.join(baseDir, dbType);

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const safeName = result.name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-");

  // If filename is not a string (e.g. from forEach), use safeName
  const finalFilename = typeof filename === "string" ? filename : `${safeName}.json`;
  const filePath = path.join(dir, finalFilename);

  // Add scriptPath if we can detect it (best effort for reporter matching)
  if (!result.scriptPath && typeof process.argv[1] === "string") {
    const fullPath = process.argv[1];
    if (fullPath.includes("tests/benchmarks/")) {
      result.scriptPath = fullPath.split("tests/benchmarks/")[1].replace(/^/, "tests/benchmarks/");
    }
  }

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
 * Executes a function with detailed memory tracking (RSS and Heap).
 */
export async function runWithMemoryTracking<T>(
  _name: string,
  fn: () => Promise<T>,
): Promise<{ result: T; rssDelta: number; heapDelta: number }> {
  await stabilize();
  const start = process.memoryUsage();
  const result = await fn();
  await stabilize();
  const end = process.memoryUsage();

  const rssDelta = (end.rss - start.rss) / 1024 / 1024;
  const heapDelta = (end.heapUsed - start.heapUsed) / 1024 / 1024;

  return { result, rssDelta, heapDelta };
}

/**
 * Shared Local Dispatcher Mock for REST/API benchmarks.
 */
let cachedHandleApiRequests: any = null;

export async function mockDispatch(
  pathOrEvent:
    | string
    | {
        path: string;
        method?: string;
        body?: any;
        user?: any;
        tenantId?: string;
        headers?: Record<string, string>;
        [key: string]: any;
      },
  method: string = "GET",
) {
  const isString = typeof pathOrEvent === "string";
  let path = isString ? pathOrEvent : pathOrEvent.path;
  const targetMethod = isString ? method : pathOrEvent.method || "GET";
  const body = isString ? undefined : pathOrEvent.body;
  const tenantId = isString ? "global" : pathOrEvent.tenantId || "global";
  const user = isString
    ? { _id: "admin", role: "admin", isAdmin: true }
    : pathOrEvent.user || { _id: "admin", role: "admin", isAdmin: true };
  const customHeaders = isString ? {} : pathOrEvent.headers || {};

  if (!path.startsWith("/")) path = "/" + path;
  if (path.startsWith("/api/")) path = path.replace("/api/", "/");

  // 🚀 FIX: If API_BASE_URL is set, perform a real network fetch
  const apiBase = process.env.API_BASE_URL;
  if (apiBase) {
    const realUrl = `${apiBase}/api${path}`;
    return fetch(realUrl, {
      method: targetMethod,
      headers: {
        "x-tenant-id": tenantId,
        "content-type": "application/json",
        "x-test-secret": process.env.TEST_API_SECRET || "SveltyCMS-Benchmark-Secret-2026",
        ...customHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  if (!cachedHandleApiRequests) {
    const { handleApiRequests } = await import("@src/hooks/handle-api-requests");
    cachedHandleApiRequests = handleApiRequests;
  }

  const url = `http://localhost/api${path}`;

  const event: any = {
    url: new URL(url),
    request: new Request(url, {
      method: targetMethod,
      headers: {
        "x-tenant-id": tenantId,
        "content-type": "application/json",
        "x-test-secret": process.env.TEST_API_SECRET || "SveltyCMS-Benchmark-Secret-2026",
        ...customHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
    locals: { tenantId, user, isAdmin: true },
    cookies: { get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} },
    getClientAddress: () => "127.0.0.1",
    platform: {},
    params: {},
    route: { id: "/api/[...path]" },
  };

  return cachedHandleApiRequests({ event, resolve: async () => new Response("OK") });
}

/**
 * Standardised metric export for the enterprise orchestrator.
 */
export function exportMetric(
  name: string,
  value: number,
  unit: string = "ms",
  extra?: Record<string, any>,
) {
  const metric: SystemMetric = {
    name,
    value,
    unit,
    _type: "numeric-metric",
    timestamp: new Date().toISOString(),
    metadata: extra,
  };

  const dbType = process.env.DB_TYPE || "unknown";
  const baseDir = process.env.RESULTS_DIR || path.join(process.cwd(), "tests/benchmarks/results");

  // 🚀 FIX: Prevent double-nesting if baseDir already ends with dbType
  const dir = baseDir.endsWith(dbType) ? baseDir : path.join(baseDir, dbType);

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const slug = name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
  const filePath = path.join(dir, `${slug}.json`);

  fs.writeFileSync(filePath, JSON.stringify(metric, null, 2));
}

/**
 * Lifecycle helper for benchmarks to manage their own SveltyCMS instance.
 */
export async function setupBenchmarkServer() {
  const { startServer } = await import("../../scripts/benchmark-matrix/server");
  const { ALL_DATABASES } = await import("../../scripts/benchmark-matrix/config");

  const dbType = process.env.DB_TYPE || "sqlite";
  const dbConf =
    ALL_DATABASES.find((d) => (d.useRedis ? `${d.type}-redis` : d.type) === dbType) ||
    ALL_DATABASES[0];

  const port = 4173 + (process.pid % 100);
  const dbName = `bench_tmp_${process.pid}`;

  // Silence logger for the server
  process.env.LOG_LEVEL = "silent";
  process.env.DISABLE_AUDIT_LOGS = "true";
  process.env.API_BASE_URL = `http://127.0.0.1:${port}`;

  const { stop } = await startServer(dbConf, port, dbName);

  return {
    baseUrl: process.env.API_BASE_URL,
    stop,
  };
}

/**
 * Automatically update the benchmark documentation matrix.
 * Triggered if BENCHMARK_UPDATE_DOCS=1 or in CI mode.
 */
export async function updateBenchmarkDocumentation(): Promise<void> {
  if (process.env.BENCHMARK_UPDATE_DOCS !== "1" && !process.env.CI) return;

  console.log("\n📄 Regenerating centralized benchmark report...");

  try {
    // Dynamic import to avoid circular dependencies and only load when needed
    const { generateFinalReport } = await import("../../scripts/benchmark-matrix/reporting");
    await generateFinalReport([], {
      parallelMode: "off",
      skipBuild: true,
      dbFilter: null,
      sectionFilter: null,
      levelFilter: null,
      onlyFilter: null,
      fileFilter: null,
      skipRedis: false,
      retryCount: 0,
      timeoutMs: 30000,
      warmup: false,
      ci: !!process.env.CI,
      list: false,
    });
    console.log("✅ benchmarks.mdx updated successfully.");
  } catch (err: any) {
    console.error("Failed to update report:", err.message);
  }
}
