/**
 * @file scripts\benchmark-matrix\reporting.ts
 * @description Reporting utility for the benchmark matrix tool.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { version as pkgVersion } from "../../package.json";
import { log } from "./logger";
import {
  DB_METADATA,
  ALL_DATABASES,
  BENCHMARK_SCRIPTS,
  ROOT_RESULTS_DIR,
  CI_SUMMARY_FILE,
  PERFORMANCE_BUDGET,
} from "./config";
import { extractMetrics, getTrendDetails } from "./utils";
import type { BenchmarkResult, RunConfig } from "./types";
import { Project, SyntaxKind, type ObjectLiteralExpression, type SourceFile } from "ts-morph";
import { collectHostInfo } from "./cli";

// ✨ Memoized AST Project to prevent heap churn
let memoizedProject: Project | null = null;
let memoizedSourceFile: SourceFile | null = null;

/**
 * 📂 Robust recursive file discovery helper.
 */
async function findFilesRecursive(dir: string, pattern: RegExp): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await findFilesRecursive(fullPath, pattern)));
      } else if (pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Skip if directory missing or inaccessible
  }
  return results;
}

function getASTProject() {
  if (!memoizedProject) {
    memoizedProject = new Project();
    const sourceFilePath = path.resolve(
      process.cwd(),
      "scripts/benchmark-matrix/benchmark-scripts.ts",
    );
    memoizedSourceFile = memoizedProject.addSourceFileAtPath(sourceFilePath);
  }
  return { project: memoizedProject, sourceFile: memoizedSourceFile! };
}

/**
 * Persists benchmark script metadata (lastRun) using AST.
 */
export async function persistScriptMetadataAST(
  scriptPath: string,
  timestamp: string,
  dbKey?: string, // NEW: optional per-database context
  force = false,
) {
  if (!force && !process.env.UPDATE_BENCHMARK_METADATA) {
    // Only update when explicitly requested (e.g. full suite or --update-metadata flag)
    return;
  }

  try {
    const { sourceFile } = getASTProject();

    const scriptsArray = sourceFile
      .getVariableDeclaration("BENCHMARK_SCRIPTS")
      ?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);

    if (!scriptsArray) return;

    let updated = false;

    for (const element of scriptsArray.getElements()) {
      if (element.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;

      const obj = element as ObjectLiteralExpression;
      const pathProp = obj.getProperty("path")?.asKind(SyntaxKind.PropertyAssignment);
      const pathValue = pathProp?.getInitializer()?.getText().replace(/['"]/g, "");

      if (pathValue === scriptPath) {
        let lastRunProp = obj.getProperty("lastRun")?.asKind(SyntaxKind.PropertyAssignment);

        if (lastRunProp) {
          lastRunProp.setInitializer(`"${timestamp}"`);
        } else {
          obj.addPropertyAssignment({
            name: "lastRun",
            initializer: `"${timestamp}"`,
          });
        }

        // Optional: store per-database last run
        if (dbKey) {
          const dbLastRunProp = obj
            .getProperty(`lastRun_${dbKey}`)
            ?.asKind(SyntaxKind.PropertyAssignment);
          if (dbLastRunProp) {
            dbLastRunProp.setInitializer(`"${timestamp}"`);
          } else {
            obj.addPropertyAssignment({
              name: `lastRun_${dbKey}`,
              initializer: `"${timestamp}"`,
            });
          }
        }

        updated = true;
        log.info(`Updated lastRun for ${scriptPath}${dbKey ? ` (${dbKey})` : ""}`);
        break; // Only update the matching script
      }
    }

    if (updated) {
      await sourceFile.save();
    }
  } catch (err: any) {
    log.warn(`AST update failed: ${err.message}`);
  }
}

/**
 * Updates individual database reports incrementally.
 * Optimization: Only updates terminal summary during the loop.
 * Full MDX generation is now moved to finalizeDatabaseAudit.
 */
export async function updateIncrementalReport(results: BenchmarkResult[]) {
  // We keep this lightweight for the loop.
  // It just ensures the results array is ready for printSummaryTable.
  // The actual disk I/O for MDX is now handled in generateFinalReport.
  return results;
}

/**
 * 📊 Prints a professional ASCII summary table to the console.
 */
export function printSummaryTable(results: BenchmarkResult[]) {
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
      `${res.coldStartMs ?? "—"}ms`.padEnd(COL[1]),
      `${m.collections > 0 ? m.collections.toFixed(2) + "ms" : "FAILED"}`.padEnd(COL[2]),
      `${m.graphqlAvg > 0 ? m.graphqlAvg.toFixed(2) + "ms" : "FAILED"}`.padEnd(COL[3]),
      `${m.memGrowth > 0 ? m.memGrowth.toFixed(1) : "—"}`.padEnd(COL[4]),
      budgetCell.padEnd(COL[5] + 10),
      statusCell,
    ].join("  ");
    console.log(`${meta.color}${row}\x1b[0m`);

    if (violations.length > 0) {
      for (const v of violations) console.log(`\x1b[33m    ⚠ ${v}\x1b[0m`);
    }
    if (res.error) console.log(`\x1b[31m    ✗ ${res.error}\x1b[0m`);
  }
}

/**
 * 🚀 Reconstructs high-fidelity ASCII tables for MDX.
 */
function buildAsciiTable(title: string, subtitle: string, scenarios: any[]): string {
  const SC_COL = 30;
  const AVG_COL = 14;
  const P95_COL = 14;
  const RPS_COL = 14;
  const W = 2 + SC_COL + 3 + AVG_COL + 3 + P95_COL + 3 + RPS_COL + 2;

  const bar = (l: string, _m: string, r: string) => l + "═".repeat(W - 2).replace(/ /g, "═") + r;
  const row = (sc: string, avg: string, p95: string, rps: string) =>
    `║ ${sc.padEnd(SC_COL)} │ ${avg.padEnd(AVG_COL)} │ ${p95.padEnd(P95_COL)} │ ${rps.padEnd(RPS_COL)} ║`;

  let md = "```text\n";
  md += bar("╔", "═", "╗") + "\n";

  // Center Title
  const titlePad = Math.max(0, Math.floor((W - 2 - title.length) / 2));
  md += "║" + " ".repeat(titlePad) + title + " ".repeat(W - 2 - title.length - titlePad) + "║\n";

  // Center Subtitle
  const subPad = Math.max(0, Math.floor((W - 2 - subtitle.length) / 2));
  md += "║" + " ".repeat(subPad) + subtitle + " ".repeat(W - 2 - subtitle.length - subPad) + "║\n";

  md += bar("╠", "═", "╣") + "\n";
  md += row("Scenario", "Avg latency", "p95", "RPS") + "\n";
  md += bar("╠", "═", "╣") + "\n";

  for (const s of scenarios) {
    const isMs = !s.name.toLowerCase().includes("size") && !s.name.toLowerCase().includes("count");
    const suffix = isMs ? " ms" : "";
    md +=
      row(
        s.name,
        `${s.avgMs.toFixed(3)}${suffix}`,
        `${s.p95Ms.toFixed(3)}${suffix}`,
        Math.round(s.rps).toLocaleString(),
      ) + "\n";
  }

  md += bar("╚", "═", "╝") + "\n";
  md += "```\n";
  return md;
}

/**
 * Surgical SQL-based trend extractor for individual scripts.
 */
async function getScriptTrend(
  db: any,
  dbKey: string,
  scriptShortLabel: string,
  currentVal: number = 0,
) {
  if (!currentVal) return { icon: "⚪", pct: "—", isRegression: false };

  try {
    const row = db
      .query(
        `
        SELECT AVG(p95Ms) as avg_val 
        FROM (
          SELECT json_extract(metrics_json, '$.' || ? || '.p95Ms') as p95Ms 
          FROM runs 
          WHERE db_key = ? AND status = 'SUCCESS' 
          ORDER BY timestamp DESC LIMIT 8
        )
      `,
      )
      .get(scriptShortLabel, dbKey) as { avg_val: number | null };

    if (!row?.avg_val) return { icon: "⚪", pct: "—", isRegression: false };

    const pct = ((currentVal - row.avg_val) / row.avg_val) * 100;
    const icon = pct < -3 ? "🟢" : pct > 8 ? "🔴" : "⚪";

    return {
      icon,
      pct: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
      isRegression: pct > 8,
    };
  } catch (e) {
    console.warn(`Trend failed for ${scriptShortLabel}:`, e);
    return { icon: "⚪", pct: "—", isRegression: false };
  }
}

/**
 * 🚀 Builds a detailed section for each of the 20 benchmarks.
 */
export async function buildFullAuditLedger(
  dbKey: string,
  results: BenchmarkResult[],
  db: any,
): Promise<string> {
  const res = results.find((r) => r.db === dbKey);
  let md = `\n## 🔬 Detailed Performance Ledger (20+ Modules)\n\n`;

  for (const script of BENCHMARK_SCRIPTS) {
    const isSql =
      dbKey.includes("sqlite") || dbKey.includes("postgres") || dbKey.includes("mariadb");
    const isApplicable =
      script.strategy === "all" ||
      (script.strategy === "sql" && isSql) ||
      (script.strategy === "once" && dbKey === "sqlite");

    if (!isApplicable) continue;

    // We show all applicable, even if pending
    md += `### 🏷️ ${script.label}\n`;
    md += `**Source:** [${script.path}](file:///${path.resolve(process.cwd(), script.path).replace(/\\/g, "/")}) | **Intensity:** \`${script.intensity}\`\n`;
    md += `**Proves:** ${script.desc}\n\n`;

    const timing = res?.scriptTimings?.[script.shortLabel];

    if (!timing) {
      md += `> ⏳ **Status**: Pending execution for this engine.\n\n`;
      continue;
    }

    const trend = await getScriptTrend(db, dbKey, script.shortLabel, timing);
    md = md.replace(`### 🏷️ ${script.label}`, `### 🏷️ ${script.label} ${trend.icon} ${trend.pct}`);

    // 1. Reconstruct Scenario Table
    // We extract scenarios from the metrics_json or direct result files
    // For simplicity here, we'll try to find any metrics that match the script name
    const scenarios: any[] = [];
    if (res?.metrics) {
      // Look for scenarios in the metrics map
      for (const [mKey, mVal] of Object.entries(res.metrics)) {
        if (
          mKey.toLowerCase().includes(script.shortLabel.toLowerCase()) ||
          (mVal as any).name?.includes(script.shortLabel)
        ) {
          if ((mVal as any).avgMs !== undefined) scenarios.push(mVal);
        }
      }
    }

    if (scenarios.length > 0) {
      md += buildAsciiTable(script.label.toUpperCase(), script.desc, scenarios);
    } else {
      md += `**Result:** ✅ **${timing.toFixed(3)}ms** (Script Total)\n\n`;
    }

    // 2. Trend Chart for this specific script
    const history = db
      .query(
        `
        SELECT timestamp, metrics_json FROM runs
        WHERE db_key = ? AND status = 'SUCCESS'
        ORDER BY timestamp DESC LIMIT 10
    `,
      )
      .all(dbKey) as any[];

    const trendPoints = history
      .map((h) => {
        const m = JSON.parse(h.metrics_json);
        const scriptMetric = Object.values(m).find(
          (v: any) => v.name === script.shortLabel || v.shortLabel === script.shortLabel,
        ) as any;
        return scriptMetric?.avgMs || m[script.shortLabel]?.avgMs || 0;
      })
      .filter((v) => v > 0)
      .reverse();

    if (trendPoints.length > 1) {
      md += `\n#### 📈 ${script.shortLabel} Trend\n`;
      md += `\`\`\`mermaid\nxychart-beta\n  title "${script.shortLabel} Latency Trend"\n  x-axis ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10"]\n  y-axis "Latency (ms)"\n  line "Latency" : [${trendPoints.map((p) => p.toFixed(2)).join(", ")}]\n\`\`\`\n\n`;
    }

    md += `---\n\n`;
  }

  return md;
}

/**
 * 🔒 Simple File System Lock to prevent concurrent MDX updates.
 */
async function acquireLock(lockName: string): Promise<boolean> {
  const lockDir = path.join(ROOT_RESULTS_DIR, `${lockName}.lock`);
  const maxRetries = 30;
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fs.mkdir(lockDir);
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

async function releaseLock(lockName: string) {
  const lockDir = path.join(ROOT_RESULTS_DIR, `${lockName}.lock`);
  await fs.rm(lockDir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Orchestrates the final report generation.
 */
export async function generateFinalReport(
  resultsIn: BenchmarkResult[] = [],
  _cfg?: RunConfig,
): Promise<string[]> {
  const results = resultsIn.length > 0 ? resultsIn : await scanResultsDirectory();
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
        host_info_json TEXT,
        metrics_json TEXT
      )
    `);

    const regressions: string[] = [];
    const latestMetrics: Record<string, ReturnType<typeof extractMetrics>> = {};

    const insert = db.prepare(`
      INSERT INTO runs (timestamp, db_key, status, cold_start_ms, collections_p95, graphql_avg, mem_growth, cpu_load, host_info_json, metrics_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const hostInfo = await collectHostInfo();
    for (const res of results) {
      if (!res.hostInfo) res.hostInfo = hostInfo;
      const dbKey = res.db;
      const m = extractMetrics(res.metrics || {}, dbKey.replace("-redis", ""));
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
        JSON.stringify(res.hostInfo || {}),
        JSON.stringify(res.metrics || {}),
      );
    }

    // 🚀 Update per-database specific technical ledgers
    const hasLock = await acquireLock("mdx_report");
    if (hasLock) {
      try {
        await updateDatabaseSpecificReports(db, results, latestMetrics);
        log.success("Enterprise Benchmark technical ledgers updated.");
      } finally {
        await releaseLock("mdx_report");
      }
    } else {
      log.warn("Could not acquire lock for MDX report. Skipping incremental update.");
    }

    return regressions;
  } finally {
    db.close();
  }
}

/**
 * 🚀 Generates/Updates database-specific detail pages with historical trends and placeholders.
 * Truly surgical: Preserves existing successful results in the MDX.
 */
async function updateDatabaseSpecificReports(
  db: any,
  results: BenchmarkResult[],
  latestMetrics: Record<string, any>,
) {
  const DOCS_DIR = path.join(process.cwd(), "docs/project/benchmarks");
  await fs.mkdir(DOCS_DIR, { recursive: true });

  for (const dbConf of ALL_DATABASES) {
    const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
    const meta = (DB_METADATA as any)[dbKey] || {
      label: dbKey.toUpperCase(),
      icon: "❓",
    };
    const filePath = path.join(DOCS_DIR, `benchmark_${dbKey.replace("-", "_")}.mdx`);

    let doc = await fs.readFile(filePath, "utf8").catch(() => "");
    if (!doc) {
      // ... initial template if file missing ...
      doc = `---
path: "docs/project/benchmarks/benchmark_${dbKey.replace("-", "_")}.mdx"
title: ${meta.label} Performance Audit
description: Enterprise performance trends for ${meta.label}.
order: 5
icon: "mdi:speedometer"
author: "SveltyCMS Team"
created: "${new Date().toISOString().split("T")[0]}"
updated: "${new Date().toISOString().split("T")[0]}"
tags:
  - "benchmark"
  - "performance"
  - "${dbConf.type}"
---

# ${meta.icon} ${meta.label} Performance Ledger

> [!IMPORTANT]
> **Performance Verification**: This report is automatically generated by the SveltyCMS Audit engine.

<!-- BENCHMARK_START -->
<!-- BENCHMARK_END -->
`;
    }

    // Get current results or last historical SUCCESS
    let curr = results.find((r) => r.db === dbKey);
    if (!curr && !doc.includes("<!-- BENCHMARK_START -->")) continue;

    let m: ReturnType<typeof extractMetrics>;
    let status: string;
    let timestamp: string;
    let isHistorical = false;

    if (curr && curr.status !== "PENDING") {
      m = latestMetrics[dbKey];
      status = curr.status;
      timestamp = new Date().toLocaleString();
    } else {
      const last = db
        .query(
          `SELECT * FROM runs WHERE db_key = ? AND status = 'SUCCESS' ORDER BY timestamp DESC LIMIT 1`,
        )
        .get(dbKey) as any;
      if (!last) continue;
      m = extractMetrics(JSON.parse(last.metrics_json), dbConf.type);
      status = last.status;
      timestamp = new Date(last.timestamp).toLocaleString();
      isHistorical = true;

      // 🚀 RESTORE Host Info from History
      if (last.host_info_json) {
        (curr as any) = {
          ...curr,
          hostInfo: JSON.parse(last.host_info_json),
        };
      }
    }

    const coldTrend = await getTrendDetails(db, dbKey, curr?.coldStartMs || 0, "cold_start_ms");
    const restTrend = await getTrendDetails(db, dbKey, m.collections, "collections_p95");
    const gqlTrend = await getTrendDetails(db, dbKey, m.graphqlAvg, "graphql_avg");

    let headerMd = `\n## 📊 Latest Performance Audit (${timestamp})\n\n`;
    headerMd += `**Status:** ${status === "SUCCESS" ? "✅ PASS" : "❌ FAIL"}${isHistorical ? " *(Historical)*" : ""}\n\n`;

    headerMd += `### ⚡ Executive Latency Matrix\n`;
    headerMd += `| Scenario | Avg Latency | Trend | Target Budget |\n`;
    headerMd += `| :--- | :--- | :--- | :--- |\n`;
    headerMd += `| **Cold Start** | ${curr?.coldStartMs || 0}ms | ${coldTrend.icon} (${coldTrend.pct}) | < 5000ms |\n`;
    headerMd += `| **REST (Collections)** | ${m.collections.toFixed(3)}ms | ${restTrend.icon} (${restTrend.pct}) | < 5ms |\n`;
    headerMd += `| **GraphQL (Avg)** | ${m.graphqlAvg.toFixed(3)}ms | ${gqlTrend.icon} (${gqlTrend.pct}) | < 5ms |\n`;
    headerMd += `| **DB Raw (p95)** | ${m.dbRaw.toFixed(3)}ms | ⚪ | < 50ms |\n\n`;

    /**
     * Standardized trend block generator for audit ledgers.
     */
    headerMd += await generateTrendBlock(
      "mixedAvg",
      "Mixed p95",
      "Production request mix: 60% Reads, 20% Writes, 15% GraphQL, 5% Media.",
      "mixed-workload-aggregate",
      "mixedAvg",
      "Mixed Workload Performance",
    );

    headerMd += `### 📈 Historical Latency Trends\n`;
    headerMd += `\`\`\`mermaid\nxychart-beta\n  title "${meta.label} Latency Trend (last 10 runs)"\n  x-axis ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10"]\n  y-axis "Latency (ms)"\n  line "p95 Latency" : [${(() => {
      const hist = db
        .query(
          `SELECT collections_p95 FROM runs WHERE db_key = ? AND status = 'SUCCESS' ORDER BY timestamp DESC LIMIT 10`,
        )
        .all(dbKey) as any[];
      return hist
        .map((h) => h.collections_p95.toFixed(1))
        .reverse()
        .join(", ");
    })()}]\n\`\`\`\n`;

    headerMd += `\n## 🔬 Detailed Performance Ledger (20+ Modules)\n\n`;

    async function generateTrendBlock(
      metricKey: string,
      label: string,
      desc: string,
      historyKey: string,
      liveKey: string,
      title: string,
      unit: string = "ms",
    ) {
      const trend = await getTrendDetails(db, dbKey, (m as any)[liveKey], historyKey);
      const budget = (PERFORMANCE_BUDGET as any)[metricKey];
      const budgetText = budget ? ` | **Target:** < ${budget}${unit}` : "";

      let block = `### 🏷️ ${title} {#${metricKey}}\n`;
      block += `**${label}:** ${(m as any)[liveKey].toFixed(3)}${unit}${budgetText} | **Trend:** ${trend.icon} (${trend.pct})\n`;
      block += `> ${desc}\n\n`;
      return block;
    }


    // 1. CORE TREND AUDIT
    headerMd += `\n## 📈 Core Infrastructure Trends\n\n`;

    const coreTrends = [
      {
        metric: "dbRaw",
        label: "Raw Adapter p95",
        desc: "Direct database access latency (bypass CMS logic).",
        historyKey: "adapter_read_avg",
        liveKey: "dbRaw",
        title: "Database Adapter Performance",
      },
      {
        metric: "hooks",
        label: "Middleware p95",
        desc: "Total overhead of security, logging, and auth hooks.",
        historyKey: "middleware_hooks_p95",
        liveKey: "hooks",
        title: "Middleware & Hooks Audit",
      },
      {
        metric: "memGrowth",
        label: "Memory RSS Δ",
        desc: "Peak memory growth during stress workload.",
        historyKey: "mem_growth",
        liveKey: "memGrowth",
        title: "Memory Stability Audit",
        unit: "MB",
      },
    ];

    for (const item of coreTrends) {
      headerMd += await generateTrendBlock(
        item.metric,
        item.label,
        item.desc,
        item.historyKey,
        item.liveKey,
        item.title,
        item.unit,
      );
    }

    // 2. ENTERPRISE SCALE AUDIT
    headerMd += `\n## 🏢 Enterprise Scale Audit\n\n`;

    headerMd += await generateTrendBlock(
      "tenancyAvg",
      "Tenancy p95",
      "Measures latency across tenant isolation boundaries.",
      "collections_p95",
      "tenancyAvg",
      "Multi-Tenancy Performance",
    );

    headerMd += await generateTrendBlock(
      "relationalAvg",
      "Relational p95",
      "Tests performance of complex JOINs and nested relationship population.",
      "graphql_avg",
      "relationalAvg",
      "Relational Resolver Latency",
    );

    headerMd += await generateTrendBlock(
      "telemetryAvg",
      "Telemetry p95",
      "Measures overhead of telemetry collection and cryptographic signing.",
      "middleware_hooks_p95",
      "telemetryAvg",
      "Telemetry & Update Performance",
    );

    headerMd += `\n### 🏷️ Mixed Workload Performance\n`;

    headerMd += `\n## 🔬 Detailed Performance Ledger (20+ Modules)\n\n`;

    // Reconstruct the internal sections surgically
    for (const script of BENCHMARK_SCRIPTS) {
      const isSql =
        dbKey.includes("sqlite") || dbKey.includes("postgres") || dbKey.includes("mariadb");
      const isApplicable =
        script.strategy === "all" ||
        (script.strategy === "sql" && isSql) ||
        (script.strategy === "once" && dbKey === "sqlite");

      if (!isApplicable) continue;

      const timing = curr?.scriptTimings?.[script.shortLabel] || 0;
      const trend = await getScriptTrend(db, dbKey, script.shortLabel, timing);

      const tag = script.shortLabel.split(" ")[0].toUpperCase() + "_TABLE";
      const START_TAG = `<!-- ${tag}_START -->`;
      const END_TAG = `<!-- ${tag}_END -->`;

      // Check if we have new data in ROOT_RESULTS_DIR
      let tableContent = "";
      try {
        const dbResultsDir = path.join(ROOT_RESULTS_DIR, dbKey);
        const allFiles = await findFilesRecursive(dbResultsDir, /\.table\.txt$/);

        const tableFile = allFiles.find((f) => {
          const baseName = path.basename(f);
          return baseName.toLowerCase().includes(script.shortLabel.toLowerCase().replace(/ /g, "_"));
        });

        if (tableFile) {
          const rawTable = await fs.readFile(tableFile, "utf8");
          tableContent = `### 🏷️ ${script.label} ${trend.icon} ${trend.pct}\n> 📂 **Source**: [${script.path}](file:///${path.resolve(process.cwd(), script.path).replace(/\\/g, "/")})\n> 🎯 **Proves**: ${script.desc}\n\n\`\`\`text\n${rawTable}\n\`\`\``;
        }
      } catch {}

      // If no new data, try to extract from current document
      if (!tableContent && doc.includes(START_TAG) && doc.includes(END_TAG)) {
        const existing = doc.split(START_TAG)[1].split(END_TAG)[0].trim();
        if (existing && !existing.includes("Pending execution")) {
          tableContent = existing;
        }
      }

      // If still no content, show pending
      if (!tableContent) {
        tableContent = `> ⏳ **${script.label}**: Pending execution.\n> 📂 **Source**: [${script.path}](file:///${path.resolve(process.cwd(), script.path).replace(/\\/g, "/")})`;
      }

      headerMd += `${START_TAG}\n${tableContent}\n${END_TAG}\n\n`;
    }

    headerMd += `\n--- \n\n## 🔬 Host Environment\n`;
    headerMd += `| CPU | Cores | RAM | Runtime |\n`;
    headerMd += `| :--- | :--- | :--- | :--- |\n`;
    headerMd += `| ${curr?.hostInfo?.cpu || "Unknown"} | ${curr?.hostInfo?.cores || "-"} | ${curr?.hostInfo?.ram || "-"} | ${curr?.hostInfo?.runtime || "-"} |\n\n`;

    const BENCH_START = "<!-- BENCHMARK_START -->";
    const BENCH_END = "<!-- BENCHMARK_END -->";

    if (doc.includes(BENCH_START) && doc.includes(BENCH_END)) {
      doc = doc.replace(
        /<!-- BENCHMARK_START -->[\s\S]*?<!-- BENCHMARK_END -->/,
        `${BENCH_START}${headerMd}${BENCH_END}`,
      );
    } else {
      doc += `\n${BENCH_START}${headerMd}${BENCH_END}`;
    }

    await fs.writeFile(filePath, doc);
    log.info(`Updated technical ledger: benchmark_${dbKey.replace("-", "_")}.mdx`);
  }
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
  return summary as any;
}

/**
 * Crawls the results directory to reconstruct the performance matrix.
 * Supports decentralized self-reporting where each test saves its own JSON.
 */
export async function scanResultsDirectory(): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  try {
    const entries = await fs.readdir(ROOT_RESULTS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const dbKey = entry.name;
      const dbPath = path.join(ROOT_RESULTS_DIR, dbKey);

      const files = await findFilesRecursive(dbPath, /\.json$/);
      const filteredFiles = files.filter((f) => !f.endsWith(".meta.json"));

      if (filteredFiles.length === 0) continue;

      const metrics: Record<string, any> = {};
      const scriptTimings: Record<string, number> = {};
      let status: "SUCCESS" | "FAILED" = "SUCCESS";

      for (const filePath of files) {
        const f = path.basename(filePath);
        try {
          const raw = await fs.readFile(filePath, "utf8");
          if (!raw || raw.trim() === "") continue;

          const content = JSON.parse(raw);

          // Handle suite summary results
          if (content.name && content.avgMs !== undefined) {
            const short = content.shortLabel || content.name.split(":")[0] || "unknown";
            scriptTimings[short] = content.avgMs;
            if (content.failureCount > 0) status = "FAILED";

            // Merge nested metrics if present
            if (content.metrics) Object.assign(metrics, content.metrics);
            // Save scriptPath for reliable matching
            if (content.scriptPath) (scriptTimings as any).scriptPath = content.scriptPath;

            // Store the full result as a metric for detailed ledger reconstruction
            metrics[short] = content;
          } else if (content._type === "numeric-metric") {
            metrics[content.name] = content;
          } else {
            const baseName = path.basename(f, ".json");
            // Normalize key by stripping ISO timestamp (e.g. -2026-04-23T...)
            const key = (content.name || baseName).replace(
              /-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/,
              "",
            );
            metrics[key] = content;
          }
        } catch (err) {
          log.warn(`Failed to parse result file ${f}: ${err}`);
        }
      }

      if (Object.keys(metrics).length > 0 || Object.keys(scriptTimings).length > 0) {
        results.push({
          db: dbKey,
          status,
          metrics,
          scriptTimings,
          scriptPath: (scriptTimings as any).scriptPath || metrics.scriptPath,
          coldStartMs: metrics["cold-start"]?.value || metrics["cold-start"] || 0,
        } as any);
      }
    }
  } catch (e: any) {
    log.warn(`Could not scan results directory: ${e.message}`);
  }
  return results;
}
