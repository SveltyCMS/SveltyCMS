/**
 * @file scripts/enterprise-matrix.ts
 * @description Zero-Mock Enterprise Performance Matrix (Trend-aware & Actionable Reporting)
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
}

interface RunData {
  timestamp: string;
  coldStart: number;
  collections: number;
  dbRaw: number;
  hooks: number;
  version: string;
  metrics: any;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const DATABASES: DatabaseConfig[] = [
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
  {
    type: "postgresql",
    port: 5432,
    host: "127.0.0.1",
    container: "postgres",
    user: "postgres",
    password: "postgres",
  },
  {
    type: "mariadb",
    port: 3306,
    host: "127.0.0.1",
    container: "mariadb",
    user: "root",
    password: "mariadb",
  },
];

const PORT = 4173;
const DB_NAME = "SveltyCMS_test";
const TEST_API_SECRET = "enterprise-audit-2026";
const RESULTS_DIR = path.join(process.cwd(), "tests/benchmarks/results");
const HISTORY_FILE = path.join(process.cwd(), "tests/benchmarks/results/history.json");
const BENCHMARKS_DOC = path.join(process.cwd(), "docs/project/benchmarks.mdx");

const BENCHMARK_SCRIPTS = [
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
    path: "tests/benchmarks/database-performance.test.ts",
    label: "DB Adapter",
    description: "Benchmarks raw CRUD operations directly via the database adapter layer.",
  },
];

let serverProcess: ChildProcess | null = null;
let _auditStartTime: number = 0;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const log = {
  header: (msg: string) => console.log(`\n🏢 ${msg}`),
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  success: (msg: string) => console.log(`✅ ${msg}`),
  error: (msg: string) => console.error(`❌ ${msg}`),
};

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
      code === 0
        ? resolve(output.trim())
        : reject(new Error(`${cmd} exited with ${code}\n${output}`)),
    );
    proc.on("error", reject);
  });
}

async function runCommand(cmd: string, args: string[], env: Record<string, string> = {}) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "inherit", env: { ...process.env, ...env } });
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)),
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
          serverProcess.kill("SIGKILL");
        }
      } catch (e) {
        log.error("Failed to kill server process: " + (e as any).message);
      }
    }
    serverProcess = null;
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function startServer(db: DatabaseConfig): Promise<{ coldStart: number; version: string }> {
  const buildPath = path.join(process.cwd(), "build/index.js");
  try {
    await fs.access(buildPath);
  } catch {
    throw new Error(`Build not found at ${buildPath}. Ensure build completed successfully.`);
  }

  const env = {
    ...process.env,
    NODE_ENV: "production",
    TEST_MODE: "true",
    PORT: PORT.toString(),
    DB_TYPE: db.type,
    DB_HOST: db.host,
    DB_PORT: db.port > 0 ? db.port.toString() : undefined,
    DB_NAME,
    DB_USER: db.user || undefined,
    DB_PASSWORD: db.password || undefined,
    TEST_API_SECRET,
  } as any;

  serverProcess = spawn("bun", ["build/index.js"], {
    env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  const start = Date.now();
  const maxRetries = process.env.CI === "true" ? 120 : 60;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/system/health`).catch(() => null);
      if (res && (res.ok || res.status === 503)) {
        const status = await res.json().catch(() => ({}));
        const okStatuses = ["READY", "SETUP", "IDLE", "WARMING"];
        if (okStatuses.includes(status.overallStatus)) {
          const coldStart = Date.now() - start;
          const version = status.dbVersion || "unknown";
          log.success(
            `Server reached ${status.overallStatus} state in ${coldStart}ms (${version})`,
          );
          return { coldStart, version };
        }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Server health check timed out after ${maxRetries}s`);
}

async function waitForContainer(db: DatabaseConfig) {
  if (db.type === "sqlite") return;
  const cmd =
    db.type === "mariadb" ? "mariadb-admin" : db.type === "postgresql" ? "pg_isready" : "mongosh";
  const args =
    db.type === "mariadb"
      ? ["ping", `-p${db.password}`, "--silent"]
      : db.type === "postgresql"
        ? ["-U", "postgres"]
        : ["--eval", "db.adminCommand('ping')"];
  for (let i = 0; i < 30; i++) {
    try {
      await runWithOutput("docker", ["exec", db.container, cmd, ...args]);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function resetDatabase(db: DatabaseConfig) {
  const testConfig = path.join(process.cwd(), "config/private.test.ts");
  await fs.rm(testConfig, { force: true }).catch(() => {});

  if (db.type === "sqlite") {
    const dbDir = path.join(process.cwd(), "config/database");
    log.info(`Cleaning SQLite artifacts in ${dbDir}...`);
    const files = [`${DB_NAME}.sqlite`, `${DB_NAME}.sqlite-wal`, `${DB_NAME}.sqlite-shm`];
    for (const f of files) {
      await fs.rm(path.join(dbDir, f), { force: true }).catch(() => {});
    }
    return;
  }
  await waitForContainer(db);
  log.info(`Resetting ${db.type}...`);
  try {
    if (db.type === "mongodb") {
      await runCommand("docker", [
        "exec",
        db.container,
        "mongosh",
        "--eval",
        `db.getSiblingDB('${DB_NAME}').dropDatabase()`,
      ]);
    } else if (db.type === "postgresql") {
      await runCommand("docker", [
        "exec",
        db.container,
        "psql",
        "-U",
        "postgres",
        "-c",
        `ALTER USER postgres WITH PASSWORD 'postgres';`,
      ]);
      await runCommand("docker", [
        "exec",
        db.container,
        "psql",
        "-U",
        "postgres",
        "-c",
        `DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE);`,
      ]);
      await runCommand("docker", [
        "exec",
        db.container,
        "psql",
        "-U",
        "postgres",
        "-c",
        `CREATE DATABASE "${DB_NAME}";`,
      ]);
    } else if (db.type === "mariadb") {
      const sql = `
        CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED BY '${db.password}';
        GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;
        DROP DATABASE IF EXISTS ${DB_NAME};
        CREATE DATABASE ${DB_NAME};
        FLUSH PRIVILEGES;
      `
        .replace(/\s+/g, " ")
        .trim();
      await runCommand("docker", [
        "exec",
        db.container,
        "mariadb",
        "-u",
        "root",
        `-p${db.password}`,
        "-e",
        sql,
      ]);
    }
  } catch (e: any) {
    log.error(`Reset failed for ${db.type}: ${e.message}`);
    throw e;
  }
}

/**
 * Robust Metric Discovery
 */
function extractMetrics(metrics: any, dbType: string) {
  const findNewest = (prefix: string) => {
    const matching = Object.keys(metrics).filter((k) => k.startsWith(prefix));
    if (matching.length === 0) return null;
    return metrics[matching.sort().reverse()[0]];
  };

  let collections = findNewest("rest-collections-list")?.p95Ms || 0;
  if (collections === 0) {
    const found = Object.values(metrics).find(
      (v: any) => v && typeof v.p95Ms === "number" && v.name?.includes("collections"),
    );
    collections = (found as any)?.p95Ms || 0;
  }

  let dbRaw = 0;
  const matrixKey = `matrix-${dbType.toLowerCase()}`;
  const dbData = metrics[matrixKey]?.metrics;
  if (dbData && typeof dbData.insert === "number") {
    dbRaw = (dbData.insert + dbData.read + dbData.update + dbData.delete) / 4;
  } else {
    const matrixEntry = Object.entries(metrics).find(([k]) => k.startsWith("matrix-"));
    if (matrixEntry) {
      const mData = (matrixEntry[1] as any)?.metrics;
      if (mData) dbRaw = (mData.insert + mData.read + mData.update + mData.delete) / 4;
    }
  }

  const hooks = Object.entries(metrics)
    .filter(([k]) => k.startsWith("hook-") && !k.includes("pipeline"))
    .reduce((acc, [_, v]: [string, any]) => acc + (v?.p95Ms || 0), 0);

  return { collections, dbRaw, hooks };
}

function getTrend(curr: number, prev: number): string {
  if (!prev || prev === 0) return " ⚪ (—)";
  const pct = ((curr - prev) / prev) * 100;
  const emoji = pct < -3 ? "🟢" : pct > 5 ? "🔴" : "⚪";
  return ` ${emoji} ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function getOverallTrend(curr: any, prev: any): string {
  const totalCurr = (curr.collections || 0) + (curr.dbRaw || 0) + (curr.hooks || 0);
  const totalPrev = (prev.collections || 0) + (prev.dbRaw || 0) + (prev.hooks || 0);
  if (!totalPrev) return " ⚪ (—)";
  const pct = ((totalCurr - totalPrev) / totalPrev) * 100;
  const emoji = pct < -3 ? "🟢" : pct > 5 ? "🔴" : "⚪";
  return `${emoji} ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

async function generateFinalReport(_bundleReport: any, results: BenchmarkResult[]) {
  let history: any = { runs: {} };
  try {
    const data = await fs.readFile(HISTORY_FILE, "utf8");
    history = JSON.parse(data);
  } catch {
    history = { runs: {} };
  }
  if (!history.runs) history.runs = {};

  const now = new Date().toISOString();

  for (const res of results) {
    if (res.status !== "SUCCESS") continue;
    const key = `${res.db.toUpperCase()}-Memory`;
    const { collections, dbRaw, hooks } = extractMetrics(res.metrics, res.db);

    const currentRun: RunData = {
      timestamp: now,
      coldStart: res.coldStartMs || 0,
      collections: collections || 0,
      dbRaw: dbRaw || 0,
      hooks: hooks || 0,
      version: res.version || "unknown",
      metrics: res.metrics,
    };

    if (!history.runs[key]) history.runs[key] = [];
    history.runs[key].unshift(currentRun); // newest first
    if (history.runs[key].length > 5) history.runs[key].pop();
  }

  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));

  let md = `## 📊 Enterprise Benchmark Matrix — ${new Date().toLocaleString()}\n\n`;

  md += `### 🧪 What We Tested\n\n`;
  for (const s of BENCHMARK_SCRIPTS) {
    md += `- **${s.label}** — ${s.description}\n   📍 \`${s.path}\`\n`;
  }
  md += `\n**Cache mode**: In-memory • Test Mode: ENABLED\n\n`;

  // Table
  md += `| Database | Version | Cold Start | REST (p95) | Raw DB (avg) | Hooks | Overall Trend |\n`;
  md += `|----------|---------|------------|------------|--------------|-------|---------------|\n`;

  const regressions: string[] = [];
  const improvements: string[] = [];
  const bottlenecks: string[] = [];

  for (const key of Object.keys(history.runs).sort()) {
    const runs = history.runs[key];
    if (runs.length === 0) continue;

    const curr = runs[0];
    const prev = runs[1] || curr;
    const dbName = key.split("-")[0];

    const coldTrend = getTrend(curr.coldStart, prev.coldStart);
    const restTrend = getTrend(curr.collections, prev.collections);
    const dbTrend = getTrend(curr.dbRaw, prev.dbRaw);
    const hooksTrend = getTrend(curr.hooks, prev.hooks);
    const overall = getOverallTrend(curr, prev);

    md += `| **${dbName}** | ${curr.version} | ${curr.coldStart.toFixed(0)}ms${coldTrend} | `;
    md += `${curr.collections.toFixed(2)}ms${restTrend} | ${curr.dbRaw.toFixed(3)}ms${dbTrend} | `;
    md += `${curr.hooks.toFixed(2)}ms${hooksTrend} | ${overall} |\n`;

    const totalNow = curr.collections + curr.dbRaw + curr.hooks;
    const totalPrev = prev.collections + prev.dbRaw + prev.hooks;

    if (totalPrev > 0) {
      const changePct = ((totalNow - totalPrev) / totalPrev) * 100;
      if (changePct > 8)
        regressions.push(`🔴 **${dbName}** slowed down **+${changePct.toFixed(1)}%**`);
      else if (changePct < -8)
        improvements.push(`🟢 **${dbName}** improved **${changePct.toFixed(1)}%**`);
    }

    if (totalNow > 0) {
      if (curr.collections / totalNow > 0.75)
        bottlenecks.push(
          `📌 **${dbName}** — REST dominates (${((curr.collections / totalNow) * 100).toFixed(0)}%)`,
        );
      else if (curr.dbRaw / totalNow > 0.3)
        bottlenecks.push(
          `📌 **${dbName}** — Raw DB is heavy (${((curr.dbRaw / totalNow) * 100).toFixed(0)}%)`,
        );
    }
  }

  // Trends Chart (Fixed Mermaid)
  md += `\n### 📈 Latency Trends (last 5 runs — lower is better)\n\n`;
  md += `\`\`\`mermaid\n`;
  md += `xychart-beta\n`;
  md += `  title "Total Latency (ms) — REST + DB + Hooks"\n`;
  md += `  x-axis "Run"\n`;
  md += `  y-axis "Latency (ms)"\n`;

  const dbKeys = Object.keys(history.runs).sort();
  if (dbKeys.length > 0) {
    const historyLength = history.runs[dbKeys[0]].length;
    const labels = history.runs[dbKeys[0]]
      .slice(0, 5)
      .map((_r: any, i: number) => `"Run ${historyLength - i}"`)
      .reverse();
    md += `  [${labels.join(", ")}]\n`;

    for (const key of dbKeys) {
      const totals = history.runs[key]
        .slice(0, 5)
        .map((r: any) => (r.collections + r.dbRaw + r.hooks).toFixed(1))
        .reverse();
      md += `  line "${key.split("-")[0]}" : [${totals.join(", ")}]\n`;
    }
  }
  md += `\`\`\`\n\n`;

  // Smart Summary
  md += `### 🚨 What Needs Attention\n\n`;
  if (regressions.length) md += `**Regressions**\n${regressions.join("\n")}\n\n`;
  if (improvements.length) md += `**Improvements**\n${improvements.join("\n")}\n\n`;
  md += `**Bottlenecks**\n${bottlenecks.length ? bottlenecks.join("\n") : "Balanced across components"}\n\n`;
  md += `**Note**: Many "TEST_MODE enabled. Bypassing state checks" warnings appeared. Expected in benchmarks, but worth checking in real usage.\n`;

  // Write to MDX
  let doc = await fs.readFile(BENCHMARKS_DOC, "utf8").catch(() => "");
  const start = "<!-- BENCHMARK_START -->";
  const end = "<!-- BENCHMARK_END -->";
  const content = `${start}\n\n${md}\n\n${end}`;
  if (doc.includes(start) && doc.includes(end)) {
    doc = doc.slice(0, doc.indexOf(start)) + content + doc.slice(doc.indexOf(end) + end.length);
  } else {
    doc = content + "\n---\n" + doc;
  }
  await fs.writeFile(BENCHMARKS_DOC, doc);

  log.success("📄 Smart benchmark report generated → docs/project/benchmarks.mdx");
}

async function main() {
  _auditStartTime = Date.now();
  try {
    if (process.env.SVELTYCMS_SKIP_BUILD !== "true") {
      log.header("Building production binary & capturing bundle stats...");
      await runCommand("bun", ["run", "build:stats"], {
        ...process.env,
        SVELTYCMS_SKIP_INIT: "true",
      } as any);
    }
    const bundleReport = JSON.parse(await fs.readFile("bundle-report.json", "utf8"));
    const results: BenchmarkResult[] = [];

    for (const db of DATABASES) {
      log.header(`Auditing ${db.type.toUpperCase()}`);
      try {
        await stopServer();
        await resetDatabase(db);
        const { coldStart: coldStartMs, version } = await startServer(db);
        const env = {
          API_BASE_URL: `http://127.0.0.1:${PORT}`,
          TEST_MODE: "true",
          SSR: "true",
          DB_TYPE: db.type,
          TEST_API_SECRET,
          DB_USER: db.user,
          DB_PASSWORD: db.password,
          DB_HOST: db.host,
          DB_NAME,
          BUN_TEST_MOCKS: "false",
        };

        log.info("Seeding system...");
        await runCommand("bun", ["run", "scripts/setup-system.ts"], env);

        log.info("Running benchmark scripts...");
        await fs.rm(RESULTS_DIR, { recursive: true, force: true }).catch(() => {});
        await fs.mkdir(RESULTS_DIR, { recursive: true });

        const benchEnv = { ...env, RESULTS_DIR, DB_TYPE: db.type, BUN_TEST_MOCKS: "false" };

        for (const s of BENCHMARK_SCRIPTS) {
          log.info(`Executing ${s.label}...`);
          await runCommand("bun", ["test", s.path], benchEnv);
        }

        log.info("Ensuring raw DB adapter benchmark ran...");
        try {
          await runCommand(
            "bun",
            ["test", "tests/benchmarks/database-performance.test.ts"],
            benchEnv,
          );
        } catch (e) {
          log.error("DB benchmark failed to run: " + (e as any).message);
        }

        const metrics: any = {},
          files = await fs.readdir(RESULTS_DIR);
        for (const f of files)
          if (f.endsWith(".json"))
            metrics[path.basename(f, ".json")] = JSON.parse(
              await fs.readFile(path.join(RESULTS_DIR, f), "utf8"),
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
        log.error(`Pass failed for ${db.type}: ${e.message}`);
        results.push({ db: db.type, cache: "Memory", status: "FAILED", error: e.message });
      }
    }
    await generateFinalReport(bundleReport, results);
    log.success(`Audit completed in ${((Date.now() - _auditStartTime) / 1000).toFixed(1)}s`);

    console.log("\n" + "=".repeat(80));
    console.log("✅ ENTERPRISE BENCHMARK MATRIX COMPLETE");
    console.log("📄 Full smart report → docs/project/benchmarks.mdx");
    console.log("🔍 Check the 'Smart Summary — What Needs Attention' section!");
    console.log("=".repeat(80));

    process.exit(results.every((r) => r.status === "SUCCESS") ? 0 : 1);
  } catch (e: any) {
    log.error("Fatal audit error: " + e.message);
    process.exit(1);
  } finally {
    await stopServer();
  }
}

main();
