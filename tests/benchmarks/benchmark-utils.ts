/**
 * @file tests/benchmarks/benchmark-utils.ts
 * @description Enterprise benchmarking core for SveltyCMS.
 * Standardizes execution, statistical analysis (percentiles, CV), memory auditing,
 * and professional reporting across all 19+ audit modules.
 */
import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";
import { logger } from "@utils/logger";

// ── silencing noise ─────────────────────────────────────────────────────────
process.env.LOG_LEVEL = "error";
process.env.DEBUG = "";
process.env.QUIET = "true";

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
  // Memory
  rssDelta?: number;
  heapUsedDelta?: number;
  externalDelta?: number;
  totalMs: number;
  errorRate?: number;
  // Metadata
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

/**
 * Calculates a percentile using linear interpolation (industry standard).
 * Match behavior of tools like Benchmark.js / Prometheus.
 */
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
 * Computes high-fidelity statistics including CV for stability tracking.
 */
export function computeStatistics(times: number[], rps: number, config: any): BenchmarkResult {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;

  // Standard Deviation for CV
  const variance = sorted.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / sorted.length;
  const stdDev = Math.sqrt(variance);
  const cv = (stdDev / avg) * 100;

  return {
    name: config.name,
    db: getDbType(),
    avgMs: avg,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    p99Ms: percentile(sorted, 99),
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
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
}

// ── infrastructure ───────────────────────────────────────────────────────────

/**
 * Returns the current database type being audited.
 * 🚀 SMART DISCOVERY: Checks ENV first, then falls back to active DB adapter state.
 */
export function getDbType(): string {
  const envType = process.env.DB_TYPE;
  if (envType) return envType.toLowerCase();

  // Attempt to get type from active adapter if available
  try {
    const { getDb } = require("@src/databases/db");
    const db = getDb();
    if (db?.type) return db.type.toLowerCase();
  } catch {
    /* ignore */
  }

  return "sqlite";
}

/**
 * 🚀 Automatically discovers the calling benchmark file path.
 */
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
        // Support both forward and backslashes
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

  // 🚀 If we found a file but no description, try to read it from the file header
  if (metadata.path !== "unknown" && metadata.proves === "Performance verification.") {
    try {
      const fullPath = path.resolve(process.cwd(), metadata.path);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf-8");
        // Look for @description in JSDoc header
        const descMatch = content.match(/@description\s+(.+)/i);
        if (descMatch) {
          metadata.proves = descMatch[1].trim();
        }
      }
    } catch {
      /* fallback to default */
    }
  }

  return metadata;
}

/**
 * Aggressive GC stabilization and memory snapshotting.
 */
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

let lastMdxTitle = "";
let lastMdxShortLabel = "";
let accumulatedMdxTable = "";
let lastMdxResults: any[] = [];

export function printTruthTable(options: {
  title: string;
  subtitle: string;
  results: any[];
  layerMode?: boolean;
  shortLabel?: string; // 🚀 Optional shortLabel for precise MDX targeting
}) {
  const dbType = getDbType();
  const dbNames = process.env.ALL_DBS?.split(",").map((s) => s.trim()) ?? [dbType];
  const multi = dbNames.length > 1;

  for (const r of options.results) if (!r.db) r.db = dbType;

  const SC_COL = 28;
  const METRIC_COL = 10;
  const VAL_COL = 14;
  const OVH_COL = 14;

  const makeHelpers = (width: number) => ({
    bar: (l: string, r: string) => l + "═".repeat(width - 2) + r,
    center: (s: string) => {
      const maxWidth = width - 4; // allow for padding
      let display = s;
      if (s.length > maxWidth) {
        display = s.substring(0, maxWidth - 3) + "...";
      }
      const pad = width - 2 - display.length;
      return (
        "║" +
        " ".repeat(Math.max(0, Math.floor(pad / 2))) +
        display +
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

  if (multi && !options.layerMode) {
    const W = 2 + SC_COL + 3 + METRIC_COL + dbNames.length * (VAL_COL + 3) + 1;
    const h = makeHelpers(W);

    log("\n" + h.bar("╔", "╗"));
    log(h.center(options.title + " (MATRIX)"));
    if (options.subtitle) {
      options.subtitle.split("\n").forEach((line: string) => log(h.center(line)));
    }

    // 🚀 Add File and Description for transparency
    const meta = discoverBenchmarkMetadata();
    log(h.center(`File: ${meta.path}`));
    log(h.center(`Proves: ${meta.proves}`));

    log(h.bar("╠", "╣"));

    let hdr = `║ ${"Scenario".padEnd(SC_COL)} │ ${"Metric".padEnd(METRIC_COL)}`;
    for (const db of dbNames) hdr += ` │ ${db.toUpperCase().padEnd(VAL_COL)}`;
    log(hdr + " ║");
    log(h.bar("╠", "╣"));

    const scenarios = Array.from(
      new Set(options.results.map((r) => r.name.replace(/ @ \d+c$/, ""))),
    );
    for (const sc of scenarios) {
      ["avg", "p95", "RPS"].forEach((m, i) => {
        let line = `║ ${(i === 0 ? sc : "").padEnd(SC_COL)} │ ${m.padEnd(METRIC_COL)}`;
        for (const db of dbNames) {
          const r = options.results.find((x) => x.db === db && x.name.startsWith(sc));
          const val = !r
            ? "—"
            : m === "avg"
              ? `${r.avgMs.toFixed(3)} ms`
              : m === "p95"
                ? `${r.p95Ms.toFixed(3)} ms`
                : Math.round(r.rps).toLocaleString();
          line += ` │ ${val.padEnd(VAL_COL)}`;
        }
        log(line + " ║");
      });
      log(h.bar("╠", "╣"));
    }
    log(h.bar("╚", "╝"));
  } else if (options.layerMode) {
    const W = 2 + SC_COL + 3 + 6 + 3 + VAL_COL + 3 + 12 + 3 + 12 + 3 + OVH_COL + 2;
    const h = makeHelpers(W);
    const row = (sc: string, c: string, avg: string, p95: string, rps: string, ovh: string) =>
      `║ ${sc.padEnd(SC_COL)} │ ${c.padEnd(6)} │ ${avg.padEnd(VAL_COL)} │ ${p95.padEnd(12)} │ ${rps.padEnd(12)} │ ${ovh.padEnd(OVH_COL)} ║`;

    log("\n" + h.bar("╔", "╗"));
    log(h.center(options.title.replace(" AUDIT", "") + " AUDIT"));
    if (options.subtitle) {
      options.subtitle.split("\n").forEach((line: string) => log(h.center(line)));
    }

    // 🚀 Add File and Description for transparency
    const meta = discoverBenchmarkMetadata();
    log(h.center(`File: ${meta.path}`));
    log(h.center(`Proves: ${meta.proves}`));

    log(h.bar("╠", "╣"));
    log(row("Scenario", "c", "Avg latency", "p95", "RPS", "Overhead"));
    log(h.bar("╠", "╣"));

    const scenarios = Array.from(
      new Set(options.results.map((r) => r.name.replace(/^(SDK|Dispatcher) /, "").split(" @ ")[0])),
    );

    scenarios.forEach((sc) => {
      const variants = options.results.filter((r) => r.name.includes(sc));
      const concurrencyLevels = Array.from(new Set(variants.map((r) => r.name.split(" @ ")[1])));

      concurrencyLevels.forEach((c) => {
        const sdk = variants.find((r) => r.name.includes(c) && r.name.startsWith("SDK"));
        const dis = variants.find((r) => r.name.includes(c) && r.name.startsWith("Dispatcher"));

        if (sdk)
          log(
            row(
              sc,
              c,
              `${sdk.avgMs.toFixed(3)} ms`,
              sdk.p95Ms.toFixed(3),
              Math.round(sdk.rps).toLocaleString(),
              "SDK",
            ),
          );
        if (dis) {
          const overhead = sdk ? `+${(dis.avgMs - sdk.avgMs).toFixed(2)} ms` : "—";
          log(
            row(
              "",
              "",
              `${dis.avgMs.toFixed(3)} ms`,
              dis.p95Ms.toFixed(3),
              Math.round(dis.rps).toLocaleString(),
              overhead,
            ),
          );
        }
        log(h.bar("╠", "╣"));
      });
    });
    log(h.bar("╚", "╝"));
  } else {
    const W = 2 + SC_COL + 3 + VAL_COL + 3 + 12 + 3 + 12 + 2;
    const h = makeHelpers(W);
    const row = (sc: string, avg: string, p95: string, rps: string) =>
      `║ ${sc.padEnd(SC_COL)} │ ${avg.padEnd(VAL_COL)} │ ${p95.padEnd(12)} │ ${rps.padEnd(12)} ║`;

    log("\n" + h.bar("╔", "╗"));
    log(h.center(options.title));
    if (options.subtitle) {
      options.subtitle.split("\n").forEach((line: string) => log(h.center(line)));
    }

    // 🚀 Add File and Description for transparency
    const meta = discoverBenchmarkMetadata();
    log(h.center(`File: ${meta.path}`));
    log(h.center(`Proves: ${meta.proves}`));

    log(h.bar("╠", "╣"));
    log(row("Scenario", "Avg latency", "p95", "RPS"));
    log(h.bar("╠", "╣"));

    // 🚀 Load history for inline trend analysis
    let history: any[] = [];
    try {
      const historyFile = path.resolve(process.cwd(), RESULTS_DIR, "history.jsonl");
      if (fs.existsSync(historyFile)) {
        history = fs
          .readFileSync(historyFile, "utf8")
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l));
      }
    } catch {
      /* ignore */
    }

    options.results.forEach((r) => {
      let trend = "";
      const prev = history.filter((h) => h.name === r.name && h.db === r.db).slice(-1)[0];

      if (prev && prev.avgMs > 0 && r.avgMs > 0) {
        const delta = ((r.avgMs - prev.avgMs) / prev.avgMs) * 100;
        const icon = delta > 5 ? "🔴" : delta < -5 ? "🟢" : "⚪";
        trend = ` (${icon} ${delta > 0 ? "+" : ""}${delta.toFixed(1)}%)`;
      }

      const avgStr = typeof r.avgMs === "number" ? `${r.avgMs.toFixed(3)} ms` : "N/A";
      const p95Str = typeof r.p95Ms === "number" ? `${r.p95Ms.toFixed(3)} ms` : "N/A";

      log(
        row(
          r.name.replace(" (aggregate)", ""),
          `${avgStr}${trend}`,
          p95Str,
          Math.round(r.rps || 0).toLocaleString(),
        ),
      );
    });
    log(h.bar("╚", "╝"));
  }

  // 🚀 Save and Push the identical ASCII table to the technical ledger
  const tableContent = outputBuffer.trim();
  saveTerminalTable(options.title, tableContent);

  lastMdxTitle = options.title;
  lastMdxShortLabel = options.shortLabel || "";
  accumulatedMdxTable = tableContent;
  lastMdxResults = options.results || [];

  pushTableToMdx(options.title, tableContent, options.shortLabel);
}

/**
 * Injects the ASCII table directly into the database-specific MDX technical ledger.
 */
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

    // Generate a unique tag based on shortLabel or title (e.g., <!-- API_TABLE -->)
    const scriptId = shortLabel
      ? shortLabel.split(" ")[0].toLowerCase()
      : title.split("—")[1]?.trim().split(" ")[0].toLowerCase() || "unknown";

    // Handle mapping for consistency with reporting.ts
    const finalId = scriptId === "database" ? "db" : scriptId;

    const tag = `${finalId.toUpperCase()}_TABLE`;
    const START = `<!-- ${tag}_START -->`;
    const END = `<!-- ${tag}_END -->`;

    let trendStr = "";
    if (lastMdxResults && lastMdxResults.length > 0) {
      try {
        const historyFile = path.resolve(process.cwd(), RESULTS_DIR, "history.jsonl");
        if (fs.existsSync(historyFile)) {
          const lines = fs.readFileSync(historyFile, "utf8").trim().split("\n");
          const mainResult = lastMdxResults[lastMdxResults.length - 1];
          const historyLines = lines
            .filter((l) => l.trim().length > 0)
            .map((l) => JSON.parse(l))
            .filter((h) => h.name === mainResult.name && h.db === mainResult.db);

          if (historyLines.length > 0) {
            const prev = historyLines[historyLines.length - 1];
            const current = mainResult;

            if (prev && prev.avgMs > 0 && current.avgMs > 0) {
              const delta = ((current.avgMs - prev.avgMs) / prev.avgMs) * 100;
              const icon = delta > 5 ? "🔴" : delta < -5 ? "🟢" : "⚪";
              trendStr = ` (Trend: ${icon} ${delta > 0 ? "+" : ""}${delta.toFixed(1)}%)`;
            }
          }
        }
      } catch {
        // Silent fail
      }
    }

    const tableBlock = `\n### 🏷️ ${title.split("—")[1]?.trim() || title}${trendStr}\n\n\`\`\`text\n${table}\n\`\`\`\n`;

    if (content.includes(START) && content.includes(END)) {
      const regex = new RegExp(`<!-- ${tag}_START -->[\\s\\S]*?<!-- ${tag}_END -->`);
      content = content.replace(regex, `${START}${tableBlock}${END}`);
    } else {
      // Auto-Registration: Append to the "Detailed Performance Ledger" section
      const insertionPoint = "## 🔬 Detailed Performance Ledger (20+ Modules)";
      if (content.includes(insertionPoint)) {
        content = content.replace(
          insertionPoint,
          `${insertionPoint}\n\n${START}${tableBlock}${END}`,
        );
      }
    }
    fs.writeFileSync(docPath, content);
  } catch (err: any) {
    console.error(`[pushTableToMdx] Failed: ${err.message}`);
  }
}

/**
 * Saves the identical terminal output table to a persistent file.
 */
function saveTerminalTable(title: string, content: string) {
  const dbType = getDbType();
  const dir = path.resolve(process.cwd(), RESULTS_DIR, dbType);
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
    const line = `║ ${m.key.padEnd(50)} │ ${valStr.padStart(12)} ${m.unit.padEnd(8)} ║`;
    log(line);
  });
  log(helpers.bar("╚", "╝") + "\n");

  if (lastMdxTitle) {
    accumulatedMdxTable += "\n\n" + summaryBuffer.trim();
    pushTableToMdx(lastMdxTitle, accumulatedMdxTable, lastMdxShortLabel);
  }
}

// ── core execution ───────────────────────────────────────────────────────────

export async function runBenchmark(config: any) {
  const { iterations, runs = 1, concurrency = 1, onIteration, onSetup } = config;
  if (!onIteration) throw new Error("Benchmark must provide onIteration");

  const results: number[] = [];

  let totalErrors = 0;

  for (let r = 0; r < runs; r++) {
    if (onSetup) await onSetup();

    // Warmup
    if (config.warmupIterations) {
      for (let i = 0; i < config.warmupIterations; i++) {
        try {
          await onIteration(i);
        } catch {
          // ignore warmup errors
        }
      }
    }

    const tStart = performance.now();

    if (concurrency > 1) {
      // Parallel mode
      const tasks = Array.from({ length: iterations }, (_, i) => i);
      const chunks = [];
      for (let i = 0; i < tasks.length; i += concurrency) {
        chunks.push(tasks.slice(i, i + concurrency));
      }

      for (const chunk of chunks) {
        await Promise.all(
          chunk.map(async (i) => {
            try {
              await onIteration(i);
            } catch (err) {
              totalErrors++;
              if (!config.silent) logger.warn(`Benchmark iteration ${i} failed`, err);
            }
          }),
        );
      }
    } else {
      // Sequential mode
      for (let i = 0; i < iterations; i++) {
        const iStart = performance.now();
        try {
          await onIteration(i);
          results.push(performance.now() - iStart);
        } catch (err) {
          totalErrors++;
          if (!config.silent) logger.warn(`Benchmark iteration ${i} failed`, err);
        }
      }
    }

    const tTotal = performance.now() - tStart;
    if (concurrency > 1) {
      const avg = tTotal / iterations;
      for (let i = 0; i < iterations; i++) results.push(avg);
    }
  }

  const validResults = results.filter((r) => !isNaN(r));
  const sum = validResults.reduce((a, b) => a + b, 0);
  const rps = sum > 0 ? (iterations * runs) / (sum / 1000) : 0;

  if (validResults.length === 0) {
    throw new Error(
      `Benchmark "${config.name}" failed completely: 0 valid results, ${totalErrors} errors.`,
    );
  }

  return computeStatistics(validResults, rps, {
    ...config,
    errorRate: totalErrors / (iterations * runs),
  });
}

/**
 * Executes a ramping load test with stage transitions and SLA validation.
 */
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

  console.log(`   [Stochastic] Starting ${config.name} with ${stages.length} stages...`);

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
      if (elapsed < interval) {
        await new Promise((r) => setTimeout(r, interval - elapsed));
      }
    }
  }

  const sorted = latencies.sort((a, b) => a - b);
  const p95 = percentile(sorted, 95);
  const errorRate = failures / totalReqs;

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

// ── mocks & helpers ──────────────────────────────────────────────────────────

export async function setupBenchmarkServer() {
  const apiBase = process.env.API_BASE_URL;
  if (apiBase) return { baseUrl: apiBase, stop: async () => {} };

  // Aggressive silence for startup noise
  process.env.LOG_LEVEL = "info";
  process.env.QUIET = "false";

  const { startServer, runSystemSetup } = await import("../../scripts/benchmark-matrix/server");
  const { ALL_DATABASES } = await import("../../scripts/benchmark-matrix/config");

  const dbType = getDbType();
  const dbConf =
    ALL_DATABASES.find((d) => (d.useRedis ? `${d.type}-redis` : d.type) === dbType) ||
    ALL_DATABASES[0];
  const port = 4173 + Math.floor(Math.random() * 500);

  process.env.API_BASE_URL = `http://127.0.0.1:${port}`;
  const dbName = `bench_tmp_${process.pid}`;
  process.env.DB_NAME = dbName;

  // 🚀 Ensure mandatory secrets are in env for the test process too
  const {
    JWT_SECRET_KEY,
    ENCRYPTION_KEY,
    TEST_API_SECRET: configSecret,
  } = await import("../../scripts/benchmark-matrix/config");
  process.env.JWT_SECRET_KEY = JWT_SECRET_KEY;
  process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
  process.env.TEST_API_SECRET = configSecret;
  process.env.DB_HOST = dbConf.host || "127.0.0.1";
  process.env.DB_TYPE = dbConf.type;
  process.env.DB_PORT = dbConf.port.toString();

  const { stop: originalStop } = await startServer(dbConf, port, dbName);

  const stop = async () => {
    delete process.env.API_BASE_URL;
    await originalStop();
  };

  // Standalone run: initialize tables after starting server
  await runSystemSetup(dbConf, port, dbName, {
    QUIET: "true",
    LOG_LEVEL: "fatal",
  });

  // Seed benchmark data if not running through the matrix runner
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
    // Ignore seeding errors
  }

  return { baseUrl: process.env.API_BASE_URL, stop };
}

/**
 * Force kills a port on Windows.
 */
export async function forceKillPort(port: number) {
  if (process.platform !== "win32") return;
  try {
    const { execSync } = require("node:child_process");
    const output = execSync(`netstat -ano | findstr :${port}`).toString();
    const lines = output.split("\n");
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length > 4) {
        const pid = parts[parts.length - 1];
        if (pid && pid !== "0" && pid !== process.pid.toString()) {
          logger.debug(`Force killing process ${pid} on port ${port}`);
          execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
        }
      }
    }
  } catch {
    /* ignore if port is free */
  }
}

export async function mockDispatch(pathOrEvent: any, method: string = "GET") {
  const pathStr = typeof pathOrEvent === "string" ? pathOrEvent : pathOrEvent.path;
  const targetMethod = typeof pathOrEvent === "string" ? method : pathOrEvent.method || "GET";

  const { handleApiRequests } = await import("@src/hooks/handle-api-requests");
  const url = `http://localhost/api${pathStr.startsWith("/") ? pathStr : "/" + pathStr}`;

  const event: any = {
    url: new URL(url),
    request: new Request(url, {
      method: targetMethod,
      headers: pathOrEvent.headers || {},
      body: pathOrEvent.body ? JSON.stringify(pathOrEvent.body) : undefined,
    }),
    locals: {
      tenantId: "global",
      user: { _id: "admin", role: "admin", isAdmin: true },
      isAdmin: true,
    },
    cookies: {
      get: () => undefined,
      getAll: () => [],
      set: () => {},
      delete: () => {},
    },
    getClientAddress: () => "127.0.0.1",
    platform: {},
    params: {},
    route: { id: "/api/[...path]" },
  };

  const start = performance.now();
  const response = await handleApiRequests({
    event,
    resolve: async () => new Response("OK"),
  });
  const end = performance.now();

  return {
    status: response.status,
    text: async () => response.text(),
    latency: end - start,
  };
}

export function exportResult(r: any) {
  const dbType = getDbType();
  let dir = path.resolve(process.cwd(), RESULTS_DIR);
  // Only append dbType if it's not already at the end of RESULTS_DIR
  if (!dir.toLowerCase().endsWith(dbType.toLowerCase())) {
    dir = path.join(dir, dbType);
  }

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${r.name.replace(/\s/g, "_")}.json`),
    JSON.stringify(r, null, 2),
  );

  // 🚀 Automated Time-Series Trend Logging
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
    // Silent fail
  }
}

/**
 * 🚀 Structured Metric Exporter for Matrix Dashboard
 */
export function exportMetric(key: string, value: number, unit: string) {
  const dbType = getDbType();
  // 1. File Persistence
  try {
    let dir = path.resolve(process.cwd(), RESULTS_DIR);
    // Only append dbType if it's not already at the end of RESULTS_DIR
    if (!dir.toLowerCase().endsWith(dbType.toLowerCase())) {
      dir = path.join(dir, dbType);
    }

    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const metricsFile = path.join(dir, "matrix_metrics.json");

    let current: Record<string, any> = {};
    if (fs.existsSync(metricsFile)) {
      current = JSON.parse(fs.readFileSync(metricsFile, "utf8"));
    }

    current[key] = {
      _type: "numeric-metric",
      name: key,
      value,
      unit,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(metricsFile, JSON.stringify(current, null, 2));
  } catch (err: any) {
    logger.error(`[exportMetric] Failed: ${err.message}`);
  }

  // 2. Console Output (for CI parsing)
  const formattedVal = typeof value === "number" ? value.toFixed(3) : value;
  console.log(`METRIC: ${key}=${formattedVal}${unit}`);
}

export function checkBenchmarkEnv() {
  const dbType = getDbType();
  if (!dbType) {
    console.warn("⚠️ DB_TYPE not set, defaulting to 'sql' for benchmark.");
    process.env.DB_TYPE = "sql";
  }
}

// ── Core Utilities & Performance Assertions ───────────────────────────────────

export function measureSuiteRuntime(baselineMs: number) {
  const tStart = performance.now();
  return {
    assertNoRegression: () => {
      const elapsedMs = performance.now() - tStart;
      const threshold = baselineMs * 2;

      console.log(
        `\n⏳ Suite Execution Time: ${elapsedMs.toFixed(2)}ms (Baseline: ${baselineMs}ms)`,
      );

      if (elapsedMs > threshold) {
        throw new Error(
          `❌ PERFORMANCE REGRESSION: Suite execution time (${elapsedMs.toFixed(2)}ms) exceeded the regression threshold (${threshold}ms, 2x baseline).`,
        );
      }
    },
  };
}

// ── Shared Benchmark Constants ───────────────────────────────────────────────

export const STABLE_COLLECTION = "BenchmarkStable";
export const STABLE_ENTRY_ID = "bench-shared-001";
export const TEST_API_SECRET = (() => {
  if (process.env.TEST_API_SECRET) return process.env.TEST_API_SECRET;
  if (process.env.VITE_TEST_API_SECRET) return process.env.VITE_TEST_API_SECRET;
  try {
    const secretPath = path.join(process.cwd(), "tests", "e2e", ".auth", "test-secret.txt");
    if (fs.existsSync(secretPath)) return fs.readFileSync(secretPath, "utf8").trim();
  } catch {
    // Ignore
  }
  return "SVELTYCMS_TEST_SECRET_2026";
})();

console.log(`[benchmark-utils.ts] TEST_API_SECRET resolved: ${TEST_API_SECRET.substring(0, 4)}...`);

/**
 * Ensures that the stable benchmark collection and entry exist in the DB.
 * Also registers them in the in-process contentStore for LocalCMS audits.
 */
export async function ensureStableTestData(db?: any, tenantId: string = "global") {
  const { getDb, ensureFullInitialization } = await import("@src/databases/db");
  if (!db && !getDb()) {
    await ensureFullInitialization();
  }
  const activeDb = db || getDb();
  if (!activeDb)
    throw new Error("ensureStableTestData: activeDb is null after ensureFullInitialization");

  const schema = {
    _id: STABLE_COLLECTION,
    name: STABLE_COLLECTION,
    fields: [
      {
        db_fieldName: "title",
        label: "Title",
        widget: { Name: "Input" },
        type: "string",
        required: true,
      },
      {
        db_fieldName: "content",
        label: "Content",
        widget: { Name: "RichText" },
        type: "string",
        required: false,
      },
      {
        db_fieldName: "status",
        label: "Status",
        widget: { Name: "Input" },
        type: "string",
        required: false,
      },
      {
        db_fieldName: "count",
        label: "Count",
        widget: { Name: "Input" },
        type: "number",
        required: false,
      },
    ],
  };

  const existingColRes = await activeDb.collection.listSchemas(tenantId);
  const existingSchemas = existingColRes.success ? (existingColRes.data as any[]) : [];
  const exists = existingSchemas.some((s: any) => s._id === STABLE_COLLECTION);

  if (!exists) {
    await activeDb.collection.createModel(schema as any);
  }

  // Seed entry if missing
  const existingEntry = await activeDb.crud.findOne(
    STABLE_COLLECTION,
    { _id: STABLE_ENTRY_ID },
    { tenantId },
  );

  if (existingEntry.success && existingEntry.data) {
    logger.debug(`[Benchmark] Stable test data already exists for ${STABLE_COLLECTION}`);
    return;
  }

  logger.info(`[Benchmark] Seeding stable test data for ${STABLE_COLLECTION}...`);
  await activeDb.crud
    .upsert(
      STABLE_COLLECTION,
      { _id: STABLE_ENTRY_ID },
      {
        _id: STABLE_ENTRY_ID,
        title: "Stable Benchmark Entry",
        content:
          "This is a stable entry for benchmarking purposes. It contains enough text to measure transformation overhead.",
        status: "published",
        count: 42,
      },
      { tenantId },
    )
    .catch((err: any) => {
      logger.error(`[Benchmark] Failed to seed stable test data: ${err.message}`);
    });

  // Ensure it's registered in the in-process contentStore for LocalCMS audits
  try {
    const { contentStore } = await import("@src/stores/content-store.svelte");
    if (!contentStore.getCollection(STABLE_COLLECTION, tenantId)) {
      contentStore.upsert({
        _id: STABLE_COLLECTION,
        name: STABLE_COLLECTION,
        nodeType: "collection",
        tenantId,
        collectionDef: schema as any,
      } as any);
    }

    // 🚀 NEW: Initialize widgets for this environment
    const { widgets } = await import("@src/stores/widget-store.svelte");
    await widgets.initialize(tenantId, activeDb);
  } catch {
    // Silent fail if store not available
  }
}
