/**
 * @file scripts/enterprise-matrix.ts
 * @description Zero-Mock Enterprise Performance Matrix (Trend-aware & Actionable Reporting)
 *
 * Features:
 * - Selective DB filtering via --db flag (e.g. --db sqlite,mongodb)
 * - Sub-directory result isolation (results/sqlite/, results/mongodb/)
 * - CROSS-PLATFORM port clearing and zombie process prevention
 * - COMBINED HEAD-TO-HEAD TABLES for REST, GraphQL, and Middleware
 */

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface DatabaseConfig {
  type: "sqlite" | "mongodb" | "postgresql" | "mariadb";
  port: number;
  host: string;
  container: string;
  user: string;
  password: string;
}

interface BenchmarkResult {
  db: string;
  version?: string;
  cache: string;
  status: "SUCCESS" | "FAILED";
  coldStartMs?: number;
  metrics?: Record<string, any>;
  error?: string;
  durationMs?: number;
  isHistorical?: boolean;
}

interface RunData {
  timestamp: string;
  coldStart: number;
  collections: number;
  graphqlAvg: number;
  dbRaw: number;
  hooks: number;
  version: string;
  metrics: Record<string, any>;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const ALL_DATABASES: DatabaseConfig[] = [
  {
    type: "sqlite",
    port: 0,
    host: "./config/database",
    container: "",
    user: "",
    password: "",
  },
  {
    type: "mongodb",
    port: 27017,
    host: "127.0.0.1",
    container: "mongodb",
    user: "",
    password: "",
  },
];

const PORT = 4173;
const DB_NAME = "SveltyCMS_test";
const TEST_API_SECRET = "enterprise-audit-2026";
const ROOT_RESULTS_DIR = path.join(process.cwd(), "tests/benchmarks/results");
const HISTORY_FILE = path.join(process.cwd(), "tests/benchmarks/results/history.json");
const BENCHMARKS_DOC = path.join(process.cwd(), "docs/project/benchmarks.mdx");

interface BenchmarkScript {
  path: string;
  label: string;
  description: string;
}

const BENCHMARK_SCRIPTS: BenchmarkScript[] = [
  {
    path: "tests/benchmarks/rest-api-performance.test.ts",
    label: "REST API",
    description: "Measures E2E collection throughput and latency using REST API endpoints.",
  },
  {
    path: "tests/benchmarks/hooks-performance.test.ts",
    label: "Hooks",
    description: "Evaluates middleware and lifecycle hook overhead across various data operations.",
  },
  {
    path: "tests/benchmarks/graphql-api-performance.test.ts",
    label: "GraphQL API",
    description: "Benchmarks resolver performance and nested object resolution latency.",
  },
  {
    path: "tests/benchmarks/database-performance.test.ts",
    label: "DB Adapter",
    description: "Benchmarks raw CRUD operations directly via the database adapter layer.",
  },
];

// ─────────────────────────────────────────────────────────────
// Helpers & Safety
// ─────────────────────────────────────────────────────────────

const log = {
  header: (msg: string) => console.log(`\n\x1b[1m\x1b[34m🏢 ${msg}\x1b[0m`),
  info: (msg: string) => console.log(`\x1b[36mℹ ${msg}\x1b[0m`),
  success: (msg: string) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`),
  error: (msg: string) => console.log(`\x1b[31m❌ ${msg}\x1b[0m`),
  warn: (msg: string) => console.log(`\x1b[33m⚠ ${msg}\x1b[0m`),
};

let serverProcess: ChildProcess | null = null;
let _auditStartTime = 0;

process.on("SIGINT", async () => {
  log.warn("\nAudit aborted by user. Cleaning up background processes...");
  await stopServer();
  process.exit(1);
});

async function runCommand(cmd: string, args: string[], env: Record<string, string> = {}) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)),
    );
    proc.on("error", reject);
  });
}

async function runWithOutput(
  cmd: string,
  args: string[],
  env: Record<string, string> = {},
): Promise<string> {
  const proc = spawn(cmd, args, { stdio: "pipe", env: { ...process.env, ...env } });
  let output = "";
  proc.stdout?.on("data", (d) => (output += d.toString()));
  proc.stderr?.on("data", (d) => (output += d.toString()));
  return new Promise((resolve, reject) => {
    proc.on("close", (code) =>
      code === 0 ? resolve(output.trim()) : reject(new Error(`${output}`)),
    );
    proc.on("error", reject);
  });
}

async function stopServer() {
  if (serverProcess) {
    log.info("Stopping server...");
    const pid = serverProcess.pid;
    if (pid) {
      try {
        if (process.platform === "win32") {
          await runWithOutput("taskkill", ["/T", "/F", "/PID", pid.toString()]);
        } else {
          process.kill(-pid, "SIGKILL");
        }
      } catch {
        serverProcess.kill("SIGKILL");
      }
    }
    serverProcess = null;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

async function freePort(port: number) {
  log.info(`Ensuring port ${port} is free...`);
  try {
    if (process.platform === "win32") {
      await runWithOutput("powershell", [
        "-Command",
        `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`,
      ]).catch(() => {});
    } else {
      await runWithOutput("sh", ["-c", `lsof -ti:${port} | xargs kill -9 || true`]).catch(() => {});
    }
  } catch {}
}

async function resetDatabase(db: DatabaseConfig) {
  log.info(`Resetting ${db.type}...`);
  if (db.type === "sqlite") {
    await fs.rm("config/database/SveltyCMS_test.sqlite", { force: true }).catch(() => {});
  } else if (db.type === "mongodb") {
    await runWithOutput("mongosh", [
      "--eval",
      `db.getSiblingDB('${DB_NAME}').dropDatabase()`,
      "--quiet",
    ]).catch((e) => log.warn("MongoDB reset partial: " + e.message));
  }
}

async function startServer(db: DatabaseConfig): Promise<{ coldStart: number; version: string }> {
  log.info(`Launching SveltyCMS — ${db.type.toUpperCase()}`);
  const env = {
    PORT: PORT.toString(),
    DB_TYPE: db.type,
    TEST_MODE: "true",
    SSR: "true",
    BUN_TEST_MOCKS: "false",
    TEST_API_SECRET,
  };

  const start = performance.now();
  serverProcess = spawn("bun", ["run", "preview"], {
    stdio: "pipe",
    env: { ...process.env, ...env },
    detached: process.platform !== "win32",
  });

  let version = "unknown";
  return new Promise((resolve, reject) => {
    serverProcess?.stdout?.on("data", async (d) => {
      const line = d.toString();
      if (line.includes("Local:") || line.includes("127.0.0.1:")) {
        const coldStart = Math.round(performance.now() - start);
        log.success(`Cold Start: ${coldStart}ms`);
        // Stabilization
        for (let i = 0; i < 3; i++) {
          try {
            const r = await fetch(`http://127.0.0.1:${PORT}/api/system/health`, {
              signal: AbortSignal.timeout(2000),
            });
            if (r.ok) {
              const data = await r.json();
              version = data.dbVersion || "unknown";
              break;
            }
          } catch {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        resolve({ coldStart, version });
      }
    });

    serverProcess?.on("error", reject);
    setTimeout(() => reject(new Error("Server Startup Timeout")), 30000);
  });
}

// ─────────────────────────────────────────────────────────────
// Matrix Logic
// ─────────────────────────────────────────────────────────────

function extractMetrics(metrics: Record<string, any> = {}, dbType: string) {
  const restKey = "rest-collections-list";
  const hookKey = "hook-pipeline";
  const adapterKey = `matrix-${dbType.toLowerCase()}`;

  const collections = metrics[restKey]?.p95Ms || 0;
  const dbRaw = metrics[adapterKey]?.metrics?.read || 0;
  const hooks = (metrics[hookKey]?.p95Ms || 0) / 1000;

  const gqlEntries = Object.entries(metrics).filter(([k]) => k.startsWith("graphql-"));
  const graphqlAvg = gqlEntries.length
    ? gqlEntries.reduce((acc, [_, v]) => acc + (v?.avgMs || 0), 0) / gqlEntries.length
    : 0;

  return { collections, dbRaw, hooks, graphqlAvg };
}

function getTrend(curr: number, prev: number, isBaseline: boolean): string {
  if (isBaseline) return " ⚪ baseline";
  if (!prev) return " ⚪ (—)";
  const pct = ((curr - prev) / prev) * 100;
  return ` ${pct < -3 ? "🟢" : pct > 5 ? "🔴" : "⚪"} ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function getOverallTrend(curr: any, prev: any, isBaseline: boolean): string {
  if (isBaseline) return "⚪ baseline";
  const cTotal = (curr.collections || 0) + (curr.dbRaw || 0) + (curr.hooks || 0);
  const pTotal = (prev.collections || 0) + (prev.dbRaw || 0) + (prev.hooks || 0);
  if (!pTotal) return " ⚪ (—)";
  const pct = ((cTotal - pTotal) / pTotal) * 100;
  return `${pct < -3 ? "🟢" : pct > 5 ? "🔴" : "⚪"} ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function cleanVersion(dbType: string, raw?: string): string {
  if (!raw || raw === "unknown") return "unknown";
  const type = dbType.toLowerCase();
  if (type === "mongodb") return `MongoDB ${raw}`;
  if (type === "sqlite") return `SQLite ${raw}`;
  return raw;
}

function parseDbFilter(): DatabaseConfig[] {
  const arg = process.argv.find((a) => a.startsWith("--db="));
  if (!arg) return ALL_DATABASES;
  const requested = arg
    .split("=")[1]
    .split(",")
    .map((s) => s.trim().toLowerCase());
  return ALL_DATABASES.filter((db) => requested.includes(db.type));
}

async function generateFinalReport(results: BenchmarkResult[]) {
  const historyRaw = await fs.readFile(HISTORY_FILE, "utf8").catch(() => '{"runs":{}}');
  const history = JSON.parse(historyRaw);
  const now = new Date().toISOString();

  // 1. Update history
  for (const res of results) {
    if (res.status !== "SUCCESS") continue;
    const key = `${res.db.toLowerCase()}-memory`;
    const m = extractMetrics(res.metrics || {}, res.db);
    const currentRun: RunData = {
      timestamp: now,
      coldStart: res.coldStartMs || 0,
      collections: m.collections,
      graphqlAvg: m.graphqlAvg,
      dbRaw: m.dbRaw,
      hooks: m.hooks,
      version: res.version || "unknown",
      metrics: res.metrics || {},
    };
    if (!history.runs[key]) history.runs[key] = [];
    history.runs[key].unshift(currentRun);
    if (history.runs[key].length > 5) history.runs[key].pop();
  }
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));

  // 2. Combine Results
  const combined: any[] = [];
  for (const dbConf of ALL_DATABASES) {
    const fresh = results.find((r) => r.db.toLowerCase() === dbConf.type.toLowerCase());
    if (fresh) combined.push(fresh);
    else {
      const hist = history.runs[`${dbConf.type.toLowerCase()}-memory`]?.[0];
      if (hist)
        combined.push({
          db: dbConf.type,
          version: hist.version,
          metrics: hist.metrics,
          coldStartMs: hist.coldStart,
          isHistorical: true,
          status: "SUCCESS",
        });
    }
  }

  let md = `## 📊 Enterprise Benchmark Matrix — ${new Date().toLocaleString("en-GB")}\n\n`;
  md += `### 🧪 Component Performance Comparison (Head-to-Head)\n\n`;

  // --- Summary Matrix ---
  md += `| Database | Version | Cold Start | REST (p95) | GQL (avg) | Raw DB (read) | Hooks | Overall |\n`;
  md += `|----------|---------|------------|------------|-----------|--------------|-------|---------|\n`;
  for (const res of combined) {
    const key = `${res.db.toLowerCase()}-memory`;
    const hist = history.runs[key] || [];
    const curr = hist[0];
    const prev = hist[1] || null;
    const isBaseline = !prev;
    const m = extractMetrics(res.metrics, res.db);

    md += `| ${res.isHistorical ? `${res.db.toUpperCase()} (hist)` : `**${res.db.toUpperCase()}**`} | ${cleanVersion(res.db, res.version)} | `;
    md += `${curr.coldStart.toFixed(0)}ms${getTrend(curr.coldStart, prev?.coldStart, isBaseline)} | `;
    md += `${m.collections.toFixed(2)}ms${getTrend(m.collections, prev?.collections, isBaseline)} | `;
    md += `${m.graphqlAvg.toFixed(2)}ms${getTrend(m.graphqlAvg, prev?.graphqlAvg, isBaseline)} | `;
    md += `${m.dbRaw.toFixed(3)}ms${getTrend(m.dbRaw, prev?.dbRaw, isBaseline)} | `;
    md += `${m.hooks.toFixed(2)}ms${getTrend(m.hooks, prev?.hooks, isBaseline)} | `;
    md += `${getOverallTrend(m, prev, isBaseline)} |\n`;
  }
  md += `\n`;

  // 1. Unified REST
  md += `#### 📡 REST API PERFORMANCE MATRIX (LATENCY ANALYTICS)\n`;
  md += `**Head-to-Head Comparison**: Comparing aggregate response parity across database engines.\n\n`;
  md += `| Endpoint | Database | Avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | RPS |\n|---|---|---|---|---|---|---|\n`;
  const restItems = ["rest-collections-list", "rest-system-health", "rest-user-me"];
  for (const item of restItems) {
    for (const res of combined) {
      const val = res.metrics?.[item];
      if (val) {
        const name = item.replace("rest-", "");
        md += `| ${name} | ${res.db.toUpperCase()} | ${val.avgMs?.toFixed(2)} | ${val.p50Ms?.toFixed(2)} | ${val.p95Ms?.toFixed(2)} | ${val.p99Ms?.toFixed(2)} | ${val.rps?.toFixed(0)} |\n`;
      }
    }
    md += `| --- | --- | --- | --- | --- | --- | --- |\n`;
  }
  md += `\n`;

  // 2. Unified GraphQL
  md += `#### 🗃️ GRAPHQL RESOLVER PERFORMANCE MATRIX (BOTTLENECK ANALYSIS)\n`;
  md += `| Resolver | Database | Avg (ms) | p50 (ms) | p95 (ms) | p99 (ms) | RPS |\n|---|---|---|---|---|---|---|\n`;
  const gqlFiles = [
    "graphql-me",
    "graphql-system-health",
    "graphql-collection-stats",
    "graphql-list-users",
    "graphql-media-images",
  ];
  for (const file of gqlFiles) {
    for (const res of combined) {
      const val = res.metrics?.[file];
      if (val) {
        const name = file.replace("graphql-", "");
        md += `| ${name} | ${res.db.toUpperCase()} | ${val.avgMs?.toFixed(2)} | ${val.p50Ms?.toFixed(2)} | ${val.p95Ms?.toFixed(2)} | ${val.p99Ms?.toFixed(2)} | ${val.rps?.toFixed(0)} |\n`;
      }
    }
    md += `| --- | --- | --- | --- | --- | --- | --- |\n`;
  }
  md += `\n`;

  // 3. Unified Middleware
  md += `#### 🏁 MIDDLWARE PERFORMANCE MATRIX\n`;
  md += `| Hook | Database | Avg (µs) | p95 (µs) | 99 (µs) | Efficiency |\n|---|---|---|---|---|---|\n`;
  const filterHooks = [
    "hook-addsecurityheaders",
    "hook-handleauthentication",
    "hook-handleauthorization",
    "hook-handlesecurity",
    "hook-handlesystemstate",
  ];
  for (const hook of filterHooks) {
    for (const res of combined) {
      const val = res.metrics?.[hook];
      if (val) {
        const name = hook.replace("hook-", "");
        md += `| ${name} | ${res.db.toUpperCase()} | ${((val.avgMs || 0) * 1000).toFixed(2)} | ${((val.p95Ms || 0) * 1000).toFixed(2)} | ${((val.p99Ms || 0) * 1000).toFixed(2)} | ${val.avgMs < 0.005 ? "🚀" : "✅"} |\n`;
      }
    }
    md += `| --- | --- | --- | --- | --- | --- |\n`;
  }
  md += `\n`;

  let doc = await fs.readFile(BENCHMARKS_DOC, "utf8").catch(() => "");
  const startM = "<!-- BENCHMARK_START -->";
  const endM = "<!-- BENCHMARK_END -->";
  const content = `${startM}\n\n${md}\n\n${endM}`;
  if (doc.includes(startM) && doc.includes(endM)) {
    doc = doc.slice(0, doc.indexOf(startM)) + content + doc.slice(doc.indexOf(endM) + endM.length);
  } else doc = content + "\n---\n" + doc;
  await fs.writeFile(BENCHMARKS_DOC, doc);
  log.success("Report synchronized.");
}

async function main() {
  _auditStartTime = Date.now();
  await freePort(PORT);
  const DATABASES = parseDbFilter();
  try {
    const results: BenchmarkResult[] = [];
    await fs.mkdir(ROOT_RESULTS_DIR, { recursive: true });

    for (const db of DATABASES) {
      log.header(`Auditing ${db.type.toUpperCase()}`);
      try {
        await stopServer();
        await resetDatabase(db);
        const { coldStart: coldStartMs, version } = await startServer(db);
        const dbDir = path.join(ROOT_RESULTS_DIR, db.type.toLowerCase());
        await fs.rm(dbDir, { recursive: true, force: true }).catch(() => {});
        await fs.mkdir(dbDir, { recursive: true });

        const env = {
          API_BASE_URL: `http://127.0.0.1:${PORT}`,
          TEST_MODE: "true",
          RESULTS_DIR: dbDir,
          DB_TYPE: db.type,
          TEST_API_SECRET,
          BUN_TEST_MOCKS: "false",
        };
        log.info("Seeding...");
        await runCommand("bun", ["run", "scripts/setup-system.ts"], env as any);

        for (const s of BENCHMARK_SCRIPTS) {
          log.info(`Executing ${s.label}...`);
          await runCommand("bun", ["test", s.path], env as any);
        }

        const metrics: any = {};
        const files = await fs.readdir(dbDir);
        for (const f of files)
          if (f.endsWith(".json"))
            metrics[path.basename(f, ".json")] = JSON.parse(
              await fs.readFile(path.join(dbDir, f), "utf8"),
            );
        results.push({
          db: db.type,
          version,
          cache: "Memory",
          status: "SUCCESS",
          coldStartMs,
          metrics,
        });
      } catch (e: any) {
        log.error(`Audit Failed: ${e.message}`);
      }
    }
    await generateFinalReport(results);
    log.success(`Audit complete in ${((Date.now() - _auditStartTime) / 1000).toFixed(1)}s`);
  } catch (err: any) {
    log.error(`Fatal: ${err.message}`);
  } finally {
    await stopServer();
  }
}

main();
