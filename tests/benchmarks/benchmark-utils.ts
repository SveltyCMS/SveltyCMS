/**
 * @file tests/benchmarks/benchmark-utils.ts
 * @description Enterprise benchmarking core for SveltyCMS.
 * Standardizes execution, statistical analysis (percentiles, CV), memory auditing,
 * and professional reporting across all 19+ audit modules.
 */
import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";
import { logger } from "@utils/logger.server";

// ── silencing noise ─────────────────────────────────────────────────────────
process.env.LOG_LEVEL = "error";
process.env.DEBUG = "";
process.env.QUIET = "true";
if (logger) logger.level = "error";

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
  // Metadata
  timestamp: string;
  version: string;
  layer?: string;
  pair?: string;
  overhead?: number;
}

// ── configuration ────────────────────────────────────────────────────────────
const RESULTS_DIR = process.env.RESULTS_DIR ?? "tests/benchmarks/results";

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
    timestamp: new Date().toISOString(),
    version: "0.0.8-enterprise",
  };
}

// ── infrastructure ───────────────────────────────────────────────────────────

export function getDbType(): string {
  return (process.env.DB_TYPE || "sqlite").toLowerCase();
}

/**
 * Aggressive GC stabilization and memory snapshotting.
 */
export async function stabilize() {
  if (typeof Bun !== "undefined" && typeof (Bun as any).gc === "function") {
    (Bun as any).gc(true);
  } else if (typeof (globalThis as any).gc === "function") {
    (globalThis as any).gc();
  }
  await new Promise((r) => setTimeout(r, 100));
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

// ── reporting engine ─────────────────────────────────────────────────────────

export function printAuditTable(options: {
  title: string;
  subtitle: string;
  results: any[];
  layerMode?: boolean;
  shortLabel?: string; // 🚀 ULTRA ELITE: Optional shortLabel for precise MDX targeting
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
      const pad = width - 2 - s.length;
      return "║" + " ".repeat(Math.floor(pad / 2)) + s + " ".repeat(Math.ceil(pad / 2)) + "║";
    },
  });

  let outputBuffer = "";
  const log = (s: string) => {
    console.log(s);
    outputBuffer += s + "\n";
  };

  if (multi && !options.layerMode) {
    const W = 2 + SC_COL + 3 + METRIC_COL + dbNames.length * (VAL_COL + 3) + 1;
    const h = makeHelpers(W);

    log("\n" + h.bar("╔", "╗"));
    log(h.center(options.title + " (MATRIX)"));
    log(h.center(options.subtitle));
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
    log(h.center(options.subtitle));
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
    log(h.center(options.subtitle));
    log(h.bar("╠", "╣"));
    log(row("Scenario", "Avg latency", "p95", "RPS"));
    log(h.bar("╠", "╣"));
    options.results.forEach((r) =>
      log(
        row(
          r.name.replace(" (aggregate)", ""),
          `${r.avgMs.toFixed(3)} ms`,
          `${r.p95Ms.toFixed(3)} ms`,
          Math.round(r.rps).toLocaleString(),
        ),
      ),
    );
    log(h.bar("╚", "╝"));
  }

  // 🚀 ULTRA ELITE: Save and Push the identical ASCII table to the technical ledger
  const tableContent = outputBuffer.trim();
  saveTerminalTable(options.title, tableContent);
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

    const tableBlock = `\n### 🏷️ ${title.split("—")[1]?.trim() || title}\n\n\`\`\`text\n${table}\n\`\`\`\n`;

    if (content.includes(START) && content.includes(END)) {
      const regex = new RegExp(`<!-- ${tag}_START -->[\\s\\S]*?<!-- ${tag}_END -->`);
      content = content.replace(regex, `${START}${tableBlock}${END}`);
      fs.writeFileSync(docPath, content);
    }
  } catch (err) {
    // Silent fail
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

  console.log("\n" + helpers.bar("╔", "╗"));
  console.log(helpers.center("FINAL AUDIT SUMMARY"));
  console.log(helpers.bar("╠", "╣"));
  metrics.forEach((m) => {
    const valStr = typeof m.val === "number" ? m.val.toFixed(3) : String(m.val);
    const line = `║ ${m.key.padEnd(50)} │ ${valStr.padStart(12)} ${m.unit.padEnd(8)} ║`;
    console.log(line);
  });
  console.log(helpers.bar("╚", "╝") + "\n");
}

// ── core execution ───────────────────────────────────────────────────────────

export async function runBenchmark(config: any) {
  const { iterations, runs = 1, concurrency = 1, onIteration, onSetup } = config;
  if (!onIteration) throw new Error("Benchmark must provide onIteration");

  const results: number[] = [];

  for (let r = 0; r < runs; r++) {
    if (onSetup) await onSetup();

    // Warmup
    if (config.warmupIterations) {
      for (let i = 0; i < config.warmupIterations; i++) {
        await onIteration(i);
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
        await Promise.all(chunk.map((i) => onIteration(i)));
      }
    } else {
      // Sequential mode
      for (let i = 0; i < iterations; i++) {
        const iStart = performance.now();
        await onIteration(i);
        results.push(performance.now() - iStart);
      }
    }

    const tTotal = performance.now() - tStart;
    if (concurrency > 1) {
      // For parallel, results is just one giant avg/rps calc
      const avg = tTotal / iterations;
      for (let i = 0; i < iterations; i++) results.push(avg);
    }
  }

  const rps = (iterations * runs) / (results.reduce((a, b) => a + b, 0) / 1000);
  return computeStatistics(results, rps, config);
}

// ── mocks & helpers ──────────────────────────────────────────────────────────

export async function setupBenchmarkServer() {
  const apiBase = process.env.API_BASE_URL;
  if (apiBase) return { baseUrl: apiBase, stop: async () => {} };

  // Aggressive silence for startup noise
  process.env.LOG_LEVEL = "error";
  process.env.QUIET = "true";

  const { startServer } = await import("../../scripts/benchmark-matrix/server");
  const { ALL_DATABASES } = await import("../../scripts/benchmark-matrix/config");

  const dbType = getDbType();
  const dbConf =
    ALL_DATABASES.find((d) => (d.useRedis ? `${d.type}-redis` : d.type) === dbType) ||
    ALL_DATABASES[0];
  const port = 4173 + (process.pid % 100);

  process.env.API_BASE_URL = `http://127.0.0.1:${port}`;
  const { stop } = await startServer(dbConf, port, `bench_tmp_${process.pid}`);
  return { baseUrl: process.env.API_BASE_URL, stop };
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
    cookies: { get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} },
    getClientAddress: () => "127.0.0.1",
    platform: {},
    params: {},
    route: { id: "/api/[...path]" },
  };

  const start = performance.now();
  const response = await handleApiRequests({ event, resolve: async () => new Response("OK") });
  const end = performance.now();

  return {
    status: response.status,
    text: async () => response.text(),
    latency: end - start,
  };
}

export function exportResult(r: any) {
  const dir = path.resolve(process.cwd(), RESULTS_DIR, getDbType());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${r.name.replace(/\s/g, "_")}.json`),
    JSON.stringify(r, null, 2),
  );
}

export function checkBenchmarkEnv() {
  const dbType = getDbType();
  if (!dbType) {
    console.warn("⚠️ DB_TYPE not set, defaulting to 'sql' for benchmark.");
    process.env.DB_TYPE = "sql";
  }
}

export function exportMetric(key: string, val: number, unit: string) {
  // Simple console export for CI parsing
  const formattedVal = typeof val === "number" ? val.toFixed(3) : val;
  console.log(`METRIC: ${key}=${formattedVal}${unit}`);
}
