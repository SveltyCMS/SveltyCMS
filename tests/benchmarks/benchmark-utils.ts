/**
 * @file tests/benchmarks/benchmark-utils.ts
 * @description Enterprise benchmarking core for SveltyCMS.
 * Standardizes execution, statistical analysis (percentiles, CV), memory auditing,
 * and professional reporting across all 19+ audit modules.
 */
import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";

// ── silencing noise ─────────────────────────────────────────────────────────
(globalThis as any).__SVELTY_QUIET__ = true;
process.env.BENCHMARK = "true";
process.env.LOG_LEVEL =
  process.env.BENCHMARK_DEBUG === "true" ? "debug" : process.env.LOG_LEVEL || "error";
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
}

// ── configuration ────────────────────────────────────────────────────────────
const RESULTS_DIR = process.env.RESULTS_DIR ?? "tests/benchmarks/results";

export const CONCURRENCY_GROUPS = {
  sqlite: 1,
  mariadb: 1,
  postgresql: 2,
  mongodb: 3,
} as const;

export function getRecommendedConcurrency(): number {
  const dbType = getDbType().toLowerCase();
  if (dbType.includes("sqlite") || dbType.includes("mariadb")) return CONCURRENCY_GROUPS.sqlite;
  if (dbType.includes("postgresql")) return CONCURRENCY_GROUPS.postgresql;
  return CONCURRENCY_GROUPS.mongodb;
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

export function computeStatistics(
  times: number[],
  rps: number,
  config: any,
  failTimes: number[] = [],
): BenchmarkResult {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / (sorted.length || 1);

  const variance = sorted.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (sorted.length || 1);
  const stdDev = Math.sqrt(variance);
  const cv = avg > 0 ? (stdDev / avg) * 100 : 0;

  const result: BenchmarkResult = {
    name: config.name,
    db: getDbType(),
    avgMs: avg,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    minMs: sorted[0] || 0,
    maxMs: sorted[sorted.length - 1] || 0,
    rps,
    iterations: times.length,
    runs: config.runs || 1,
    concurrency: config.concurrency || 1,
    cv,
    totalMs: sum,
    errorRate: config.errorRate || 0,
    timestamp: new Date().toISOString(),
    version: "0.0.8-enterprise",
  };

  if (failTimes.length > 0) {
    const sortedFails = [...failTimes].sort((a, b) => a - b);
    const sumFails = sortedFails.reduce((a, b) => a + b, 0);
    result.failAvgMs = sumFails / sortedFails.length;
    result.failP95Ms = percentile(sortedFails, 95);
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

  if (metadata.path !== "unknown" && metadata.proves === "Performance verification.") {
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

export async function stabilize(ms: number = 100) {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
  await new Promise((r) => setTimeout(r, ms));
}

export function getMemorySnapshot() {
  const mem = process.memoryUsage();
  return {
    rss: mem.rss / 1024 / 1024,
    heapUsed: mem.heapUsed / 1024 / 1024,
    heapTotal: mem.heapTotal / 1024 / 1024,
    external: mem.external / 1024 / 1024,
  };
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
    process.stdout.write(s + "\n");
    outputBuffer += s + "\n";
  };

  const W = 80;
  const h = makeHelpers(W);
  log("\n" + h.bar("╔", "╗"));
  log(h.center(options.title));
  const meta = discoverBenchmarkMetadata();
  log(h.center(`File: ${meta.path}`));
  log(h.bar("╠", "╣"));
  options.results.forEach((r) => {
    log(
      `║ ${r.name.padEnd(30)} │ ${r.avgMs.toFixed(3).padStart(12)} ms │ p95: ${r.p95Ms.toFixed(3).padStart(12)} ms │ RPS: ${Math.round(r.rps).toLocaleString().padStart(10)} ║`,
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
      const regex = new RegExp(`<!-- ${tag}_START -->[\\s\\S]*?<!-- ${tag}_END -->`);
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
  if (!dir.toLowerCase().endsWith(dbType.toLowerCase())) dir = path.join(dir, dbType);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const fileName = title.toLowerCase().replace(/[^a-z0-9]/g, "_") + ".table.txt";
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
      return "║" + " ".repeat(Math.floor(pad / 2)) + s + " ".repeat(Math.ceil(pad / 2)) + "║";
    },
  };
  let summaryBuffer = "";
  const log = (s: string) => {
    process.stdout.write(s + "\n");
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
  } = config;
  if (!onIteration) throw new Error("Benchmark must provide onIteration");
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
  return computeStatistics(
    validResults,
    rps,
    { ...config, errorRate: totalErrors / totalCompleted },
    failResults,
  );
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
  return { passedSLA: violations.length === 0, violations, p95, errorRate, totalReqs, failures };
}

export async function setupBenchmarkServer() {
  const apiBase = process.env.API_BASE_URL;
  if (apiBase) return { baseUrl: apiBase, stop: async () => {} };

  const { startServer, runSystemSetup } = await import("../../scripts/benchmark-matrix/server");
  const {
    ALL_DATABASES,
    JWT_SECRET_KEY,
    ENCRYPTION_KEY,
    TEST_API_SECRET: configSecret,
  } = await import("../../scripts/benchmark-matrix/config");

  const dbType = getDbType() || "sqlite";
  const dbName = `bench_tmp_${process.pid}`;
  const dbConf =
    ALL_DATABASES.find((d) => (d.useRedis ? `${d.type}-redis` : d.type) === dbType) ||
    ALL_DATABASES.find((d) => d.type === "sqlite") ||
    ALL_DATABASES[0];

  process.env.DB_TYPE = dbType;
  process.env.DB_NAME = dbName;
  const port = 4173 + Math.floor(Math.random() * 500);
  process.env.API_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.JWT_SECRET_KEY = JWT_SECRET_KEY;
  process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
  process.env.TEST_API_SECRET = configSecret;
  process.env.SVELTY_BENCHMARK_SUITE = "true";

  const { stop: originalStop } = await startServer(dbConf, port, dbName);
  const stop = async () => {
    delete process.env.API_BASE_URL;
    await originalStop();
  };

  await runSystemSetup(dbConf, port, dbName, { QUIET: "true", LOG_LEVEL: "fatal" });

  try {
    const { spawn } = await import("node:child_process");
    await new Promise<void>((resolve) => {
      const proc = spawn(
        "bun",
        [
          "run",
          "--preload",
          "./tests/unit/setup.ts",
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
  if (!dir.toLowerCase().endsWith(dbType.toLowerCase())) dir = path.join(dir, dbType);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${r.name.replace(/\s/g, "_")}.json`),
    JSON.stringify(r, null, 2),
  );
  try {
    const historyFile = path.resolve(process.cwd(), RESULTS_DIR, "history.jsonl");
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

export const STABLE_COLLECTION = "BenchmarkStable";
export const STABLE_ENTRY_ID = "bench-shared-001";
export const TEST_API_SECRET = (() => {
  if (process.env.TEST_API_SECRET) return process.env.TEST_API_SECRET;
  if (process.env.VITE_TEST_API_SECRET) return process.env.VITE_TEST_API_SECRET;
  return "SVELTYCMS_TEST_SECRET_2026";
})();

export async function ensureStableTestData(db?: any, tenantId: string = "global") {
  const { getDb, getDbInitPromise } = await import("@src/databases/db");
  if (!db) await getDbInitPromise(false, "CORE").catch(() => {});
  const activeDb = db || getDb();
  if (!activeDb) throw new Error("ensureStableTestData: activeDb is null");

  const schema = {
    _id: STABLE_COLLECTION,
    name: STABLE_COLLECTION,
    fields: [
      { db_fieldName: "_id", label: "ID", widget: { Name: "Input" }, type: "string" },
      { db_fieldName: "title", label: "Title", widget: { Name: "Input" }, type: "string" },
      { db_fieldName: "slug", label: "Slug", widget: { Name: "Input" }, type: "string" },
      { db_fieldName: "content", label: "Content", widget: { Name: "RichText" }, type: "string" },
      { db_fieldName: "count", label: "Count", widget: { Name: "Input" }, type: "number" },
    ],
  };

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
        body: JSON.stringify({ action: "create-collection", schema }),
      });
      if (res.ok) {
        const bulkData = Array.from({ length: 100 }, (_, i) => ({
          _id: `bench-shared-${(i + 1).toString().padStart(3, "0")}`,
          title: `Stable Entry ${i + 1}`,
          content: "Enterprise benchmark data chunk ".repeat(10),
          status: "published",
          count: i + 1,
        }));
        await fetch(`${process.env.API_BASE_URL}/api/collections/${STABLE_COLLECTION}/bulk`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-test-mode": "true",
            "x-test-secret": TEST_API_SECRET,
          },
          body: JSON.stringify(bulkData),
        });
        return;
      }
    } catch {
      /* ignore */
    }
  }

  try {
    await activeDb.collection.createModel(schema as any);
  } catch {
    /* ignore */
  }
  for (let i = 1; i <= 100; i++) {
    const id = `bench-shared-${i.toString().padStart(3, "0")}`;
    const data = {
      _id: id,
      title: `Stable Entry ${i}`,
      content: "Enterprise benchmark data chunk ".repeat(10),
      status: "published",
      count: i,
    };
    const res = await activeDb.crud.update(STABLE_COLLECTION, id, data, {
      tenantId,
      skipValidation: true,
      suppressErrorLog: true,
    });
    if (!res.success)
      await activeDb.crud.insert(STABLE_COLLECTION, data, {
        tenantId,
        skipValidation: true,
        suppressErrorLog: true,
      });
  }
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

export function generateRealisticEntry(
  i: number,
  complexity: "light" | "medium" | "heavy" = "medium",
) {
  const size = complexity === "light" ? 500 : complexity === "medium" ? 2500 : 10000;
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
