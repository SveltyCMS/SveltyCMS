/**
 * @file scripts\benchmark-matrix\reporting.ts
 * @description Reporting utility for the benchmark matrix tool.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { version as pkgVersion } from "../../package.json";
import { log } from "./logger";
import {
  PERFORMANCE_BUDGET,
  DB_METADATA,
  ALL_DATABASES,
  BENCHMARK_SCRIPTS,
  ROOT_RESULTS_DIR,
  BENCHMARKS_DOC,
  CI_SUMMARY_FILE,
} from "./config";
import { extractMetrics, getTrendDetails } from "./utils";
import type { BenchmarkResult, RunConfig } from "./types";

export function printSummaryTable(results: BenchmarkResult[]) {
  console.log("\n\x1b[1m\x1b[38;5;208m━━━ AUDIT SUMMARY ━━━\x1b[0m\n");

  const COL = [22, 12, 12, 10, 10, 8, 7];
  const hdr = ["Database", "Cold Start", "REST p95", "GQL Avg", "Heap ΔMB", "Budget", "Status"]
    .map((h, i) => h.padEnd(COL[i]))
    .join("  ");
  console.log(`\x1b[90m${hdr}\x1b[0m`);
  console.log(`\x1b[90m${"─".repeat(hdr.length)}\x1b[0m`);

  for (const res of results) {
    const meta = (DB_METADATA as any)[res.db] ?? {
      icon: "❓",
      label: res.db.toUpperCase(),
      color: "\x1b[37m",
    };
    const m = extractMetrics(res.metrics ?? {}, res.db.replace("-redis", ""));
    const violations = res.budgetViolations ?? [];

    const budgetCell =
      violations.length === 0 ? "\x1b[32m✓ OK\x1b[0m" : `\x1b[31m✗ ${violations.length}\x1b[0m`;
    const statusCell = res.status === "SUCCESS" ? "\x1b[32m✅\x1b[0m" : "\x1b[31m❌\x1b[0m";

    const row = [
      `${meta.icon} ${meta.label}`.padEnd(COL[0]),
      `${res.coldStartMs ?? 0}ms`.padEnd(COL[1]),
      `${m.collections.toFixed(2)}ms`.padEnd(COL[2]),
      `${m.graphqlAvg.toFixed(2)}ms`.padEnd(COL[3]),
      `${m.memGrowth.toFixed(1)}`.padEnd(COL[4]),
      budgetCell.padEnd(COL[5] + 10),
      statusCell,
    ].join("  ");
    console.log(`${meta.color}${row}\x1b[0m`);

    if (violations.length > 0) {
      for (const v of violations) console.log(`\x1b[33m    ⚠ ${v}\x1b[0m`);
    }
    if (res.error) console.log(`\x1b[31m    ✗ ${res.error}\x1b[0m`);
  }

  console.log("\n\x1b[1m\x1b[38;5;208m━━━ BENCHMARK DETAIL ━━━\x1b[0m\n");

  const runDbs = results.filter((r) => r.status === "SUCCESS");
  if (runDbs.length === 0) return;

  const BENCH_COL = 28;
  const VAL_COL = 16;
  const headerCells = [
    "Benchmark".padEnd(BENCH_COL),
    ...runDbs.map((r) => r.db.toUpperCase().padEnd(VAL_COL)),
  ];
  console.log(`\x1b[90m${headerCells.join("  ")}\x1b[0m`);
  console.log(`\x1b[90m${"─".repeat(BENCH_COL + runDbs.length * (VAL_COL + 2))}\x1b[0m`);

  const METRIC_ROWS: Array<{
    label: string;
    key: keyof ReturnType<typeof extractMetrics>;
    unit: string;
  }> = [
    { label: "Hooks p95", key: "hooks", unit: "ms" },
    { label: "DB raw read", key: "dbRaw", unit: "ms" },
    { label: "ACID commit", key: "txCommit", unit: "ms" },
    { label: "REST avg", key: "restAvg", unit: "ms" },
    { label: "REST p95", key: "collections", unit: "ms" },
    { label: "REST RPS", key: "restRps", unit: "req/s" },
    { label: "GraphQL avg", key: "graphqlAvg", unit: "ms" },
    { label: "GraphQL RPS", key: "gqlRps", unit: "req/s" },
    { label: "Auth avg", key: "authAvg", unit: "ms" },
    { label: "Security p95", key: "securityMs", unit: "ms" },
    { label: "OpenAPI cache-hit", key: "openapiHit", unit: "ms" },
    { label: "Realtime broadcast", key: "realtimeLatency", unit: "ms" },
    { label: "Widget avg", key: "widgetAvg", unit: "ms" },
    { label: "Media avg", key: "mediaAvg", unit: "ms" },
    { label: "Relational avg", key: "relationalAvg", unit: "ms" },
    { label: "Tenancy avg", key: "tenancyAvg", unit: "ms" },
    { label: "Mixed workload avg", key: "mixedAvg", unit: "ms" },
    { label: "Heap growth", key: "memGrowth", unit: "MB" },
    { label: "Build duration", key: "buildDuration", unit: "ms" },
  ];

  const SECTIONS: Record<string, string[]> = {
    Internals: ["Hooks p95", "DB raw read", "ACID commit"],
    REST: ["REST avg", "REST p95", "REST RPS"],
    GraphQL: ["GraphQL avg", "GraphQL RPS"],
    "Auth/Security": ["Auth avg", "Security p95", "OpenAPI cache-hit"],
    Realtime: ["Realtime broadcast"],
    Logic: ["Widget avg", "Media avg", "Relational avg"],
    Scale: ["Tenancy avg", "Mixed workload avg"],
    System: ["Heap growth", "Build duration"],
  };

  for (const [section, labels] of Object.entries(SECTIONS)) {
    const rows = METRIC_ROWS.filter((r) => labels.includes(r.label));
    const hasData = rows.some((r) =>
      runDbs.some((db) => {
        const m = extractMetrics(db.metrics ?? {}, db.db.replace("-redis", ""));
        return (m[r.key] as number) > 0;
      }),
    );
    if (!hasData) continue;

    console.log(`\n\x1b[33m  ${section}\x1b[0m`);

    for (const row of rows) {
      const cells = runDbs.map((db) => {
        const m = extractMetrics(db.metrics ?? {}, db.db.replace("-redis", ""));
        const val = m[row.key] as number;
        if (!val) return "\x1b[90m—\x1b[0m".padEnd(VAL_COL + 9);
        const budget = (PERFORMANCE_BUDGET as any)[row.key];
        const over = budget !== undefined && val > (budget as number);
        const color = over ? "\x1b[31m" : "\x1b[32m";
        const cell = `${val.toFixed(row.unit === "req/s" || row.unit === "count" ? 0 : 2)} ${row.unit}`;
        return `${color}${cell}\x1b[0m`.padEnd(VAL_COL + 9);
      });
      console.log(`  ${row.label.padEnd(BENCH_COL)}  ${cells.join("  ")}`);
    }
  }

  for (const res of results) {
    if (res.scriptTimings && Object.keys(res.scriptTimings).length > 0) {
      const meta = (DB_METADATA as any)[res.db] ?? {
        label: res.db.toUpperCase(),
        color: "\x1b[37m",
      };
      const timings = Object.entries(res.scriptTimings)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);
      console.log(`\n\x1b[90m  ${meta.label} — slowest scripts:\x1b[0m`);
      for (const [label, ms] of timings)
        console.log(`\x1b[90m    ${label.padEnd(20)} ${(ms / 1000).toFixed(1)}s\x1b[0m`);
    }
  }
  console.log();
}

export async function writeCISummary(results: BenchmarkResult[], regressions: string[]) {
  const passed = results.filter((r) => r.status === "SUCCESS").length;
  const failed = results.filter((r) => r.status === "FAILED").length;
  const allViolations = results.flatMap((r) => r.budgetViolations ?? []);
  const overall = failed === 0 && regressions.length === 0 ? "PASS" : "FAIL";

  const summary = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    version: pkgVersion,
    overall,
    passed,
    failed,
    regressions,
    budgetViolations: allViolations,
    databases: results.map((r) => {
      const dbKey = r.db;
      const m = extractMetrics(r.metrics ?? {}, dbKey.replace("-redis", ""));
      return {
        db: r.db,
        status: r.status,
        coldStartMs: r.coldStartMs || 0,
        restP95Ms: m.collections,
        graphqlAvgMs: m.graphqlAvg,
        memGrowthMb: m.memGrowth,
        cpuLoadPct: m.systemCpu,
        violations: r.budgetViolations ?? [],
      };
    }),
    badge: {
      schemaVersion: 1,
      label: "benchmarks",
      message: failed === 0 ? `${passed}/${results.length} passed` : `${failed} failed`,
      color: overall === "PASS" ? "brightgreen" : "red",
    },
  };

  await fs.mkdir(path.dirname(CI_SUMMARY_FILE), { recursive: true });
  await fs.writeFile(CI_SUMMARY_FILE, JSON.stringify(summary, null, 2));
  log.success(`CI summary → ${CI_SUMMARY_FILE}`);

  // Ported from summary-to-markdown.ts: Write to GitHub Step Summary if available
  if (process.env.GITHUB_STEP_SUMMARY) {
    let md = `### 📊 SveltyCMS Audit 2.0 Summary\n\n`;
    md += `**Overall Status:** ${overall === "PASS" ? "✅ PASS" : "❌ FAIL"}\n`;
    md += `**Version:** ${pkgVersion} | **Generated:** ${summary.generatedAt}\n\n`;

    if (regressions.length > 0) {
      md += `#### ⚠️ Regressions Detected\n`;
      for (const r of regressions) md += `- ${r}\n`;
      md += "\n";
    }

    md += `| Database | Status | REST p95 | GQL Avg | Heap ΔMB | Budget |\n`;
    md += `|----------|--------|----------|---------|----------|--------|\n`;

    for (const db of summary.databases) {
      const budget = db.violations.length === 0 ? "✅" : `❌ ${db.violations.length}`;
      const status = db.status === "SUCCESS" ? "✅" : "❌";
      md += `| ${db.db.toUpperCase()} | ${status} | ${db.restP95Ms.toFixed(2)}ms | ${db.graphqlAvgMs.toFixed(2)}ms | ${db.memGrowthMb.toFixed(1)} | ${budget} |\n`;
    }

    if (allViolations.length > 0) {
      md += `\n#### 📑 Budget Violations\n`;
      for (const v of allViolations) md += `- ${v}\n`;
    }

    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, md);
    log.success("GitHub Step Summary updated.");
  }

  return summary as any;
}

/**
 * Builds the Mermaid chart section.
 */
function buildMermaidChart(db: any): string {
  let md = `\n### 📈 Latency Trends (last 5 runs)\n\n`;
  md += '```mermaid\nxychart-beta\n  title "Total Latency (ms)"\n';
  md += '  x-axis ["Run 1", "Run 2", "Run 3", "Run 4", "Run 5"]\n';
  md += '  y-axis "Latency (ms)"\n';
  for (const dbConf of ALL_DATABASES) {
    const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
    const hist = db
      .query(
        `SELECT collections_p95 FROM runs WHERE db_key = ? AND status = 'SUCCESS' ORDER BY timestamp DESC LIMIT 5`,
      )
      .all(dbKey) as { collections_p95: number }[];
    const points = hist.map((run) => run.collections_p95.toFixed(1)).reverse();
    if (points.length > 0) {
      md += `  line "${(dbConf.label ?? dbConf.type).toUpperCase()}" : [${points.join(", ")}]\n`;
    }
  }
  md += "```\n";
  return md;
}

/**
 * Builds the component performance comparison sections.
 */
function buildComponentPerformance(
  latestMetrics: Record<string, any>,
  results: BenchmarkResult[],
): string {
  let md = `\n## 🧩 Component Performance Comparison\n`;

  md += `\n### 📡 REST API Performance Matrix\n`;
  md += `| Adapter | Avg Latency | p95 Latency | RPS |\n`;
  md += `|---------|-------------|-------------|-----|\n`;
  for (const dbConf of ALL_DATABASES) {
    const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
    const m = latestMetrics[dbKey];
    if (m?.collections) {
      const histMark = !results.find((r) => r.db === dbKey) ? " (Hist)" : "";
      md += `| ${(dbConf.label ?? dbConf.type).toUpperCase()}${histMark} | ${m.restAvg.toFixed(2)}ms | ${m.collections.toFixed(2)}ms | ${m.restRps.toFixed(0)} |\n`;
    }
  }

  md += `\n### 🕸️ GraphQL API Highlights\n`;
  md += `| Adapter | Avg Latency | Throughput | Complexity Status |\n`;
  md += `|---------|-------------|------------|-------------------|\n`;
  for (const dbConf of ALL_DATABASES) {
    const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
    const m = latestMetrics[dbKey];
    if (m?.graphqlAvg) {
      const histMark = !results.find((r) => r.db === dbKey) ? " (Hist)" : "";
      md += `| ${(dbConf.label ?? dbConf.type).toUpperCase()}${histMark} | ${m.graphqlAvg.toFixed(2)}ms | ${m.gqlRps.toFixed(0)} req/s | 🟢 Optimizing |\n`;
    }
  }

  md += `\n### 🔐 Auth & RBAC Performance\n`;
  md += `| Adapter | Avg Latency | Security Overhead | Throughput |\n`;
  md += `|---------|-------------|-------------------|------------|\n`;
  for (const dbConf of ALL_DATABASES) {
    const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
    const m = latestMetrics[dbKey];
    if (m?.authAvg) {
      const histMark = !results.find((r) => r.db === dbKey) ? " (Hist)" : "";
      md += `| ${(dbConf.label ?? dbConf.type).toUpperCase()}${histMark} | ${m.authAvg.toFixed(2)}ms | ${m.securityMs.toFixed(2)}ms | ${m.authRps.toFixed(0)} |\n`;
    }
  }
  return md;
}

/**
 * Builds the database comparison table for the report.
 */
async function buildDatabaseComparisonTable(
  db: any,
  results: BenchmarkResult[],
  latestMetrics: Record<string, any>,
  regressions: string[],
): Promise<string> {
  let md = `| Database | Cold Start | REST p95 | GraphQL Avg | CPU Load | Heap Growth | Budget | Status |\n`;
  md += `|----------|------------|----------|-------------|----------|-------------|--------|--------|\n`;

  for (const dbConf of ALL_DATABASES) {
    const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
    const curr = results.find((r) => r.db === dbKey);

    let displayMetrics: ReturnType<typeof extractMetrics>;
    let displayColdStart: number;
    let displayStatus: string;
    let historical = false;

    if (curr) {
      displayMetrics = latestMetrics[dbKey];
      displayColdStart = curr.coldStartMs || 0;
      displayStatus = curr.status;
    } else {
      const last = db
        .query(
          `SELECT * FROM runs WHERE db_key = ? AND status = 'SUCCESS' ORDER BY timestamp DESC LIMIT 1`,
        )
        .get(dbKey) as any;
      if (!last) continue;
      displayMetrics = extractMetrics(JSON.parse(last.metrics_json), dbConf.type);
      displayColdStart = last.cold_start_ms;
      displayStatus = last.status;
      historical = true;
      latestMetrics[dbKey] = displayMetrics;
    }

    const dbMeta = (DB_METADATA as any)[dbKey] ?? {
      icon: "❓",
      label: dbKey.toUpperCase(),
    };

    const coldTrend = await getTrendDetails(db, dbKey, displayColdStart, "cold_start_ms");
    const restTrend = await getTrendDetails(
      db,
      dbKey,
      displayMetrics.restAvg || displayMetrics.collections,
      "collections_p95",
    );
    const gqlTrend = await getTrendDetails(db, dbKey, displayMetrics.graphqlAvg, "graphql_avg");
    const memTrend = await getTrendDetails(db, dbKey, displayMetrics.memGrowth, "mem_growth");

    if (
      !historical &&
      (coldTrend.isRegression || restTrend.isRegression || gqlTrend.isRegression)
    ) {
      regressions.push((dbConf.label ?? dbConf.type).toUpperCase());
    }

    const violations = curr?.budgetViolations ?? [];
    const budgetCell = violations.length === 0 ? "✅" : `⚠️ ${violations.length}`;
    const statusIcon = displayStatus === "SUCCESS" ? "✅" : historical ? "📜" : "❌";
    const historicalTag = historical ? " *(Hist)*" : "";

    const formatMetric = (val: number, trend: any, precision = 2) => {
      if (val === 0 && (displayStatus === "FAILED" || displayStatus === "PENDING")) {
        return "N/A";
      }
      return `${val.toFixed(precision)}ms ${trend.icon}(${trend.pct})`;
    };

    md += `| **${dbMeta.icon} ${dbMeta.label}** | `;
    md += `${displayColdStart ? displayColdStart + "ms" : "N/A"} ${coldTrend.icon}(${coldTrend.pct}) | `;
    md += `${formatMetric(displayMetrics.restAvg || displayMetrics.collections, restTrend)} | `;
    md += `${formatMetric(displayMetrics.graphqlAvg, gqlTrend)} | `;
    md += `${displayMetrics.systemCpu > 0 ? displayMetrics.systemCpu.toFixed(1) + "%" : "—"} | `;
    md += `${displayMetrics.memGrowth > 0 ? displayMetrics.memGrowth.toFixed(1) + " MB" : "0.0 MB"} ${memTrend.icon} | `;
    md += `${budgetCell} | `;
    md += `${statusIcon}${historicalTag} |\n`;
  }
  return md;
}

/**
 * Orchestrates the final report generation.
 */
export async function generateFinalReport(
  results: BenchmarkResult[],
  _cfg: RunConfig,
): Promise<string[]> {
  const now = new Date().toISOString();

  const { Database } = await import("bun:sqlite");
  const sqliteHistoryFile = path.join(ROOT_RESULTS_DIR, "history.sqlite");
  const db = new Database(sqliteHistoryFile);

  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        db_key TEXT,
        status TEXT,
        cold_start_ms REAL,
        collections_p95 REAL,
        graphql_avg REAL,
        mem_growth REAL,
        cpu_load REAL,
        metrics_json TEXT
      )
    `);

    const regressions: string[] = [];
    const latestMetrics: Record<string, ReturnType<typeof extractMetrics>> = {};

    const insert = db.prepare(`
      INSERT INTO runs (timestamp, db_key, status, cold_start_ms, collections_p95, graphql_avg, mem_growth, cpu_load, metrics_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const res of results) {
      const dbKey = res.db;
      const m = extractMetrics(res.metrics, dbKey.replace("-redis", ""));
      latestMetrics[dbKey] = m;

      insert.run(
        now,
        dbKey,
        res.status,
        res.coldStartMs || 0,
        m.collections,
        m.graphqlAvg,
        m.memGrowth,
        m.systemCpu,
        JSON.stringify(res.metrics),
      );
    }

    let md = `## 📊 SveltyCMS Enterprise Benchmark Matrix — ${new Date().toLocaleString()}\n\n`;
    md += `**Version:** ${pkgVersion} | **Generated:** ${now}\n\n`;

    md += `### 🧪 Benchmarks Included\n\n`;
    for (const s of BENCHMARK_SCRIPTS)
      md += `- **${s.label}** (L${s.level} · ${s.section}) — ${s.desc}\n`;
    md += "\n";

    md += await buildDatabaseComparisonTable(db, results, latestMetrics, regressions);

    if (regressions.length > 0) {
      md += `\n> [!CAUTION]\n> **Regressions detected in**: ${regressions.join(", ")}\n`;
    }

    md += `\n### 🏢 Multi-Tenancy Scaling\n`;
    md += `| Adapter | Tenancy Avg | Mem Growth | Status |\n`;
    md += `|---------|-------------|------------|--------|\n`;
    for (const dbConf of ALL_DATABASES) {
      const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
      const m = latestMetrics[dbKey];
      if (m?.tenancyAvg) {
        const histMark = !results.find((r) => r.db === dbKey) ? " *(Hist)*" : "";
        md += `| ${dbConf.label ?? dbConf.type}${histMark} | ${m.tenancyAvg.toFixed(1)}ms | ${m.memGrowth.toFixed(1)}MB | ${m.memGrowth < 40 ? "🟢 Stable" : "🟡 Growing"} |\n`;
      }
    }

    md += `\n### 🌀 Mixed Workload\n`;
    md += `| Adapter | Avg Latency | Status |\n`;
    md += `|---------|-------------|--------|\n`;
    for (const dbConf of ALL_DATABASES) {
      const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
      const m = latestMetrics[dbKey];
      if (m?.mixedAvg) {
        const histMark = !results.find((r) => r.db === dbKey) ? " *(Hist)*" : "";
        md += `| ${dbConf.label ?? dbConf.type}${histMark} | ${m.mixedAvg.toFixed(2)}ms | ✅ Pass |\n`;
      }
    }

    md += `\n### 🧠 Memory Stability\n`;
    md += `| Adapter | Heap Growth | Status |\n`;
    md += `|---------|-------------|--------|\n`;
    for (const dbConf of ALL_DATABASES) {
      const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
      const m = latestMetrics[dbKey];
      if (m && m.memGrowth !== undefined) {
        const histMark = !results.find((r) => r.db === dbKey) ? " *(Hist)*" : "";
        md += `| ${dbConf.label ?? dbConf.type}${histMark} | ${m.memGrowth.toFixed(1)} MB | ${m.memGrowth < 40 ? "🟢 Stable" : "🟡 Growing"} |\n`;
      }
    }

    md += buildMermaidChart(db);

    const lastRunRow = db
      .query(
        `SELECT metrics_json FROM runs WHERE status = 'SUCCESS' ORDER BY timestamp DESC LIMIT 1`,
      )
      .get() as { metrics_json: string } | null;
    const host =
      results[0]?.hostInfo || (lastRunRow ? JSON.parse(lastRunRow.metrics_json).hostInfo : null);
    if (host) {
      md += `\n### 🖥️ Host Environment\n`;
      md += `| CPU | Cores | RAM | OS | Runtime |\n`;
      md += `|-----|-------|-----|----|---------|\n`;
      md += `| ${host.cpu} | ${host.cores} | ${host.ram} | ${host.os} (${host.arch}) | ${host.runtime} |\n\n`;
    }

    md += buildComponentPerformance(latestMetrics, results);

    md += `\n### ⚙️ Internals & Middleware\n`;
    md += `| Adapter | Hooks p95 | DB Raw | ACID Commit |\n`;
    md += `|---------|-----------|--------|-------------|\n`;
    for (const dbConf of ALL_DATABASES) {
      const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
      const m = latestMetrics[dbKey];
      if (m?.hooks || m?.dbRaw) {
        const res = results.find((r) => r.db === dbKey);
        const isFailed = res ? res.status === "FAILED" : false;
        const histMark = !res ? " (Hist)" : "";

        const formatMetric = (val: number, precision = 2) => {
          if (val === 0 && (isFailed || !m)) return "N/A";
          return `${val.toFixed(precision)}ms`;
        };

        md += `| ${(dbConf.label ?? dbConf.type).toUpperCase()}${histMark} | ${formatMetric(m.hooks, 3)} | ${formatMetric(m.dbRaw)} | ${formatMetric(m.txCommit)} |\n`;
      }
    }

    md += `\n### 🧩 Widget & Media Logic\n`;
    md += `| Adapter | Widget Avg | Media Avg | Relational Avg |\n`;
    md += `|---------|------------|-----------|----------------|\n`;
    for (const dbConf of ALL_DATABASES) {
      const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
      const m = latestMetrics[dbKey];
      if (m?.widgetAvg || m?.mediaAvg) {
        const res = results.find((r) => r.db === dbKey);
        const isFailed = res ? res.status === "FAILED" : false;
        const histMark = !res ? " (Hist)" : "";

        const formatMetric = (val: number, precision = 2) => {
          if (val === 0 && (isFailed || !m)) return "N/A";
          return `${val.toFixed(precision)}ms`;
        };

        md += `| ${(dbConf.label ?? dbConf.type).toUpperCase()}${histMark} | ${formatMetric(m.widgetAvg)} | ${formatMetric(m.mediaAvg)} | ${formatMetric(m.relationalAvg)} |\n`;
      }
    }

    md += `\n### 🛠️ Self-Healing & DX\n`;
    md += `| Adapter | Content Scan | Build Duration | Bundle Size |\n`;
    md += `|---------|--------------|----------------|-------------|\n`;
    for (const dbConf of ALL_DATABASES) {
      const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
      const m = latestMetrics[dbKey];
      if (m?.scanAvg || m?.buildDuration) {
        const res = results.find((r) => r.db === dbKey);
        const isFailed = res ? res.status === "FAILED" : false;
        const histMark = !res ? " (Hist)" : "";

        const formatMetric = (val: number, precision = 2, unit = "ms") => {
          if (val === 0 && (isFailed || !m)) return "N/A";
          return unit === "s" ? `${(val / 1000).toFixed(1)}s` : `${val.toFixed(precision)}${unit}`;
        };

        md += `| ${(dbConf.label ?? dbConf.type).toUpperCase()}${histMark} | ${formatMetric(m.scanAvg)} | ${formatMetric(m.buildDuration, 1, "s")} | ${formatMetric(m.bundleSize, 2, "MB")} |\n`;
      }
    }

    const allViolations = results.flatMap((r) =>
      (r.budgetViolations ?? []).map((v) => `**${r.db}**: ${v}`),
    );
    if (allViolations.length > 0) {
      md += `\n### ⚠️ Performance Budget Violations\n\n`;
      for (const v of allViolations) md += `- ${v}\n`;
      md += "\n";
    }

    let doc = await fs.readFile(BENCHMARKS_DOC, "utf8").catch(() => "");
    const START = "<!-- BENCHMARK_START -->";
    const END = "<!-- BENCHMARK_END -->";
    const block = `${START}\n\n${md}\n\n${END}`;
    doc =
      doc.includes(START) && doc.includes(END)
        ? doc.replace(/<!-- BENCHMARK_START -->[\s\S]*?<!-- BENCHMARK_END -->/, block)
        : block + "\n\n" + doc;
    await fs.writeFile(BENCHMARKS_DOC, doc);
    log.success("Enterprise Benchmark Matrix written to documentation.");

    return regressions;
  } finally {
    db.close();
  }
}
