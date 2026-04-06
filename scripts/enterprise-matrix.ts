/**
 * @file scripts/enterprise-matrix.ts
 * @description Zero-Mock Enterprise Performance Matrix (Trend-aware & Actionable Reporting)
 */

import { spawn, execSync, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
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
  { type: "sqlite", port: 0, host: "./config/database", user: "", password: "" },
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
  { type: "postgresql", port: 5432, host: "127.0.0.1", user: "postgres", password: "postgres" },
  { type: "mariadb", port: 3306, host: "127.0.0.1", user: "mariadb", password: "password" },
];

const PORT = 4173;
const DB_NAME = "SveltyCMS_test";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "password123!";
const TEST_API_SECRET = process.env.TEST_API_SECRET || randomBytes(32).toString("hex");
const ROOT_RESULTS_DIR = path.join(process.cwd(), "tests/benchmarks/results");
const HISTORY_FILE = path.join(process.cwd(), "tests/benchmarks/results/history.json");
const BENCHMARKS_DOC = path.join(process.cwd(), "docs/project/benchmarks.mdx");

const BENCHMARK_SCRIPTS = [
  {
    path: "tests/benchmarks/rest-api-performance.test.ts",
    label: "REST API",
    desc: "Validates unified dispatcher overhead and JSON serialization latency.",
  },
  {
    path: "tests/benchmarks/hooks-performance.test.ts",
    label: "Hooks",
    desc: "High-resolution micro-benchmarks for individual middleware layers (µs).",
  },
  {
    path: "tests/benchmarks/graphql-api-performance.test.ts",
    label: "GraphQL API",
    desc: "Resolvers performance and N+1 relationship stress testing.",
  },
  {
    path: "tests/benchmarks/relational-performance.test.ts",
    label: "Relational",
    desc: "JOINs, population, and nested relation performance (Depth 2-3).",
  },
  {
    path: "tests/benchmarks/database-performance.test.ts",
    label: "DB Adapter",
    desc: "Raw CRUD latency for the current database adapter.",
  },
];

const TARGET_DB_ORDER = ["sqlite", "sqlite+redis", "mongodb", "postgresql", "mariadb"];

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
    relationalAvg: m["relational-graphql-nested"]?.avgMs || 0,
  };
}

/**
 * Calculates trend over the last N runs (default 5).
 * Returns trend icon, percentage change, and regression status.
 */
function getTrendDetails(
  history: any[],
  currentVal: number,
  extractor: (m: any) => number,
): { icon: string; pct: string; isRegression: boolean } {
  if (!history || history.length === 0) return { icon: "⚪", pct: "—", isRegression: false };

  // Calculate average of up to last 5 runs
  const windowSize = Math.min(5, history.length);
  const recentRuns = history.slice(0, windowSize);
  const avgPrev = recentRuns.reduce((acc, run) => acc + extractor(run.metrics), 0) / windowSize;

  if (avgPrev === 0) return { icon: "⚪", pct: "—", isRegression: false };

  const pct = ((currentVal - avgPrev) / avgPrev) * 100;
  const isBetter = pct < -3;
  const isWorse = pct > 5;
  const isRegression = pct > 10; // Critical degradation threshold

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
      execSync(`lsof -ti:${port},3001 | xargs kill -9 || true`, { stdio: "ignore" });
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
    await new Promise((r) => setTimeout(r, 1500)); // Increased cool-down for DB connections to settle
  }
}

/**
 * Executes a command and captures output, only displaying it on failure.
 */
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
      // Only show error if it's not a known ignorable one
      if (!out.includes("UNIQUE constraint failed: roles._id")) {
        console.log(out);
      }
    }
    if (e.stderr) console.error(e.stderr.toString());
    return false;
  }
}

/**
 * Self-healing DB creation helpers
 */
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
      log.warn(`PostgreSQL pre-check failed (might already exist or auth issue): ${e.message}`);
    }
  } else if (db.type === "mariadb") {
    try {
      const mysql = (await import("mysql2/promise")).default;
      const conn = await mysql.createConnection({
        host: db.host,
        port: db.port,
        user: db.user,
        password: db.password,
      });
      await conn.query(`CREATE DATABASE IF NOT EXISTS ${DB_NAME}`);
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

  serverProcess = spawn(
    "bun",
    ["x", "vite", "preview", "--port", PORT.toString(), "--host", "127.0.0.1"],
    {
      stdio: ["ignore", "pipe", "pipe"], // Capture both stdout and stderr
      env: { ...process.env, ...env },
    },
  );

  return new Promise((resolve, reject) => {
    let resolved = false;
    let buffer = "";
    const timeout = setTimeout(() => {
      if (!resolved) reject(new Error("Server Startup Timeout"));
    }, 45000);

    // Handle stdout
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
          /UNIQUE constraint failed: roles._id/i.test(cleanLine) ||
          /UNIQUE constraint failed: users.email/i.test(cleanLine) ||
          /Method listSchemas not yet implemented/i.test(cleanLine);

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
          // Increase retries for slower DB startups (e.g. MongoDB/Postgres)
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
            } catch (e: any) {
              /* Wait & retry */
              if (i === 14) log.warn(`Health check still failing: ${e.message}`);
            }
          }

          if (healthy) resolve({ coldStartMs, version });
          else reject(new Error("Server reached but health check failed (timeout)"));
        }
      }
    });

    let errBuffer = "";
    // Handle stderr
    serverProcess?.stderr?.on("data", (d) => {
      errBuffer += d.toString();
      const lines = errBuffer.split(/\r?\n/);
      errBuffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const cleanLine = line.replace(new RegExp("\\x1b" + "\\[[0-9;]*[JKmsu]", "g"), "");

        const isAccessLog =
          /→\s+[0-9]{3}/.test(cleanLine) ||
          /(GET|POST|PUT|DELETE|PATCH) \/.* [0-9]{3}/i.test(cleanLine);
        const isNoisyError =
          /AppError \[.*\]: User not found/i.test(cleanLine) ||
          /GET_ACTIVE_THEME_FAILED/i.test(cleanLine) ||
          /UNIQUE constraint failed: roles._id/i.test(cleanLine) ||
          /Method listSchemas not yet implemented/i.test(cleanLine);

        if (isAccessLog || isNoisyError) continue;

        process.stderr.write(line + "\n");
      }
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

  for (const res of results) {
    if (res.status !== "SUCCESS") continue;
    const key = `${res.db}-memory`;
    if (!history.runs[key]) history.runs[key] = [];
    history.runs[key].unshift({ timestamp: now, ...res });
    if (history.runs[key].length > 20) history.runs[key].pop();
  }
  await fs.mkdir(path.dirname(HISTORY_FILE), { recursive: true });
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2));

  // --- REPORT GENERATION ---
  let md = `## 📊 Enterprise Benchmark Matrix — ${new Date().toLocaleString()}\n\n`;

  md += `### 🧪 What We Tested\n\n`;
  md += `- **REST API** — Measures E2E collection throughput and latency using REST API endpoints.\n`;
  md += `   📍 \`tests/benchmarks/rest-api-performance.test.ts\`\n`;
  md += `- **GraphQL API** — Measures resolver efficiency and N+1 relationship resolution.\n`;
  md += `   📍 \`tests/benchmarks/graphql-api-performance.test.ts\`\n`;
  md += `- **Relational** — JOINs, population, and nested relation performance (Depth 2-3).\n`;
  md += `   📍 \`tests/benchmarks/relational-performance.test.ts\`\n`;
  md += `- **Hooks** — Evaluates middleware and lifecycle hook overhead across various data operations.\n`;
  md += `   📍 \`tests/benchmarks/hooks-performance.test.ts\`\n`;
  md += `- **DB Adapter** — Benchmarks raw CRUD operations directly via the database adapter layer.\n`;
  md += `   📍 \`tests/benchmarks/database-performance.test.ts\`\n\n`;

  md += `| Database | Cold Start | REST (p95) | GQL (avg) | Relational (avg) | Raw DB (read) | Status |\n`;
  md += `|----------|------------|------------|-----------|------------------|--------------|--------|\n`;

  let regressions: string[] = [];
  const latestMetrics: Record<string, any> = {};

  for (const dbConf of ALL_DATABASES) {
    const key = `${dbConf.type}-memory`;
    const hist = history.runs[key] || [];
    const curr = results.find((r) => r.db === dbConf.type) || hist[0];
    if (!curr) continue;

    latestMetrics[dbConf.type] = extractMetrics(curr.metrics, dbConf.type);
    const previousRuns = hist;

    const coldTrend = getTrendDetails(
      previousRuns,
      curr.coldStartMs || 0,
      (run) => run.coldStartMs || 0,
    );
    const restTrend = getTrendDetails(
      previousRuns,
      latestMetrics[dbConf.type].collections,
      (run) => extractMetrics(run.metrics, dbConf.type).collections,
    );
    const gqlTrend = getTrendDetails(
      previousRuns,
      latestMetrics[dbConf.type].graphqlAvg,
      (run) => extractMetrics(run.metrics, dbConf.type).graphqlAvg,
    );
    const relationalTrend = getTrendDetails(
      previousRuns,
      latestMetrics[dbConf.type].relationalAvg,
      (run) => extractMetrics(run.metrics, dbConf.type).relationalAvg,
    );
    const dbTrend = getTrendDetails(
      previousRuns,
      latestMetrics[dbConf.type].dbRaw,
      (run) => extractMetrics(run.metrics, dbConf.type).dbRaw,
    );

    if (
      coldTrend.isRegression ||
      restTrend.isRegression ||
      gqlTrend.isRegression ||
      relationalTrend.isRegression ||
      dbTrend.isRegression
    ) {
      regressions.push(dbConf.type.toUpperCase());
    }

    const cold = curr.coldStartMs || 0;
    md += `| **${dbConf.type.toUpperCase()}** | `;
    md += `${cold}ms ${coldTrend.icon} (${coldTrend.pct}) | `;
    md += `${latestMetrics[dbConf.type].collections.toFixed(2)}ms ${restTrend.icon} (${restTrend.pct}) | `;
    md += `${latestMetrics[dbConf.type].graphqlAvg.toFixed(2)}ms ${gqlTrend.icon} (${gqlTrend.pct}) | `;
    md += `${latestMetrics[dbConf.type].relationalAvg.toFixed(2)}ms ${relationalTrend.icon} (${relationalTrend.pct}) | `;
    md += `${latestMetrics[dbConf.type].dbRaw.toFixed(3)}ms ${dbTrend.icon} (${dbTrend.pct}) | ${curr.status === "SUCCESS" ? "✅" : "❌"} |\n`;
  }

  if (regressions.length > 0) {
    md += `\n> [!CAUTION]\n`;
    md += `> **PERFORMANCE DEGRADATION DETECTED**: Significant regressions found in: ${regressions.join(", ")}. Investigation required.\n`;
  }

  // Latency Trends Chart (Last 5 runs)
  md += `\n### 📈 Latency Trends (last 5 runs — lower is better)\n\n`;
  md += `\`\`\`mermaid\nxychart-beta\n  title "Total Latency (ms) — REST + DB + Hooks"\n  x-axis "Run"\n  y-axis "Latency (ms)"\n  ["Run 1", "Run 2", "Run 3", "Run 4", "Run 5"]\n`;

  for (const dbConf of ALL_DATABASES) {
    if (dbConf.useRedis) continue;
    const key = `${dbConf.type}-memory`;
    const hist = history.runs[key] || [];
    const points = hist
      .slice(0, 5)
      .map((run: any) => {
        const m = extractMetrics(run.metrics, dbConf.type);
        return (m.collections + m.dbRaw + m.hooks / 1000).toFixed(2);
      })
      .reverse();
    if (points.length > 0) {
      md += `  line "${dbConf.type.toUpperCase()}" : [${points.join(", ")}]\n`;
    }
  }
  md += `\`\`\`\n`;

  md += `\n---\n\n## 🧩 Component Performance Comparison (Head-to-Head)\n\n`;

  // 1. REST API
  md += `### 📡 REST API PERFORMANCE MATRIX (LATENCY ANALYTICS)\n`;
  md += `> **Why it matters**: Validates the overhead of the unified dispatcher and JSON serialization. Direct memory calls in SveltyCMS aim for sub-1ms overhead.\n`;
  md += `> **Test File**: [\`tests/benchmarks/rest-api-performance.test.ts\`](file:///tests/benchmarks/rest-api-performance.test.ts)\n\n`;
  md += `| Database | Avg Latency | p95 Latency | Throughput (RPS) |\n`;
  md += `|----------|-------------|-------------|------------------|\n`;
  for (const db of ALL_DATABASES) {
    const key = `${db.type}-memory`;
    const hist = history.runs[key] || [];
    const curr = results.find((r) => r.db === db.type) || hist[0];
    const m = curr?.metrics?.["rest-collections-list"];
    if (m)
      md += `| ${db.type.toUpperCase()} | ${m.avgMs.toFixed(2)}ms | ${m.p95Ms.toFixed(2)}ms | ${m.rps.toFixed(0)} |\n`;
  }
  md += `\n`;

  // 2. GraphQL
  md += `### 🗃️ GRAPHQL RESOLVER PERFORMANCE MATRIX (BOTTLENECK ANALYSIS)\n`;
  md += `> **Why it matters**: Tests resolver efficiency and N+1 relationship resolution. Professional benchmarks ensure deep queries don't block the event loop.\n`;
  md += `> **Test File**: [\`tests/benchmarks/graphql-api-performance.test.ts\`](file:///tests/benchmarks/graphql-api-performance.test.ts)\n\n`;
  md += `| Database | Me Query (avg) | Health (avg) | Throughput (RPS) |\n`;
  md += `|----------|----------------|--------------|------------------|\n`;
  for (const db of ALL_DATABASES) {
    const key = `${db.type}-memory`;
    const hist = history.runs[key] || [];
    const curr = results.find((r) => r.db === db.type) || hist[0];
    if (curr?.metrics) {
      const me = curr.metrics["graphql-me"]?.avgMs || 0;
      const health = curr.metrics["graphql-system-health"]?.avgMs || 0;
      const rps = curr.metrics["graphql-me"]?.rps || 0;
      if (me > 0)
        md += `| ${db.type.toUpperCase()} | ${me.toFixed(2)}ms | ${health.toFixed(2)}ms | ${rps.toFixed(0)} |\n`;
    }
  }
  md += `\n`;

  // 2.5 Relational Queries
  md += `### 🔗 RELATIONAL PERFORMANCE MATRIX (JOIN & POPULATION)\n`;
  md += `> **Why it matters**: Validates the efficiency of JOINs, populations, and nested relationship resolution (Depth 2-3). Essential for complex data structures.\n`;
  md += `> **Test File**: [\`tests/benchmarks/relational-performance.test.ts\`](file:///tests/benchmarks/relational-performance.test.ts)\n\n`;
  md += `| Database | GQL Nested (Depth 2) | REST Search (Aggregated) | Throughput (RPS) |\n`;
  md += `|----------|-----------------------|--------------------------|------------------|\n`;
  for (const db of ALL_DATABASES) {
    const key = `${db.type}-memory`;
    const hist = history.runs[key] || [];
    const curr = results.find((r) => r.db === db.type) || hist[0];
    if (curr?.metrics) {
      const nested = curr.metrics["relational-graphql-nested"]?.avgMs || 0;
      const search = curr.metrics["relational-rest-search"]?.avgMs || 0;
      const rps = curr.metrics["relational-graphql-nested"]?.rps || 0;
      if (nested > 0)
        md += `| ${db.type.toUpperCase()} | ${nested.toFixed(2)}ms | ${search.toFixed(2)}ms | ${rps.toFixed(0)} |\n`;
    }
  }
  md += `\n`;

  // 3. Middleware
  md += `### 🏁 MIDDLWARE PERFORMANCE MATRIX\n`;
  md += `> **Why it matters**: SveltyCMS middleware handles Security, Auth, and Multi-tenancy. This matrix ensures these layers add negligible overhead.\n`;
  md += `> **Test File**: [\`tests/benchmarks/hooks-performance.test.ts\`](file:///tests/benchmarks/hooks-performance.test.ts)\n\n`;
  md += `| Hook | Database | Avg (µs) | p95 (µs) | p99 (µs) | Efficiency |\n`;
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
      if (dbConf.useRedis) continue; // Skip redis for the primary middleware table
      const key = `${dbConf.type}-memory`;
      const hist = history.runs[key] || [];
      const curr = results.find((r) => r.db === dbConf.type) || hist[0];
      const m = curr?.metrics?.[`hook-${hook}`];

      if (m) {
        const avg = (m.avgMs * 1000).toFixed(2);
        const p95 = (m.p95Ms * 1000).toFixed(2);
        const p99 = (m.p99Ms * 1000).toFixed(2);
        const icon = Number(avg) < 5 ? "🚀" : "⚡";
        md += `| ${first ? `**${hook}**` : "---"} | ${dbConf.type.toUpperCase()} | ${avg} | ${p95} | ${p99} | ${icon} |\n`;
        first = false;
      }
    }
    md += `| --- | --- | --- | --- | --- | --- |\n`;
  }
  md += `\n`;

  // 4. Bottleneck Analysis
  md += `### 🚨 Bottleneck Analysis (Latency Distribution)\n`;
  md += `> **Insight**: Identifies whether the API layer (serialization/routing) or the DB Adapter layer is the primary performance contributor.\n\n`;

  for (const dbConf of ALL_DATABASES) {
    if (dbConf.useRedis) continue;
    const m = latestMetrics[dbConf.type];
    if (m && m.collections > 0) {
      const total = m.collections;
      const dbPct = Math.round((m.dbRaw / total) * 100);
      const restPct = 100 - dbPct;
      const dominance = restPct > dbPct ? "REST dominates" : "DB Layer dominates";
      md += `📌 **${dbConf.type.toUpperCase()}** — ${dominance} (${restPct}% REST vs ${dbPct}% DB)\n`;
    }
  }
  md += `\n`;

  // 4. Cache Efficacy (Redis Comparison)
  md += `### ⚡ CACHE STRATEGY PERFORMANCE (REDIS VS IN-MEMORY)\n`;
  md += `> **Why it matters**: Demonstrates the overhead of network L2 cache (Redis) vs local L1 cache (In-Memory).\n\n`;
  md += `| Strategy | Avg Latency | p95 Latency | Throughput |\n`;
  md += `|----------|-------------|-------------|------------|\n`;

  const sqlite = results.find((r) => r.db === "sqlite") || history.runs["sqlite-memory"]?.[0];
  const redis =
    results.find((r) => r.db === "sqlite" && r.metrics?.["USE_REDIS"] === "true") ||
    history.runs["sqlite-redis-memory"]?.[0];

  if (sqlite?.metrics?.["hook-pipeline"]) {
    const m = sqlite.metrics["hook-pipeline"];
    md += `| **L1 (In-Memory)** | ${(m.avgMs * 1000).toFixed(2)}µs | ${(m.p95Ms * 1000).toFixed(2)}µs | ${m.rps.toFixed(0)} |\n`;
  }
  if (redis?.metrics?.["hook-pipeline"]) {
    const m = redis.metrics["hook-pipeline"];
    md += `| **L2 (Redis)** | ${(m.avgMs * 1000).toFixed(2)}µs | ${(m.p95Ms * 1000).toFixed(2)}µs | ${m.rps.toFixed(0)} |\n`;
  }
  md += `\n`;

  md += `\n### 📖 Benchmark Glossary\n\n`;
  md += `| Test Label | File Path | Description |\n`;
  md += `|------------|-----------|-------------|\n`;
  for (const s of BENCHMARK_SCRIPTS) {
    md += `| **${s.label}** | \`${s.path}\` | ${s.desc} |\n`;
  }

  let doc = await fs.readFile(BENCHMARKS_DOC, "utf8").catch(() => "");
  const startM = "<!-- BENCHMARK_START -->";
  const endM = "<!-- BENCHMARK_END -->";

  // Update the static Hardware Comparison with current data
  const intelData = latestMetrics["sqlite"] || latestMetrics["mongodb"] || {};
  const hwTableRegex =
    /\| \*\*Internal Latency\*\*  \| 0\.13 ms                                \| \*\*.*\*\*  \| \*\*.*\*\*    \|/;
  if (hwTableRegex.test(doc) && intelData.hooks) {
    const hooks = intelData.hooks.toFixed(2);
    const read = intelData.dbRaw.toFixed(3);
    doc = doc.replace(
      /\| \*\*Internal Latency\*\*  \| 0\.13 ms                                \| \*\*.*\*\*  \| \*\*.*\*\*    \|/,
      `| **Internal Latency**  | 0.13 ms                                | **${hooks} ms**  | **~${Math.round(((0.13 - intelData.hooks) / 0.13) * 100)}%** |`,
    );
    doc = doc.replace(
      /\| \*\*Raw DB Read\*\*       \| 0\.94 ms                                \| \*\*.*\*\*  \| \*\*.*\*\*    \|/,
      `| **Raw DB Read**       | 0.94 ms                                | **${read} ms**  | **~${Math.round(((0.94 - intelData.dbRaw) / 0.94) * 100)}%** |`,
    );
  }

  const content = `${startM}\n\n${md}\n\n${endM}`;
  if (doc.includes(startM) && doc.includes(endM)) {
    doc = doc.slice(0, doc.indexOf(startM)) + content + doc.slice(doc.indexOf(endM) + endM.length);
  } else doc = content + "\n---\n" + doc;

  await fs.writeFile(BENCHMARKS_DOC, doc);
  log.success("Benchmarks synchronized to documentation.");
}

// ─────────────────────────────────────────────────────────────
// Main Loop
// ─────────────────────────────────────────────────────────────

async function main() {
  const skipBuild = process.argv.includes("--no-build");
  const dbArg = process.argv.find((a) => a.startsWith("--db="))?.split("=")[1];
  const targetTypes = dbArg
    ? dbArg
        .split(",")
        .map((s) => (s.trim().toLowerCase() === "sql" ? "sqlite" : s.trim().toLowerCase()))
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

  const results: BenchmarkResult[] = [];
  await fs.mkdir(ROOT_RESULTS_DIR, { recursive: true });

  for (const dbType of TARGET_DB_ORDER) {
    // Correctly find redis vs non-redis variants
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

      // PRE-CHECK: Ensure database exists (self-healing)
      await ensureDatabaseExists(db);

      // RESET: Wipe SQLite file specifically to ensure clean seeding
      if (db.type === "sqlite") {
        const sqliteFile = path.join(process.cwd(), "config/database", `${DB_NAME}.sqlite`);
        await fs.rm(sqliteFile, { force: true }).catch(() => {});
        log.info(`Cleaned SQLite file: ${sqliteFile}`);
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

      const setupOk = runTask("Seeding System", `bun run scripts/setup-system.ts`, env);
      if (!setupOk) throw new Error("Setup System failed");

      const relationalSetupOk = runTask(
        "Seeding Relational Data",
        `bun run scripts/setup-benchmarks.ts`,
        env,
      );
      if (!relationalSetupOk) throw new Error("Relational Setup failed");

      log.info("Settling database engine (2s)...");
      await new Promise((r) => setTimeout(r, 2000));

      log.info("Restarting server for clean benchmark...");
      await stopServer();
      await startServer(db);

      for (const s of BENCHMARK_SCRIPTS) {
        const testOk = runTask(`Benchmark: ${s.label}`, `bun test ${s.path}`, env);
        if (!testOk) throw new Error(`${s.label} failed`);
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

      const resultDBName = db.useRedis ? `${db.type}-redis` : db.type;
      results.push({ db: resultDBName, status: "SUCCESS", coldStartMs, version, metrics });
    } catch (e: any) {
      log.error(`${db.label || db.type} suite failed: ${e.message}`);
      const resultDBName = db.useRedis ? `${db.type}-redis` : db.type;
      results.push({ db: resultDBName, status: "FAILED", error: e.message });
      // FAIL-FAST: Exit loop on first database error
      log.error("FAIL-FAST: Stopping matrix due to error.");
      break;
    }
  }

  await generateFinalReport(results);
  await stopServer();
  log.success("Audit Complete.");
}

main().catch(console.error);
