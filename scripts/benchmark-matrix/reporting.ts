/**
 * @file scripts/benchmark-matrix/reporting.ts
 * @description
 * Reporting and documentation synchronization layer for the benchmark matrix.
 *
 * Takes raw benchmark results, runs regression detection, updates SQLite history,
 * and performs surgical MDX updates to per-adapter reports in docs/project/benchmarks/.
 *
 * > [!IMPORTANT]
 * > **Empirical Verification Required** (per AGENTS.md):
 * > After modifying report generation, always run the full matrix and inspect
 * > the generated MDX reports. The benchmark reports are the public-facing proof
 * > of SveltyCMS's performance claims.
 * >
 * > ```bash
 * > bun run scripts/benchmark-matrix/index.ts --sql
 * > # Inspect: docs/project/benchmarks/benchmark_sqlite.mdx
 * > ```
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
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
import { detectRegressions } from "./regression-detector";
import type { BenchmarkResult, RunConfig, RegressionResult } from "./types";
import { Project, SyntaxKind, type ObjectLiteralExpression, type SourceFile } from "ts-morph";
import { collectHostInfo } from "./cli";
import {
  applyDimensionSummaryToLedger,
  deduplicateLedgerSections,
  ensureExecutiveMarkers,
  EXECUTIVE_MARKERS,
  extractFirstTagBlock,
  extractTagInner,
  extractZone,
  mapSectionToDimension,
  type DimensionStatus,
  type LedgerDimension,
  LEDGER_DIMENSION_ORDER,
  patchBenchmarkZones,
  patchExecutiveAlerts,
  patchExecutivePartialWatermark,
  replaceLatestAuditHeading,
  replaceZone,
  stripLatestOutsideExecutive,
  upsertLedgerSection,
  ZONE_MARKERS,
} from "../../tests/benchmarks/modules/benchmark-mdx";
import { writeHistoryArchive } from "../../tests/benchmarks/modules/benchmark-reporting";
import { analyzeTrend, classifyRootCause } from "../../tests/benchmarks/modules/benchmark-analysis";
import { loadHistory } from "../../tests/benchmarks/modules/benchmark-history";
import {
  buildCollapsedLedgerTagInner,
  buildExecutiveReport,
  buildHostEnvironmentTable,
  formatTestInsightNote,
  isSpecificInsight,
  wrapInfrastructureCollapse,
  type TestRollupEntry,
} from "../../tests/benchmarks/modules/benchmark-executive";

/**
 * 📂 Robust recursive file discovery helper.
 */
async function findFilesRecursive(dir: string, pattern: string | RegExp): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await findFilesRecursive(fullPath, pattern)));
      } else {
        const matches =
          typeof pattern === "string" ? entry.name.endsWith(pattern) : pattern.test(entry.name);
        if (matches) results.push(fullPath);
      }
    }
  } catch {
    // Silence errors for missing directories
  }
  return results;
}

// ✨ Memoized AST Project to prevent heap churn
let memoizedProject: Project | null = null;
let memoizedSourceFile: SourceFile | null = null;

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
      `${m.collections > 0 ? m.collections.toFixed(3) + "ms" : "—"}`.padEnd(COL[2]),
      `${m.graphqlAvg > 0 ? m.graphqlAvg.toFixed(3) + "ms" : "—"}`.padEnd(COL[3]),
      `${m.memGrowth !== 0 ? m.memGrowth.toFixed(1) : "—"}`.padEnd(COL[4]),
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
  const NAME_W = 30;
  const VAL_W = 12;
  const W = 2 + NAME_W + 3 + VAL_W + 10 + VAL_W + 10 + 10 + 2; // = 91

  const bar = (l: string, _m: string, r: string) => l + "═".repeat(W - 2).replace(/ /g, "═") + r;
  const row = (sc: string, avg: string, p95: string, rps: string) =>
    `║ ${sc.padEnd(NAME_W)} │ ${avg.padStart(VAL_W)} ms │ p95: ${p95.padStart(VAL_W)} ms │ RPS: ${rps.padStart(10)} ║`;

  let md = "```text\n";
  md += bar("╔", "═", "╗") + "\n";

  // Center Title
  const titlePad = Math.max(0, Math.floor((W - 2 - title.length) / 2));
  md += "║" + " ".repeat(titlePad) + title + " ".repeat(W - 2 - title.length - titlePad) + "║\n";

  // Center Subtitle
  const subPad = Math.max(0, Math.floor((W - 2 - subtitle.length) / 2));
  md += "║" + " ".repeat(subPad) + subtitle + " ".repeat(W - 2 - subtitle.length - subPad) + "║\n";

  md += bar("╠", "═", "╣") + "\n";

  for (const s of scenarios) {
    const avg = typeof s.avgMs === "number" ? s.avgMs.toFixed(3) : "0.000";
    const p95 = typeof s.p95Ms === "number" ? s.p95Ms.toFixed(3) : avg;
    const rps = typeof s.rps === "number" ? Math.round(s.rps).toLocaleString() : "0";

    md += row(s.name, avg, p95, rps) + "\n";
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
    // SMARTER TREND: Compare against most recent previous run, capped at ±100%
    const row = db
      .query(
        `SELECT json_extract(metrics_json, '$.' || ? || '.p95Ms') as prev_val
        FROM runs
        WHERE db_key = ? AND status = 'SUCCESS'
        ORDER BY timestamp DESC LIMIT 1 OFFSET 1`,
      )
      .get(scriptShortLabel, dbKey) as { prev_val: number | null };

    if (!row?.prev_val || row.prev_val <= 0) return { icon: "⚪", pct: "—", isRegression: false };

    const pct = Math.max(-100, Math.min(100, ((currentVal - row.prev_val) / row.prev_val) * 100));

    // 🚀 WINDOWS OPTIMIZATION: Relaxed thresholds for local environments
    const isRegression = pct > 15;
    const icon = pct < -5 ? "🟢" : pct > 10 ? "🔴" : "⚪";

    return {
      icon,
      pct: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
      isRegression,
    };
  } catch {
    return {
      icon: "⚪",
      pct: "—",
      isRegression: false,
    };
  }
}

/**
 * Standardized trend block generator for audit ledgers.
 */
async function generateTrendBlock(
  db: any,
  dbKey: string,
  m: any,
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

    const timing = res?.scriptTimings?.[script.shortLabel] || 0;
    const trend = await getScriptTrend(db, dbKey, script.shortLabel, timing);

    const relativePath = `../../../${script.path.replace(/\\/g, "/")}`;
    md += `### 🏷️ ${script.label} ${trend.icon} ${trend.pct} {#${script.shortLabel.replace(/[^a-zA-Z0-9]/g, "_")}}\n`;
    md += `**Source:** [${script.path}](${relativePath}) | **Intensity:** \`${script.intensity}\`\n`;
    md += `**Proves:** ${script.desc}\n\n`;

    if (timing === 0) {
      md += `> ⏳ **Status**: Pending execution for this engine.\n\n`;
      continue;
    }

    // 1. Reconstruct Scenario Table
    const scenarios: any[] = [];
    if (res?.metrics) {
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
        SELECT metrics_json FROM runs
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
        return scriptMetric?.p95Ms || scriptMetric?.avgMs || m[script.shortLabel]?.avgMs || 0;
      })
      .filter((v) => v > 0)
      .reverse();

    if (trendPoints.length > 1) {
      // 🚀 Ensure we have exactly 10 points for the chart baseline
      // Only render chart when enough data exists (skip padding anti-pattern)
      if (trendPoints.length < 3) continue;
      md += `\n#### 📈 ${script.shortLabel} Trend\n`;
      md += `\`\`\`mermaid\nxychart-beta\n  title "${script.shortLabel} Latency Trend"\n  x-axis ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10"]\n  y-axis "Latency (ms)"\n  line "Latency" : [${trendPoints.map((p) => p.toFixed(3)).join(", ")}]\n\`\`\`\n\n`;
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
): Promise<RegressionResult[]> {
  const scanned = await scanResultsDirectory();
  const results = [...resultsIn];

  // Merge scanned results to preserve other benchmarks when running a subset of tests
  for (const s of scanned) {
    const existingIdx = results.findIndex((r) => r.db === s.db);
    if (existingIdx === -1) {
      results.push(s);
    } else {
      results[existingIdx] = {
        ...s,
        ...results[existingIdx],
        scriptTimings: {
          ...s.scriptTimings,
          ...results[existingIdx].scriptTimings,
        },
        metrics: { ...s.metrics, ...results[existingIdx].metrics },
        coldStartMs: results[existingIdx].coldStartMs || s.coldStartMs || 0,
      };
    }
  }
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
        middleware_hooks_p95 REAL DEFAULT 0,
        index_pressure_p95 REAL DEFAULT 0,
        adapter_read_avg REAL DEFAULT 0,
        mixed_workload_aggregate REAL DEFAULT 0,
        auth_avg REAL DEFAULT 0,
        host_info_json TEXT,
        metrics_json TEXT
      )
    `);

    // Schema migration for older tables missing these columns
    const existingCols = db.query("PRAGMA table_info(runs)").all() as {
      name: string;
    }[];
    const existingColNames = new Set(existingCols.map((c) => c.name));
    const newCols: [string, string][] = [
      ["middleware_hooks_p95", "REAL DEFAULT 0"],
      ["index_pressure_p95", "REAL DEFAULT 0"],
      ["adapter_read_avg", "REAL DEFAULT 0"],
      ["mixed_workload_aggregate", "REAL DEFAULT 0"],
      ["auth_avg", "REAL DEFAULT 0"],
    ];
    for (const [col, def] of newCols) {
      if (!existingColNames.has(col)) {
        db.exec("ALTER TABLE runs ADD COLUMN " + col + " " + def);
      }
    }

    // Metric trends cache (avoids recomputing statistical analysis every run)
    db.exec(`
      CREATE TABLE IF NOT EXISTS metric_trends (
        adapter TEXT, metric TEXT, run_count INTEGER,
        weighted_avg REAL, stddev_val REAL, slope REAL,
        last_updated TEXT, PRIMARY KEY (adapter, metric)
      )
    `);

    // Baseline reset tracking for warming-up grace periods
    db.exec(`
      CREATE TABLE IF NOT EXISTS reset_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT, reason TEXT, adapter TEXT
      )
    `);

    const latestMetrics: Record<string, ReturnType<typeof extractMetrics>> = {};

    const insert = db.prepare(`
      INSERT INTO runs (timestamp, db_key, status, cold_start_ms, collections_p95, graphql_avg, mem_growth, cpu_load, middleware_hooks_p95, index_pressure_p95, adapter_read_avg, mixed_workload_aggregate, auth_avg, host_info_json, metrics_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        m.hooks,
        m.indexPressure,
        m.dbRaw,
        m.mixedAvg,
        m.authAvg,
        JSON.stringify(res.hostInfo || {}),
        JSON.stringify(res.metrics || {}),
      );
    }

    // 🚀 Detect performance regressions — only on CURRENT run's DBs, not stale disk data
    const currentDbKeys = new Set(resultsIn.map((r) => r.db));
    const currentResults = results.filter((r) => currentDbKeys.has(r.db));
    const result = await detectRegressions(currentResults);
    const perfRegressions = result.regressions;
    const _report = result.report;
    void _report; // available for future callers (flapping, cross-cutting, forecasts)

    // 🚀 Update per-database specific technical ledgers
    const hasLock = await acquireLock("mdx_report");
    if (hasLock) {
      try {
        await updateDatabaseSpecificReports(
          db,
          results,
          latestMetrics,
          resultsIn,
          perfRegressions,
          now,
        );
        await updateBenchmarkIndexReport(db, results, latestMetrics, perfRegressions);

        // 🚀 Build ranked executive summary from history.sqlite
        const isPartial = resultsIn.length < ALL_DATABASES.length;
        await writeRankedExecutiveSummary(db, results, isPartial);
        log.success("Ranked executive summary updated.");

        log.success("Enterprise Benchmark technical ledgers updated.");
      } finally {
        await releaseLock("mdx_report");
      }
    } else {
      log.warn("Could not acquire lock for MDX report. Skipping incremental update.");
    }

    return perfRegressions;
  } finally {
    db.close();
  }
}

/** Builds a ranked executive summary from history.sqlite and writes it to per-DB reports. */
async function writeRankedExecutiveSummary(
  db: any,
  results: BenchmarkResult[],
  isPartial: boolean,
): Promise<void> {
  const dbKeys = [...new Set(results.map((r) => r.db))];

  for (const dbKey of dbKeys) {
    // Query recent regressions for this DB
    const regressions = db
      .query(
        `SELECT test_id, avg_ms, p50_ms, p95_ms, rps, phase, timestamp
         FROM benchmark_runs
         WHERE db_type = ? AND status = 'SUCCESS' AND avg_ms > 0
         ORDER BY timestamp DESC
         LIMIT 200`,
      )
      .all(dbKey) as any[];

    if (regressions.length < 2) continue;

    // Group by test_id, compute deltas
    const byTest = new Map<string, any[]>();
    for (const r of regressions) {
      if (!byTest.has(r.test_id)) byTest.set(r.test_id, []);
      byTest.get(r.test_id)!.push(r);
    }

    const lines: string[] = [];

    if (isPartial) {
      lines.push(
        "> \u{1F4CB} **Partial report** — run full matrix for complete cross-DB analysis.",
      );
    }

    // Find tests with >10% degradation
    const degraded: Array<{
      testId: string;
      deltaPct: number;
      current: number;
      baseline: number;
    }> = [];

    for (const [testId, runs] of byTest) {
      if (runs.length < 2) continue;
      const current = runs[0];
      const prev = runs.slice(1, Math.min(6, runs.length));
      const med = (arr: number[]) => {
        const s = [...arr].sort((a, b) => a - b);
        return s[Math.floor(s.length / 2)];
      };
      const bAvg = med(prev.map((r: any) => r.avg_ms));
      if (bAvg <= 0) continue;
      const deltaPct = ((current.avg_ms - bAvg) / bAvg) * 100;

      if (Math.abs(deltaPct) > 10) {
        degraded.push({
          testId,
          deltaPct,
          current: current.avg_ms,
          baseline: bAvg,
        });
      }
    }

    if (degraded.length === 0) continue;

    degraded.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));

    // Top regressions
    lines.push("");
    lines.push("### \u{1F534} Top Regressions");
    for (const d of degraded.slice(0, 5)) {
      const icon = Math.abs(d.deltaPct) > 20 ? "\u{1F534}" : "\u{1F7E0}";
      const dir = d.deltaPct > 0 ? "+" : "";
      lines.push(
        `> **${icon} ${d.testId}** (${dbKey}): ${dir}${d.deltaPct.toFixed(0)}% | ${d.current.toFixed(2)}ms vs ${d.baseline.toFixed(2)}ms baseline`,
      );
    }

    // Write ranked regressions into EXECUTIVE alerts slot (replace, never append)
    try {
      const docPath = path.join(
        process.cwd(),
        "docs/project/benchmarks",
        `benchmark_${dbKey.replace("-", "_")}.mdx`,
      );
      let doc = await fs.readFile(docPath, "utf8").catch(() => "");
      if (!doc) continue;

      const [execStart, execEnd] = ZONE_MARKERS.executive;
      let executive = extractZone(doc, execStart, execEnd);
      if (executive === null) continue;

      executive = patchExecutivePartialWatermark(
        executive,
        isPartial
          ? "> \u{1F4CB} **Partial report** — run full matrix for complete cross-DB analysis."
          : null,
      );
      executive = patchExecutiveAlerts(executive, lines.join("\n"));

      const replaced = replaceZone(doc, execStart, execEnd, executive);
      if (!replaced) continue;
      doc = stripLatestOutsideExecutive(deduplicateLedgerSections(replaced));

      const dir = path.dirname(docPath);
      const base = path.basename(docPath);
      try {
        const staleFiles = fsSync
          .readdirSync(dir)
          .filter((f: string) => f.startsWith(base + ".tmp."));
        for (const sf of staleFiles) {
          try {
            fsSync.unlinkSync(path.join(dir, sf));
          } catch {
            /* best-effort */
          }
        }
      } catch {
        /* dir may not exist */
      }

      const tmpPath = docPath + ".tmp." + Date.now();
      await fs.writeFile(tmpPath, doc, "utf8");
      await fs.rename(tmpPath, docPath);
    } catch {
      /* best-effort */
    }
  }
}

async function updateBenchmarkIndexReport(
  db: any,
  results: BenchmarkResult[],
  latestMetrics: Record<string, any>,
  perfRegressions: any[] = [],
) {
  const indexFilePath = path.join(process.cwd(), "docs/project/benchmarks/index.mdx");
  let doc = await fs.readFile(indexFilePath, "utf8").catch(() => "");
  if (!doc) return;

  const START_TAG = "<!-- SUMMARY_MATRIX_START -->";
  const END_TAG = "<!-- SUMMARY_MATRIX_END -->";

  if (!doc.includes(START_TAG) || !doc.includes(END_TAG)) return;

  let warningBox = "";
  if (perfRegressions.length > 0) {
    warningBox = `> [!WARNING]\n> **Performance Regressions Detected (Statistical Deviation > 15%)**:\n`;
    for (const r of perfRegressions) {
      const changeStr =
        r.changePct > 0 ? `+${r.changePct.toFixed(1)}%` : `${r.changePct.toFixed(1)}%`;
      warningBox += `> - **${r.db}** → **${r.metric}**: ${r.current.toFixed(3)}ms (was ${r.previousAvg.toFixed(3)}ms, delta: ${changeStr}) - *${r.reason}*\n`;
    }
    warningBox += `>\n> *Please review recent changes or environmental noise to preserve sub-millisecond execution times.*\n\n`;
  }

  let tableMd = `\n### ⚡ Executive Summary Matrix\n\n${warningBox}`;
  tableMd += `| Database | Status | Cold Start | REST p95 | GQL Avg | CPU | Memory |\n`;
  tableMd += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  for (const dbConf of ALL_DATABASES) {
    const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;
    const meta = (DB_METADATA as any)[dbKey] || {
      label: dbKey.toUpperCase(),
      icon: "❓",
    };
    const label = `${meta.icon} **${meta.label}**`;

    let curr = results.find((r) => r.db === dbKey);
    let m: ReturnType<typeof extractMetrics> | null = null;
    let status = "PENDING";

    if (curr && curr.status !== "PENDING") {
      m = latestMetrics[dbKey] || null;
      status = curr.status === "SUCCESS" ? "🟢 PASS" : "🔴 FAIL";

      const last = db
        .query(
          `SELECT * FROM runs WHERE db_key = ? AND status = 'SUCCESS' ORDER BY timestamp DESC LIMIT 1`,
        )
        .get(dbKey) as any;
      if (last && curr.status === "FAILED" && m) {
        const lastM = extractMetrics(JSON.parse(last.metrics_json), dbConf.type);
        if (!m.collections) m.collections = lastM.collections;
        if (!m.graphqlAvg) m.graphqlAvg = lastM.graphqlAvg;
        if (!m.memGrowth) m.memGrowth = lastM.memGrowth;
        if (!m.systemCpu) m.systemCpu = lastM.systemCpu;
        if (!curr.coldStartMs && last.cold_start_ms) curr.coldStartMs = last.cold_start_ms;
      }
    } else {
      const last = db
        .query(
          `SELECT * FROM runs WHERE db_key = ? AND status = 'SUCCESS' ORDER BY timestamp DESC LIMIT 1`,
        )
        .get(dbKey) as any;
      if (last) {
        m = extractMetrics(JSON.parse(last.metrics_json), dbConf.type);
        status = "🟢 PASS (Hist)";
        curr = { coldStartMs: last.cold_start_ms } as any;
      }
    }

    if (m) {
      tableMd += `| [${label}](./benchmark_${dbKey.replace("-", "_")}.mdx) | ${status} | ${curr?.coldStartMs || 0}ms | ${m.collections.toFixed(3)}ms | ${m.graphqlAvg.toFixed(3)}ms | ${m.systemCpu.toFixed(1)}% | ${m.memGrowth.toFixed(1)}MB |\n`;
    } else {
      tableMd += `| [${label}](./benchmark_${dbKey.replace("-", "_")}.mdx) | ⚪ N/A | - | - | - | - | - |\n`;
    }
  }

  doc = doc.replace(
    /<!-- SUMMARY_MATRIX_START -->[\s\S]*?<!-- SUMMARY_MATRIX_END -->/,
    `${START_TAG}\n${tableMd}\n${END_TAG}`,
  );

  await fs.writeFile(indexFilePath, doc);
  log.info("Updated index summary matrix in docs/project/benchmarks/index.mdx");
}

/**
 * 🚀 Generates/Updates database-specific detail pages with historical trends and placeholders.
 * Truly surgical: Preserves existing successful results in the MDX.
 */
async function updateDatabaseSpecificReports(
  db: any,
  results: BenchmarkResult[],
  latestMetrics: Record<string, any>,
  resultsIn: BenchmarkResult[] = [],
  perfRegressions: any[] = [],
  currentRunTimestamp?: string,
) {
  const DOCS_DIR = path.join(process.cwd(), "docs/project/benchmarks");
  await fs.mkdir(DOCS_DIR, { recursive: true });

  for (const dbConf of ALL_DATABASES) {
    const dbKey = dbConf.useRedis ? `${dbConf.type}-redis` : dbConf.type;

    // Only update databases that were actually part of the current run (if resultsIn is provided and not empty)
    if (resultsIn.length > 0 && !resultsIn.some((r) => r.db === dbKey)) {
      continue;
    }
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

<!-- EXECUTIVE_START -->
<!-- LATEST_AUDIT_HEADER -->
## 📊 Latest Performance Audit

> ⏳ Pending — run full matrix to populate.

<!-- EXECUTIVE_FIX_NOTES_START -->
### 📝 Fix Overlays

> Phase notes and remediation entries appear here after matrix or surgical runs.
<!-- EXECUTIVE_FIX_NOTES_END -->

<!-- EXECUTIVE_PARTIAL_WATERMARK -->
<!-- EXECUTIVE_ALERTS_START -->
<!-- EXECUTIVE_ALERTS_END -->

<!-- EXECUTIVE_END -->

<!-- SUMMARY_START -->

> ⏳ Pending — derived tables populate after benchmark runs.

<!-- SUMMARY_END -->

<!-- LEDGER_START -->

<!-- LEDGER_END -->

<!-- BENCHMARK_END -->
`;
    }

    const ledgerScope = extractZone(doc, ZONE_MARKERS.ledger[0], ZONE_MARKERS.ledger[1]) ?? doc;

    // Get current results or last historical SUCCESS
    let curr = results.find((r) => r.db === dbKey);
    if (!curr && !doc.includes("<!-- BENCHMARK_START -->")) continue;

    let m: ReturnType<typeof extractMetrics>;
    let status: string;
    let timestamp: string;
    let isHistorical = false;

    // 🚀 CRITICAL: Get the PREVIOUS successful run for metric fallback, NOT the current one.
    // The current run was just inserted into the history DB with potentially sparse metrics
    // (e.g., from a --only run). We must exclude it so the surgical recovery copies from
    // the last COMPLETE run, not from itself.
    const last = db
      .query(
        `SELECT * FROM runs WHERE db_key = ? AND status = 'SUCCESS'${currentRunTimestamp ? " AND timestamp < ?" : ""} ORDER BY timestamp DESC LIMIT 1`,
      )
      .all(...(currentRunTimestamp ? [dbKey, currentRunTimestamp] : [dbKey])) as any[];
    const previousRun = last?.[0] || null;

    if (curr && curr.status !== "PENDING") {
      m = latestMetrics[dbKey];
      status = curr.status;
      timestamp = new Date().toLocaleString();

      // 🚀 SURGICAL METRICS RECOVERY: If a test crashed, its aggregate metric might be 0.
      // We must patch these zeroes with the last known good historical data to prevent ledger regression.
      if (previousRun) {
        const lastM = extractMetrics(JSON.parse(previousRun.metrics_json), dbConf.type);
        if (!m.collections) m.collections = lastM.collections;
        if (!m.graphqlAvg) m.graphqlAvg = lastM.graphqlAvg;
        if (!m.dbRaw) m.dbRaw = lastM.dbRaw;
        if (!m.memGrowth) m.memGrowth = lastM.memGrowth;
        if (!m.systemCpu) m.systemCpu = lastM.systemCpu;
        if (!m.hooks) m.hooks = lastM.hooks;
        // Only carry forward index pressure if the test did not explicitly fail
        if (!m.indexPressure && m.indexPressureStatus !== -1) m.indexPressure = lastM.indexPressure;
        if (!curr.coldStartMs && previousRun.cold_start_ms)
          curr.coldStartMs = previousRun.cold_start_ms;
      }
    } else {
      if (!previousRun) continue;
      m = extractMetrics(JSON.parse(previousRun.metrics_json), dbConf.type);
      status = previousRun.status;
      timestamp = new Date(previousRun.timestamp).toLocaleString();
      isHistorical = true;

      // 🚀 RESTORE Host Info from History
      if (previousRun.host_info_json) {
        (curr as any) = {
          ...curr,
          hostInfo: JSON.parse(previousRun.host_info_json),
        };
      }
    }

    const coldTrend = await getTrendDetails(db, dbKey, curr?.coldStartMs || 0, "cold_start_ms");
    const restTrend = await getTrendDetails(db, dbKey, m.collections, "collections_p95");
    const gqlTrend = await getTrendDetails(db, dbKey, m.graphqlAvg, "graphql_avg");

    const dbRegressions = perfRegressions.filter((r) => r.db === dbKey);
    let dbWarningBox = "";
    if (dbRegressions.length > 0) {
      dbWarningBox = `> [!WARNING]\n> **Performance Regressions Detected for ${meta.label}**:\n`;
      for (const r of dbRegressions) {
        const changeStr =
          r.changePct > 0 ? `+${r.changePct.toFixed(1)}%` : `${r.changePct.toFixed(1)}%`;
        dbWarningBox += `> - **${r.metric}**: ${r.current.toFixed(3)}ms (was ${r.previousAvg.toFixed(3)}ms, delta: ${changeStr}) - *${r.reason}*\n`;
      }
      dbWarningBox += `>\n> *Please investigate potential database adapter performance bottlenecks or environment variance.*\n\n`;
    }

    const fmtMs = (val: number): string => (val > 0 ? val.toFixed(3) + "ms" : "N/A");
    const fmtStatus = (val: number, budget: number): string =>
      val <= 0 ? "⚪ N/A" : val <= budget ? "🟢 PASS" : "🔴 FAIL";

    let extraWarnings = dbWarningBox;
    if (curr?.error || status === "FAILED") {
      extraWarnings += `> [!CAUTION]\n> **Anomalies Detected**: ${curr?.error || "System setup or script execution failed."} See console for stack trace.\n\n`;
    }
    if (!isHistorical && restTrend.icon === "🔴" && coldTrend.icon === "🔴") {
      extraWarnings += `> [!WARNING]\n> **Environment Shift Detected**: Massive latency delta (${restTrend.pct}). Re-run matrix to establish a new baseline.\n\n`;
    }

    const latencyRows = [
      {
        scenario: "Cold Start",
        latency: `${curr?.coldStartMs || 0}ms`,
        trend: `${coldTrend.icon} (${coldTrend.pct})`,
        budget: "< 5000ms",
        result: (curr?.coldStartMs || 0) <= 5000 ? "🟢 PASS" : "🔴 FAIL",
      },
      {
        scenario: "REST (Collections)",
        latency: fmtMs(m.collections || m.restAvg),
        trend: `${restTrend.icon} (${restTrend.pct})`,
        budget: "< 5ms",
        result: fmtStatus(m.collections || m.restAvg, 5),
      },
      {
        scenario: "Middleware Hooks",
        latency: fmtMs(m.hooks),
        trend: "⚪",
        budget: `< ${PERFORMANCE_BUDGET.hooks}ms`,
        result: fmtStatus(m.hooks, PERFORMANCE_BUDGET.hooks),
      },
      {
        scenario: "GraphQL (Avg)",
        latency: fmtMs(m.graphqlAvg),
        trend: `${gqlTrend.icon} (${gqlTrend.pct})`,
        budget: "< 5ms",
        result: fmtStatus(m.graphqlAvg, 5),
      },
      {
        scenario: "Million-Row Index",
        latency: m.indexPressureStatus === -1 ? "FAILED" : fmtMs(m.indexPressure),
        trend: "⚪",
        budget: "< 250ms",
        result:
          m.indexPressureStatus === -1
            ? "🔴 FAIL"
            : m.indexPressure <= 0
              ? "⚪ N/A"
              : m.indexPressure <= 250
                ? "🟢 PASS"
                : dbKey === "sqlite"
                  ? "🔴 LOCK WALL"
                  : "🔴 FAIL",
      },
      {
        scenario: "DB Raw (p95)",
        latency: fmtMs(m.dbRaw),
        trend: "⚪",
        budget: "< 50ms",
        result: fmtStatus(m.dbRaw, 50),
      },
    ];

    const mermaidHist = db
      .query(
        `SELECT collections_p95 FROM runs WHERE db_key = ? AND status = 'SUCCESS' AND collections_p95 > 0 ORDER BY timestamp DESC LIMIT 10`,
      )
      .all(dbKey) as Array<{ collections_p95: number }>;
    const mermaidPoints = mermaidHist.map((h) => h.collections_p95).reverse();

    const [fixStart, fixEnd] = EXECUTIVE_MARKERS.fixNotes;
    const execZone = extractZone(doc, ZONE_MARKERS.executive[0], ZONE_MARKERS.executive[1]) ?? "";
    const existingFixNotes = extractZone(execZone, fixStart, fixEnd) ?? "";

    const dbType = dbKey.replace("-redis", "");
    const redisOn = dbKey.includes("redis");
    const testEntries: TestRollupEntry[] = [];
    let recordedScripts = 0;
    let applicableTotal = 0;

    let infrastructureMd = `\n## \u{1F4CA} Infrastructure drill-down\n\n`;

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

    infrastructureMd += await generateTrendBlock(
      db,
      dbKey,
      m,
      "mixedAvg",
      "Mixed p95",
      "Production request mix: 60% Reads, 20% Writes, 15% GraphQL, 5% Media.",
      "mixed_workload_aggregate",
      "mixedAvg",
      "Mixed Workload Performance",
    );

    for (const item of coreTrends) {
      infrastructureMd += await generateTrendBlock(
        db,
        dbKey,
        m,
        item.metric,
        item.label,
        item.desc,
        item.historyKey,
        item.liveKey,
        item.title,
        item.unit,
      );
    }

    infrastructureMd += `\n### Enterprise scale audit\n\n`;

    infrastructureMd += await generateTrendBlock(
      db,
      dbKey,
      m,
      "tenancyAvg",
      "Tenancy p95",
      "Measures latency across tenant isolation boundaries.",
      "collections_p95",
      "tenancyAvg",
      "Multi-Tenancy Performance",
    );

    infrastructureMd += await generateTrendBlock(
      db,
      dbKey,
      m,
      "relationalAvg",
      "Relational p95",
      "Tests performance of complex JOINs and nested relationship population.",
      "graphql_avg",
      "relationalAvg",
      "Relational Resolver Latency",
    );

    infrastructureMd += await generateTrendBlock(
      db,
      dbKey,
      m,
      "telemetryAvg",
      "Telemetry p95",
      "Measures overhead of telemetry collection and cryptographic signing.",
      "middleware_hooks_p95",
      "telemetryAvg",
      "Telemetry & Update Performance",
    );

    // Patch ledger sections — collapsed `<details>` per test
    for (const script of BENCHMARK_SCRIPTS) {
      const isSql =
        dbKey.includes("sqlite") || dbKey.includes("postgres") || dbKey.includes("mariadb");
      const isApplicable =
        script.strategy === "all" ||
        (script.strategy === "sql" && isSql) ||
        (script.strategy === "once" && dbKey === "sqlite");

      if (!isApplicable) continue;
      applicableTotal++;

      const timing = curr?.scriptTimings?.[script.shortLabel] || 0;
      const trend = await getScriptTrend(db, dbKey, script.shortLabel, timing);
      const tagSlug = script.shortLabel
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "_")
        .toUpperCase();

      const testId = path.basename(script.path).replace(/\.test\.ts$/i, "");
      const history = loadHistory(testId, dbType, redisOn, "warm");
      const prior = history.slice(0, -1);
      const currentSample =
        history.length > 0
          ? history[history.length - 1]!
          : { avgMs: timing, p95Ms: timing, rps: 0 };
      const analyzed = analyzeTrend(
        {
          name: script.shortLabel,
          avgMs: currentSample.avgMs,
          p95Ms: currentSample.p95Ms,
          rps: currentSample.rps,
        },
        prior.length > 0 ? prior : history,
        testId,
        dbType,
        redisOn,
        "warm",
      );
      const rootCause = classifyRootCause(
        analyzed.deltaPct,
        analyzed.p95DeltaPct,
        analyzed.rpsDeltaPct,
        false,
        analyzed.sampleSize,
      );
      const baselineMs = prior.length > 0 ? prior[prior.length - 1]!.avgMs : currentSample.avgMs;
      const likelyCause =
        script.codePaths?.[0] || (rootCause.insight.match(/`([^`]+)`/)?.[1] ?? "\u2014");
      const insightRaw = rootCause.insight;
      const insight =
        insightRaw && isSpecificInsight(insightRaw)
          ? formatTestInsightNote(insightRaw, script.codePaths ?? [])
          : "";

      testEntries.push({
        tag: tagSlug,
        label: script.label,
        shortLabel: script.shortLabel,
        path: script.path,
        section: script.section,
        avgMs: currentSample.avgMs,
        baselineMs,
        deltaPct: analyzed.deltaPct,
        severity: timing > 0 ? analyzed.severity : "pending",
        icon: trend.icon,
        trendLabel: trend.pct,
        likelyCause,
        budgetLabel: script.metricCategory === "latency" ? "< 5ms" : "\u2014",
        codePaths: script.codePaths ?? [],
        expected: analyzed.severity === "regression" ? "NO \u2014 investigate" : "\u2014",
        owner: analyzed.severity === "regression" ? "@backend" : "\u2014",
      });

      let truthBlock = `> \u23F3 **${script.label}**: Pending execution.\n> \uD83C\uDFAF ${script.desc}`;
      try {
        const dbResultsDir = path.join(ROOT_RESULTS_DIR, dbKey);
        const allFiles = await findFilesRecursive(dbResultsDir, ".table.txt");
        const tableFile = allFiles.find((f) => {
          const baseName = path.basename(f).toLowerCase();
          const targetSlug = script.shortLabel.toLowerCase().replace(/[^a-z0-9]/g, "_");
          return baseName.includes(targetSlug);
        });
        if (tableFile) {
          const rawTable = await fs.readFile(tableFile, "utf8");
          truthBlock = `\`\`\`text\n${rawTable.trim()}\n\`\`\``;
          recordedScripts++;
        }
      } catch {
        /* best-effort */
      }

      if (truthBlock.startsWith(">")) {
        const tagBlock =
          extractFirstTagBlock(ledgerScope, tagSlug) ??
          extractFirstTagBlock(ledgerScope, script.shortLabel.split(" ")[0]!.toUpperCase());
        if (tagBlock) {
          const inner = extractTagInner(tagBlock, tagSlug);
          const truthMatch = inner.match(
            /<!-- LEDGER_TRUTH_START -->\s*([\s\S]*?)\s*<!-- LEDGER_TRUTH_END -->/,
          );
          if (truthMatch?.[1]?.trim() && !truthMatch[1].includes("Pending")) {
            truthBlock = truthMatch[1].trim();
            recordedScripts++;
          }
        }
      }

      const tableContent = buildCollapsedLedgerTagInner({
        tag: tagSlug,
        label: script.label,
        testPath: script.path,
        avgMs: currentSample.avgMs || timing,
        icon: trend.icon,
        deltaPct: analyzed.deltaPct,
        trendLabel: trend.pct,
        insight,
        truth: truthBlock,
      });

      doc = upsertLedgerSection(doc, tagSlug, tableContent);
    }

    // ── Patch dimension summary table and auto-open degraded dimension groups ──
    const dimStatuses: Partial<Record<LedgerDimension, DimensionStatus>> = {};
    const dimEntries = new Map<LedgerDimension, TestRollupEntry[]>();
    for (const dim of LEDGER_DIMENSION_ORDER) dimEntries.set(dim, []);
    for (const entry of testEntries) {
      const section = entry.section ?? "baseline";
      const dim = mapSectionToDimension(section);
      dimEntries.get(dim)!.push(entry);
    }
    for (const dim of LEDGER_DIMENSION_ORDER) {
      const entries = dimEntries.get(dim)!;
      if (entries.length === 0) continue;
      let worstAbsDelta = 0;
      let worstIcon = "\u{1F7E2}";
      let hasDegraded = false;
      for (const entry of entries) {
        if (entry.severity === "regression" || entry.severity === "critical") {
          hasDegraded = true;
          worstIcon = "\u{1F534}";
          worstAbsDelta = Math.max(worstAbsDelta, Math.abs(entry.deltaPct ?? 0));
        } else if (entry.severity === "warning" || entry.severity === "watch") {
          if (!hasDegraded) worstIcon = "\u{1F7E1}";
          worstAbsDelta = Math.max(worstAbsDelta, Math.abs(entry.deltaPct ?? 0));
        } else if (entry.severity === "pending") {
          if (!hasDegraded && worstIcon === "\u{1F7E2}") worstIcon = "\u{26AA}";
        }
      }
      dimStatuses[dim] = {
        testCount: entries.length,
        worstIcon,
        worstDelta: worstAbsDelta > 0 ? `\u00B1${worstAbsDelta.toFixed(0)}%` : "\u2014",
        worstBudget: hasDegraded ? "Fail" : worstIcon === "\u{26AA}" ? "\u2014" : "Pass",
        hasDegraded,
      };
    }
    doc = applyDimensionSummaryToLedger(doc, dimStatuses);

    const hostInfo = (curr?.hostInfo ?? {}) as Record<string, string>;
    const hostLine = hostInfo.runtime ?? "runtime pending";
    let executiveBody = buildExecutiveReport({
      dbLabel: meta.label,
      timestamp,
      status,
      isHistorical,
      recorded: recordedScripts || testEntries.filter((e) => e.avgMs > 0).length,
      total: applicableTotal,
      skipped: Math.max(0, applicableTotal - recordedScripts),
      hostLine,
      warningBox: extraWarnings,
      latencyRows,
      testEntries,
      mermaidPoints,
      existingFixNotes,
    });

    let executiveMd = replaceLatestAuditHeading(executiveBody, `(${timestamp})`);
    executiveMd = ensureExecutiveMarkers(executiveMd);
    if (isHistorical) {
      executiveMd = patchExecutivePartialWatermark(
        executiveMd,
        "> \u{1F4CB} **Historical snapshot** — metrics recovered from prior matrix run.",
      );
    }

    const metadataMd = buildHostEnvironmentTable(hostInfo);
    const existingSummary = extractZone(doc, ZONE_MARKERS.summary[0], ZONE_MARKERS.summary[1]);

    doc = patchBenchmarkZones(doc, {
      executive: executiveMd,
      summary: existingSummary?.trim() || undefined,
      infrastructure: wrapInfrastructureCollapse(infrastructureMd),
      metadata: metadataMd,
    });

    await fs.writeFile(filePath, doc);
    writeHistoryArchive(dbKey, filePath);
    log.info(`Updated technical ledger: benchmark_${dbKey.replace("-", "_")}.mdx`);
  }
}

export async function writeCISummary(
  results: BenchmarkResult[],
  regressions: string[] | RegressionResult[],
) {
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
