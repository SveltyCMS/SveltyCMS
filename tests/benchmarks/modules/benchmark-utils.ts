/**
 * @file tests/benchmark./modules/benchmark-utils.ts
 * @description Enterprise benchmarking core for SveltyCMS.
 * Standardizes execution, statistical analysis (percentiles, CV), memory auditing,
 * and professional reporting across all 19+ audit modules.
 */
import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";
import { pushTableToMdx, appendSummaryToMdx } from "./benchmark-reporting";

// 🟢 Bun/Node compatibility: Shim `node:v8` for the `bson` package
// so MongoDB benchmarks can run under `bun test` (not just vitest/Node).
import "@utils/v8-shim";

// Re-export isolation paths for benchmark modules
export {
  BENCHMARK_COLLECTIONS_DIR,
  BENCHMARK_COMPILED_DIR,
  USER_COLLECTIONS_DIR,
  USER_COMPILED_DIR,
  getBenchmarkWorkspace,
  prepareBenchmarkCompiledWorkspace,
  cleanupBenchmarkCompiledWorkspace,
  cleanupAllBenchmarkWorkspaces,
} from "@utils/benchmark-paths";

// ── Standalone Shim (Compatibility for 'bun run') ────────────────────────────
/**
 * 🚀 Standalone Test Runner Shim
 * Allows .test.ts files to be run with 'bun run' while maintaining 'bun test' compatibility.
 * Detects if it is being run within a test runner or as a standalone script.
 */
const isTestRunner =
  !!process.env.BUN_TEST ||
  (typeof (globalThis as any).test !== "undefined" && !process.env.BENCHMARK_STANDALONE);

// 🚀 Auto-Redirector: Ensures benchmarks always run via 'bun test' engine
if (!isTestRunner && !process.env.BENCHMARK_REDIRECTED) {
  const filePath = process.argv[1];
  if (filePath && (filePath.endsWith(".test.ts") || filePath.endsWith(".bench.ts"))) {
    console.log(
      "\n\x1b[33m[NOTICE]\x1b[0m SveltyCMS Benchmarks must be executed via \x1b[1m'bun test'\x1b[0m for maximum precision and automatic resource cleanup.",
    );
    console.log(
      `\x1b[36m[AUTO-REDIRECT]\x1b[0m Rerunning \x1b[1m${path.basename(filePath)}\x1b[0m via the Bun Test Engine...\n`,
    );

    const { spawnSync } = require("node:child_process");
    const result = spawnSync("bun", ["test", ...process.argv.slice(1)], {
      stdio: "inherit",
      env: { ...process.env, BENCHMARK_REDIRECTED: "true" },
      shell: process.platform === "win32",
    });
    process.exit(result.status || 0);
  }
}

let testFn = (globalThis as any).test;
let describeFn = (globalThis as any).describe;
let beforeAllFn = (globalThis as any).beforeAll;
let afterAllFn = (globalThis as any).afterAll;
let beforeEachFn = (globalThis as any).beforeEach;
let afterEachFn = (globalThis as any).afterEach;

if (typeof Bun !== "undefined") {
  try {
    const bunTest = require("bun:test");
    testFn = bunTest.test;
    describeFn = bunTest.describe;
    beforeAllFn = bunTest.beforeAll;
    afterAllFn = bunTest.afterAll;
    beforeEachFn = bunTest.beforeEach;
    afterEachFn = bunTest.afterEach;
  } catch {
    // Ignore
  }
}

export const test = (name: string, fn: any, timeout?: number) => {
  _benchmarkTestStartTime = performance.now();
  if (testFn) {
    try {
      return testFn(name, fn, timeout);
    } catch {
      // Fallback
    }
  }
  return (async () => {
    await fn();
  })();
};

export const expect = (val: any) => {
  if (typeof (globalThis as any).expect !== "undefined") return (globalThis as any).expect(val);

  return {
    toBe: (exp: any) => {
      if (val !== exp) throw new Error(`Expected ${val} to be ${exp}`);
    },
    toBeGreaterThan: (exp: any) => {
      if (val <= exp) throw new Error(`Expected ${val} > ${exp}`);
    },
    toBeLessThan: (exp: any) => {
      if (val >= exp) throw new Error(`Expected ${val} < ${exp}`);
    },
    toBeDefined: () => {
      if (val === undefined) throw new Error(`Expected defined`);
    },
    toEqual: (exp: any) => {
      const s1 = JSON.stringify(val);
      const s2 = JSON.stringify(exp);
      if (s1 !== s2) throw new Error(`Expected ${s1} to equal ${s2}`);
    },
    toBeTruthy: () => {
      if (!val) throw new Error(`Expected truthy`);
    },
    toBeFalsy: () => {
      if (val) throw new Error(`Expected falsy`);
    },
    toContain: (exp: any) => {
      if (!val.includes(exp)) throw new Error(`Expected to contain ${exp}`);
    },
  };
};

export const describe = (name: string, fn: any) => {
  if (describeFn) {
    try {
      return describeFn(name, fn);
    } catch {
      // Fallback
    }
  }
  console.log(`\n\x1b[35m[SUITE]\x1b[0m ${name}`);
  return fn();
};

export const it = test;

export const beforeAll = (fn: any, timeout?: number) => {
  if (beforeAllFn) {
    try {
      return beforeAllFn(fn, timeout);
    } catch {
      // Fallback
    }
  }
  return fn();
};

export const afterAll = (fn: any, timeout?: number) => {
  if (afterAllFn) {
    try {
      return afterAllFn(fn, timeout);
    } catch {
      // Fallback
    }
  }
  return fn();
};

export const beforeEach = (fn: any, timeout?: number) => {
  if (beforeEachFn) {
    try {
      return beforeEachFn(fn, timeout);
    } catch {
      // Fallback
    }
  }
  return fn();
};

export const afterEach = (fn: any, timeout?: number) => {
  if (afterEachFn) {
    try {
      return afterEachFn(fn, timeout);
    } catch {
      // Fallback
    }
  }
  return fn();
};

// ── silencing noise ─────────────────────────────────────────────────────────
(globalThis as any).__SVELTY_QUIET__ = true;
// Align all benchmark runtime flags (GraphQL, scanners, compile) — same contract as matrix server
process.env.BENCHMARK = "true";
process.env.BENCHMARK_MODE = process.env.BENCHMARK_MODE || "1";
process.env.BENCHMARK_STABLE = process.env.BENCHMARK_STABLE || "true";
process.env.SVELTY_BENCHMARK_SUITE = process.env.SVELTY_BENCHMARK_SUITE || "true";
process.env.TEST_MODE = process.env.TEST_MODE || "true";

// 🛡️ AUTO-CLEANUP: Global hook to prevent connection leaks and collection pollution
afterAll(async () => {
  // Finalize report only in standalone mode (matrix calls it once for all tests)
  if (process.env.BENCHMARK_MATRIX !== "1") {
    try {
      const { finalizeReport } = await import("./benchmark-reporting");
      await finalizeReport(_currentRunId);
    } catch {}
  }

  const { shutdownSystem } = await import("@src/databases/db");
  await shutdownSystem().catch(() => {});
  if (process.env.BENCHMARK_MATRIX !== "1") {
    const { cleanupAllBenchmarkWorkspaces } = await import("@utils/benchmark-paths");
    await cleanupAllBenchmarkWorkspaces().catch(() => {});
  }
});

// 🚀 UNIFIED LOGGING: High-frequency benchmarks use 'error' by default, 'debug' only if requested.

process.env.LOG_LEVEL = process.env.BENCHMARK_DEBUG === "true" ? "debug" : "error";
process.env.DEBUG = "";
process.env.QUIET = "true";
process.env.DB_NAME = process.env.DB_NAME || "bench_parent";

// Suppress console.info/warn during init
const originalInfo = console.info;
const originalWarn = console.warn;
console.info = () => {};
console.warn = () => {};
setTimeout(() => {
  console.info = originalInfo;
  console.warn = originalWarn;
}, 2000);

// ── types ───────────────────────────────────────────────────────────────────
export interface BenchmarkResult {
  name: string;
  db: string;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  rps: number;
  iterations: number;
  runs: number;
  concurrency: number;
  cv: number; // Coefficient of Variation (%)
  rssDelta?: number;
  heapUsedDelta?: number;
  externalDelta?: number;
  totalMs: number;
  errorRate?: number;
  failAvgMs?: number;
  failP95Ms?: number;
  timestamp: string;
  version: string;
  layer?: string;
  pair?: string;
  overhead?: number;
  trimmedCount?: number;
  ci95MarginMs?: number;
  ci95Ms?: [number, number];
  [key: string]: any;
}

/** Track test start time for wall clock measurement */
let _benchmarkTestStartTime = 0;
/** Track server boot overhead */
let _benchmarkBootMs = 0;
/** Track seed overhead */
let _benchmarkSeedMs = 0;
/** Current run ID (shared across matrix subprocesses) */
const _currentRunId = process.env.BENCHMARK_RUN_ID || crypto.randomUUID();

// ── configuration ────────────────────────────────────────────────────────────
const RESULTS_DIR = process.env.RESULTS_DIR ?? "tests/benchmarks/results";

export const CONCURRENCY_GROUPS = {
  sqlite: 1,
  mariadb: 4,
  postgresql: 4,
  mongodb: 4,
} as const;

/**
 * 🚀 DYNAMIC CONCURRENCY THROTTLE
 * SQL databases like PostgreSQL and MariaDB are designed for high-concurrency,
 * while SQLite requires serialization (1) on Windows to prevent file lock contention.
 */
export function getRecommendedConcurrency(): number {
  const dbType = getDbType().toLowerCase();
  if (dbType.includes("sqlite")) return CONCURRENCY_GROUPS.sqlite;
  if (dbType.includes("mariadb") || dbType.includes("mysql")) return CONCURRENCY_GROUPS.mariadb;
  if (dbType.includes("postgresql") || dbType.includes("postgres"))
    return CONCURRENCY_GROUPS.postgresql;
  if (dbType.includes("mongodb")) return CONCURRENCY_GROUPS.mongodb;
  return 1;
}

// ── statistics ───────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * 🚀 ENTERPRISE STATISTICS: Robust outlier removal using Interquartile Range (IQR).
 * Eliminates noise from GC spikes or background OS jitter.
 */
function trimOutliersIQR(times: number[]): number[] {
  if (times.length < 10) return times; // Too small to trim reliably

  const sorted = [...times].sort((a, b) => a - b);
  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;

  const lowerBound = q1 - 1.5 * iqr;
  const upperBound = q3 + 1.5 * iqr;

  return times.filter((t) => t >= lowerBound && t <= upperBound);
}

export function computeStatistics(
  times: number[],
  rps: number,
  config: any,
  failTimes: number[] = [],
): BenchmarkResult {
  // Apply outlier trimming if requested
  const processedTimes =
    config.trimOutliers === "iqr" || config.trimOutliers === true ? trimOutliersIQR(times) : times;

  const sorted = [...processedTimes].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / (sorted.length || 1);

  const variance = sorted.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (sorted.length || 1);
  const stdDev = Math.sqrt(variance);
  const cv = avg > 0 ? (stdDev / avg) * 100 : 0;

  // 🚀 Confidence Interval (95%)
  const n = sorted.length;
  const z = 1.96; // 95% critical value
  const marginOfError = n > 0 ? z * (stdDev / Math.sqrt(n)) : 0;

  const result: BenchmarkResult = {
    name: config.name,
    db: getDbType(),
    avgMs: Number(avg.toFixed(3)),
    p50Ms: Number(percentile(sorted, 50).toFixed(3)),
    p95Ms: Number(percentile(sorted, 95).toFixed(3)),
    p99Ms: Number(percentile(sorted, 99).toFixed(3)),
    minMs: Number((sorted[0] || 0).toFixed(3)),
    maxMs: Number((sorted[sorted.length - 1] || 0).toFixed(3)),
    rps: Number(rps.toFixed(1)),
    iterations: times.length, // Report original iteration count
    runs: config.runs || 1,
    concurrency: config.concurrency || 1,
    cv: Number(cv.toFixed(2)),
    totalMs: Number(sum.toFixed(3)),
    errorRate: Number((config.errorRate || 0).toFixed(4)),
    timestamp: new Date().toISOString(),
    version: "0.0.8-enterprise",
    overhead: times.length - processedTimes.length, // Track how many were trimmed
    trimmedCount: times.length - processedTimes.length,
    ci95MarginMs: Number(marginOfError.toFixed(3)),
    ci95Ms: [
      Number(Math.max(0, avg - marginOfError).toFixed(3)),
      Number((avg + marginOfError).toFixed(3)),
    ],
  };

  if (failTimes.length > 0) {
    const sortedFails = [...failTimes].sort((a, b) => a - b);
    const sumFails = sortedFails.reduce((a, b) => a + b, 0);
    result.failAvgMs = Number((sumFails / sortedFails.length).toFixed(3));
    result.failP95Ms = Number(percentile(sortedFails, 95).toFixed(3));
  }

  return result;
}

// ── infrastructure ───────────────────────────────────────────────────────────

export function getDbLabel(): string {
  return process.env.DB_LABEL || getDbType().toUpperCase();
}

export function getDbType(): string {
  // Default: SQLite with Redis L2 cache enabled
  if (process.env.DB_TYPE) return process.env.DB_TYPE.toLowerCase();
  process.env.DB_TYPE = "sqlite";
  return "sqlite";
}

function discoverBenchmarkMetadata() {
  let filePath = process.env.BENCH_FILE || "";
  if (!filePath) {
    try {
      const err = new Error();
      const stack = err.stack || "";
      for (const line of stack.split("\n")) {
        const n = line.replace(/\\/g, "/");
        if (n.includes("tests/benchmarks/") && !n.includes("benchmark-utils.ts")) {
          const m = n.match(/tests\/benchmarks\/([\w.-]+)/i);
          if (m) {
            filePath = `tests/benchmarks/${m[1].split(":")[0].split("?")[0]}`;
            break;
          }
        }
      }
    } catch {}
  }

  let proves = "";
  if (filePath) {
    try {
      const fullPath = path.resolve(process.cwd(), filePath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        // Prefer @summary for table header, fall back to @description first line
        const m = content.match(/@summary\s+(.+)/i) || content.match(/@description\s+(.+)/i);
        if (m) proves = m[1].trim();
      }
    } catch {}
  }

  return { path: filePath || "unknown", proves };
}

export async function stabilize(ms: number = 150) {
  // 🧹 AGGRESSIVE GC: Clear memory pressure before critical measurements
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }

  // 💤 JITTER BUFFER: Windows needs slightly more time to settle file handles
  const waitTime = process.platform === "win32" ? ms * 1.5 : ms;
  await new Promise((r) => setTimeout(r, waitTime));
}

let lastMemorySnapshot: any = null;

export function getMemorySnapshot() {
  const mem = process.memoryUsage();
  const current = {
    rss: mem.rss / 1024 / 1024,
    heapUsed: mem.heapUsed / 1024 / 1024,
    heapTotal: mem.heapTotal / 1024 / 1024,
    external: mem.external / 1024 / 1024,
  };

  const snapshot: any = { ...current };

  if (lastMemorySnapshot) {
    snapshot.rssDelta = current.rss - lastMemorySnapshot.rss;
    snapshot.heapUsedDelta = current.heapUsed - lastMemorySnapshot.heapUsed;
  }

  lastMemorySnapshot = current;
  return snapshot;
}
export const measureMemory = getMemorySnapshot;

// ── reporting engine ─────────────────────────────────────────────────────────

export function printTruthTable(options: {
  title: string;
  subtitle?: string;
  results: any[];
  layerMode?: boolean;
  shortLabel?: string;
}) {
  const dbType = getDbType();

  for (const r of options.results) if (!r.db) r.db = dbType;

  const makeHelpers = (width: number) => ({
    bar: (l: string, r: string) => l + "═".repeat(width - 2) + r,
    center: (s: string) => {
      const pad = width - 2 - s.length;
      return (
        "║" +
        " ".repeat(Math.max(0, Math.floor(pad / 2))) +
        s +
        " ".repeat(Math.max(0, Math.ceil(pad / 2))) +
        "║"
      );
    },
  });

  let outputBuffer = "";
  const log = (s: string) => {
    console.log(s);
    outputBuffer += s + "\n";
  };

  const W = 91;
  const h = makeHelpers(W);
  log("\n" + h.bar("╔", "╗"));
  log(h.center(options.title));
  const meta = discoverBenchmarkMetadata();
  log(h.center(`File: ${meta.path}`));
  const now = new Date();
  const ts = now.toISOString().replace("T", " ").substring(0, 19);
  log(h.center(`Ran: ${ts}`));
  if (meta.proves) {
    const lines = meta.proves.split("\n");
    for (const line of lines) {
      log(h.center(line));
    }
  }
  log(h.bar("╠", "╣"));
  options.results.forEach((r) => {
    const avgMs = r.avgMs ?? 0;
    const p95Ms = r.p95Ms ?? 0;
    const rps = r.rps ?? 0;
    log(
      `║ ${r.name.padEnd(30)} │ ${avgMs.toFixed(3).padStart(12)} ms │ p95: ${p95Ms.toFixed(3).padStart(12)} ms │ RPS: ${Math.round(rps).toLocaleString().padStart(10)} ║`,
    );
  });
  log(h.bar("╚", "╝"));

  const tableContent = outputBuffer.trim();
  saveTerminalTable(options.title, tableContent);

  pushTableToMdx(options.title, tableContent, options.shortLabel);
}

function saveTerminalTable(title: string, content: string) {
  const dbType = getDbType();
  let dir = path.resolve(process.cwd(), RESULTS_DIR);
  if (!dir.toLowerCase().endsWith(dbType.toLowerCase())) dir = path.join(dir, dbType);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fileName = title.toLowerCase().replace(/[^a-z0-9]/g, "_") + ".table.txt";
  fs.writeFileSync(path.join(dir, fileName), content);
}

export function printSummaryTable(
  metrics: Array<{ key: string; val: number | string; unit: string }>,
  shortLabel?: string,
) {
  const W = 80;
  const helpers = {
    bar: (l: string, r: string) => l + "═".repeat(W - 2) + r,
    center: (s: string) => {
      const pad = W - 2 - s.length;
      return "║" + " ".repeat(Math.floor(pad / 2)) + s + " ".repeat(Math.ceil(pad / 2)) + "║";
    },
  };
  let summaryBuffer = "";
  const log = (s: string) => {
    console.log(s);
    summaryBuffer += s + "\n";
  };
  log("\n" + helpers.bar("╔", "╗"));
  log(helpers.center("FINAL AUDIT SUMMARY"));
  const now2 = new Date();
  const ts2 = now2.toISOString().replace("T", " ").substring(0, 19);
  log(helpers.center(`Ran: ${ts2}`));
  log(helpers.bar("╠", "╣"));
  metrics.forEach((m) => {
    const valStr = typeof m.val === "number" ? m.val.toFixed(3) : String(m.val);
    log(`║ ${m.key.padEnd(50)} │ ${valStr.padStart(12)} ${m.unit.padEnd(8)} ║`);
  });
  log(helpers.bar("╚", "╝") + "\n");

  // Write summary to MDX
  appendSummaryToMdx(summaryBuffer.trim(), shortLabel);
}

export async function runBenchmark(config: any) {
  const {
    iterations,
    runs = 1,
    concurrency = 1,
    onIteration,
    onSetup,
    abortOnErrors = true,
    warmupIterations = 0,
    onSuccess,
  } = config;
  if (!onIteration) throw new Error("Benchmark must provide onIteration");

  if (warmupIterations > 0) {
    for (let i = 0; i < warmupIterations; i++) {
      try {
        await onIteration(i);
      } catch {
        // optionally log warmup errors if debugging
      }
    }
  }

  const results: number[] = [];
  const failResults: number[] = [];
  let totalErrors = 0;
  const maxConsecutiveErrors = 10;
  let consecutiveErrors = 0;

  for (let r = 0; r < runs; r++) {
    if (onSetup) await onSetup();
    if (concurrency > 1) {
      const tasks = Array.from({ length: iterations }, (_, i) => i);
      const chunks = [];
      for (let i = 0; i < tasks.length; i += concurrency)
        chunks.push(tasks.slice(i, i + concurrency));
      for (const chunk of chunks) {
        if (abortOnErrors && consecutiveErrors >= maxConsecutiveErrors)
          throw new Error(
            `Benchmark aborted: Exceeded ${maxConsecutiveErrors} consecutive errors.`,
          );
        await Promise.all(
          chunk.map(async (i) => {
            const iStart = performance.now();
            try {
              await onIteration(i);
              results.push(performance.now() - iStart);
              consecutiveErrors = 0;
            } catch (err) {
              totalErrors++;
              consecutiveErrors++;
              failResults.push(performance.now() - iStart);
              if (totalErrors === 1 && abortOnErrors !== false)
                console.error(`\n[Benchmark DEBUG] First error in "${config.name}":`, err);
            }
          }),
        );
      }
    } else {
      for (let i = 0; i < iterations; i++) {
        if (abortOnErrors && consecutiveErrors >= maxConsecutiveErrors)
          throw new Error(
            `Benchmark aborted: Exceeded ${maxConsecutiveErrors} consecutive errors.`,
          );
        const iStart = performance.now();
        try {
          await onIteration(i);
          results.push(performance.now() - iStart);
          consecutiveErrors = 0;
        } catch (err) {
          totalErrors++;
          consecutiveErrors++;
          failResults.push(performance.now() - iStart);
          if (totalErrors === 1 && abortOnErrors !== false)
            console.error(`\n[Benchmark DEBUG] First error in "${config.name}":`, err);
        }
      }
    }
  }
  const validResults = results.filter((r) => !isNaN(r));
  const sum = validResults.reduce((a, b) => a + b, 0);
  const totalCompleted = validResults.length + failResults.length;
  const rps = sum > 0 ? totalCompleted / (sum / 1000) : 0;
  const stats = computeStatistics(
    validResults,
    rps,
    { ...config, errorRate: totalErrors / totalCompleted },
    failResults,
  );

  // 🛡️ RELIABILITY GUARD: Ensure the benchmark reached an acceptable success rate
  const reliabilityThreshold = config.reliabilityThreshold ?? 0.99; // Default 99% success required
  const reliability = 1 - (stats.errorRate || 0);
  if (reliability < reliabilityThreshold) {
    throw new Error(
      `Benchmark Reliability Failure: "${stats.name}" reached only ${(reliability * 100).toFixed(2)}% reliability (Threshold: ${reliabilityThreshold * 100}%).`,
    );
  }

  if (onSuccess) onSuccess(stats);
  return stats;
}

export async function runStochasticLoadTest(config: {
  name: string;
  stages: Array<{ duration: number; target: number }>;
  thresholds: Record<string, string>;
  onIteration: (i: number) => Promise<void>;
}) {
  const { stages, thresholds, onIteration } = config;
  const latencies: number[] = [];
  let totalReqs = 0;
  let failures = 0;
  for (const stage of stages) {
    const startTime = Date.now();
    const deadline = startTime + stage.duration * 1000;
    const interval = 1000 / stage.target;
    while (Date.now() < deadline) {
      const t0 = performance.now();
      try {
        await onIteration(totalReqs++);
        latencies.push(performance.now() - t0);
      } catch {
        failures++;
      }
      const elapsed = performance.now() - t0;
      if (elapsed < interval) await new Promise((r) => setTimeout(r, interval - elapsed));
    }
  }
  const sorted = latencies.sort((a, b) => a - b);
  const p95 = percentile(sorted, 95);
  const errorRate = failures / (totalReqs || 1);
  const violations: string[] = [];
  if (thresholds.p95) {
    const limit = parseFloat(thresholds.p95.replace(/[^\d.]/g, ""));
    if (p95 > limit) violations.push(`p95 latency ${p95.toFixed(2)}ms > threshold ${limit}ms`);
  }
  if (thresholds.error_rate) {
    const limit = parseFloat(thresholds.error_rate.replace(/[^\d.]/g, ""));
    if (errorRate > limit)
      violations.push(
        `Error rate ${(errorRate * 100).toFixed(2)}% > threshold ${(limit * 100).toFixed(2)}%`,
      );
  }
  return {
    passedSLA: violations.length === 0,
    violations,
    p95,
    errorRate,
    totalReqs,
    failures,
  };
}

export async function setupBenchmarkServer() {
  const _bootStart = performance.now();
  const apiBase = process.env.API_BASE_URL;
  if (apiBase) {
    // Shared server mode: use env vars directly
    _benchmarkBootMs = 0;
    process.env.TEST_API_SECRET = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";
    TEST_API_SECRET = process.env.TEST_API_SECRET;
    return { baseUrl: apiBase, stop: async () => {} };
  }

  // ── Standalone mode: spawn a local server ───────────────────────────
  const { spawn } = await import("node:child_process");

  const dbType = getDbType() || "sqlite";
  const port = 4173 + Math.floor(Math.random() * 500);
  const dbName = "benchmark_shared";
  const secret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";
  const adminPw = process.env.ADMIN_PASSWORD || "Admin123!";

  process.env.DB_TYPE = dbType;
  process.env.DB_NAME = dbName;
  process.env.API_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.JWT_SECRET_KEY = "Benchmark-JWT-Secret-Key-2026-32ch";
  process.env.ENCRYPTION_KEY = "Benchmark-Encryption-Key-2026-32ch";
  process.env.TEST_API_SECRET = secret;
  process.env.ADMIN_PASSWORD = adminPw;
  TEST_API_SECRET = secret;
  process.env.SVELTY_BENCHMARK_SUITE = "true";

  const serverProcess = spawn("node", ["build/index.js"], {
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: "pipe",
    shell: process.platform === "win32",
  });

  // Wait for server to become healthy
  const healthUrl = `http://127.0.0.1:${port}/api/system/health`;
  let healthy = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) {
        healthy = true;
        break;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!healthy) {
    serverProcess.kill("SIGTERM");
    throw new Error(`Server at ${healthUrl} did not become healthy within 30s`);
  }

  // Run system setup
  const { execSync } = await import("child_process");
  execSync("bun run scripts/setup-system.ts", {
    env: {
      ...process.env,
      API_BASE_URL: process.env.API_BASE_URL,
      PRESET: "demo",
    },
    stdio: "pipe",
    shell: process.platform === "win32",
  });

  // Seed benchmark data in-process
  await ensureStableTestData(undefined, "global");

  const stop = async () => {
    delete process.env.API_BASE_URL;
    serverProcess.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    try {
      serverProcess.kill("SIGKILL");
    } catch {
      // Process may already be dead
    }
  };

  _benchmarkBootMs = performance.now() - _bootStart;

  return { baseUrl: process.env.API_BASE_URL, stop };
}

export async function exportResult(r: any) {
  const dbType = getDbType();

  // Detect test file
  let testFile = process.env.BENCH_FILE || "";
  if (!testFile) {
    const m = (process.argv[1] || "").match(/tests[/\\]benchmarks[/\\]([\w.-]+)\.ts/);
    if (m) testFile = m[1];
  }

  const runMode = process.env.BENCHMARK_MATRIX === "1" ? "matrix" : "standalone";
  const wallClockMs = _benchmarkTestStartTime > 0 ? performance.now() - _benchmarkTestStartTime : 0;

  // Build structured entry
  const entry = {
    runMode,
    runId: _currentRunId,
    testFile: testFile || "unknown",
    metric: r.name,
    layer: r.layer || "unknown",
    avgMs: r.avgMs ?? 0,
    p95Ms: r.p95Ms ?? 0,
    rps: r.rps ?? 0,
    cv: r.cv ?? 0,
    errorRate: r.errorCount && r.iterations ? r.errorCount / r.iterations : 0,
    wallClockMs,
    serverBootMs: _benchmarkBootMs,
    seedMs: _benchmarkSeedMs,
    db: r.db || dbType,
    redis: process.env.USE_REDIS === "true",
    timestamp: new Date().toISOString(),
    status: r.status || "SUCCESS",
  };

  // Always write to history.jsonl
  const historyFile = path.resolve(process.cwd(), RESULTS_DIR, "history.jsonl");
  const dir = path.dirname(historyFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(historyFile, JSON.stringify(entry) + "\n");

  // Store individual result JSON for debugging
  let resultDir = path.resolve(process.cwd(), RESULTS_DIR);
  if (!resultDir.toLowerCase().endsWith(dbType.toLowerCase()))
    resultDir = path.join(resultDir, dbType);
  if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });
  const fileName = `${r.name.replace(/[^a-zA-Z0-9]/g, "_")}.json`;
  fs.writeFileSync(path.join(resultDir, fileName), JSON.stringify(entry, null, 2));

  // Print summary line (always)
  const p95Str = entry.p95Ms ? `p95: ${entry.p95Ms.toFixed(3)}ms` : "";
  // Track which test files have been reported (dedup)
  if (!_reportedFiles.has(testFile)) {
    _reportedFiles.add(testFile);
    // Don't print "Recorded to" anymore - finalizeReport handles MDX
  }

  // In standalone mode, show per-metric line
  if (runMode === "standalone") {
    console.log(
      `  ${r.name}: ${entry.avgMs.toFixed(3)}ms${p95Str ? ` (${p95Str})` : ""} · RPS: ${Math.round(entry.rps)}`,
    );
  }
}

export async function runFinalizeReport(): Promise<void> {
  if (!_reportedFiles.size) return;
  const { finalizeReport } = await import("./benchmark-reporting");
  await finalizeReport(_currentRunId);
}

// ─────────────────────────────────────────────────────────────
// Multi-Database Runner: runs a benchmark callback across all 8 variants
// ─────────────────────────────────────────────────────────────

/**
 * Runs a benchmark callback across all 8 database variants sequentially.
 * Each variant gets its own server, results are labeled with the db key.
 *
 * Usage in a test:
 * ```ts
 * import { runOnAllDatabases } from "./modules/benchmark-utils";
 *
 * test("my test", async () => {
 *   await runOnAllDatabases(async (dbKey, baseUrl) => {
 *     // run benchmarks against baseUrl
 *   });
 * });
 * ```
 */
export async function runOnAllDatabases(
  runFn: (dbKey: string, baseUrl: string, dbType: string) => Promise<void>,
): Promise<void> {
  const { ALL_DATABASES } = await import("../../../scripts/benchmark-matrix/config");

  // Filter: if TEST_ALL_DBS env is set to specific db types, only run those.
  // Otherwise run all 8: sqlite, sqlite-redis, mongodb, mongodb-redis,
  // postgresql, postgresql-redis, mariadb, mariadb-redis
  const filter = (process.env.TEST_ALL_DBS || "").toLowerCase();
  const dbs = filter
    ? ALL_DATABASES.filter((d) => {
        const key = d.useRedis ? `${d.type}-redis` : d.type;
        return filter.split(",").includes(key) || filter.split(",").includes(d.type);
      })
    : ALL_DATABASES;

  const passed: string[] = [];
  const failed: string[] = [];

  for (const dbConf of dbs) {
    const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
    const label = dbConf.label || dbKey.toUpperCase();
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔷 [${label}] Starting...`);
    console.log(`${"=".repeat(60)}\n`);

    try {
      // Set env vars for this database
      process.env.DB_TYPE = dbConf.type;
      process.env.USE_REDIS = dbConf.useRedis ? "true" : "false";
      if (dbConf.useRedis) {
        process.env.REDIS_HOST = "127.0.0.1";
        process.env.REDIS_PORT = "6379";
      }

      // Clear any cached server URL so setupBenchmarkServer starts fresh
      delete process.env.API_BASE_URL;

      await runFn(dbKey, "", dbConf.type);
      passed.push(label);
      console.log(`\n✅ [${label}] PASSED`);
    } catch (err: any) {
      failed.push(label);
      console.error(`\n❌ [${label}] FAILED: ${err.message}`);
    }
  }

  // Final summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📊 Multi-Database Results:`);
  console.log(`   ✅ Passed: ${passed.length}/${dbs.length}`);
  console.log(`   ❌ Failed: ${failed.length}/${dbs.length}`);
  if (failed.length > 0) {
    console.log(`   Failed on: ${failed.join(", ")}`);
    throw new Error(
      `Test failed on ${failed.length}/${dbs.length} databases: ${failed.join(", ")}`,
    );
  }
  console.log(`${"=".repeat(60)}\n`);
}

export function exportMetric(key: string, value: number, unit: string) {
  const dbType = getDbType();
  try {
    let dir = path.resolve(process.cwd(), RESULTS_DIR);
    if (!dir.toLowerCase().endsWith(dbType.toLowerCase())) dir = path.join(dir, dbType);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const metricsFile = path.join(dir, "matrix_metrics.json");
    let current: Record<string, any> = {};
    if (fs.existsSync(metricsFile)) current = JSON.parse(fs.readFileSync(metricsFile, "utf8"));
    current[key] = {
      _type: "numeric-metric",
      name: key,
      value,
      unit,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(metricsFile, JSON.stringify(current, null, 2));
  } catch (err: any) {
    console.error(`[exportMetric] Failed: ${err.message}`);
  }
  const formattedVal = typeof value === "number" ? value.toFixed(3) : value;
  console.log(`METRIC: ${key}=${formattedVal}${unit}`);
}

/**
 * Export a sub-component timing metric for per-phase breakdown.
 * Enables pinpointing exactly WHERE time is spent within a benchmark.
 *
 * Example:
 *   exportSubMetric("auth.jwt.verify", 1.2, "ms", "warm")
 *   exportSubMetric("auth.session.lookup", 0.8, "ms", "warm")
 */
export function exportSubMetric(
  key: string,
  value: number,
  unit: string = "ms",
  phase: "cold" | "warm" | "mixed" = "warm",
) {
  const fullKey = `${key}.${phase}`;
  exportMetric(fullKey, value, unit);

  // Also save to structured metrics for intelligence layer
  try {
    const dbType = getDbType();
    const dir = path.resolve(process.cwd(), RESULTS_DIR);
    const dbDir = path.join(dir, dbType);
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    const metricsFile = path.join(dbDir, "structured-metrics.json");
    let data: any = {};
    if (fs.existsSync(metricsFile)) {
      data = JSON.parse(fs.readFileSync(metricsFile, "utf8"));
    }
    if (!data[fullKey]) data[fullKey] = [];
    data[fullKey].push({
      value,
      timestamp: new Date().toISOString(),
      phase,
    });
    fs.writeFileSync(metricsFile, JSON.stringify(data, null, 2));
  } catch {
    /* best-effort */
  }
}

export const STABLE_COLLECTION = "BenchmarkStable";
export const STABLE_ENTRY_ID = "bench-shared-001";
export let TEST_API_SECRET = (() => {
  if (process.env.TEST_API_SECRET) return process.env.TEST_API_SECRET;
  if (process.env.VITE_TEST_API_SECRET) return process.env.VITE_TEST_API_SECRET;
  return "SVELTYCMS_TEST_SECRET_2026";
})();

/** Track files that have already reported their MDX recording message */
const _reportedFiles = new Set<string>();

export async function ensureStableTestData(db?: any, tenantId: string = "global") {
  const _seedStart = performance.now();
  if (process.env.BENCHMARK_DEBUG === "true") {
    process.stderr.write(
      `\n[DEBUG] ensureStableTestData called. API_BASE_URL: ${process.env.API_BASE_URL}, SECRET: ${TEST_API_SECRET ? "OK" : "NO"}\n`,
    );
  }

  // 🚀 BENCHMARK MODE: Prefer HTTP API to the running server — avoids needing
  // DB env vars (MongoDB/PostgreSQL/MariaDB) in the benchmark child process.
  if (process.env.API_BASE_URL && process.env.TEST_API_SECRET) {
    try {
      const res = await fetch(`${process.env.API_BASE_URL}/api/testing`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-mode": "true",
          "x-test-secret": TEST_API_SECRET,
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({
          action: "create-collection",
          schema: {
            _id: STABLE_COLLECTION,
            name: STABLE_COLLECTION,
            fields: [
              {
                db_fieldName: "_id",
                label: "ID",
                widget: { Name: "Input" },
                type: "string",
              },
              {
                db_fieldName: "title",
                label: "Title",
                widget: { Name: "Input" },
                type: "string",
              },
              {
                db_fieldName: "slug",
                label: "Slug",
                widget: { Name: "Input" },
                type: "string",
              },
              {
                db_fieldName: "content",
                label: "Content",
                widget: { Name: "RichText" },
                type: "string",
              },
              {
                db_fieldName: "count",
                label: "Count",
                widget: { Name: "Input" },
                type: "number",
              },
              {
                db_fieldName: "author",
                label: "Author",
                widget: { Name: "Relation" },
                type: "string",
                relation: "BenchmarkAuthors",
              },
              {
                db_fieldName: "publishDate",
                label: "Publish Date",
                widget: { Name: "DateTime" },
                type: "string",
              },
            ],
          },
        }),
      });
      if (res.ok && process.env.BENCHMARK_DEBUG === "true") {
        process.stderr.write(`[DEBUG] Stable collection created via API\n`);
      }

      // Ensure bench-shared-001 exists — PATCH to reset count, POST if missing
      if (res.ok) {
        const patchRes = await fetch(
          `${process.env.API_BASE_URL}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-test-mode": "true",
              "x-test-secret": TEST_API_SECRET,
              "x-tenant-id": tenantId,
            },
            body: JSON.stringify({ count: 0 }),
          },
        );

        // If PATCH fails (entry missing), create it via POST
        if (!patchRes.ok) {
          await fetch(`${process.env.API_BASE_URL}/api/collections/${STABLE_COLLECTION}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-test-mode": "true",
              "x-test-secret": TEST_API_SECRET,
              "x-tenant-id": tenantId,
            },
            body: JSON.stringify({
              _id: STABLE_ENTRY_ID,
              title: "Benchmark Stable Entry",
              count: 0,
            }),
          }).catch(() => {});
        }
        return;
      }
      // create-collection action failed (not yet implemented in testing handler).
      // Fall through to direct DB path to create the collection and entry.
    } catch (err: any) {
      if (process.env.BENCHMARK_DEBUG === "true") {
        process.stderr.write(`[DEBUG] API-based stable data seeding failed: ${err.message}\n`);
      }
    }
  }

  // 🚀 FALLBACK: Direct DB adapter (only works when DB env vars are available — e.g. SQLite)
  const { getDb, getDbInitPromise } = await import("@src/databases/db");
  if (!db) await getDbInitPromise(false, "CORE").catch(() => {});
  const activeDb = db || getDb();
  if (!activeDb) throw new Error("ensureStableTestData: activeDb is null");

  const schema = {
    _id: STABLE_COLLECTION,
    name: STABLE_COLLECTION,
    fields: [
      {
        db_fieldName: "_id",
        label: "ID",
        widget: { Name: "Input" },
        type: "string",
      },
      {
        db_fieldName: "title",
        label: "Title",
        widget: { Name: "Input" },
        type: "string",
      },
      {
        db_fieldName: "slug",
        label: "Slug",
        widget: { Name: "Input" },
        type: "string",
      },
      {
        db_fieldName: "content",
        label: "Content",
        widget: { Name: "RichText" },
        type: "string",
      },
      {
        db_fieldName: "count",
        label: "Count",
        widget: { Name: "Input" },
        type: "number",
      },
      {
        db_fieldName: "author",
        label: "Author",
        widget: { Name: "Relation" },
        type: "string",
        relation: "BenchmarkAuthors",
      },
      {
        db_fieldName: "publishDate",
        label: "Publish Date",
        widget: { Name: "DateTime" },
        type: "string",
      },
    ],
  };

  // Always seed via the local DB adapter first to ensure data exists
  try {
    await activeDb.collection.createModel(schema as any);
  } catch {
    /* may already exist */
  }

  // Upsert the target entry with count=0 directly into the DB
  // This bypasses the built server's API layer entirely
  const { sql } = await import("drizzle-orm");
  if (activeDb.type === "sqlite") {
    try {
      await (activeDb as any).execute(
        sql.raw(
          `INSERT OR REPLACE INTO "collection_BenchmarkStable" ("_id", "tenantId", "data", "status", "isDeleted", "createdAt", "updatedAt") VALUES ('bench-shared-001', 'global', '{"count":0}', 'published', 0, 0, 0)`,
        ),
      );
    } catch (e: any) {
      if (process.env.BENCHMARK_DEBUG === "true")
        process.stderr.write(`[DEBUG] SQLite insert failed: ${e.message}\n`);
    }
  } else if (activeDb.type === "postgresql") {
    try {
      await (activeDb.raw?.execute || activeDb.execute).call(
        activeDb,
        `INSERT INTO "collection_BenchmarkStable" ("_id", "tenantId", "data", "status", "isDeleted", "createdAt", "updatedAt") VALUES ('bench-shared-001', 'global', '{"count":0}'::jsonb, 'published', false, NOW(), NOW()) ON CONFLICT ("_id") DO UPDATE SET "data" = '{"count":0}'::jsonb, "updatedAt" = NOW()`,
      );
    } catch (e: any) {
      if (process.env.BENCHMARK_DEBUG === "true")
        process.stderr.write(`[DEBUG] PostgreSQL upsert failed: ${e.message}\n`);
    }
  } else if (activeDb.type === "mariadb" || activeDb.type === "mysql") {
    try {
      await (activeDb as any).execute(
        sql.raw(
          `INSERT INTO \`collection_BenchmarkStable\` (\`_id\`, \`tenantId\`, \`data\`, \`status\`, \`isDeleted\`, \`createdAt\`, \`updatedAt\`) VALUES ('bench-shared-001', 'global', '{"count":0}', 'published', false, NOW(), NOW()) ON DUPLICATE KEY UPDATE \`data\` = '{"count":0}', \`updatedAt\` = NOW()`,
        ),
      );
    } catch (e: any) {
      if (process.env.BENCHMARK_DEBUG === "true")
        process.stderr.write(`[DEBUG] MariaDB upsert failed: ${e.message}\n`);
    }
  } else {
    // MongoDB: use crud upsert
    try {
      await activeDb.crud.upsert(
        "collection_BenchmarkStable",
        { _id: "bench-shared-001" },
        { _id: "bench-shared-001", tenantId, count: 0 },
      );
    } catch {
      /* ignore */
    }
  }

  // Also try via API PATCH as a secondary measure
  if (process.env.API_BASE_URL && process.env.TEST_API_SECRET) {
    try {
      await fetch(
        `${process.env.API_BASE_URL}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-test-mode": "true",
            "x-test-secret": TEST_API_SECRET,
            "x-tenant-id": tenantId,
          },
          body: JSON.stringify({ count: 0 }),
        },
      );
    } catch {}
  }

  _benchmarkSeedMs += performance.now() - _seedStart;
}

export async function forceRefreshServer(baseUrl: string, tenantId: string = "global") {
  await new Promise((r) => setTimeout(r, 50));
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${baseUrl}/api/system/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-mode": "true",
          "x-test-secret": TEST_API_SECRET,
        },
        body: JSON.stringify({ tenantId }),
      });
      if (res.ok) return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

/**
 * 🛡️ SCHEMA SYNC GUARD: Poll GraphQL __schema until dynamic collection is visible.
 */
export async function waitForCollection(
  baseUrl: string,
  collectionId: string,
  tenantId: string = "global",
) {
  const headers = {
    "Content-Type": "application/json",
    "x-test-mode": "true",
    "x-test-secret": TEST_API_SECRET,
    "x-tenant-id": tenantId,
  };
  const query = `query { __schema { types { name } } }`;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`${baseUrl}/api/graphql`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.errors) {
          console.log(`[waitForCollection] GraphQL errors:`, JSON.stringify(data.errors));
        } else {
          const types = data.data.__schema.types.map((t: any) => t.name);
          if (types.includes(collectionId)) return;
          if (i % 5 === 0) {
            console.log(`[waitForCollection] Types (sample):`, types.slice(0, 15).join(", "));
          }
        }
      } else {
        console.log(`[waitForCollection] Fetch not OK: ${res.status} ${res.statusText}`);
      }
    } catch (e: any) {
      console.log(`[waitForCollection] Exception:`, e.message);
    }
    // After 10 retries, try forcing collection creation + cache refresh
    if (i === 10) {
      console.log(`[waitForCollection] Forcing collection creation via testing API...`);
      await fetch(`${baseUrl}/api/testing`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "create-collection",
          schema: { _id: collectionId, name: collectionId, fields: [] },
        }),
      }).catch(() => {});
      await fetch(`${baseUrl}/api/content/refresh`, {
        method: "POST",
        headers,
        body: JSON.stringify({ method: "refresh", tenantId }),
      }).catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timeout waiting for collection ${collectionId} in GraphQL schema.`);
}

export function generateRealisticEntry(
  i: number,
  complexity: "light" | "medium" | "heavy" = "medium",
) {
  const size = complexity === "light" ? 500 : complexity === "medium" ? 2500 : 10000;
  return {
    _id: `real-${Date.now()}-${i}`,
    title: `Post Title ${i} - SveltyCMS Performance Audit`,
    slug: `post-${i}-${Math.random().toString(36).substring(7)}`,
    content: "A".repeat(size),
    score: Math.floor(Math.random() * 10000),
    category: Math.random() > 0.5 ? "A" : "B",
    metadata: { readingTime: 5, publishedAt: new Date().toISOString() },
  };
}

export async function waitThinkTime(minMs = 200, maxMs = 1500) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((r) => setTimeout(r, ms));
}
