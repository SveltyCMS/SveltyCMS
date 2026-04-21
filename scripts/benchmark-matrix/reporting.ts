/**
 * @file scripts\benchmark-matrix\reporting.ts
 * @description Reporting utility for the benchmark matrix tool.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { version as pkgVersion } from "../../package.json";
import { log } from "./logger";
import { Project, SyntaxKind, ObjectLiteralExpression } from "ts-morph";
import {
  DB_METADATA,
  ALL_DATABASES,
  BENCHMARK_SCRIPTS,
  ROOT_RESULTS_DIR,
  BENCHMARKS_DOC,
  CI_SUMMARY_FILE,
} from "./config";
import { extractMetrics, getTrendDetails } from "./utils";
import type { BenchmarkResult, RunConfig } from "./types";

/**
 * Persists benchmark script metadata (lastRun) using AST.
 */
export async function persistScriptMetadataAST(scriptPath: string, timestamp: string) {
  try {
    const project = new Project();
    const sourceFilePath = path.resolve(
      process.cwd(),
      "scripts/benchmark-matrix/benchmark-scripts.ts",
    );
    const sourceFile = project.addSourceFileAtPath(sourceFilePath);

    const scriptsArray = sourceFile
      .getVariableDeclaration("BENCHMARK_SCRIPTS")
      ?.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression);

    if (scriptsArray) {
      for (const element of scriptsArray.getElements()) {
        if (element.getKind() === SyntaxKind.ObjectLiteralExpression) {
          const obj = element as ObjectLiteralExpression;
          const pathProp = obj.getProperty("path")?.asKind(SyntaxKind.PropertyAssignment);
          const pathValue = pathProp?.getInitializer()?.getText().replace(/['"]/g, "");

          if (pathValue === scriptPath) {
            const lastRunProp = obj.getProperty("lastRun")?.asKind(SyntaxKind.PropertyAssignment);
            if (lastRunProp) {
              lastRunProp.setInitializer(`"${timestamp}"`);
              log.db("AST", `Updated lastRun for ${scriptPath}`);
            }
          }
        }
      }
      await sourceFile.save();
    }
  } catch (err: any) {
    log.warn(`AST Metadata persistence failed: ${err.message}`);
  }
}

/**
 * Updates the benchmark matrix documentation incrementally.
 */
export async function updateIncrementalReport(results: BenchmarkResult[]) {
  const sqliteHistoryFile = path.join(ROOT_RESULTS_DIR, "history.sqlite");
  const { Database } = await import("bun:sqlite");
  const db = new Database(sqliteHistoryFile);

  try {
    const latestMetrics: Record<string, any> = {};
    for (const res of results) {
      latestMetrics[res.db] = extractMetrics(res.metrics ?? {}, res.db.replace("-redis", ""));
    }

    let md = `## 📊 SveltyCMS Enterprise Audit Matrix — Progress Report\n\n`;
    md += `**Status**: 🛠️ Audit in progress... | **Last Update**: ${new Date().toLocaleTimeString()}\n\n`;

    md += await buildDatabaseComparisonTable(db, results, latestMetrics, []);
    md += await buildPerBenchmarkSections(results);

    // Add Script Matrix (Pass/Fail)
    md += `\n### 📑 Script Status Matrix\n\n`;
    const scripts = BENCHMARK_SCRIPTS;
    const dbs =
      results.length > 0
        ? results.map((r) => r.db)
        : ALL_DATABASES.map((d) => (d.useRedis ? `${d.type}-redis` : d.type));

    md += `| Script | ${dbs.map((d) => d.toUpperCase()).join(" | ")} |\n`;
    md += `| :--- | ${dbs.map(() => "--- |").join(" ")}\n`;

    for (const s of scripts) {
      md += `| ${s.shortLabel} | `;
      for (const dbKey of dbs) {
        const res = results.find((r) => r.db === dbKey);
        const timing = res?.scriptTimings?.[s.shortLabel];
        if (timing) {
          md += `✅ ${timing}ms | `;
        } else if (res?.status === "FAILED") {
          md += `❌ FAIL | `;
        } else {
          md += `⏳ PENDING | `;
        }
      }
      md += `\n`;
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
  } finally {
    db.close();
  }
}

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

/**
 * Builds dedicated section for each benchmark script using decentralized results.
 */
async function buildPerBenchmarkSections(results: BenchmarkResult[]): Promise<string> {
  let md = `\n## 📋 Detailed Benchmark Sections\n\n`;

  for (const script of BENCHMARK_SCRIPTS) {
    const matchingResults = results.filter((r) => {
      // 1. Direct scriptPath match (Most reliable)
      if (r.scriptPath && script.path.endsWith(r.scriptPath)) return true;
      // 2. Direct timing/shortLabel match
      if (r.scriptTimings?.[script.shortLabel] !== undefined) return true;
      // 3. Metric name match (Fallback)
      return Object.keys(r.metrics || {}).some((k) =>
        k.toLowerCase().includes(script.shortLabel.toLowerCase()),
      );
    });

    if (matchingResults.length === 0) continue;

    md += `### ${script.label} (${script.level} · ${script.section})\n`;
    md += `**Test file:** \`${script.path}\`\n`;
    md += `**Description:** ${script.desc}\n`;
    md += `**Last run:** ${script.lastRun ? new Date(script.lastRun).toLocaleString() : "—"}\n\n`;

    // Simple table for this benchmark across databases
    md += `| Database | Avg Latency | p95 | RPS | Status |\n`;
    md += `|----------|-------------|-----|-----|--------|\n`;

    for (const res of matchingResults) {
      const dbClean = res.db.replace("-redis", "");
      const m = extractMetrics(res.metrics || {}, dbClean);
      const timing = res.scriptTimings?.[script.shortLabel] || 0;
      const status = res.status === "SUCCESS" ? "✅" : "❌";

      // Attempt to find the specific p95/avg for THIS script
      // If result is generic, fallback to metrics summary
      md += `| **${res.db.toUpperCase()}** | ${timing > 0 ? timing.toFixed(2) : (m.restAvg || m.graphqlAvg || 0).toFixed(2)}ms | `;
      md += `${(m.collections || 0).toFixed(2)}ms | ${(m.restRps || m.gqlRps || 0).toFixed(0)} | ${status} |\n`;
    }

    md += `\n`;
  }

  return md;
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
      const files = await fs.readdir(dbPath);

      const metrics: Record<string, any> = {};
      const scriptTimings: Record<string, number> = {};
      let status: "SUCCESS" | "FAILED" = "SUCCESS";

      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        try {
          const filePath = path.join(dbPath, f);
          const content = JSON.parse(await fs.readFile(filePath, "utf8"));

          // Handle suite summary results
          if (content.name && content.avgMs !== undefined) {
            const short = content.shortLabel || content.name.split(":")[0] || "unknown";
            scriptTimings[short] = content.avgMs;
            if (content.failureCount > 0) status = "FAILED";

            // Merge nested metrics if present
            if (content.metrics) Object.assign(metrics, content.metrics);
            // Save scriptPath for reliable matching
            if (content.scriptPath) (scriptTimings as any).scriptPath = content.scriptPath;
          } else if (content._type === "numeric-metric") {
            // Direct metric export from exportMetric()
            metrics[content.name] = content;
          } else {
            // General JSON result
            metrics[path.basename(f, ".json")] = content;
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
        JSON.stringify(res.metrics || {}),
      );
    }

    let md = `## 📊 SveltyCMS Enterprise Audit Matrix — ${new Date().toLocaleString()}\n\n`;
    md += `**Version:** ${pkgVersion} | **Generated:** ${now}\n\n`;

    md += await buildDatabaseComparisonTable(db, results, latestMetrics, regressions);

    if (regressions.length > 0) {
      md += `\n> [!CAUTION]\n> **Regressions detected in**: ${regressions.join(", ")}\n`;
    }

    // Build rich per-benchmark sections (new decentralized style)
    md += await buildPerBenchmarkSections(results);

    // Build category-based summary sections
    // md += await buildPerformanceCategories(runDbs, latestMetrics);

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

    const allViolations = results.flatMap((r) =>
      (r.budgetViolations ?? []).map((v) => `**${r.db}**: ${v}`),
    );
    if (allViolations.length > 0) {
      md += `\n### ⚠️ Performance Budget Violations\n\n`;
      for (const v of allViolations) md += `- ${v}\n`;
      md += "\n";
    }

    // Add Script Status Matrix (Pass/Fail)
    md += `\n### 📑 Detailed Script Matrix\n\n`;
    const dbs =
      results.length > 0
        ? results.map((r) => r.db)
        : ALL_DATABASES.map((d) => (d.useRedis ? `${d.type}-redis` : d.type));
    md += `| Script | Path | ${dbs.map((d) => d.toUpperCase()).join(" | ")} |\n`;
    md += `| :--- | :--- | ${dbs.map(() => "--- |").join(" ")}\n`;

    for (const s of BENCHMARK_SCRIPTS) {
      md += `| **${s.shortLabel}** | \`${s.path}\` | `;
      for (const dbKey of dbs) {
        // Strategy Logic: Check if engine is applicable
        const isSql =
          dbKey.includes("sqlite") || dbKey.includes("postgres") || dbKey.includes("mariadb");
        const isApplicable =
          s.strategy === "all" ||
          (s.strategy === "sql" && isSql) ||
          (s.strategy === "once" && dbKey === "sqlite");

        if (!isApplicable) {
          md += `— (N/A) | `;
          continue;
        }

        const res = results.find((r) => r.db === dbKey);
        const timing = res?.scriptTimings?.[s.shortLabel];
        if (timing) {
          md += `✅ ${timing.toFixed(2)}ms | `;
        } else if (res?.status === "FAILED") {
          md += `❌ FAIL | `;
        } else if (res?.status === "RUNNING") {
          md += `⏳ RUNNING | `;
        } else {
          md += `⏳ PENDING | `;
        }
      }
      md += `\n`;
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

// 🚀 Self-Execution Logic for Standalone Generating
if (process.argv.includes("--generate")) {
  log.info("🔍 Crawling results directory for standalone report generation...");
  generateFinalReport()
    .then(() => {
      log.success("✅ Standalone report generated.");
      process.exit(0);
    })
    .catch((err) => {
      log.error(`❌ Standalone report failed: ${err.message}`);
      process.exit(1);
    });
}
