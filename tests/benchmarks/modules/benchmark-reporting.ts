/**
 * @file tests/benchmark./modules/benchmark-reporting.ts
 * @description Public facade for the benchmark intelligence pipeline.
 *
 * ### Contract
 *
 * ```typescript
 * await reportBenchmark(result, {
 *   source: "single-test",
 *   mode: "partial",
 *   testFile: "tests/benchmarks/auth-performance.test.ts",
 *   phase: "warm",
 * });
 * ```
 *
 * ### Record Modes
 *
 * | Mode      | Console | SQLite | MDX Write |
 * |-----------|:-------:|:------:|:---------:|
 * | `none`    | ✅      | ❌     | ❌        |
 * | `history` | ✅      | ✅     | ❌        |
 * | `partial` | ✅      | ✅     | ✅ (one section + watermark) |
 * | `full`    | ✅      | ✅     | ✅ (all sections) |
 *
 * ### Internals
 * - normalize → persist (SQLite, WAL, transactions)
 * - analyze → trend + root cause + budgets
 * - update → MDX section + executive summary (with file lock)
 */
import {
  persistRun,
  detectCommitSha,
  detectBranch,
  detectOS,
  detectRuntime,
  type HistoryEntry,
} from "./benchmark-history";
import { runAnalysis } from "./benchmark-analysis";
import {
  writeTruthTable,
  writeSummary,
  writeTrendAndInsight,
  writeExecutiveSummary,
  getDocPath,
} from "./benchmark-mdx";
import { buildExecutiveSummary, formatSummaryAsMdx } from "./benchmark-summary";
import { crossCorrelate } from "./benchmark-cross-correlate";
import fs from "node:fs";
import path from "node:path";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type BenchmarkRecordMode = "none" | "history" | "partial" | "full";

export interface BenchmarkReportOptions {
  /** Which runner produced this result */
  source: "single-test" | "matrix";
  /** Recording mode — controls persistence + MDX mutation */
  mode: BenchmarkRecordMode;
  /** Path to the test file (e.g. "tests/benchmarks/auth-performance.test.ts") */
  testFile: string;
  /** Stable test identifier (e.g. "auth-performance") */
  testId?: string;
  /** Short label for MDX tag matching (e.g. "Auth Trace") */
  shortLabel?: string;
  /** Execution phase: cold start, warm request, or mixed workload */
  phase?: "cold" | "warm" | "mixed";
  /** Scenario name for multi-scenario benchmarks */
  scenario?: string;
  /** Unique run ID to prevent duplicate history rows on retry */
  runId?: string;
  /** Git commit SHA (auto-detected if omitted) */
  commitSha?: string;
  /** Git branch (auto-detected if omitted) */
  branch?: string;
}

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

function getDbType(): string {
  return typeof process !== "undefined" ? process.env.DB_TYPE || "sqlite" : "sqlite";
}

function isRedisEnabled(): boolean {
  return process.env.REDIS_ENABLED === "1" || process.env.REDIS_ENABLED === "true";
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "");
}

// ─────────────────────────────────────────────────────────────
// Test Metadata Registry (educational context)
// ─────────────────────────────────────────────────────────────

interface TestMeta {
  proves: string;
  codePaths: string[];
  impact: string;
}

const META_REGISTRY: Record<string, TestMeta> = {};

export function registerTestMeta(
  testFile: string,
  proves: string,
  codePaths: string[],
  impact: string,
) {
  META_REGISTRY[slugify(testFile)] = { proves, codePaths, impact };
}

/** Bulk register metadata from a frozen registry object — replaces 50+ individual calls */
export function registerBulkTestMeta(
  registry: Record<string, { proves: string; codePaths: readonly string[]; impact: string }>,
) {
  const keys = Object.keys(registry);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    const meta = registry[k]!;
    META_REGISTRY[slugify(k)] = {
      proves: meta.proves,
      codePaths: [...meta.codePaths],
      impact: meta.impact,
    };
  }
}

export function getTestMeta(testFile: string): TestMeta {
  const key = slugify(testFile);
  const registered = META_REGISTRY[key];
  if (registered) return registered;

  // Fallback: try to read @description from the test file
  let proves = "";
  try {
    const c = fs.readFileSync(path.resolve(process.cwd(), testFile), "utf-8");
    const dm = c.match(/@description\s+(.+)/i);
    if (dm) proves = dm[1].trim();
  } catch {
    /* best-effort */
  }

  return { proves, codePaths: [], impact: "" };
}

// ─────────────────────────────────────────────────────────────
// Main API
// ─────────────────────────────────────────────────────────────

let _trendEmitted = false;

export function resetTrendGuard(): void {
  _trendEmitted = false;
}

/**
 * Report a benchmark result through the full intelligence pipeline.
 *
 * Called by both single-test runner (`bun test`) and the full matrix runner.
 * The `mode` parameter controls what gets persisted and mutated.
 */
export async function reportBenchmark(
  result: {
    name: string;
    avgMs: number;
    p50Ms?: number;
    p95Ms?: number;
    p99Ms?: number;
    minMs?: number;
    maxMs?: number;
    rps: number;
    cv?: number;
    ci95MarginMs?: number;
    memoryHeapMb?: number;
    memoryRssMb?: number;
    errorCount?: number;
    status?: string;
  },
  options: BenchmarkReportOptions,
): Promise<void> {
  // ── Guard: prevent duplicate trend emission per test run ──
  if (_trendEmitted && options.mode !== "none") return;
  if (options.mode !== "none") _trendEmitted = true;

  const dbType = getDbType();
  const redisEnabled = isRedisEnabled();
  const phase = options.phase || "warm";
  const testId = options.testId || path.basename(options.testFile, path.extname(options.testFile));
  const meta = getTestMeta(options.testFile);

  // ── Step 1: Persist to SQLite (if recording) ──
  if (options.mode !== "none") {
    const entry: HistoryEntry = {
      testId,
      testFile: options.testFile,
      dbType,
      redisEnabled,
      phase,
      scenario: options.scenario || "",
      commitSha: options.commitSha || detectCommitSha(),
      branch: options.branch || detectBranch(),
      os: detectOS(),
      runtime: detectRuntime(),
      avgMs: result.avgMs,
      p50Ms: result.p50Ms || 0,
      p95Ms: result.p95Ms || 0,
      p99Ms: result.p99Ms || 0,
      p99_9Ms: 0,
      minMs: result.minMs || 0,
      maxMs: result.maxMs || 0,
      rps: result.rps,
      cv: result.cv || 0,
      ci95MarginMs: result.ci95MarginMs || 0,
      memoryHeapMb: result.memoryHeapMb,
      memoryRssMb: result.memoryRssMb,
      errorCount: result.errorCount || 0,
      status: result.status || "SUCCESS",
      runId: options.runId,
      extra: { runId: options.runId },
    };
    persistRun(entry);
  }

  // ── Step 2: Analyze trends ──
  const isSingleTest = options.source === "single-test";
  const analysis = runAnalysis(
    {
      name: result.name,
      avgMs: result.avgMs,
      p95Ms: result.p95Ms || 0,
      rps: result.rps,
    },
    testId,
    options.testFile,
    dbType,
    redisEnabled,
    phase,
    isSingleTest,
    meta.codePaths,
  );

  // ── Cross-test correlation for single-test runs ──
  if (isSingleTest && Math.abs(analysis.trend.deltaPct) > 5) {
    const correlation = crossCorrelate(testId, dbType, analysis.trend.deltaPct);
    if (correlation.isConfirmed) {
      // Upgrade insight with correlation evidence
      analysis.rootCause.insight += "  \n**Cross-correlation**: " + correlation.explanation;
      analysis.rootCause.confidence = "confirmed";
      analysis.rootCause.isSuspected = false;
    }
  }

  // ── Step 3: Update MDX (if recording mode allows) ──
  if (options.mode === "partial" || options.mode === "full") {
    // Write trend label + insight to MDX section
    writeTrendAndInsight(
      analysis.trend.label,
      analysis.rootCause.insight,
      options.testFile,
      null,
      options.shortLabel,
    );

    // Write executive summary
    const isPartial = options.mode === "partial";
    writeExecutiveSummary(result.name, analysis.trend.label, isPartial);
  }
}

// ─────────────────────────────────────────────────────────────
// Gate
// ─────────────────────────────────────────────────────────────

function shouldRecord(): boolean {
  return (
    process.env.BENCHMARK_RECORD === "1" ||
    process.env.BENCHMARK_MATRIX === "1" ||
    process.env.CI === "true"
  );
}

// ─────────────────────────────────────────────────────────────
// Compatibility bridges for benchmark-utils.ts
// These adapt the old API (title + shortLabel) to the new modules (testFile)
// ─────────────────────────────────────────────────────────────

let _lastTag: string | null = null;
let _lastTestFile = "unknown";

function discoverTestFile(): string {
  try {
    const err = new Error();
    const stack = err.stack || "";
    for (const line of stack.split("\n")) {
      const n = line.replace(/\\/g, "/");
      // Must be a test file, not an infrastructure module
      if (
        n.includes("tests/benchmarks/") &&
        !n.includes("tests/benchmarks/modules/") &&
        !n.includes("benchmark-utils") &&
        !n.includes("benchmark-reporting") &&
        !n.includes("benchmark-mdx") &&
        !n.includes("benchmark-analysis") &&
        !n.includes("benchmark-history") &&
        !n.includes("benchmark-summary") &&
        !n.includes("benchmark-cross-correlate") &&
        !n.includes("benchmark-meta") &&
        !n.includes("benchmark-intelligence")
      ) {
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

/**
 * Bridge: called by benchmark-utils.ts printTruthTable()
 * Gated — only writes MDX when BENCHMARK_RECORD=1 or BENCHMARK_MATRIX=1.
 */
export function pushTableToMdx(_title: string, table: string, shortLabel?: string): void {
  if (!shouldRecord()) return;
  const testFile = discoverTestFile();
  _lastTestFile = testFile;
  _lastTag = writeTruthTable(table, testFile, shortLabel);
}

/**
 * Bridge: called by benchmark-utils.ts printSummaryTable()
 * Gated — only writes MDX when BENCHMARK_RECORD=1 or BENCHMARK_MATRIX=1.
 */
export function appendSummaryToMdx(summaryTable: string, shortLabel?: string): void {
  if (!shouldRecord()) return;
  writeSummary(summaryTable, _lastTestFile, _lastTag, shortLabel);
}

/**
 * Compatibility wrapper — called by benchmark-utils.ts exportResult().
 * Uses the old history.jsonl + new SQLite pipeline.
 */
export async function computeAndApplyTrend(
  result: any,
  shortLabel?: string,
  mode: "cold" | "warm" | "mixed" = "warm",
): Promise<void> {
  // Discover test file from env or call stack (legacy behavior)
  let testFile = process.env.BENCH_FILE || "unknown";

  if (testFile === "unknown") {
    try {
      const err = new Error();
      const stack = err.stack || "";
      for (const line of stack.split("\n")) {
        const n = line.replace(/\\/g, "/");
        // Must be a test file, not an infrastructure module
        if (
          n.includes("tests/benchmarks/") &&
          !n.includes("tests/benchmarks/modules/") &&
          !n.includes("benchmark-utils") &&
          !n.includes("benchmark-reporting") &&
          !n.includes("benchmark-mdx") &&
          !n.includes("benchmark-analysis") &&
          !n.includes("benchmark-history") &&
          !n.includes("benchmark-summary") &&
          !n.includes("benchmark-cross-correlate") &&
          !n.includes("benchmark-meta") &&
          !n.includes("benchmark-intelligence")
        ) {
          const m = n.match(/tests\/benchmarks\/([\w.-]+)/i);
          if (m) {
            testFile = `tests/benchmarks/${m[1].split(":")[0].split("?")[0]}`;
            break;
          }
        }
      }
    } catch {
      /* best-effort */
    }
  }

  // Determine mode from environment
  const recordMode: BenchmarkRecordMode =
    process.env.BENCHMARK_MATRIX === "1"
      ? "full"
      : process.env.BENCHMARK_RECORD === "1"
        ? "partial"
        : process.env.BENCHMARK_HISTORY_ONLY === "1"
          ? "history"
          : "none";

  return reportBenchmark(result, {
    source: process.env.BENCHMARK_MATRIX === "1" ? "matrix" : "single-test",
    mode: recordMode,
    testFile,
    shortLabel,
    phase: mode,
  });
}

// ─────────────────────────────────────────────────────────────
// 6. Ranked Executive Summary (called by matrix runner)
// ─────────────────────────────────────────────────────────────

/**
 * Build and write a ranked executive summary to the MDX report.
 * Called by the matrix runner after all benchmarks complete.
 *
 * Reads all tracked tests from history.sqlite across all databases,
 * computes cross-test correlation, and writes ranked results.
 */
export function buildAndWriteExecutiveSummary(
  trackedTests: Array<{
    testId: string;
    dbType: string;
    phase: string;
    redisEnabled: boolean;
  }>,
  isPartial: boolean,
): string {
  if (!shouldRecord()) return "";

  const summary = buildExecutiveSummary(trackedTests, isPartial);
  const mdx = formatSummaryAsMdx(summary);

  // Write to the MDX report
  try {
    const docPath = getDocPath();
    if (!fs.existsSync(docPath)) return mdx;

    let doc = fs.readFileSync(docPath, "utf8");
    const marker = "## \u{1F4CA} Executive Summary";
    if (!doc.includes(marker)) return mdx;

    // Replace everything between Executive Summary and the next ## heading
    const nextHeading = doc.indexOf("## ", doc.indexOf(marker) + marker.length);
    if (nextHeading > 0) {
      doc =
        doc.slice(0, doc.indexOf("\n", doc.indexOf(marker)) + 1) +
        "\n" +
        mdx +
        "\n\n" +
        doc.slice(nextHeading);
    } else {
      doc = doc.slice(0, doc.indexOf("\n", doc.indexOf(marker)) + 1) + "\n" + mdx + "\n";
    }

    // Atomic write
    const tmpPath = docPath + ".tmp." + Date.now();
    fs.writeFileSync(tmpPath, doc, "utf8");
    fs.renameSync(tmpPath, docPath);
  } catch {
    /* best-effort */
  }

  return mdx;
}
