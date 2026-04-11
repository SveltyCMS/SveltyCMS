/**
 * @file scripts/enterprise-matrix.ts
 * @description Zero-Mock Enterprise Performance Matrix (Trend-aware & Actionable Reporting)
 */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { version as pkgVersion } from "../package.json";

interface DatabaseConfig {
  type: string;
  port: number;
  host: string;
  user: string;
  password: string;
  useRedis?: boolean;
  label?: string;
}

interface BenchmarkResult {
  db: string;
  version?: string;
  status: "SUCCESS" | "FAILED";
  coldStartMs?: number;
  metrics?: Record<string, any>;
  error?: string;
  isHistorical?: boolean;
}

const ALL_DATABASES: DatabaseConfig[] = [
  {
    type: "sqlite",
    port: 0,
    host: "./config/database",
    user: "",
    password: "",
  },
  {
    type: "sqlite",
    port: 0,
    host: "./config/database",
    user: "",
    password: "",
    useRedis: true,
    label: "SQLITE+REDIS",
  },
  { type: "mongodb", port: 27017, host: "127.0.0.1", user: "", password: "" },
  {
    type: "mongodb",
    port: 27017,
    host: "127.0.0.1",
    user: "",
    password: "",
    useRedis: true,
    label: "MONGODB+REDIS",
  },
  {
    type: "postgresql",
    port: 5432,
    host: "127.0.0.1",
    user: "postgres",
    password: "postgres",
  },
  {
    type: "postgresql",
    port: 5432,
    host: "127.0.0.1",
    user: "postgres",
    password: "postgres",
    useRedis: true,
    label: "POSTGRESQL+REDIS",
  },
  {
    type: "mariadb",
    port: 3306,
    host: "127.0.0.1",
    user: "root",
    password: "mariadb",
  },
  {
    type: "mariadb",
    port: 3306,
    host: "127.0.0.1",
    user: "root",
    password: "mariadb",
    useRedis: true,
    label: "MARIADB+REDIS",
  },
];

const PORT = 4173;
const DB_NAME = "SveltyCMS_test";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Password123!";
const TEST_API_SECRET = process.env.TEST_API_SECRET || "SveltyCMS-Benchmark-Secret-2026";
const ROOT_RESULTS_DIR = path.join(process.cwd(), "tests/benchmarks/results");
const HISTORY_FILE = path.join(process.cwd(), "tests/benchmarks/results/history.json");
const BENCHMARKS_DOC = path.join(process.cwd(), "docs/project/benchmarks.mdx");

const BENCHMARK_SCRIPTS = [
  {
    path: "tests/benchmarks/rest-api-performance.test.ts",
    label: "REST API Performance",
    shortLabel: "REST API",
    desc: "Measures end-to-end throughput and latency of the unified REST dispatcher, including JSON serialization/deserialization overhead and collection listing under realistic load.",
  },
  {
    path: "tests/benchmarks/hooks-performance.test.ts",
    label: "Middleware & Hooks Performance",
    shortLabel: "Hooks",
    desc: "High-resolution micro-benchmarks (in microseconds) for individual middleware layers: Turbo Pipeline, Authentication, Authorization, Security, and API Request handling.",
  },
  {
    path: "tests/benchmarks/graphql-api-performance.test.ts",
    label: "GraphQL API Performance",
    shortLabel: "GraphQL",
    desc: "Evaluates resolver execution time, N+1 query problem mitigation, and overall throughput for common queries (e.g., 'me' and system health).",
  },
  {
    path: "tests/benchmarks/relational-performance.test.ts",
    label: "Relational & Nested Queries Performance",
    shortLabel: "Relational",
    desc: "Stress-tests JOINs, population strategies, and deeply nested relationships (depth 2–3) via both REST search and GraphQL queries.",
  },
  {
    path: "tests/benchmarks/widget-performance.test.ts",
    label: "Core Widgets Overhead",
    shortLabel: "Widgets",
    desc: "Audits server-side processing cost of built-in widgets (Input, RichText, Relation) inside the modifyRequest pipeline to ensure near-zero overhead.",
  },
  {
    path: "tests/benchmarks/database-performance.test.ts",
    label: "Database Adapter Raw CRUD",
    shortLabel: "DB Adapter",
    desc: "Direct low-level benchmarks of Create, Read, Update, Delete operations on the current database adapter (bypassing higher layers).",
  },
  {
    path: "tests/benchmarks/security-audit.test.ts",
    label: "Security Hardening & Audit",
    shortLabel: "Security",
    desc: "Measures the performance impact of security features: Fail-Closed Dispatcher overhead, Payload scanning latency, and SHA-256 Audit Chaining.",
  },
  {
    path: "tests/benchmarks/graphql-stress.ts",
    label: "GraphQL Load Stress",
    shortLabel: "GQL Stress",
    desc: "Executes massive concurrency loads (1000+ requests) to determine the breaking point of the GraphQL resolver engine under pressure.",
  },
];

const TARGET_DB_ORDER = [
  "sqlite",
  "sqlite+redis",
  "mongodb",
  "mongodb+redis",
  "postgresql",
  "postgresql+redis",
  "mariadb",
  "mariadb+redis",
];

const log = {
  header: (msg: string) => console.log(`\n\x1b[1m\x1b[34m🏢 ${msg}\x1b[0m`),
  info: (msg: string) => console.log(`\x1b[36mℹ ${msg}\x1b[0m`),
  success: (msg: string) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`),
  error: (msg: string) => console.log(`\x1b[31m❌ ${msg}\x1b[0m`),
  warn: (msg: string) => console.log(`\x1b[33m⚠ ${msg}\x1b[0m`),
};

let serverProcess: ChildProcess | null = null;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function extractMetrics(metrics: any, dbType: string) {
  const m = metrics || {};
  return {
    collections: m["rest-collections-list"]?.p95Ms || 0,
    dbRaw: m[`matrix-${dbType}`]?.metrics?.read || 0,
    hooks: (m["hook-handleturbopipeline"]?.p95Ms || 0) / 1000,
    graphqlAvg: m["graphql-me"]?.avgMs || 0,
    relationalAvg:
      m["relational-graphql-nested"]?.avgMs || m["relational-graphql-population"]?.avgMs || 0,
    widgetInputAvg: m["widget-overhead-input"]?.avgMs || 0,
    widgetRichTextAvg: m["widget-overhead-richtext"]?.avgMs || 0,
    widgetRelationAvg: m["widget-overhead-relation"]?.avgMs || 0,
    securityFirewallMs: m["security-firewall-clean"]?.p95Ms || 0,
    securityAuditMs: m["security-audit-logging"]?.p95Ms || 0,
    securityArgon2Ms: m["security-crypto-argon2"]?.avgMs || 0,
    gqlStressRps: m["graphql-stress"]?.profiles?.[0]?.rps || 0,
  };
}

/**
 * Calculates trend over the last N runs (default 5).
 */
function getTrendDetails(
  history: any[],
  currentVal: number,
  extractor: (m: any) => number,
): { icon: string; pct: string; isRegression: boolean } {
  if (!history || history.length === 0 || currentVal === 0)
    return { icon: "⚪", pct: "—", isRegression: false };

  const windowSize = Math.min(5, history.length);
  const recentRuns = history.slice(0, windowSize);
  const avgPrev = recentRuns.reduce((acc, run) => acc + extractor(run.metrics), 0) / windowSize;

  if (avgPrev === 0) return { icon: "⚪", pct: "—", isRegression: false };

  const pct = ((currentVal - avgPrev) / avgPrev) * 100;
  const isBetter = pct < -3;
  const isWorse = pct > 5;
  const isRegression = pct > 10;

  const icon = isBetter ? "🟢" : isWorse ? "🔴" : "⚪";
  return {
    icon,
    pct: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
    isRegression,
  };
}

/**
 * Specifically for Throughput (RPS), where higher is better.
 */
function getRpsTrendDetails(
  history: any[],
  currentVal: number,
  extractor: (m: any) => number,
): { icon: string; pct: string; isRegression: boolean } {
  if (!history || history.length === 0 || currentVal === 0)
    return { icon: "⚪", pct: "—", isRegression: false };

  const windowSize = Math.min(5, history.length);
  const recentRuns = history.slice(0, windowSize);
  const avgPrev = recentRuns.reduce((acc, run) => acc + extractor(run.metrics), 0) / windowSize;

  if (avgPrev === 0) return { icon: "⚪", pct: "—", isRegression: false };

  const pct = ((currentVal - avgPrev) / avgPrev) * 100;
  const isBetter = pct > 3;
  const isWorse = pct < -5;
  const isRegression = pct < -10;

  const icon = isBetter ? "🟢" : isWorse ? "🔴" : "⚪";
  return {
    icon,
    pct: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
    isRegression,
  };
}

async function freePort(port: number) {
  log.info(`Ensuring port ${port} and 3001 are free...`);
  try {
    if (process.platform === "win32") {
      execSync(
        `powershell -Command "Get-NetTCPConnection -LocalPort ${port},3001 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
        { stdio: "ignore" },
      );
    } else {
      execSync(`lsof -ti:${port},3001 | xargs kill -9 || true`, {
        stdio: "ignore",
      });
    }
  } catch {}
}

async function stopServer() {
  if (serverProcess) {
    const pid = serverProcess.pid;
    if (pid) {
      try {
        if (process.platform === "win32")
          execSync(`taskkill /T /F /PID ${pid}`, { stdio: "ignore" });
        else process.kill(-pid, "SIGKILL");
      } catch {
        serverProcess.kill("SIGKILL");
      }
    }
    serverProcess = null;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

function runTask(name: string, command: string, env: any) {
  process.stdout.write(`\x1b[36mℹ ${name}...\x1b[0m`);
  try {
    execSync(command, { env: { ...process.env, ...env }, stdio: "pipe" });
    process.stdout.write(` \x1b[32m[DONE]\x1b[0m\n`);
    return true;
  } catch (e: any) {
    process.stdout.write(` \x1b[31m[FAILED]\x1b[0m\n`);
    if (e.stdout) {
      const out = e.stdout.toString();
      const filtered = out
        .split("\n")
        .filter((l: string) => {
          return (
            !l.includes("UNIQUE constraint failed") &&
            !l.includes("CREATE_ROLE_FAILED") &&
            !l.includes("AutomationService") &&
            !l.includes("Config exists but NO USERS found") &&
            !l.includes("ENOENT") &&
            !l.includes("No changes made to private.ts") &&
            !l.includes("Failed to read keys") &&
            !l.includes("DEFAULT_THEME fallback") &&
            !l.includes("ModifyRequest completed in") &&
            !l.includes("setupCheck") &&
            !l.includes("DEBUG:")
          );
        })
        .join("\n");
      if (filtered.trim()) console.log(filtered);
    }
    return false;
  }
}

async function ensureDatabaseExists(db: DatabaseConfig) {
  if (db.type === "postgresql") {
    try {
      const postgres = (await import("postgres")).default;
      const sql = postgres({
        host: db.host,
        port: db.port,
        user: db.user,
        password: db.password,
        database: "postgres",
        connect_timeout: 5,
      });
      await sql.unsafe(`CREATE DATABASE "${DB_NAME}"`).catch((e) => {
        if (e.code !== "42P04") throw e;
      });
      await sql.end();
      log.info(`PostgreSQL database ready: ${DB_NAME}`);
    } catch (e: any) {
      log.warn(`PostgreSQL pre-check failed: ${e.message}`);
    }
  } else if (db.type === "mariadb") {
    try {
      const mysql = (await import("mysql2/promise")).default;
      const conn = await mysql.createConnection({
        host: db.host === "localhost" ? "127.0.0.1" : db.host,
        port: db.port,
        user: db.user,
        password: db.password,
        authProtocol: "mysql_native_password",
      });
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
      await conn.end();
      log.info(`MariaDB database ready: ${DB_NAME}`);
    } catch (e: any) {
      log.warn(`MariaDB pre-check failed: ${e.message}`);
    }
  }
}

async function startServer(db: DatabaseConfig): Promise<{ coldStartMs: number; version: string }> {
  log.info(
    `Launching SveltyCMS — ${db.label || db.type.toUpperCase()}${db.useRedis ? " [REDIS]" : ""}`,
  );
  const env = {
    PORT: PORT.toString(),
    DB_TYPE: db.type,
    DB_HOST: db.host,
    DB_PORT: db.port.toString(),
    DB_USER: db.user,
    DB_PASSWORD: db.password,
    TEST_MODE: "true",
    TEST_API_SECRET,
    ADMIN_PASSWORD,
    USE_REDIS: db.useRedis ? "true" : "false",
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: "6379",
  };
  const start = performance.now();

  serverProcess = spawn("bun", ["build/index.js"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...env,
      HOST: "127.0.0.1",
      PORT: PORT.toString(),
      ORIGIN: `http://127.0.0.1:${PORT}`,
      PROTOCOL_HEADER: "x-forwarded-proto",
      HOST_HEADER: "host",
    },
  });

  return new Promise((resolve, reject) => {
    let resolved = false;
    let buffer = "";
    const timeout = setTimeout(() => {
      if (!resolved) reject(new Error("Server Startup Timeout"));
    }, 45000);

    serverProcess?.stdout?.on("data", async (d) => {
      buffer += d.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const cleanLine = line.replace(new RegExp("\\x1b" + "\\[[0-9;]*[JKmsu]", "g"), "");

        const isAccessLog =
          /→\s+[0-9]{3}/.test(cleanLine) ||
          /(GET|POST|PUT|DELETE|PATCH) \/.* [0-9]{3}/i.test(cleanLine);

        const isNoisyError =
          /AppError \[.*\]: User not found/i.test(cleanLine) ||
          /GET_ACTIVE_THEME_FAILED/i.test(cleanLine) ||
          /UNIQUE constraint failed/i.test(cleanLine) ||
          /Method listSchemas not yet implemented/i.test(cleanLine) ||
          /CREATE_ROLE_FAILED/i.test(cleanLine) ||
          /AutomationService/i.test(cleanLine) ||
          /Config exists but NO USERS found/i.test(cleanLine) ||
          /ENOENT.*config\/private\.ts/i.test(cleanLine) ||
          /No changes made to private\.ts/i.test(cleanLine) ||
          /Failed to read keys from private\.ts/i.test(cleanLine) ||
          /Using DEFAULT_THEME fallback/i.test(cleanLine) ||
          /ModifyRequest completed in/i.test(cleanLine) ||
          /Role ".*" creation returned failure/i.test(cleanLine) ||
          /setupCheck/i.test(cleanLine) ||
          /DEBUG:/i.test(cleanLine) ||
          /Initial MariaDB connection check failed/i.test(cleanLine) ||
          /MariaDB adapter error/i.test(cleanLine);

        if (isAccessLog || isNoisyError) continue;

        process.stdout.write(line + "\n");

        if (!resolved && (cleanLine.includes("Local:") || cleanLine.includes("127.0.0.1:"))) {
          resolved = true;
          clearTimeout(timeout);
          const coldStartMs = Math.round(performance.now() - start);
          log.success(`Cold Start: ${coldStartMs}ms`);

          log.info("Waiting for system healthy...");
          let healthy = false;
          let version = "unknown";
          for (let i = 0; i < 15; i++) {
            try {
              await new Promise((r) => setTimeout(r, 2000));
              const r = await fetch(`http://127.0.0.1:${PORT}/api/system/health`);
              if (r.ok) {
                const data = await r.json();
                version = data.dbVersion || "unknown";
                healthy = true;
                break;
              }
            } catch {}
          }

          if (healthy) {
            await new Promise((r) => setTimeout(r, 5000));
            resolve({ coldStartMs, version });
          } else reject(new Error("Server reached but health check failed (timeout)"));
        }
      }
    });

    serverProcess?.stderr?.on("data", (d) => {
      const line = d.toString();
      const cleanLine = line.replace(new RegExp("\\x1b" + "\\[[0-9;]*[JKmsu]", "g"), "");
      const isNoisyError =
        /AppError/i.test(cleanLine) ||
        /ENOENT/i.test(cleanLine) ||
        /UNIQUE constraint/i.test(cleanLine) ||
        /CREATE_ROLE_FAILED/i.test(cleanLine) ||
        /Using DEFAULT_THEME/i.test(cleanLine) ||
        /No changes made to private/i.test(cleanLine) ||
        /setupCheck/i.test(cleanLine) ||
        /DEBUG:/i.test(cleanLine) ||
        /Initial MariaDB connection check failed/i.test(cleanLine) ||
        /MariaDB adapter error/i.test(cleanLine);

      if (!isNoisyError) process.stderr.write(line);
    });

    serverProcess?.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Reporting
// ─────────────────────────────────────────────────────────────

async function generateFinalReport(results: BenchmarkResult[]) {
  const historyRaw = await fs.readFile(HISTORY_FILE, "utf8").catch(() => '{"runs":{}}');
  const history = JSON.parse(historyRaw);
  if (!history.runs) history.runs = {};
  const now = new Date().toISOString();

  // Load stress metrics separately if they exist
  const stressRaw = await fs
    .readFile(path.join(ROOT_RESULTS_DIR, "graphql-stress.json"), "utf8")
    .catch(() => null);
  const stressData = stressRaw ? JSON.parse(stressRaw) : null;

  for (const res of results) {
    if (res.status !== "SUCCESS") continue;
    const dbKey = res.db;
    const key = `${dbKey}-memory`;
    if (!history.runs[key]) history.runs[key] = [];
    // Inject stress metrics into the result object if this is the target DB
    if (stressData && res.status === "SUCCESS") {
      res.metrics = { ...res.metrics, "graphql-stress": stressData };
    }
    history.runs[key].unshift({ timestamp: now, ...res });
    if (history.runs[key].length > 20) history.runs[key].pop();
  }
  await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true });
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));

  let md = `## 📊 Enterprise Benchmark Matrix — ${new Date().toLocaleString()}\n\n`;

  md += `### 🧪 What We Tested\n\n`;
  BENCHMARK_SCRIPTS.forEach((s) => {
    md += `- **${s.label}** — ${s.desc}\n`;
    md += `   📍 \`${s.path}\`\n`;
  });
  md += `\n`;

  md += `| Database | Cold Start | REST (p95) | GQL (avg) | GQL Stress | Relational (avg) | Status |\n`;
  md += `|----------|------------|------------|-----------|-------------|------------------|--------|\n`;

  let regressions: string[] = [];
  const latestMetrics: Record<string, any> = {};

  for (const dbConf of ALL_DATABASES) {
    const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
    const key = `${dbKey}-memory`;
    const hist = history.runs[key] || [];
    const curr = results.find((r) => r.db === dbKey) || hist[0];
    if (!curr) continue;

    const metrics = extractMetrics(curr.metrics, dbConf.type);
    latestMetrics[dbKey] = metrics;
    const previousRuns = hist;

    const coldTrend = getTrendDetails(
      previousRuns,
      curr.coldStartMs || 0,
      (run) => run.coldStartMs || 0,
    );
    const restTrend = getTrendDetails(
      previousRuns,
      metrics.collections,
      (run) => extractMetrics(run.metrics, dbConf.type).collections,
    );
    const gqlTrend = getTrendDetails(
      previousRuns,
      metrics.graphqlAvg,
      (run) => extractMetrics(run.metrics, dbConf.type).graphqlAvg,
    );
    const relationalTrend = getTrendDetails(
      previousRuns,
      metrics.relationalAvg,
      (run) => extractMetrics(run.metrics, dbConf.type).relationalAvg,
    );
    const dbTrend = getTrendDetails(
      previousRuns,
      metrics.dbRaw,
      (run) => extractMetrics(run.metrics, dbConf.type).dbRaw,
    );

    if (
      coldTrend.isRegression ||
      restTrend.isRegression ||
      gqlTrend.isRegression ||
      relationalTrend.isRegression ||
      dbTrend.isRegression
    ) {
      regressions.push((dbConf.label || dbConf.type).toUpperCase());
    }

    md += `| **${(dbConf.label || dbConf.type).toUpperCase()}** | `;
    md += `${curr.coldStartMs || 0}ms ${coldTrend.icon} (${coldTrend.pct}) | `;
    md += `${metrics.collections.toFixed(2)}ms ${restTrend.icon} (${restTrend.pct}) | `;
    md += `${metrics.graphqlAvg.toFixed(2)}ms ${gqlTrend.icon} (${gqlTrend.pct}) | `;
    md += `${metrics.gqlStressRps > 0 ? metrics.gqlStressRps.toFixed(0) + " RPS" : "—"} | `;
    md += `${metrics.relationalAvg.toFixed(2)}ms ${relationalTrend.icon} (${relationalTrend.pct}) | `;
    md += `${curr.status === "SUCCESS" ? "✅" : "❌"} |\n`;
  }

  if (regressions.length > 0) {
    md += `\n> [!CAUTION]\n`;
    md += `> **PERFORMANCE DEGRADATION DETECTED**: Significant regressions found in: ${regressions.join(", ")}. Investigation required.\n`;
  }

  md += `\n### 📈 Latency Trends (last 5 runs — lower is better)\n\n`;
  md += `\`\`\`mermaid\nxychart-beta\n  title "Total Latency (ms) — REST + DB + Hooks"\n  x-axis "Run"\n  y-axis "Latency (ms)"\n  ["Run 1", "Run 2", "Run 3", "Run 4", "Run 5"]\n`;

  for (const dbConf of ALL_DATABASES) {
    const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
    const key = `${dbKey}-memory`;
    const hist = history.runs[key] || [];
    const points = hist
      .slice(0, 5)
      .map((run: any) => {
        const m = extractMetrics(run.metrics, dbConf.type);
        return (m.collections + m.dbRaw + m.hooks / 1000).toFixed(2);
      })
      .reverse();
    if (points.length > 0) {
      md += `  line "${(dbConf.label || dbConf.type).toUpperCase()}" : [${points.join(", ")}]\n`;
    }
  }
  md += `\`\`\`\n`;

  md += `\n---\n\n## 🧩 Component Performance Comparison (Head-to-Head)\n\n`;

  // 1. REST API
  md += `### 📡 REST API PERFORMANCE MATRIX (LATENCY ANALYTICS)\n`;
  md += `> **Business Value**: Ensures the public API stays fast for end users and scales well under production load.\n`;
  md += `> **Test File**: [\`tests/benchmarks/rest-api-performance.test.ts\`](../../tests/benchmarks/rest-api-performance.test.ts)\n\n`;
  md += `| Adapter Variant | Avg Latency | p95 Latency | Throughput (RPS) |\n`;
  md += `|----------|-------------|-------------|------------------|\n`;
  for (const db of ALL_DATABASES) {
    const dbKey = db.useRedis ? `${db.type}-redis` : db.type;
    const key = `${dbKey}-memory`;
    const hist = history.runs[key] || [];
    const curr = results.find((r) => r.db === dbKey) || hist[0];
    const m = curr?.metrics?.["rest-collections-list"];
    if (m) {
      const avgTrend = getTrendDetails(
        hist,
        m.avgMs,
        (run) => run.metrics?.["rest-collections-list"]?.avgMs || 0,
      );
      const p95Trend = getTrendDetails(
        hist,
        m.p95Ms,
        (run) => run.metrics?.["rest-collections-list"]?.p95Ms || 0,
      );
      const rpsTrend = getRpsTrendDetails(
        hist,
        m.rps,
        (run) => run.metrics?.["rest-collections-list"]?.rps || 0,
      );
      md += `| ${(db.label || db.type).toUpperCase()} | ${m.avgMs.toFixed(2)}ms ${avgTrend.icon} | ${m.p95Ms.toFixed(2)}ms ${p95Trend.icon} | ${m.rps.toFixed(0)} ${rpsTrend.icon} |\n`;
    }
  }
  md += `\n`;

  // 2. GraphQL
  md += `### 🗃️ GRAPHQL RESOLVER PERFORMANCE MATRIX (BOTTLENECK ANALYSIS)\n`;
  md += `> **Business Value**: Validates that complex data relationships can be queried efficiently without blocking the event loop.\n`;
  md += `> **Test File**: [\`tests/benchmarks/graphql-api-performance.test.ts\`](../../tests/benchmarks/graphql-api-performance.test.ts)\n\n`;
  md += `| Adapter Variant | Me Query (avg) | Health (avg) | Throughput (RPS) |\n`;
  md += `|----------|----------------|--------------|------------------|\n`;
  for (const db of ALL_DATABASES) {
    const dbKey = db.useRedis ? `${db.type}-redis` : db.type;
    const key = `${dbKey}-memory`;
    const hist = history.runs[key] || [];
    const curr = results.find((r) => r.db === dbKey) || hist[0];
    if (curr?.metrics) {
      const me = curr.metrics["graphql-me"]?.avgMs || 0;
      const health = curr.metrics["graphql-system-health"]?.avgMs || 0;
      const rps = curr.metrics["graphql-me"]?.rps || 0;
      if (me > 0) {
        const meTrend = getTrendDetails(hist, me, (run) => run.metrics?.["graphql-me"]?.avgMs || 0);
        const healthTrend = getTrendDetails(
          hist,
          health,
          (run) => run.metrics?.["graphql-system-health"]?.avgMs || 0,
        );
        const rpsTrend = getRpsTrendDetails(
          hist,
          rps,
          (run) => run.metrics?.["graphql-me"]?.rps || 0,
        );
        md += `| ${(db.label || db.type).toUpperCase()} | ${me.toFixed(2)}ms ${meTrend.icon} | ${health.toFixed(2)}ms ${healthTrend.icon} | ${rps.toFixed(0)} ${rpsTrend.icon} |\n`;
      }
    }
  }
  md += `\n`;

  // 2.5 Relational Queries
  md += `### 🔗 RELATIONAL PERFORMANCE MATRIX (JOIN & POPULATION)\n`;
  md += `> **Business Value**: Essential for complex applications; stress-tests deep nesting and cross-collection data integrity.\n`;
  md += `> **Test File**: [\`tests/benchmarks/relational-performance.test.ts\`](../../tests/benchmarks/relational-performance.test.ts)\n\n`;
  md += `| Adapter Variant | GQL Nested (Depth 2) | REST Search (Aggregated) | Throughput (RPS) |\n`;
  md += `|----------|-----------------------|--------------------------|------------------|\n`;
  for (const db of ALL_DATABASES) {
    const dbKey = db.useRedis ? `${db.type}-redis` : db.type;
    const key = `${dbKey}-memory`;
    const hist = history.runs[key] || [];
    const curr = results.find((r) => r.db === dbKey) || hist[0];
    if (curr?.metrics) {
      const nested = curr.metrics["relational-graphql-nested"]?.avgMs || 0;
      const search = curr.metrics["relational-rest-search"]?.avgMs || 0;
      const rps = curr.metrics["relational-graphql-nested"]?.rps || 0;
      if (nested > 0) {
        const nestedTrend = getTrendDetails(
          hist,
          nested,
          (run) => run.metrics?.["relational-graphql-nested"]?.avgMs || 0,
        );
        const searchTrend = getTrendDetails(
          hist,
          search,
          (run) => run.metrics?.["relational-rest-search"]?.avgMs || 0,
        );
        const rpsTrend = getRpsTrendDetails(
          hist,
          rps,
          (run) => run.metrics?.["relational-graphql-nested"]?.rps || 0,
        );
        md += `| ${(db.label || db.type).toUpperCase()} | ${nested.toFixed(2)}ms ${nestedTrend.icon} | ${search.toFixed(2)}ms ${searchTrend.icon} | ${rps.toFixed(0)} ${rpsTrend.icon} |\n`;
      }
    }
  }
  md += `\n`;

  // 2.6 Widget Overhead
  md += `### 🧩 WIDGET PERFORMANCE OVERHEAD MATRIX\n`;
  md += `> **Business Value**: Ensures that custom UI components don't introduce performance bottlenecks in the core data pipeline.\n`;
  md += `> **Test File**: [\`tests/benchmarks/widget-performance.test.ts\`](../../tests/benchmarks/widget-performance.test.ts)\n\n`;
  md += `| Adapter Variant | Input (avg) | RichText (avg) | Relation (avg) | Status |\n`;
  md += `|----------|-------------|----------------|----------------|--------|\n`;
  for (const db of ALL_DATABASES) {
    const dbKey = db.useRedis ? `${db.type}-redis` : db.type;
    const key = `${dbKey}-memory`;
    const hist = history.runs[key] || [];
    const curr = results.find((r) => r.db === dbKey) || hist[0];
    if (curr?.metrics) {
      const input = curr.metrics["widget-overhead-input"]?.avgMs || 0;
      const richtext = curr.metrics["widget-overhead-richtext"]?.avgMs || 0;
      const relation = curr.metrics["widget-overhead-relation"]?.avgMs || 0;
      if (input > 0) {
        const inputTrend = getTrendDetails(
          hist,
          input,
          (run) => run.metrics?.["widget-overhead-input"]?.avgMs || 0,
        );
        md += `| ${(db.label || db.type).toUpperCase()} | ${input.toFixed(2)}ms ${inputTrend.icon} | ${richtext.toFixed(2)}ms | ${relation.toFixed(2)}ms | ${input < 5 ? "✅ PASS" : "⚠️ WARN"} |\n`;
      }
    }
  }
  md += `\n`;

  // 2.7 Security Hardening
  md += `### 🛡️ SECURITY HARDENING & AUDIT MATRIX\n`;
  md += `> **Business Value**: Validates that security features (Firewall, Audit Chaining) provide maximum protection with minimal performance impact.\n`;
  md += `> **Test File**: [\`tests/benchmarks/security-audit.test.ts\`](../../tests/benchmarks/security-audit.test.ts)\n\n`;
  md += `| Adapter Variant | Firewall (p95) | Audit Logging | Argon2id (Cost) | Status |\n`;
  md += `|----------|----------------|---------------|-----------------|--------|\n`;
  for (const db of ALL_DATABASES) {
    const dbKey = db.useRedis ? `${db.type}-redis` : db.type;
    const key = `${dbKey}-memory`;
    const hist = history.runs[key] || [];
    const curr = results.find((r) => r.db === dbKey) || hist[0];
    if (curr?.metrics) {
      const firewall = curr.metrics["security-firewall-clean"]?.p95Ms || 0;
      const audit = curr.metrics["security-audit-logging"]?.p95Ms || 0;
      const argon = curr.metrics["security-crypto-argon2"]?.avgMs || 0;
      if (firewall > 0) {
        md += `| ${(db.label || db.type).toUpperCase()} | ${firewall.toFixed(3)}ms | ${audit.toFixed(3)}ms | ${argon.toFixed(0)}ms | ${firewall < 0.1 ? "🟢 CLEAN" : "🟡 AUDIT"} |\n`;
      }
    }
  }
  md += `\n`;

  // 3. Middleware
  md += `### 🏁 MIDDLWARE PERFORMANCE MATRIX\n`;
  md += `> **Business Value**: Guarantees that security and multi-tenancy layers add negligible overhead to every request.\n`;
  md += `> **Test File**: [\`tests/benchmarks/hooks-performance.test.ts\`](../../tests/benchmarks/hooks-performance.test.ts)\n\n`;
  md += `| Hook | Adapter Variant | Avg (µs) | p95 (µs) | p99 (µs) | Efficiency |\n`;
  md += `|------|----------|----------|----------|----------|------------|\n`;

  const targetHooks = [
    "handleturbopipeline",
    "handleauthentication",
    "handleauthorization",
    "handlesecurity",
    "handleapirequests",
  ];

  for (const hook of targetHooks) {
    let first = true;
    for (const dbConf of ALL_DATABASES) {
      const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
      const key = `${dbKey}-memory`;
      const hist = history.runs[key] || [];
      const curr = results.find((r) => r.db === dbKey) || hist[0];
      const m = curr?.metrics?.[`hook-${hook}`];

      if (m) {
        const avg = (m.avgMs * 1000).toFixed(2);
        const avgTrend = getTrendDetails(
          hist,
          m.avgMs,
          (run) => run.metrics?.[`hook-${hook}`]?.avgMs || 0,
        );
        md += `| ${first ? `**${hook}**` : "---"} | ${(dbConf.label || dbConf.type).toUpperCase()} | ${avg} ${avgTrend.icon} | ${(m.p95Ms * 1000).toFixed(2)} | ${(m.p99Ms * 1000).toFixed(2)} | ${Number(avg) < 5 ? "🚀" : "⚡"} |\n`;
        first = false;
      }
    }
    md += `| --- | --- | --- | --- | --- | --- |\n`;
  }
  md += `\n`;

  md += `### 🚨 Bottleneck Analysis (Latency Distribution)\n`;
  for (const dbConf of ALL_DATABASES) {
    if (dbConf.useRedis) continue;
    const dbKey = dbConf.type;
    const m = latestMetrics[dbKey];
    if (m && m.collections > 0) {
      const total = m.collections;
      const dbPct = Math.round((m.dbRaw / total) * 100);
      const restPct = 100 - dbPct;
      md += `📌 **${dbConf.type.toUpperCase()}** — ${restPct > dbPct ? "REST dominates" : "DB Layer dominates"} (${restPct}% REST vs ${dbPct}% DB)\n`;
    }
  }
  md += `\n`;

  let doc = await fs.readFile(BENCHMARKS_DOC, "utf8").catch(() => "");
  const startM = "<!-- BENCHMARK_START -->";
  const endM = "<!-- BENCHMARK_END -->";

  const intelData = latestMetrics["sqlite"] || latestMetrics["mongodb"] || {};
  if (intelData.hooks) {
    doc = doc.replace(
      /\| \*\*Internal Latency\*\*  \| 0\.13 ms                                \| \*\*.*\*\*  \| \*\*.*\*\*    \|/,
      `| **Internal Latency**  | 0.13 ms                                | **${intelData.hooks.toFixed(2)} ms**  | **~${Math.round(((0.13 - intelData.hooks) / 0.13) * 100)}%** |`,
    );
    doc = doc.replace(
      /\| \*\*Raw DB Read\*\*       \| 0\.94 ms                                \| \*\*.*\*\*  \| \*\*.*\*\*    \|/,
      `| **Raw DB Read**       | 0.94 ms                                | **${intelData.dbRaw.toFixed(3)} ms**  | **~${Math.round(((0.94 - intelData.dbRaw) / 0.94) * 100)}%** |`,
    );
  }

  const content = `${startM}\n\n${md}\n\n${endM}`;
  if (doc.includes(startM) && doc.includes(endM)) {
    doc = doc.slice(0, doc.indexOf(startM)) + content + doc.slice(doc.indexOf(endM) + endM.length);
  } else doc = content + "\n---\n" + doc;

  await fs.writeFile(BENCHMARKS_DOC, doc);
  log.success("Benchmarks synchronized to documentation.");

  // Cleanup temporary JSON files (preserving history)
  await cleanupResults();
}

/**
 * Removes raw benchmark result files to keep the workspace clean.
 */
async function cleanupResults() {
  log.info("Cleaning up temporary benchmark results...");
  try {
    const files = await fs.readdir(ROOT_RESULTS_DIR);
    for (const file of files) {
      if (file !== "history.json") {
        const fullPath = path.join(ROOT_RESULTS_DIR, file);
        await fs.rm(fullPath, { recursive: true, force: true }).catch(() => {});
      }
    }
  } catch (err) {
    log.error(`Cleanup failed: ${err}`);
  }
}

async function main() {
  const skipBuild = process.argv.includes("--no-build");
  const dbArg = process.argv.find((a) => a.startsWith("--db="))?.split("=")[1];
  const targetTypes = dbArg
    ? dbArg.split(",").map((s) => s.trim().toLowerCase())
    : ["sqlite", "mongodb", "postgresql", "mariadb"];

  log.header(`SveltyCMS Enterprise Audit v${pkgVersion}`);

  if (!skipBuild) {
    log.info("Phase 1: Automated High-Memory Build...");
    try {
      execSync("bun run build:high-memory", { stdio: "inherit" });
      log.success("Build complete.");
    } catch {
      log.error("Build failed. Aborting.");
      process.exit(1);
    }
  }

  // Phase 1.5: Infrastructure Pre-check
  log.info("Phase 1.5: Infrastructure Pre-check...");
  for (const db of ALL_DATABASES) {
    if (dbArg && !targetTypes.includes(db.type)) continue;
    try {
      log.info(`  Checking ${db.label || db.type}...`);
      await ensureDatabaseExists(db);
    } catch (e: any) {
      log.warn(`Infrastructure check failed for ${db.type}: ${e.message}`);
      // Non-fatal for pre-check
    }
  }
  log.success("Infrastructure readiness documented.");

  const results: BenchmarkResult[] = [];
  await fs.mkdir(ROOT_RESULTS_DIR, { recursive: true });

  for (const dbType of TARGET_DB_ORDER) {
    const db = ALL_DATABASES.find((d) => {
      const dbLabel = (d.label || d.type).toLowerCase().replace("+", "-");
      return dbLabel === dbType.toLowerCase().replace("+", "-");
    });
    if (!db) continue;
    if (dbArg && !targetTypes.includes(db.type)) continue;

    log.header(`Testing ${db.label || db.type.toUpperCase()}`);
    try {
      await stopServer();
      await freePort(PORT);
      await ensureDatabaseExists(db);

      if (db.type === "sqlite") {
        const sqliteFile = path.join(process.cwd(), "config/database", `${DB_NAME}.sqlite`);
        await fs.rm(sqliteFile, { force: true }).catch(() => {});
      }

      const { coldStartMs, version } = await startServer(db);
      const resultsSubDir = db.useRedis ? `${db.type}-redis` : db.type;
      const dbDir = path.join(ROOT_RESULTS_DIR, resultsSubDir);
      await fs.rm(dbDir, { recursive: true, force: true }).catch(() => {});
      await fs.mkdir(dbDir, { recursive: true });

      const env = {
        API_BASE_URL: `http://127.0.0.1:${PORT}`,
        TEST_MODE: "true",
        RESULTS_DIR: dbDir,
        DB_TYPE: db.type,
        DB_NAME,
        DB_HOST: db.host,
        DB_PORT: db.port.toString(),
        DB_USER: db.user,
        DB_PASSWORD: db.password,
        TEST_API_SECRET,
        ADMIN_PASSWORD,
        BUN_TEST_MOCKS: "false",
      };

      if (!runTask("Seeding System", `bun run scripts/setup-system.ts`, env))
        throw new Error("Setup System failed");
      if (!runTask("Seeding Relational Data", `bun run scripts/setup-benchmarks.ts`, env))
        throw new Error("Relational Setup failed");

      log.info(`Settling ${db.type} engine (5s for stability)...`);
      await new Promise((r) => setTimeout(r, 5000));
      await stopServer();
      await startServer(db);

      for (const s of BENCHMARK_SCRIPTS) {
        const cmd = s.path.endsWith(".test.ts") ? `bun test ${s.path}` : `bun run ${s.path}`;
        if (!runTask(`Benchmark: ${s.label}`, cmd, env)) throw new Error(`${s.label} failed`);
      }

      const metrics: any = {};
      if (db.useRedis) metrics["USE_REDIS"] = "true";
      const files = await fs.readdir(dbDir);
      for (const f of files) {
        if (f.endsWith(".json"))
          metrics[path.basename(f, ".json")] = JSON.parse(
            await fs.readFile(path.join(dbDir, f), "utf8"),
          );
      }

      results.push({
        db: db.useRedis ? `${db.type}-redis` : db.type,
        status: "SUCCESS",
        coldStartMs,
        version,
        metrics,
      });
    } catch (e: any) {
      log.error(`${db.label || db.type} suite failed: ${e.message}`);
      results.push({
        db: db.useRedis ? `${db.type}-redis` : db.type,
        status: "FAILED",
        error: e.message,
      });
      break;
    }
  }

  await generateFinalReport(results);
  await stopServer();
  log.success("Audit Complete.");
}

main().catch(console.error);
