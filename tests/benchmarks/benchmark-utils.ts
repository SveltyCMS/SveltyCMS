/**
 * @file tests/benchmarks/benchmark-utils.ts
 * @description Enterprise benchmarking core for SveltyCMS.
 * Standardizes execution, statistical analysis (percentiles, CV), memory auditing,
 * and professional reporting across all 19+ audit modules.
 */
import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";

// ── Standalone Shim (Compatibility for 'bun run') ────────────────────────────
/**
 * 🚀 Standalone Test Runner Shim
 * Allows .test.ts files to be run with 'bun run' while maintaining 'bun test' compatibility.
 * Detects if it is being run within a test runner or as a standalone script.
 */
const isTestRunner =
  !!process.env.BUN_TEST ||
  (typeof (globalThis as any).test !== "undefined" &&
    !process.env.BENCHMARK_STANDALONE);

// 🚀 Auto-Redirector: Ensures benchmarks always run via 'bun test' engine
if (!isTestRunner && !process.env.BENCHMARK_REDIRECTED) {
  const filePath = process.argv[1];
  if (
    filePath &&
    (filePath.endsWith(".test.ts") || filePath.endsWith(".bench.ts"))
  ) {
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
  if (typeof (globalThis as any).expect !== "undefined")
    return (globalThis as any).expect(val);

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
process.env.BENCHMARK = "true";

// 🛡️ AUTO-CLEANUP: Global hook to prevent connection leaks
afterAll(async () => {
  const { shutdownSystem } = await import("@src/databases/db");
  await shutdownSystem().catch(() => {});
});

// 🚀 UNIFIED LOGGING: High-frequency benchmarks use 'error' by default, 'debug' only if requested.

process.env.LOG_LEVEL =
  process.env.BENCHMARK_DEBUG === "true" ? "debug" : "error";
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
  if (dbType.includes("mariadb") || dbType.includes("mysql"))
    return CONCURRENCY_GROUPS.mariadb;
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
    config.trimOutliers === "iqr" || config.trimOutliers === true
      ? trimOutliersIQR(times)
      : times;

  const sorted = [...processedTimes].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / (sorted.length || 1);

  const variance =
    sorted.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (sorted.length || 1);
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
  if (process.env.DB_TYPE) return process.env.DB_TYPE.toLowerCase();
  return "sqlite";
}

function discoverBenchmarkMetadata() {
  const metadata = {
    path: process.env.BENCH_FILE || "unknown",
    proves: process.env.BENCH_PROVES || "Performance verification.",
  };

  if (metadata.path === "unknown") {
    try {
      const err = new Error();
      const stack = err.stack || "";
      const lines = stack.split("\n");
      for (const line of lines) {
        const normalized = line.replace(/\\/g, "/");
        if (
          normalized.includes("tests/benchmarks/") &&
          !normalized.includes("benchmark-utils.ts")
        ) {
          const match = normalized.match(/tests\/benchmarks\/([\w.-]+)/i);
          if (match) {
            metadata.path = `tests/benchmarks/${match[1].split(":")[0].split("?")[0]}`;
            break;
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (
    metadata.path !== "unknown" &&
    metadata.proves === "Performance verification."
  ) {
    try {
      const fullPath = path.resolve(process.cwd(), metadata.path);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        const descMatch = content.match(/@description\s+(.+)/i);
        if (descMatch) metadata.proves = descMatch[1].trim();
      }
    } catch {
      /* ignore */
    }
  }
  return metadata;
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

function pushTableToMdx(title: string, table: string, shortLabel?: string) {
  try {
    const dbType = getDbType();
    const docPath = path.resolve(
      process.cwd(),
      "docs/project/benchmarks",
      `benchmark_${dbType.replace("-", "_")}.mdx`,
    );
    if (!fs.existsSync(docPath)) return;
    let content = fs.readFileSync(docPath, "utf8");
    const scriptId = shortLabel
      ? shortLabel.split(" ")[0].toLowerCase()
      : title.split("—")[1]?.trim().split(" ")[0].toLowerCase() || "unknown";
    const finalId = scriptId === "database" ? "db" : scriptId;
    const tag = `${finalId.toUpperCase()}_TABLE`;
    const START = `<!-- ${tag}_START -->`;
    const END = `<!-- ${tag}_END -->`;
    const tableBlock = `\n### 🏷️ ${title}\n\n\`\`\`text\n${table}\n\`\`\`\n`;
    if (content.includes(START) && content.includes(END)) {
      const regex = new RegExp(
        `<!-- ${tag}_START -->[\\s\\S]*?<!-- ${tag}_END -->`,
      );
      content = content.replace(regex, `${START}${tableBlock}${END}`);
    } else {
      const insertionPoint = "## 🔬 Detailed Performance Ledger (20+ Modules)";
      if (content.includes(insertionPoint))
        content = content.replace(
          insertionPoint,
          `${insertionPoint}\n\n${START}${tableBlock}${END}`,
        );
    }
    fs.writeFileSync(docPath, content);
  } catch (err: any) {
    console.error(`[pushTableToMdx] Failed: ${err.message}`);
  }
}

function saveTerminalTable(title: string, content: string) {
  const dbType = getDbType();
  let dir = path.resolve(process.cwd(), RESULTS_DIR);
  if (!dir.toLowerCase().endsWith(dbType.toLowerCase()))
    dir = path.join(dir, dbType);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fileName =
    title.toLowerCase().replace(/[^a-z0-9]/g, "_") + ".table.txt";
  fs.writeFileSync(path.join(dir, fileName), content);
}

export function printSummaryTable(
  metrics: Array<{ key: string; val: number | string; unit: string }>,
) {
  const W = 80;
  const helpers = {
    bar: (l: string, r: string) => l + "═".repeat(W - 2) + r,
    center: (s: string) => {
      const pad = W - 2 - s.length;
      return (
        "║" +
        " ".repeat(Math.floor(pad / 2)) +
        s +
        " ".repeat(Math.ceil(pad / 2)) +
        "║"
      );
    },
  };
  let summaryBuffer = "";
  const log = (s: string) => {
    console.log(s);
    summaryBuffer += s + "\n";
  };
  log("\n" + helpers.bar("╔", "╗"));
  log(helpers.center("FINAL AUDIT SUMMARY"));
  log(helpers.bar("╠", "╣"));
  metrics.forEach((m) => {
    const valStr = typeof m.val === "number" ? m.val.toFixed(3) : String(m.val);
    log(`║ ${m.key.padEnd(50)} │ ${valStr.padStart(12)} ${m.unit.padEnd(8)} ║`);
  });
  log(helpers.bar("╚", "╝") + "\n");
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
                console.error(
                  `\n[Benchmark DEBUG] First error in "${config.name}":`,
                  err,
                );
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
            console.error(
              `\n[Benchmark DEBUG] First error in "${config.name}":`,
              err,
            );
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
      if (elapsed < interval)
        await new Promise((r) => setTimeout(r, interval - elapsed));
    }
  }
  const sorted = latencies.sort((a, b) => a - b);
  const p95 = percentile(sorted, 95);
  const errorRate = failures / (totalReqs || 1);
  const violations: string[] = [];
  if (thresholds.p95) {
    const limit = parseFloat(thresholds.p95.replace(/[^\d.]/g, ""));
    if (p95 > limit)
      violations.push(`p95 latency ${p95.toFixed(2)}ms > threshold ${limit}ms`);
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
  const apiBase = process.env.API_BASE_URL;
  if (apiBase) return { baseUrl: apiBase, stop: async () => {} };

  const { startServer, runSystemSetup } =
    await import("../../scripts/benchmark-matrix/server");
  const {
    ALL_DATABASES,
    JWT_SECRET_KEY,
    ENCRYPTION_KEY,
    TEST_API_SECRET: configSecret,
  } = await import("../../scripts/benchmark-matrix/config");

  const dbType = getDbType() || "sqlite";
  const useRedis = process.env.USE_REDIS === "true";
  const dbKey = useRedis ? `${dbType}-redis` : dbType;
  const dbName = `bench_tmp_${process.pid}`;
  const dbConf =
    ALL_DATABASES.find((d) => {
      const key = d.useRedis ? `${d.type}-redis` : d.type;
      return key === dbKey;
    }) ||
    ALL_DATABASES.find((d) => d.type === "sqlite") ||
    ALL_DATABASES[0];

  process.env.DB_TYPE = dbType;
  process.env.DB_NAME = dbName;
  process.env.DB_HOST = dbConf.host;
  process.env.DB_PORT = String(dbConf.port);
  process.env.DB_USER = dbConf.user || "";
  process.env.DB_PASSWORD = dbConf.password || "";
  const port = 4173 + Math.floor(Math.random() * 500);
  process.env.API_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.JWT_SECRET_KEY = JWT_SECRET_KEY;
  process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
  process.env.TEST_API_SECRET = configSecret;
  TEST_API_SECRET = configSecret;
  process.env.SVELTY_BENCHMARK_SUITE = "true";

  const { stop: originalStop } = await startServer(dbConf, port, dbName);
  const stop = async () => {
    delete process.env.API_BASE_URL;
    await originalStop();
  };

  await runSystemSetup(dbConf, port, dbName, {
    QUIET: "true",
    LOG_LEVEL: "fatal",
  });

  try {
    const { spawn } = await import("node:child_process");
    await new Promise<void>((resolve) => {
      const proc = spawn(
        "bun",
        [
          "run",
          "--preload",
          "./tests/unit/bun-preload.ts",
          "scripts/benchmark-matrix/setup-benchmarks.ts",
        ],
        {
          env: { ...process.env, API_BASE_URL: process.env.API_BASE_URL },
          stdio: "ignore",
          shell: process.platform === "win32",
        },
      );
      proc.on("close", () => resolve());
    });
  } catch {
    /* ignore */
  }

  return { baseUrl: process.env.API_BASE_URL, stop };
}

export function exportResult(r: any) {
  const dbType = getDbType();
  let dir = path.resolve(process.cwd(), RESULTS_DIR);
  if (!dir.toLowerCase().endsWith(dbType.toLowerCase()))
    dir = path.join(dir, dbType);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${r.name.replace(/\s/g, "_")}.json`),
    JSON.stringify(r, null, 2),
  );
  try {
    const historyFile = path.resolve(
      process.cwd(),
      RESULTS_DIR,
      "history.jsonl",
    );
    const entry =
      JSON.stringify({
        timestamp: new Date().toISOString(),
        name: r.name,
        layer: r.layer || "unknown",
        avgMs: r.avgMs,
        p95Ms: r.p95Ms,
        rps: r.rps,
        db: r.db || getDbType(),
      }) + "\n";
    fs.appendFileSync(historyFile, entry);
  } catch {
    /* ignore */
  }
}

export function exportMetric(key: string, value: number, unit: string) {
  const dbType = getDbType();
  try {
    let dir = path.resolve(process.cwd(), RESULTS_DIR);
    if (!dir.toLowerCase().endsWith(dbType.toLowerCase()))
      dir = path.join(dir, dbType);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const metricsFile = path.join(dir, "matrix_metrics.json");
    let current: Record<string, any> = {};
    if (fs.existsSync(metricsFile))
      current = JSON.parse(fs.readFileSync(metricsFile, "utf8"));
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

export const STABLE_COLLECTION = "BenchmarkStable";
export const STABLE_ENTRY_ID = "bench-shared-001";
export let TEST_API_SECRET = (() => {
  if (process.env.TEST_API_SECRET) return process.env.TEST_API_SECRET;
  if (process.env.VITE_TEST_API_SECRET) return process.env.VITE_TEST_API_SECRET;
  return "SVELTYCMS_TEST_SECRET_2026";
})();

export async function ensureStableTestData(
  db?: any,
  tenantId: string = "global",
) {
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

      // Reset entry count via API PATCH
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
      ).catch(() => {});
      return;
    } catch (err: any) {
      if (process.env.BENCHMARK_DEBUG === "true") {
        process.stderr.write(
          `[DEBUG] API-based stable data seeding failed: ${err.message}\n`,
        );
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
      await (activeDb as any).execute(
        sql.raw(
          `INSERT INTO "collection_BenchmarkStable" ("_id", "tenantId", "data", "status", "isDeleted", "createdAt", "updatedAt") VALUES ('bench-shared-001', 'global', '{"count":0}'::jsonb, 'published', false, NOW(), NOW()) ON CONFLICT ("_id") DO UPDATE SET "data" = '{"count":0}'::jsonb, "updatedAt" = NOW()`,
        ),
      );
    } catch (e: any) {
      if (process.env.BENCHMARK_DEBUG === "true")
        process.stderr.write(
          `[DEBUG] PostgreSQL upsert failed: ${e.message}\n`,
        );
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
}

export async function forceRefreshServer(
  baseUrl: string,
  tenantId: string = "global",
) {
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
  const query = `query { __schema { types { name } } }`;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`${baseUrl}/api/graphql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-mode": "true",
          "x-test-secret": TEST_API_SECRET,
          "x-tenant-id": tenantId,
        },
        body: JSON.stringify({ query }),
      });
      if (res.ok) {
        const data = await res.json();
        const types = data.data.__schema.types.map((t: any) => t.name);
        if (types.includes(collectionId)) return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Timeout waiting for collection ${collectionId} in GraphQL schema.`,
  );
}

export function generateRealisticEntry(
  i: number,
  complexity: "light" | "medium" | "heavy" = "medium",
) {
  const size =
    complexity === "light" ? 500 : complexity === "medium" ? 2500 : 10000;
  return {
    _id: `real-${i}`,
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
