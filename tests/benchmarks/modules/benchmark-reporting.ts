/**
 * @file tests/benchmarks/modules/benchmark-reporting.ts
 * @description Record benchmark results, analyze trend, write to MDX.
 *
 * Called by exportResult() in benchmark-utils.ts. Both single tests and
 * the matrix runner use this same pipeline.
 */
import { persistRun, type HistoryEntry } from "./benchmark-history";
import { analyzeTrend, classifyRootCause, checkBudgets } from "./benchmark-analysis";
import { writeTruthTable, writeSummary, type BenchmarkReportOptions } from "./benchmark-mdx";
import path from "node:path";
import fs from "node:fs";

// Re-export for the matrix runner
export type BenchmarkRecordMode = "partial" | "full";

let _lastTag: string | null = null;
let _lastTestFile = "unknown";

function getDbType(): string {
  return process.env.DB_TYPE || "sqlite";
}

function shouldRecord(): boolean {
  return (
    process.env.BENCHMARK_RECORD === "1" ||
    process.env.BENCHMARK_MATRIX === "1" ||
    process.env.CI === "true"
  );
}

function discoverTestFile(): string {
  try {
    const err = new Error();
    const stack = err.stack || "";
    for (const line of stack.split("\n")) {
      const n = line.replace(/\\/g, "/");
      if (n.includes("tests/benchmarks/") && !n.includes("modules/")) {
        const m = n.match(/tests\/benchmarks\/([\w.-]+)/i);
        if (m) {
          return `tests/benchmarks/${m[1].split(":")[0].split("?")[0]}`;
        }
      }
    }
  } catch {
    /* best-effort */
  }
  return "unknown";
}

/** @deprecated Use finalizeReport() instead. Trends are now computed by finalizeReport(). */
export async function reportBenchmark(
  result: {
    name: string;
    avgMs: number;
    p95Ms?: number;
    rps?: number;
    errorCount?: number;
    status?: string;
  },
  options: BenchmarkReportOptions,
): Promise<void> {
  const dbType = options.dbType || getDbType();
  const redisEnabled = options.redisEnabled ?? false;
  const phase = options.phase || "warm";
  const testId = options.testId || path.basename(options.testFile || "unknown");

  // ── Persist passing runs to SQLite (for trend history) ──
  const isPassing =
    (result.status === "SUCCESS" || result.status === undefined) && (result.errorCount || 0) === 0;

  if (isPassing && options.mode !== "none") {
    const entry: HistoryEntry = {
      runId: options.runId,
      testId,
      dbType,
      redisEnabled,
      phase,
      avgMs: result.avgMs,
      p95Ms: result.p95Ms || 0,
      rps: result.rps || 0,
      errorCount: result.errorCount || 0,
      status: "SUCCESS",
    };
    persistRun(entry);
  }
}

// Bridge: called by benchmark-utils.ts printTruthTable()
export function pushTableToMdx(_title: string, table: string, shortLabel?: string): void {
  if (!shouldRecord()) return;
  const testFile = discoverTestFile();
  _lastTestFile = testFile;
  _lastTag = writeTruthTable(table, testFile, shortLabel);
}

// Bridge: called by benchmark-utils.ts printSummaryTable()
export function appendSummaryToMdx(summaryTable: string, shortLabel?: string): void {
  if (!shouldRecord()) return;
  writeSummary(summaryTable, _lastTestFile, _lastTag, shortLabel);
}

/** @deprecated Use finalizeReport() instead. Kept for backward compatibility. */
export async function computeAndApplyTrend(_result: any, _shortLabel?: string): Promise<void> {
  // No-op: trends are now computed by finalizeReport()
}

/**
 * Finalize report for a benchmark run.
 * Reads all history entries for this runId, filters by mode,
 * calculates mode-aware trends, writes MDX once (batched).
 */
export async function finalizeReport(runId: string): Promise<void> {
  try {
    // 1. Read history.jsonl
    const historyPath = path.resolve(process.cwd(), "tests/benchmarks/results/history.jsonl");
    if (!fs.existsSync(historyPath)) return;

    const raw = fs.readFileSync(historyPath, "utf8").trim().split("\n").filter(Boolean);
    const allEntries = raw.map((line) => JSON.parse(line));

    // 2. Filter to this runId
    const runEntries = allEntries.filter((e) => e.runId === runId);
    if (runEntries.length === 0) return;

    // 3. Determine mode and db
    const runMode = runEntries[0].runMode;
    const db = runEntries[0].db;
    const redis = runEntries[0].redis;
    const dbLabel = redis ? `${db}-redis` : db;

    // 4. Group by testFile + metric
    const groups = new Map<string, any[]>();
    for (const entry of runEntries) {
      const key = `${entry.testFile}:${entry.metric}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    // 5. Get previous same-mode history for comparison
    const previousSameMode = allEntries.filter((e) => e.runMode === runMode && e.runId !== runId);

    // 6. Build trend sections
    for (const [key, entries] of groups) {
      const current = entries[entries.length - 1];

      // Find previous same-mode, same-metric entries
      const prevEntries = previousSameMode.filter((e) => `${e.testFile}:${e.metric}` === key);

      const trend = analyzeTrend(
        {
          name: current.metric,
          avgMs: current.avgMs,
          p95Ms: current.p95Ms || 0,
          rps: current.rps || 0,
        },
        prevEntries,
        current.testFile,
        db,
        redis,
        (current.phase || "warm") as "cold" | "warm" | "mixed",
      );

      let trendLabel = trend.label;

      // Add timestamp
      const ts = current.timestamp.replace("T", " ").substring(0, 19);
      trendLabel += ` (${ts})`;

      // Get testFile and shortLabel for MDX section discovery
      const testFile = current.testFile;
      const shortLabel = current.layer || undefined;

      // Root Cause Classification
      const rootCause = classifyRootCause(
        trend.deltaPct,
        trend.p95DeltaPct,
        trend.rpsDeltaPct,
        runMode === "standalone",
        trend.sampleSize,
      );

      // Budget checking — auto-detect phase from test file
      const testFileLower = (current.testFile || "").toLowerCase();
      const isColdTest =
        testFileLower.includes("cold-start") || testFileLower.includes("setup-proxy");
      const phase = isColdTest ? "cold" : current.phase || "warm";
      const budgetViolations = checkBudgets(db, {
        [`${phase}_avg`]: current.avgMs,
        [`${phase}_p95`]: current.p95Ms || 0,
      });

      // Build dynamic SWOT Good/Bad points
      const goods: string[] = [];
      const bads: string[] = [];

      // Evaluation of Budgets
      if (budgetViolations.length === 0) {
        goods.push("Within performance budget limits");
      } else {
        for (const v of budgetViolations) {
          bads.push(`Violates budget limits: ${v}`);
        }
      }

      // Evaluation of Trend
      if (trend.isBaseline) {
        goods.push("Baseline performance successfully established");
      } else {
        if (trend.severity === "stable" || trend.severity === "watch") {
          goods.push(`Performance is stable (${trend.deltaPct.toFixed(1)}% delta)`);
        } else if (trend.deltaPct < -3) {
          goods.push(
            `Performance improved significantly (${Math.abs(trend.deltaPct).toFixed(0)}% faster)`,
          );
        } else {
          bads.push(`Performance regressed significantly (+${trend.deltaPct.toFixed(0)}% slower)`);
        }
      }

      // Evaluation of Throughput (RPS)
      if (trend.rpsDeltaPct > 5) {
        goods.push(`Throughput increased (+${trend.rpsDeltaPct.toFixed(0)}% RPS)`);
      } else if (trend.rpsDeltaPct < -10) {
        bads.push(`Throughput dropped (-${Math.abs(trend.rpsDeltaPct).toFixed(0)}% RPS)`);
      }

      // Evaluation of Consistency (CV)
      if (current.cv !== undefined) {
        if (current.cv < 0.15) {
          goods.push(`Highly consistent latency profile (CV: ${current.cv.toFixed(2)})`);
        } else if (current.cv > 0.35) {
          bads.push(`High latency variance/jitter detected (CV: ${current.cv.toFixed(2)})`);
        }
      }

      let insight = rootCause.insight;
      if (goods.length > 0 || bads.length > 0) {
        insight += "  \n\n> [!NOTE]\n> **Performance SWOT Analysis**\n>\n";
        if (goods.length > 0) {
          insight += goods.map((g) => `> * ✅ ${g}`).join("\n") + "\n>\n";
        }
        if (bads.length > 0) {
          insight += bads.map((b) => `> * ❌ ${b}`).join("\n") + "\n";
        }
      }

      // Write trend to MDX
      try {
        const { writeTrendAndInsight } = await import("./benchmark-mdx");
        writeTrendAndInsight(
          trendLabel,
          insight,
          `tests/benchmarks/${testFile}.test.ts`,
          null,
          shortLabel,
        );
      } catch {
        // Best effort
      }
    }

    // 7. Rebuild summary
    try {
      const { rebuildSummary } = await import("./benchmark-mdx");
      await rebuildSummary(dbLabel);
    } catch {
      // Best effort
    }

    // 8. Print summary to console
    const totalTime = runEntries.reduce((s, e) => Math.max(s, e.wallClockMs || 0), 0);
    const avgMetric = runEntries.reduce((s, e) => s + e.avgMs, 0) / runEntries.length;
    console.log(
      `\n  [${runMode.toUpperCase()}] ${runEntries.length} metrics recorded · avg ${avgMetric.toFixed(2)}ms · ${(totalTime / 1000).toFixed(1)}s wall clock`,
    );
  } catch (err: any) {
    console.error(`  finalizeReport error: ${err.message}`);
  }
}

// Helper to reset emitted trend flags in tests
export function resetTrendGuard(): void {
  // No-op: trend guard removed in favor of batched finalizeReport()
}
