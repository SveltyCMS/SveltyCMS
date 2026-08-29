/**
 * @file tests/benchmarks/modules/benchmark-utils.ts
 * @description Enterprise benchmarking core for SveltyCMS.
 * Standardizes execution, statistical analysis (percentiles, CV), memory auditing,
 * and professional reporting across all 19+ audit modules.
 */
import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pushTableToMdx, appendSummaryToMdx } from "./benchmark-reporting";
import { logger } from "@utils/logger";
import { takeProfileSpans } from "@src/utils/write-profiler";
import type { DatabaseId } from "@src/content/types";

// 🟢 ESM require shim: package.json is "type": "module", so raw require()
// throws ReferenceError under Node/vitest — only Bun provided it. createRequire
// works on both runtimes.
const requireShim = createRequire(import.meta.url);

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
  (typeof process !== "undefined" &&
    (process.argv.includes("test") || process.execArgv.includes("test"))) ||
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

    const { spawnSync } = requireShim("node:child_process");
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
    const bunTest = requireShim("bun:test");
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
// BENCHMARK stays as a harness marker (env-only config, sandbox isolation,
// setup force-complete). It grants NO request-path bypasses — benchmark servers
// run NODE_ENV=production with real sessions, rate limits, WAF and audits.
process.env.BENCHMARK = "true";
// Deliberately NOT setting TEST_MODE: test bypasses must never leak into
// benchmark runs. Each test file sets its own NODE_ENV when spawning servers.

// 🛡️ AUTO-CLEANUP: Global hook to prevent connection leaks and collection pollution
afterAll(async () => {
  // Finalize report only in standalone mode (matrix calls it once for all tests)
  if (process.env.BENCHMARK_MATRIX !== "1") {
    try {
      const { finalizeReport } = await import("./benchmark-reporting");
      await finalizeReport(_currentRunId, { invokedTestFiles: _reportedFiles });
    } catch {}
  }

  const { shutdownSystem } = await import("@src/databases/db");
  if (typeof shutdownSystem === "function") {
    await shutdownSystem().catch(() => {});
  }
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
// DB_HOST is REQUIRED by the private-config schema (minLength 1). Without it,
// loadPrivateConfig returns null → getDatabaseConnectionString() returns "" →
// the SQLite adapter silently fell back to the live default file
// (config/test-database/sveltycms.db), mixing benchmark state under the live
// DB name across runs. The adapter now fails closed; the harness must comply.
process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";

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
  coldFirstMs?: number;
  coldAvgMs?: number;
  coldP95Ms?: number;
  coldMaxMs?: number;
  warmAvgMs?: number;
  warmP95Ms?: number;
  warmRps?: number;
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
 * Two-sided 95% t critical values for small samples (df = n - 1).
 * z = 1.96 is only valid for large n; below ~30 the CI must widen.
 */
const T95_TABLE: Record<number, number> = {
  1: 12.706,
  2: 4.303,
  3: 3.182,
  4: 2.776,
  5: 2.571,
  6: 2.447,
  7: 2.365,
  8: 2.306,
  9: 2.262,
  10: 2.228,
  11: 2.201,
  12: 2.179,
  13: 2.16,
  14: 2.145,
  15: 2.131,
  16: 2.12,
  17: 2.11,
  18: 2.101,
  19: 2.093,
  20: 2.086,
  21: 2.08,
  22: 2.074,
  23: 2.069,
  24: 2.064,
  25: 2.06,
  26: 2.056,
  27: 2.052,
  28: 2.048,
  29: 2.045,
};

function criticalValue95(n: number): number {
  if (n >= 30) return 1.96;
  return T95_TABLE[Math.max(1, n - 1)] ?? 1.96;
}

/**
 * 🚀 ENTERPRISE STATISTICS: Robust outlier removal using Interquartile Range (IQR).
 * Eliminates noise from GC spikes or background OS jitter.
 * NOTE: applied to the MEAN only — tail percentiles are always read from raw data.
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
  // RAW sample — percentiles and min/max MUST come from here so tail latency
  // (GC spikes, jitter) stays visible in p95/p99/max instead of being trimmed
  // away before the percentile is even computed.
  const rawSorted = [...times].sort((a, b) => a - b);

  // Robust central tendency — IQR-trim only the MEAN (noise resistance), never
  // the tail metrics.
  const processedTimes =
    config.trimOutliers === "iqr" || config.trimOutliers === true ? trimOutliersIQR(times) : times;

  const sorted = [...processedTimes].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sorted.length > 0 ? sum / sorted.length : 0;

  const n = sorted.length;
  const variance = n > 1 ? sorted.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (n - 1) : 0;
  const stdDev = Math.sqrt(variance);
  const cv = avg > 0 ? (stdDev / avg) * 100 : 0;

  // 🚀 Confidence Interval (95%) — t-distribution for small samples,
  // z = 1.96 for large n.
  const critical = criticalValue95(n);
  const marginOfError = n > 1 ? critical * (stdDev / Math.sqrt(n)) : 0;

  const result: BenchmarkResult = {
    name: config.name,
    db: getDbType(),
    avgMs: Number(avg.toFixed(3)),
    p50Ms: Number(percentile(rawSorted, 50).toFixed(3)),
    p95Ms: Number(percentile(rawSorted, 95).toFixed(3)),
    p99Ms: Number(percentile(rawSorted, 99).toFixed(3)),
    minMs: Number((rawSorted[0] || 0).toFixed(3)),
    maxMs: Number((rawSorted[rawSorted.length - 1] || 0).toFixed(3)),
    rps: Number(rps.toFixed(1)),
    iterations: times.length, // Report original iteration count
    runs: config.runs || 1,
    concurrency: config.concurrency || 1,
    cv: Number(cv.toFixed(2)),
    totalMs: Number(sum.toFixed(3)),
    errorRate: Number((config.errorRate || 0).toFixed(4)),
    timestamp: new Date().toISOString(),
    version: "0.0.8-enterprise",
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

  const W = 105;
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
    const coldMs = r.coldFirstMs ?? r.coldAvgMs;
    if (coldMs !== undefined) {
      log(
        `║ ${r.name.padEnd(28)} │ Cold: ${coldMs.toFixed(2).padStart(8)} ms │ Warm: ${avgMs.toFixed(3).padStart(9)} ms │ p95: ${p95Ms.toFixed(3).padStart(9)} ms │ ${Math.round(rps).toLocaleString().padStart(7)} RPS ║`,
      );
    } else {
      log(
        `║ ${r.name.padEnd(30)} │ ${avgMs.toFixed(3).padStart(12)} ms │ p95: ${p95Ms.toFixed(3).padStart(12)} ms │ RPS: ${Math.round(rps).toLocaleString().padStart(10)} ║`,
      );
    }
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
    onWarmupError,
  } = config;
  if (!onIteration) throw new Error("Benchmark must provide onIteration");

  // 🛡️ HONEST THINK-TIME: simulate user think time BETWEEN iterations, OUTSIDE
  // the measured span (performance.now() wraps onIteration only). Previously
  // the option existed but was never read — production-day's "realistic
  // think-time simulation" claim was silently false.
  const thinkTimeMs = Array.isArray(config.thinkTimeMs) ? config.thinkTimeMs : null;
  const sleepThinkTime = async () => {
    if (!thinkTimeMs || thinkTimeMs.length < 2) return;
    const lo = thinkTimeMs[0];
    const hi = thinkTimeMs[1];
    await new Promise((r) => setTimeout(r, lo + Math.random() * Math.max(0, hi - lo)));
  };

  const warmupLatencies: number[] = [];
  let warmupErrors = 0;
  if (warmupIterations > 0) {
    for (let i = 0; i < warmupIterations; i++) {
      const w0 = performance.now();
      try {
        await onIteration(i);
        warmupLatencies.push(performance.now() - w0);
      } catch (err: any) {
        warmupErrors++;
        // 🛡️ HARDENING: Log first warmup error with full context so CI/stderr catches it.
        // Previously this was an empty catch {} — silently hiding adapter failures.
        if (warmupErrors === 1) {
          console.warn(
            `\n[Benchmark WARN] Warmup iteration ${i} failed in "${config.name}": ${err?.message || err}`,
          );
        }
        if (onWarmupError) {
          onWarmupError(i, err);
        }
      }
    }
    // 🛡️ HARDENING: If >50% of warmup iterations failed, the benchmark
    // environment is likely broken (e.g., DB collision, connection lost). Fail fast.
    if (warmupErrors > warmupIterations * 0.5) {
      throw new Error(
        `Benchmark warmup failure: ${warmupErrors}/${warmupIterations} warmup iterations failed in "${config.name}". Check logs above for details.`,
      );
    }
  }

  const results: number[] = [];
  const failResults: number[] = [];
  let totalErrors = 0;
  const maxConsecutiveErrors = 10;
  let consecutiveErrors = 0;

  // 🎯 EVENT-LOOP LAG PROBE (item: harness telemetry): samples the setImmediate
  // round-trip every 50 iterations. A blocked loop (CPU-bound serialization,
  // sync schema rebuilds, GC storms) inflates p95 while avg stays flat — this
  // is the only signal in the matrix for that failure class.
  const eluAvailable = typeof performance.eventLoopUtilization === "function";
  const eluStart = eluAvailable ? performance.eventLoopUtilization() : null;
  let maxEventLoopLagMs = 0;
  let lagSampleCounter = 0;
  const sampleEventLoopLag = async () => {
    if (!eluAvailable) return;
    lagSampleCounter++;
    if (lagSampleCounter % 50 !== 0) return;
    // performance.now() is monotonic + sub-ms — Date.now() would miss
    // sub-millisecond lag and jump on wall-clock corrections.
    const t0 = performance.now();
    await new Promise<void>((r) => setImmediate(r));
    const lag = performance.now() - t0;
    if (lag > maxEventLoopLagMs) maxEventLoopLagMs = lag;
  };

  const benchWallStart = performance.now();
  // Shared per-iteration body (one source for serial AND pooled execution).
  const runOne = async (i: number): Promise<void> => {
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
    await sampleEventLoopLag();
    await sleepThinkTime();
  };

  // 🚀 SLIDING-WINDOW WORKER POOL: constant `concurrency` in-flight requests.
  // A finished slot immediately picks up the next task via the atomic `next++`
  // — no wave/chunk sync, so a single p95 outlier no longer blocks the whole
  // batch. concurrency=1 degenerates to plain serial execution (same path).
  for (let r = 0; r < runs; r++) {
    if (onSetup) await onSetup();
    let next = 0;
    const worker = async () => {
      for (;;) {
        if (abortOnErrors && consecutiveErrors >= maxConsecutiveErrors) {
          throw new Error(
            `Benchmark aborted: Exceeded ${maxConsecutiveErrors} consecutive errors.`,
          );
        }
        const i = next++;
        if (i >= iterations) break;
        await runOne(i);
      }
    };
    await Promise.all(
      Array.from({ length: Math.max(1, Math.min(concurrency, iterations)) }, () => worker()),
    );
  }
  const benchWallDurationMs = performance.now() - benchWallStart;
  const validResults = results.filter((r) => !isNaN(r));
  const totalCompleted = validResults.length + failResults.length;
  // RPS always uses WALL-CLOCK duration — identical basis for concurrency=1 and
  // concurrency>N so throughput numbers are directly comparable. The measured
  // span (performance.now around onIteration) intentionally excludes think-time
  // and event-loop sampling; wall clock includes them, which is the honest
  // "requests per real second" figure.
  const rps = benchWallDurationMs > 0 ? totalCompleted / (benchWallDurationMs / 1000) : 0;
  const stats = computeStatistics(
    validResults,
    rps,
    { ...config, errorRate: totalErrors / totalCompleted },
    failResults,
  );

  // Attach event-loop telemetry to the result (exported with the ledger entry).
  const eluEnd = eluAvailable && eluStart ? performance.eventLoopUtilization(eluStart) : null;
  if (eluEnd) (stats as any).eventLoopUtilization = eluEnd.utilization;
  if (maxEventLoopLagMs > 0) (stats as any).eventLoopLagMs = maxEventLoopLagMs;

  // ❄️ Calculate dual-phase Cold and Warm metrics
  if (warmupLatencies.length > 0) {
    const coldSorted = [...warmupLatencies].sort((a, b) => a - b);
    const coldSum = coldSorted.reduce((a, b) => a + b, 0);
    stats.coldFirstMs = Number(warmupLatencies[0]!.toFixed(3));
    stats.coldAvgMs = Number((coldSum / coldSorted.length).toFixed(3));
    stats.coldP95Ms = Number(percentile(coldSorted, 95).toFixed(3));
    stats.coldMaxMs = Number(coldSorted[coldSorted.length - 1]!.toFixed(3));
  } else if (validResults.length > 0) {
    stats.coldFirstMs = Number(validResults[0]!.toFixed(3));
    stats.coldAvgMs = Number(validResults[0]!.toFixed(3));
    stats.coldP95Ms = Number(validResults[0]!.toFixed(3));
    stats.coldMaxMs = Number(validResults[0]!.toFixed(3));
  }
  stats.warmAvgMs = stats.avgMs;
  stats.warmP95Ms = stats.p95Ms;
  stats.warmRps = stats.rps;

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

/**
 * 🛡️ GUARD: Throws if a database result indicates failure.
 *
 * Use this inside benchmark onIteration callbacks to catch silently-returned
 * errors (e.g., MongoDB E11000, SQL constraint violations) that would
 * otherwise be counted as successful benchmark iterations.
 *
 * ### Usage:
 * ```typescript
 * onIteration: async () => {
 *   const res = await db.crud.insert("posts", data, opts);
 *   assertSuccess(res, "insert");
 * }
 * ```
 */
export function assertSuccess(
  result:
    | { success: boolean; message?: string; error?: any; [key: string]: any }
    | null
    | undefined,
  operation: string,
): void {
  if (!result || !result.success) {
    const msg = result?.message || result?.error?.message || "Unknown error";
    throw new Error(`[${operation}] ${msg}`);
  }
}

/**
 * 🛡️ GUARD: Wraps an async callback to auto-assert success on the returned result.
 * Convenience decorator for onIteration callbacks that call a single DB operation.
 *
 * ### Usage:
 * ```typescript
 * onIteration: assertResult((id) => db.crud.insert("posts", { _id: id }, opts), "insert")
 * ```
 */
export function assertResult<T extends any[]>(
  fn: (
    ...args: T
  ) => Promise<{ success: boolean; message?: string; error?: any } | null | undefined>,
  operation: string,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    const result = await fn(...args);
    assertSuccess(result, operation);
  };
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
    // Monotonic clock — Date.now() would allow wall-clock jumps to stretch/shorten a stage.
    const startTime = performance.now();
    const deadline = startTime + stage.duration * 1000;
    const interval = 1000 / stage.target;
    while (performance.now() < deadline) {
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

// ── 4b. PRODUCTION-MODE SESSION AUTH & SEEDING ──────────────────────────────
// Benchmarks authenticate like real production users: POST /api/auth/login
// → real session cookie → every request carries the cookie. No x-test-secret
// forges, no test bypass, no rate-limit/WAF exemptions.

let _benchmarkSessionCookie: string | null = null;
let _benchmarkCsrfToken: string | null = null;
let _benchmarkSessionBaseUrl: string | null = null;
let _benchmarkSessionUserKey: string | null = null;

/**
 * Real login via POST /api/auth/login. Returns the session cookie pair
 * (e.g. `auth_sessions=...` or `__Host-auth_sessions=...`) and caches it
 * for the whole benchmark process. Requires a seeded admin (seedBenchmarkState).
 */
export async function loginBenchmarkUser(
  baseUrl: string,
  email = "admin@example.com",
  password = resolveBenchmarkAdminPassword(),
): Promise<string> {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const userKey = `${email}\0${password}`;
  if (
    _benchmarkSessionCookie &&
    _benchmarkSessionBaseUrl === normalizedBaseUrl &&
    _benchmarkSessionUserKey === userKey
  ) {
    return _benchmarkSessionCookie;
  }

  const res = await fetch(`${normalizedBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Benchmark login failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const setCookies =
    typeof (res.headers as any).getSetCookie === "function"
      ? (res.headers as any).getSetCookie()
      : (res.headers.get("set-cookie") || "").split(/,(?=\s*[^;,]+=[^;,])/);
  const pairs = (setCookies || [])
    .map((c: string) => c.split(";")[0]?.trim() ?? "")
    .filter(Boolean);
  const sessionPair = pairs.find((c: string) => /auth_sessions/i.test(c));
  if (!sessionPair) {
    throw new Error("Benchmark login succeeded but no session cookie was set");
  }
  const csrfPair = pairs.find((c: string) => /csrf/i.test(c));
  _benchmarkCsrfToken = csrfPair ? csrfPair.slice(csrfPair.indexOf("=") + 1) || null : null;
  const cookieStr = pairs.join("; ");
  _benchmarkSessionCookie = cookieStr;
  _benchmarkSessionBaseUrl = normalizedBaseUrl;
  _benchmarkSessionUserKey = userKey;
  return cookieStr;
}

/**
 * Headers carrying the REAL admin session cookie (production auth). Sync —
 * requires setupBenchmarkServer() to have run (it logs in and caches the cookie).
 * Includes the same-origin Origin header so mutations pass the production CSRF
 * same-origin fast-path (like a real admin browser).
 */
export function benchmarkAuthHeaders(): Record<string, string> {
  if (!_benchmarkSessionCookie) {
    throw new Error("benchmarkAuthHeaders: no session cookie — call setupBenchmarkServer() first");
  }
  const origin = process.env.API_BASE_URL;
  const headers: Record<string, string> = { Cookie: _benchmarkSessionCookie };
  if (origin) headers.Origin = origin;
  if (_benchmarkCsrfToken) headers["X-CSRF-Token"] = _benchmarkCsrfToken;
  return headers;
}

export function clearBenchmarkSession(): void {
  _benchmarkSessionCookie = null;
  _benchmarkCsrfToken = null;
  _benchmarkSessionBaseUrl = null;
  _benchmarkSessionUserKey = null;
}

/**
 * Hard guard for chaos-lab benchmarks that rely on TEST_MODE-only synthetic
 * infrastructure (failure injection flags, spoofed proxy headers, testing-API
 * actions). Production-mode benchmark servers never honor those — running
 * them silently would measure nothing. Fail loudly instead of soft-skipping.
 *
 * NOTE: `bun test` forces NODE_ENV=test + TEST_MODE=true in child processes,
 * so plain env checks cannot detect production mode there. The harness sets
 * SVELTY_BENCHMARK_SERVER_MODE=production (setupBenchmarkServer / matrix
 * spawnTestProcess) — that marker is authoritative.
 */
export function requireTestInfrastructure(feature: string): void {
  const env = typeof process !== "undefined" ? process.env : {};
  const productionBenchServer = env.SVELTY_BENCHMARK_SERVER_MODE === "production";
  const noTestEnv = env.TEST_MODE !== "true" && env.NODE_ENV !== "test";
  if (productionBenchServer || noTestEnv) {
    throw new Error(
      `[${feature}] requires TEST_MODE infrastructure (synthetic failure injection, ` +
        `spoofed headers, /api/testing actions). It is a chaos-lab benchmark and ` +
        `cannot run against production-mode benchmark servers. Spawn it with ` +
        `TEST_MODE=true (test-mode server) instead.`,
    );
  }
}

let _benchmarkSeeded = false;
let _benchmarkSeededPassword = "";

/**
 * Single source of truth for the benchmark admin password.
 *
 * The seed hashes this password, `setupBenchmarkServer` exports it to the
 * spawned server process, and `loginBenchmarkUser` authenticates with it.
 * Three independent defaults (`Password123!` vs `Admin123!`) previously made
 * the login 401 nondeterministically whenever one call site fell back while
 * another did not — resolve it in ONE place so all three always agree.
 */
export function resolveBenchmarkAdminPassword(): string {
  if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length >= 8) {
    return process.env.ADMIN_PASSWORD;
  }
  return "Admin123!";
}

/**
 * In-process equivalent of the legacy testing action `seed-throughput-docs`
 * (403 in production mode): creates the collection if missing, clears it, and
 * bulk-inserts UUID-identified documents via the adapter. Returns the
 * generated ids so callers can target the exact documents afterwards.
 */
export async function seedThroughputDocs(
  count = 1000,
  collectionId = "BenchmarkStable",
  tenantId: string = "global",
): Promise<string[]> {
  // MUST initialize the adapter first (same pattern as ensureStableTestData):
  // getDb() alone returns null on a fresh process, silently killing the seed
  // and leaving increment benchmarks with 404 "Entry not found" failures.
  const { getDb, getDbInitPromise } = await import("@src/databases/db");
  await getDbInitPromise(false, "CORE").catch(() => {});
  const db = getDb();
  if (!db) throw new Error("seedThroughputDocs: database adapter not initialized");
  try {
    await (db as any).collection.createModel({
      _id: collectionId,
      name: collectionId,
      fields: [
        { db_fieldName: "title", widget: { Name: "Input" }, type: "string" },
        { db_fieldName: "count", widget: { Name: "Input" }, type: "number" },
      ],
    });
  } catch {
    /* already exists */
  }
  try {
    await (db as any).crud.deleteMany(collectionId, {}, { tenantId, permanent: true });
  } catch {
    /* ignore */
  }
  const BATCH = 5000;
  const ids: string[] = [];
  for (let i = 0; i < count; i += BATCH) {
    const end = Math.min(i + BATCH, count);
    const docs = Array.from({ length: end - i }, () => {
      const _id = crypto.randomUUID();
      ids.push(_id);
      return { _id, title: `Throughput Doc ${ids.length - 1}`, count: 0, tenantId };
    });
    await (db as any).crud.insertMany(collectionId, docs, {
      tenantId,
      bypassTenantCheck: true,
      skipReturning: true,
    });
  }
  return ids;
}

/**
 * In-process state seeding against the SAME database the benchmark server
 * will use: default roles, admin user (real password hash via LocalCMS auth),
 * benchmark collections + entries. Mirrors the legacy /api/testing seed
 * actions, which are 403 in production builds — this is the production-safe
 * replacement and runs BEFORE the server boots so boot-time schema loading
 * sees a complete state.
 */
export async function seedBenchmarkState(): Promise<void> {
  const password = resolveBenchmarkAdminPassword();
  if (_benchmarkSeeded && _benchmarkSeededPassword === password) return;
  _benchmarkSeeded = true;
  _benchmarkSeededPassword = password;
  const started = performance.now();
  const tenantId = "global" as DatabaseId;

  const { getDb, getDbInitPromise } = await import("@src/databases/db");
  await getDbInitPromise(false, "CORE").catch(() => {});
  const db = getDb();
  if (!db) throw new Error("seedBenchmarkState: database adapter not initialized");

  const { LocalCMS } = await import("@src/services/sdk");
  const cms = new LocalCMS(db as any);

  // 1. Default roles (idempotent — mirrors /api/testing action=seed)
  try {
    const { seedRoles } = await import("@src/routes/setup/seed");
    await seedRoles(db as any, tenantId);
  } catch (err: any) {
    logger.warn(`[BenchSeed] Role seeding failed (non-fatal): ${err.message}`);
  }

  // 2. Admin user (idempotent — mirrors /api/testing action=seed)
  //
  // LOOKUP-FIRST: never create-then-fallback. Duplicate admin rows must not
  // exist at all — createUser would race or mint a second row under a
  // different tenant while the server login reads the oldest row without
  // tenant filtering, turning every later benchmark login into a 401 lottery.
  // The lookup scope mirrors the login EXACTLY (no tenant filter, oldest
  // first), so the row we update IS the row login reads.
  const email = "admin@example.com";
  const canonicalOpts = { bypassTenantCheck: true, tenantId: null } as any;
  const existing = await cms.auth.getUserByEmail(email, canonicalOpts);
  if (existing?.success && existing?.data) {
    await cms.auth.updateUserAttributes(
      (existing.data as { _id: string })._id,
      {
        password,
        role: "admin",
        isAdmin: true,
        isRegistered: true,
        emailVerified: true,
        failedAttempts: 0,
        lockoutUntil: null,
      },
      { ...canonicalOpts, allowPrivilegeEscalation: true },
    );
  } else {
    await cms.auth.createUser(
      {
        email,
        password,
        username: "admin",
        role: "admin",
        isAdmin: true,
        isRegistered: true,
        emailVerified: true,
      },
      { tenantId } as any,
    );
  }

  // 🧹 LEGACY CLEANUP ONLY: remove pre-existing duplicate admin rows from
  // older harness eras (they can no longer be created by this seed). Login
  // reads the oldest row, so any stale duplicate would still win over the
  // freshly-updated canonical row — delete them until exactly one remains.
  try {
    const allRes = await (db as any).auth.getAllUsers({ limit: 500 } as any);
    const rows = Array.isArray(allRes)
      ? allRes
      : allRes?.success && Array.isArray(allRes.data)
        ? allRes.data
        : [];
    const canonCheck = await cms.auth.getUserByEmail(email, canonicalOpts);
    const canonId =
      canonCheck?.success && canonCheck?.data
        ? String((canonCheck.data as { _id: string })._id)
        : "";
    for (const row of rows as any[]) {
      if (row?.email !== email) continue;
      if (canonId && String(row._id) === canonId) continue;
      await cms.auth
        .deleteUser(String(row._id), {
          tenantId: (row.tenantId as any) ?? null,
        } as any)
        .catch(() => {});
    }
  } catch (err: any) {
    logger.warn(`[BenchSeed] Admin legacy-dedupe failed (non-fatal): ${err.message}`);
  }

  // 🛡️ SELF-HEALING: verify the stored hash really matches the password the
  // benchmark will log in with. Stale legacy rows (seeded under a different
  // ADMIN_PASSWORD in an older run) previously survived the update path when
  // the duplicate row the login reads differed from the row the update wrote
  // — the benchmark then failed with a 401 that crypto probes could not
  // reproduce. Force one final hash refresh when verification fails.
  try {
    const { verifyPassword } = await import("@utils/security/crypto");
    const check = await cms.auth.getUserByEmail(email, canonicalOpts);
    const adminUser = check?.success && check?.data ? check.data : null;
    const storedPw = adminUser ? String((adminUser as any).password || "") : "";
    if (!storedPw || !(await verifyPassword(storedPw, password))) {
      logger.warn(
        "[BenchSeed] Admin hash mismatch — forcing password refresh for deterministic login",
      );
      await cms.auth.updateUserAttributes(
        (adminUser as { _id: string })._id,
        { password, failedAttempts: 0, lockoutUntil: null },
        { ...canonicalOpts, allowPrivilegeEscalation: true },
      );
    }
  } catch (err: any) {
    logger.warn(`[BenchSeed] Admin hash self-heal check failed (non-fatal): ${err.message}`);
  }

  // 3. Benchmark collections (mirrors /api/testing action=benchmark-seed)
  const collectionSchemas = [
    {
      _id: "benchmark_authors",
      name: "benchmark_authors",
      fields: [
        { db_fieldName: "_id", label: "ID", widget: { Name: "Input" }, type: "string" },
        { db_fieldName: "name", label: "Name", widget: { Name: "Input" }, type: "string" },
      ],
    },
    {
      _id: "benchmark_posts",
      name: "benchmark_posts",
      fields: [
        { db_fieldName: "_id", label: "ID", widget: { Name: "Input" }, type: "string" },
        { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
        {
          db_fieldName: "author",
          label: "Author",
          widget: { Name: "Relation" },
          type: "string",
          collection: "benchmark_authors",
          relation: "benchmark_authors",
        },
      ],
    },
    {
      _id: "BenchmarkStable",
      name: "BenchmarkStable",
      fields: [
        { db_fieldName: "_id", label: "ID", widget: { Name: "Input" }, type: "string" },
        { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
        { db_fieldName: "slug", label: "Slug", widget: { Name: "Input" }, type: "string" },
        { db_fieldName: "status", label: "Status", widget: { Name: "Select" }, type: "string" },
        { db_fieldName: "content", label: "Content", widget: { Name: "RichText" }, type: "string" },
        { db_fieldName: "count", label: "Count", widget: { Name: "Input" }, type: "number" },
        {
          db_fieldName: "publishDate",
          label: "Publish Date",
          widget: { Name: "DateTime" },
          type: "string",
        },
      ],
    },
    // 🛡️ INDEX PRESSURE: bench_index_pressure powers the 100k-row sort/filter
    // audit (tests/benchmarks/index-pressure.test.ts). It must be provisioned
    // here — the schema-store fallback (BENCHMARK_FALLBACK_IDS) makes the
    // schema GET return 200, but without createModel the physical table is
    // never created and the bulk seed fails with SQLITE_ERROR on insert.
    // Fields mirror the demo preset in src/routes/setup/seed.ts.
    {
      _id: "bench_index_pressure",
      name: "bench_index_pressure",
      fields: [
        {
          db_fieldName: "title",
          label: "Title",
          widget: { Name: "Input" },
          type: "string",
          indexed: true,
          required: true,
        },
        { db_fieldName: "slug", label: "Slug", widget: { Name: "Input" }, type: "string" },
        { db_fieldName: "content", label: "Content", widget: { Name: "RichText" }, type: "string" },
        {
          db_fieldName: "score",
          label: "Score",
          widget: { Name: "Number" },
          type: "number",
          indexed: true,
        },
        {
          db_fieldName: "category",
          label: "Category",
          widget: { Name: "Select" },
          type: "string",
          indexed: true,
        },
        { db_fieldName: "author", label: "Author", widget: { Name: "Relation" }, type: "string" },
        { db_fieldName: "tags", label: "Tags", widget: { Name: "Input" }, type: "string" },
        {
          db_fieldName: "metadata",
          label: "Metadata",
          widget: { Name: "Group" },
          type: "object",
        },
      ],
    },
    // 🛡️ MIGRATION SCALE: bench_migration_large powers the 10k-row bulk
    // ingestion audit (tests/benchmarks/migration-scale.test.ts). Same
    // provisioning requirement as bench_index_pressure — without createModel
    // the physical table is never created and the bulk seed 500s.
    {
      _id: "bench_migration_large",
      name: "bench_migration_large",
      fields: [
        {
          db_fieldName: "title",
          label: "Title",
          widget: { Name: "Input" },
          type: "string",
          required: true,
        },
        { db_fieldName: "data", label: "Data", widget: { Name: "JSON" }, type: "string" },
      ],
    },
  ];
  await Promise.all(
    collectionSchemas.map(async (schema) => {
      try {
        await (db as any).collection.createModel(schema);
      } catch {
        /* already exists */
      }
    }),
  );
  for (const schema of collectionSchemas) {
    try {
      await cms.collections.registerSchema(schema._id, schema as any, tenantId);
    } catch {
      /* schema may already be registered */
    }
  }

  // 3b. 🛡️ PERSIST CONTENT NODES — a production benchmark server is a SEPARATE
  // process: it boots its content store from content_nodes in the DB. The old
  // test-mode /api/testing seed ran inside the server (registerSchema populated
  // the server's own store); the production seed runs in the TEST process, so
  // without these rows the server's store stays EMPTY: GraphQL allCollections
  // returns [], content exports 500 "Collection not found", and every
  // schema-driven benchmark measured hollow queries.
  for (const schema of collectionSchemas) {
    try {
      await (db as any).crud.upsert(
        "content_nodes",
        { path: `/collection/${schema.name}`, tenantId } as any,
        {
          _id: schema._id,
          path: `/collection/${schema.name}`,
          nodeType: "collection",
          collectionDef: schema,
          tenantId,
          status: "published",
          name: schema.name,
          slug: String(schema.name)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-"),
        } as any,
        { tenantId, bypassTenantCheck: true },
      );
    } catch (err: any) {
      logger.warn(`[BenchSeed] content_nodes upsert failed for ${schema._id}: ${err.message}`);
    }
  }

  // 4. Entries: 10 authors, 50 posts, stable entry (upsert for re-runs).
  // Deterministic UUIDv4 ids (version 4 / variant 8) — stable across re-runs
  // and format-compliant with the enterprise _id contract on collection tables.
  const AUTHOR_UUIDS = Array.from(
    { length: 10 },
    (_, i) => `10000000-0000-4000-8000-${(i + 1).toString(16).padStart(12, "0")}`,
  );
  const authors = AUTHOR_UUIDS.map((_id, i) => ({ _id, name: `Author ${i + 1}`, tenantId }));
  try {
    await cms.collections.bulkCreate("benchmark_authors", authors, {
      tenantId,
      skipValidation: true,
      system: true,
    });
    await cms.collections.bulkCreate(
      "benchmark_posts",
      authors.flatMap((author, ai) =>
        Array.from({ length: 5 }, (_, pi) => ({
          title: `Post ${pi + 1} by Author ${ai + 1}`,
          author: author._id,
          tenantId,
        })),
      ),
      { tenantId, skipValidation: true, system: true },
    );
  } catch (err: any) {
    logger.warn(`[BenchSeed] Entry seeding failed (non-fatal): ${err.message}`);
  }
  const STABLE_ENTRY_ID = "20000000-0000-4000-8000-000000000001";
  const stablePayload = {
    _id: STABLE_ENTRY_ID,
    title: "Stable Benchmark Entry",
    content: "This is a stable entry for REST and API performance testing.",
    count: 1,
    tenantId,
  };
  try {
    const res = await (db as any).crud.upsert(
      "BenchmarkStable",
      { _id: STABLE_ENTRY_ID },
      stablePayload,
      { tenantId, bypassTenantCheck: true },
    );
    if (!res?.success) {
      await cms.collections.create("BenchmarkStable", stablePayload, {
        tenantId,
        skipValidation: true,
        system: true,
      });
    }
  } catch (err: any) {
    logger.warn(`[BenchSeed] Stable entry seeding failed (non-fatal): ${err.message}`);
  }

  logger.info(`[BenchSeed] State seeded in ${(performance.now() - started).toFixed(0)}ms`);
}

export async function setupBenchmarkServer() {
  const _bootStart = performance.now();
  const apiBase = process.env.API_BASE_URL;
  if (apiBase) {
    // Shared server mode: use env vars directly
    _benchmarkBootMs = 0;
    process.env.TEST_API_SECRET = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";
    TEST_API_SECRET = process.env.TEST_API_SECRET;
    // Authenticate with a REAL session (admin must be seeded by the runner)
    await loginBenchmarkUser(apiBase).catch((err) => {
      logger.warn(`[BenchSeed] Shared-mode login failed (deferred): ${err.message}`);
    });
    return { baseUrl: apiBase, stop: async () => {} };
  }

  // ── Standalone mode: spawn a local server ───────────────────────────
  const { spawn } = await import("node:child_process");
  const { createServer } = await import("node:net");

  const dbType = getDbType() || "sqlite";

  // 🛡️ PRE-FLIGHT PORT PROBE: a random port can collide with a parallel
  // matrix run — node then exits with EADDRINUSE and the 90×500ms health poll
  // hangs the suite for 45s. Probe availability first and retry with a fresh
  // port (bounded) before giving up.
  const findFreePort = () =>
    new Promise<number>((resolve) => {
      const candidate = 4173 + Math.floor(Math.random() * 500);
      const probe = createServer();
      probe.once("error", () => resolve(0)); // in use / EADDRINUSE
      probe.listen(candidate, "127.0.0.1", () => {
        probe.close(() => resolve(candidate));
      });
    });
  let port = 0;
  for (let attempt = 0; attempt < 5 && port === 0; attempt++) {
    port = await findFreePort();
  }
  if (port === 0) port = 4173 + Math.floor(Math.random() * 500); // last resort
  // Use DB_NAME from env (CI bench-core / run-core-benchmarks), else adapter default.
  const dbName =
    process.env.DB_NAME || (dbType === "sqlite" ? "benchmark_shared" : "sveltycms_test");
  const secret = process.env.TEST_API_SECRET || "SVELTYCMS_TEST_SECRET_2026";
  const adminPw = resolveBenchmarkAdminPassword();

  const { getBenchmarkTestEnv } = await import("@src/utils/test-db-credentials");
  const defaultEnv = getBenchmarkTestEnv(dbType);
  for (const [k, v] of Object.entries(defaultEnv)) {
    if (!process.env[k] && v) {
      process.env[k] = v;
    }
  }
  process.env.DB_TYPE = dbType;
  process.env.DB_NAME = dbName;
  process.env.API_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || "Benchmark-JWT-Secret-Key-2026-32ch";
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "Benchmark-Encryption-Key-2026-32ch";
  process.env.TEST_API_SECRET = secret;
  process.env.ADMIN_PASSWORD = adminPw;
  TEST_API_SECRET = secret;
  const isTestMode = process.env.TEST_MODE === "true" || process.env.PLAYWRIGHT_TEST === "true";
  if (!isTestMode) {
    delete process.env.TEST_MODE;
    delete process.env.PLAYWRIGHT_TEST;
    process.env.BENCHMARK = "true";
    process.env.NODE_ENV = "production";
    process.env.SVELTY_BENCHMARK_SERVER_MODE = "production";
  } else {
    process.env.BENCHMARK = "true";
    process.env.NODE_ENV = "development";
    process.env.SVELTY_BENCHMARK_SERVER_MODE = "test";
  }
  process.env.RATE_LIMIT_MAX_REQUESTS = process.env.RATE_LIMIT_MAX_REQUESTS || "200000";

  const { printBenchmarkIsolationBanner } = await import("@utils/benchmark-sandbox");
  printBenchmarkIsolationBanner(dbType);

  // 🚀 Seed BEFORE boot: roles + admin + benchmark collections/entries must
  // exist before the server initializes its content engine (production mode
  // has no /api/testing to seed through).
  await seedBenchmarkState();

  const serverProcess = spawn("node", ["index.cjs"], {
    env: {
      ...process.env,
      PORT: String(port),
      DB_TYPE: dbType,
      DB_NAME: dbName,
      DB_HOST: process.env.DB_HOST || "127.0.0.1",
      DB_PORT: process.env.DB_PORT || "",
      DB_USER: process.env.DB_USER || "",
      DB_PASSWORD: process.env.DB_PASSWORD || "",
      TEST_MODE: isTestMode ? "true" : "",
      BENCHMARK: "true",
      TEST_API_SECRET: secret,
      NODE_ENV: isTestMode ? "development" : "production",
      // 🏔️ CI-PARITY SECRETS: explicitly carry the bootstrap secrets like
      // scripts/run-e2e.ts startPreviewServer does — the sync settings cache is
      // cold on API-only boots, so the auth hook falls back to process.env for
      // JWT_SECRET_KEY. Do not rely on the parent-env spread alone.
      JWT_SECRET_KEY: process.env.JWT_SECRET_KEY || "Benchmark-JWT-Secret-Key-2026-32ch",
      ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || "Benchmark-Encryption-Key-2026-32ch",
      SVELTY_BENCHMARK_SERVER_MODE: isTestMode ? "test" : "production",
      // 🏢 Audit mode: compliance → AUDIT_CHAIN_SYNC=true, DISABLE_AUDIT_LOGS=false
      BENCHMARK_AUDIT_MODE: process.env.BENCHMARK_AUDIT_MODE || "production",
      AUDIT_CHAIN_SYNC: process.env.BENCHMARK_AUDIT_MODE === "compliance" ? "true" : "false",
      DISABLE_AUDIT_LOGS: process.env.BENCHMARK_AUDIT_MODE === "compliance" ? "false" : "true",
      DISABLE_OUTBOX: process.env.DISABLE_OUTBOX || "true",
      RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS || "200000",
      SECURITY_RATE_LIMIT_SCALE: process.env.SECURITY_RATE_LIMIT_SCALE || "100",
    },
    stdio: "pipe",
    shell: false,
  });

  // Forward server stderr for visibility into startup failures
  let _stderr = "";
  serverProcess.stderr?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString().trim();
    if (msg) {
      _stderr += msg + "\n";
      process.stderr.write(`[bench-server] ${msg}\n`);
    }
  });

  const healthUrl = `http://127.0.0.1:${port}/api/system/health`;
  let healthy = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const res = await fetch(healthUrl, {
        signal: AbortSignal.timeout(2000),
      });
      // Accept any non-5xx response during startup — server may return 202/503/533
      if (res.status < 500) {
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const status = String(data.overallStatus ?? data.status ?? "").toUpperCase();
        const db = data.database;
        // SETUP/IDLE states legitimately report disconnected — only gate on db for READY+
        const dbOk =
          status === "SETUP" ||
          status === "IDLE" ||
          status === "INITIALIZING" ||
          db === true ||
          db === "connected";
        // Match integration test: accept SETUP, READY, WARMED, DEGRADED, etc.
        if (
          [
            "READY",
            "SETUP",
            "WARMED",
            "WARMING",
            "DEGRADED",
            "HEALTHY",
            "IDLE",
            "INITIALIZING",
          ].includes(status) &&
          dbOk
        ) {
          healthy = true;
          break;
        }
        // Log unexpected state for debugging
        if (attempt === 0 || attempt % 15 === 0) {
          console.log(`[bench-health] Attempt ${attempt + 1}: state=${status} db=${db}`);
        }
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  if (!healthy) {
    serverProcess.kill("SIGTERM");
    const stderrSnippet = _stderr ? `\nServer stderr:\n${_stderr.trim().slice(-2000)}` : "";
    throw new Error(`Server at ${healthUrl} did not become healthy within 45s${stderrSnippet}`);
  }

  // Authenticate with a REAL production session (login + cookie).
  await loginBenchmarkUser(`http://127.0.0.1:${port}`).catch((err) => {
    serverProcess.kill("SIGTERM");
    throw new Error(
      `Benchmark server is healthy but admin login failed — is the admin seeded? ${err.message}`,
    );
  });

  // Reset stable entry state through the real API (warms server caches)
  await ensureStableTestData(undefined, "global");

  const stop = async () => {
    delete process.env.API_BASE_URL;
    clearBenchmarkSession();
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
  let testFile = process.env.BEN_FILE || process.env.BENCH_FILE || "";
  if (!testFile) {
    const m = (process.argv[1] || "").match(/tests[/\\]benchmarks[/\\]([\w.-]+)\.ts/);
    if (m) {
      testFile = m[1].replace(/\.test$/, "");
    }
  }

  const runMode = process.env.BENCHMARK_MATRIX === "1" ? "matrix" : "standalone";
  const wallClockMs = _benchmarkTestStartTime > 0 ? performance.now() - _benchmarkTestStartTime : 0;

  // Build structured entry — spans + event-loop telemetry become trendable
  // ledger fields (PROFILE_WRITE=1 runs attach gql:/write- path span deltas).
  const spans = takeProfileSpans();
  const entry = {
    runMode,
    runId: _currentRunId,
    testFile: testFile || "unknown",
    metric: r.name,
    layer: r.layer || undefined,
    avgMs: r.avgMs ?? 0,
    p95Ms: r.p95Ms ?? 0,
    rps: r.rps ?? 0,
    cv: r.cv ?? 0,
    coldFirstMs: r.coldFirstMs,
    coldAvgMs: r.coldAvgMs,
    coldP95Ms: r.coldP95Ms,
    coldMaxMs: r.coldMaxMs,
    warmAvgMs: r.warmAvgMs ?? r.avgMs,
    warmP95Ms: r.warmP95Ms ?? r.p95Ms,
    warmRps: r.warmRps ?? r.rps,
    errorRate: r.errorCount && r.iterations ? r.errorCount / r.iterations : 0,
    wallClockMs,
    serverBootMs: _benchmarkBootMs,
    seedMs: _benchmarkSeedMs,
    db: r.db || dbType,
    redis: process.env.USE_REDIS === "true",
    timestamp: new Date().toISOString(),
    status: r.status || "SUCCESS",
    ...(r.eventLoopLagMs !== undefined ? { eventLoopLagMs: r.eventLoopLagMs } : {}),
    ...(r.eventLoopUtilization !== undefined
      ? { eventLoopUtilization: r.eventLoopUtilization }
      : {}),
    ...(spans.length > 0 ? { spans } : {}),
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

  // Export structured sub-metrics
  if (r.coldFirstMs !== undefined) {
    exportSubMetric(r.name, r.coldFirstMs, "ms", "cold");
  } else if (r.coldAvgMs !== undefined) {
    exportSubMetric(r.name, r.coldAvgMs, "ms", "cold");
  }
  if (r.avgMs !== undefined) {
    exportSubMetric(r.name, r.avgMs, "ms", "warm");
  }

  // Print summary line (always)
  const p95Str = entry.p95Ms ? `p95: ${entry.p95Ms.toFixed(3)}ms` : "";
  // Track which test files have been reported (dedup)
  if (!_reportedFiles.has(testFile)) {
    _reportedFiles.add(testFile);
    // Don't print "Recorded to" anymore - finalizeReport handles MDX
  }

  // In standalone mode, show per-metric line
  if (runMode === "standalone") {
    const coldSummary = r.coldFirstMs !== undefined ? ` [Cold: ${r.coldFirstMs.toFixed(2)}ms]` : "";
    console.log(
      `  ${r.name}: ${entry.avgMs.toFixed(3)}ms${p95Str ? ` (${p95Str})` : ""}${coldSummary} · RPS: ${Math.round(entry.rps)}`,
    );
  }
}

export async function runFinalizeReport(): Promise<void> {
  if (!_reportedFiles.size) return;
  const { finalizeReport } = await import("./benchmark-reporting");
  await finalizeReport(_currentRunId, { invokedTestFiles: _reportedFiles });
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
// Enterprise _id contract: collection-table entries require UUIDv4 ids.
export const STABLE_ENTRY_ID = "20000000-0000-4000-8000-000000000001";
// Kept for env-config compatibility (harness secret). It is NEVER sent as a
// request header — benchmark servers run in production mode where x-test-secret
// grants nothing and /api/testing is 403.
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

  // 🚀 PRODUCTION MODE: Reset the stable entry through the REAL authenticated
  // API (PATCH with session cookie) — warms the server's response cache and
  // exercises the same path a production admin uses. Falls back to direct DB
  // when no session is available (pre-login seeding).
  if (process.env.API_BASE_URL && _benchmarkSessionCookie) {
    try {
      const patchRes = await fetch(
        `${process.env.API_BASE_URL}/api/collections/${STABLE_COLLECTION}/${STABLE_ENTRY_ID}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...benchmarkAuthHeaders(),
            "x-tenant-id": tenantId,
          },
          body: JSON.stringify({ count: 0 }),
        },
      );
      if (patchRes.ok) return;
      if (process.env.BENCHMARK_DEBUG === "true") {
        process.stderr.write(
          `[DEBUG] Stable entry PATCH failed (${patchRes.status}) — falling back to direct DB\n`,
        );
      }
    } catch (err: any) {
      if (process.env.BENCHMARK_DEBUG === "true") {
        process.stderr.write(`[DEBUG] API stable-entry reset failed: ${err.message}\n`);
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
          `INSERT OR REPLACE INTO "collection_BenchmarkStable" ("_id", "tenantId", "data", "status", "isDeleted", "createdAt", "updatedAt") VALUES ('${STABLE_ENTRY_ID}', 'global', '{"count":0}', 'published', 0, 0, 0)`,
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
        `INSERT INTO "collection_BenchmarkStable" ("_id", "tenantId", "data", "status", "isDeleted", "createdAt", "updatedAt") VALUES ('${STABLE_ENTRY_ID}', 'global', '{"count":0}'::jsonb, 'published', false, NOW(), NOW()) ON CONFLICT ("_id") DO UPDATE SET "data" = '{"count":0}'::jsonb, "updatedAt" = NOW()`,
      );
    } catch (e: any) {
      if (process.env.BENCHMARK_DEBUG === "true")
        process.stderr.write(`[DEBUG] PostgreSQL upsert failed: ${e.message}\n`);
    }
  } else if (activeDb.type === "mariadb" || activeDb.type === "mysql") {
    try {
      await (activeDb as any).execute(
        sql.raw(
          `INSERT INTO \`collection_BenchmarkStable\` (\`_id\`, \`tenantId\`, \`data\`, \`status\`, \`isDeleted\`, \`createdAt\`, \`updatedAt\`) VALUES ('${STABLE_ENTRY_ID}', 'global', '{"count":0}', 'published', false, NOW(), NOW()) ON DUPLICATE KEY UPDATE \`data\` = '{"count":0}', \`updatedAt\` = NOW()`,
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
        { _id: STABLE_ENTRY_ID },
        { _id: STABLE_ENTRY_ID, tenantId, count: 0 },
      );
    } catch {
      /* ignore */
    }
  }

  // The authenticated PATCH (primary path) already reset the entry and warmed
  // the server cache. No secondary forge-header PATCH — production mode has no
  // test bypass and /api/testing is 403.

  _benchmarkSeedMs += performance.now() - _seedStart;
}

export async function forceRefreshServer(baseUrl: string, tenantId: string = "global") {
  await new Promise((r) => setTimeout(r, 50));
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-tenant-id": tenantId,
  };
  // Production mode: real session cookie (test bypass headers are gone)
  if (_benchmarkSessionCookie) Object.assign(headers, benchmarkAuthHeaders());
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(`${baseUrl}/api/system/refresh`, {
        method: "POST",
        headers,
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-tenant-id": tenantId,
  };
  // Production mode: real session cookie
  if (_benchmarkSessionCookie) Object.assign(headers, benchmarkAuthHeaders());
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
    // After 10 retries, force an authenticated content refresh (production
    // mode has no /api/testing create-collection fallback)
    if (i === 10) {
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
    _id: crypto.randomUUID(),
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
