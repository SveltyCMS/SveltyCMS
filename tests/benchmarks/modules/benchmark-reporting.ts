/**
 * @file tests/benchmarks/modules/benchmark-reporting.ts
 * @description Benchmark reporting facade — gates MDX writes on BENCHMARK_RECORD=1.
 *
 * ### Surgical run contract (`BENCHMARK_RECORD=1 bun test …`)
 * 1. `exportResult()` → `history.jsonl` (debug) + `finalizeReport()` → `history.sqlite`
 * 2. `pushTableToMdx()` → **one** LEDGER tag via `writeTruthTable()`
 * 3. `appendSummaryToMdx()` → **one** summary inside the same LEDGER tag
 * 4. `finalizeReport()` → per-test ledger + **Current Run Summary** + **Historical Trends** (separate SUMMARY slots)
 * 5. **Never** touch `EXECUTIVE` or call `updateDatabaseSpecificReports()` — matrix owns those
 *
 * ### Rule C — Current Run vs Historical Trends
 * - `SUMMARY_RUN_OVERLAY_*` — this invocation only (`buildRunSummaryTable`)
 * - `SUMMARY_HISTORY_*` — sparkline trends from `history.sqlite` (`buildHistoryArchiveTable`)
 */
import fs from "node:fs";
import path from "node:path";
import {
  persistRun,
  loadHistory,
  loadDistinctTestIds,
  type HistoryEntry,
} from "./benchmark-history";
import { analyzeTrend, classifyRootCause, checkBudgets } from "./benchmark-analysis";
import {
  buildCollapsedLedgerTagInner,
  buildExecutiveReport,
  buildTestRollupEntriesFromRun,
  formatTestInsightNote,
  isSpecificInsight,
} from "./benchmark-executive";
import {
  discoverTagInLedger,
  extractTagInner,
  findLedgerTagBounds,
  getDocPath,
  getDocPathForDb,
  getSectionForTag,
  patchBenchmarkZones,
  shortLabelToTag,
  upsertLedgerSection,
  writeMdxDocument,
  writeTruthTable,
  writeSummaryHistoryArchive,
  writeSummaryRunOverlay,
} from "./benchmark-mdx";

/** Canonical history store — full tables live here, not in MDX. */
export const HISTORY_SQLITE_PATH = "tests/benchmarks/results/history.sqlite";

const SPARKLINE_CHARS = [
  "\u2581",
  "\u2582",
  "\u2583",
  "\u2584",
  "\u2585",
  "\u2586",
  "\u2587",
  "\u2588",
] as const;
const SPARKLINE_WIDTH = 7;

/** Unicode block sparkline from a numeric series (last `width` samples). */
export function renderSparkline(values: number[], width = SPARKLINE_WIDTH): string {
  if (values.length === 0) return "\u2014";
  const slice = values.slice(-width);
  const min = Math.min(...slice);
  const max = Math.max(...slice);
  const range = max - min || 1;
  return slice
    .map((v) => {
      const idx = Math.round(((v - min) / range) * (SPARKLINE_CHARS.length - 1));
      return SPARKLINE_CHARS[Math.max(0, Math.min(SPARKLINE_CHARS.length - 1, idx))];
    })
    .join("");
}

export type BenchmarkRecordMode = "none" | "history" | "partial" | "full";

export interface BenchmarkReportOptions {
  source?: "single-test" | "matrix";
  testFile: string;
  testId: string;
  phase: "cold" | "warm" | "mixed";
  runId: string;
  mode: BenchmarkRecordMode;
  dbType?: string;
  redisEnabled?: boolean;
}

// State tracked across pushTableToMdx calls for deduplication
let _lastTag: string | null = null;
let _lastTestFile = "unknown";
void _lastTag;
void _lastTestFile; // read by future multi-file dedup logic

function getDbType(): string {
  return process.env.DB_TYPE || "sqlite";
}

/** Gates all MDX mutations — console-only unless recording. */
export function shouldRecord(): boolean {
  return (
    process.env.BENCHMARK_RECORD === "1" ||
    process.env.BENCHMARK_MATRIX === "1" ||
    process.env.CI === "true"
  );
}

function isMatrixRun(): boolean {
  return process.env.BENCHMARK_MATRIX === "1";
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

function normalizeTestFile(testFile: string): string {
  if (!testFile || testFile === "unknown") return testFile;
  if (testFile.includes("/") || testFile.includes("\\")) return testFile.replace(/\\/g, "/");
  const base = testFile.replace(/\.test\.(ts|js)$/i, "");
  return `tests/benchmarks/${base}.test.ts`;
}

function inferPhase(testFile: string, explicit?: string): "cold" | "warm" | "mixed" {
  if (explicit) return explicit as "cold" | "warm" | "mixed";
  const lower = testFile.toLowerCase();
  if (lower.includes("cold-start") || lower.includes("setup-proxy")) return "cold";
  return "warm";
}

/** Persist a passing run to history.sqlite (canonical trend store). */
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
  const redisEnabled = options.redisEnabled ?? process.env.USE_REDIS === "true";
  const phase = inferPhase(options.testFile, options.phase);
  const testId =
    options.testId || path.basename(options.testFile, ".test.ts").replace(/\.test$/, "");

  const isPassing =
    (result.status === "SUCCESS" || result.status === undefined) && (result.errorCount || 0) === 0;

  if (isPassing && options.mode !== "none") {
    const entry: HistoryEntry = {
      runId: options.runId,
      runMode: isMatrixRun() ? "matrix" : "standalone",
      testId,
      dbType,
      redisEnabled,
      phase,
      metric: result.name,
      avgMs: result.avgMs,
      p95Ms: result.p95Ms || 0,
      rps: result.rps || 0,
      errorCount: result.errorCount || 0,
      status: "SUCCESS",
    };
    persistRun(entry);
  }
}

/** Bridge: `printTruthTable()` → LEDGER tag only. */
export function pushTableToMdx(_title: string, table: string, shortLabel?: string): void {
  if (!shouldRecord()) return;
  const testFile = discoverTestFile();
  _lastTestFile = testFile;
  _lastTag = writeTruthTable(table, testFile, shortLabel);
}

/** @deprecated Run summary lives in collapsed truth table — no duplicate ASCII box. */
export function appendSummaryToMdx(_summaryTable: string, _shortLabel?: string): void {
  /* no-op */
}

/** @deprecated Trends are batched in finalizeReport(). */
export async function computeAndApplyTrend(_result: unknown, _shortLabel?: string): Promise<void> {
  /* no-op */
}

function buildSpecificInsight(
  rootCause: ReturnType<typeof classifyRootCause>,
  codePaths: string[],
): string {
  const raw = rootCause.insight.trim();
  if (!raw || !isSpecificInsight(raw)) return "";
  return formatTestInsightNote(raw, codePaths);
}

const SEVERITY_ICON: Record<string, string> = {
  critical: "\u{1F534}",
  regression: "\u{1F534}",
  warning: "\u{1F7E1}",
  watch: "\u{1F7E1}",
  stable: "\u{1F7E2}",
};

const SEVERITY_RANK: Record<string, number> = {
  "\u{1F534}": 3,
  "\u{1F7E1}": 2,
  "\u{1F7E2}": 1,
  "\u{26AA}": 0,
};

export interface JsonlRunEntry {
  runId?: string;
  runMode?: string;
  testFile: string;
  metric: string;
  layer?: string;
  avgMs: number;
  p95Ms?: number;
  rps?: number;
  cv?: number;
  timestamp?: string;
  phase?: string;
  db?: string;
  redis?: boolean;
  status?: string;
  wallClockMs?: number;
}

function formatTestLabel(testFile: string): string {
  const base = normalizeTestFile(testFile)
    .replace(/^tests\/benchmarks\//, "")
    .replace(/\.test\.ts$/i, "");
  return base.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function trendIcon(trend: ReturnType<typeof analyzeTrend>): string {
  if (trend.severity === "critical" || trend.severity === "regression") return "\u{1F534}";
  return SEVERITY_ICON[trend.severity] || "\u{26AA}";
}

function testFileToId(testFile: string): string {
  return normalizeTestFile(testFile)
    .replace(/^tests\/benchmarks\//, "")
    .replace(/\.test\.ts$/i, "");
}

/** Normalize invoked test identifiers from `exportResult()` / `_reportedFiles`. */
export function normalizeInvokedTestIds(invokedTestFiles: Iterable<string>): Set<string> {
  const invoked = new Set<string>();
  for (const file of invokedTestFiles) {
    invoked.add(testFileToId(file));
    invoked.add(file.replace(/\.test\.ts$/i, "").replace(/^tests\/benchmarks\//, ""));
  }
  return invoked;
}

/**
 * C: Current Run includes only tests that executed in THIS invocation.
 * Stale `history.jsonl` lines for the same `runId` are excluded when `invoked` is set.
 */
export function filterInvocationRunEntries(
  runEntries: JsonlRunEntry[],
  invokedTestFiles?: Iterable<string>,
): JsonlRunEntry[] {
  if (!invokedTestFiles) return runEntries;
  const invoked = normalizeInvokedTestIds(invokedTestFiles);
  return runEntries.filter((e) => invoked.has(testFileToId(e.testFile)));
}

function groupRunEntries(entries: JsonlRunEntry[]): JsonlRunEntry[] {
  const byKey = new Map<string, JsonlRunEntry>();
  for (const entry of entries) {
    byKey.set(`${entry.testFile}:${entry.metric}`, entry);
  }
  return [...byKey.values()];
}

interface RunSummaryRow {
  test: string;
  metric: string;
  avgMs: number;
  p95Ms: number;
  rps: number;
  icon: string;
  detail: string;
  sortRank: number;
}

function buildRunSummaryRows(
  runEntries: JsonlRunEntry[],
  db: string,
  redis: boolean,
): RunSummaryRow[] {
  const rows: RunSummaryRow[] = [];

  for (const entry of groupRunEntries(runEntries)) {
    const testFile = normalizeTestFile(entry.testFile);
    const testId = testFile.replace(/^tests\/benchmarks\//, "").replace(/\.test\.ts$/i, "");
    const phase = inferPhase(testFile, entry.phase);
    // Metric-keyed history — never trend BULK INSERT against INSERT
    const history = loadHistory(testId, db, redis, phase, entry.metric);
    const prior = history.slice(0, -1);
    const trend = analyzeTrend(
      {
        name: entry.metric,
        avgMs: entry.avgMs,
        p95Ms: entry.p95Ms || 0,
        rps: entry.rps || 0,
      },
      prior.length > 0 ? prior : history,
      testId,
      db,
      redis,
      phase,
    );
    const icon = trendIcon(trend);
    rows.push({
      test: formatTestLabel(entry.testFile),
      metric: entry.metric,
      avgMs: entry.avgMs,
      p95Ms: entry.p95Ms || 0,
      rps: entry.rps || 0,
      icon,
      detail: trend.label,
      sortRank: SEVERITY_RANK[icon] ?? 0,
    });
  }

  return rows.sort((a, b) => b.sortRank - a.sortRank || a.test.localeCompare(b.test));
}

/**
 * Generate ONE summary table aggregating ALL tests from the current run.
 * Scoped to `runEntries` only — not full history.sqlite.
 */
export function buildRunSummaryTable(
  runEntries: JsonlRunEntry[],
  ctx: {
    runId: string;
    runMode: string;
    db: string;
    redis: boolean;
    invokedTestFiles?: Iterable<string>;
  },
): string {
  const scoped = filterInvocationRunEntries(runEntries, ctx.invokedTestFiles);

  if (scoped.length === 0) {
    return "\n### Current Run Summary\n\n> \u23F3 No tests recorded in this invocation.\n";
  }

  const rows = buildRunSummaryRows(scoped, ctx.db, ctx.redis);
  const displayTs =
    scoped
      .map((e) => (e.timestamp || "").replace("T", " ").slice(0, 19))
      .filter(Boolean)
      .sort()
      .at(-1) || new Date().toISOString().replace("T", " ").slice(0, 19);
  const dateLabel = displayTs.slice(0, 10);

  const dbLabel = ctx.redis ? `${ctx.db}-redis` : ctx.db;
  const uniqueTests = new Set(scoped.map((e) => testFileToId(e.testFile))).size;

  let summary = `\n### Current Run Summary (${dateLabel})\n\n`;
  summary += "> **Scope:** Only tests that ran in THIS invocation.\n\n";
  if (ctx.runMode !== "matrix") {
    summary += "> \u26A0\uFE0F Executive PASS/FAIL reflects the last full matrix run.\n\n";
  }

  summary += `**Run ID:** \`${ctx.runId}\` · **Tests invoked:** ${uniqueTests} · **Metrics:** ${rows.length} · **DB:** ${dbLabel}\n\n`;
  summary += `| Test | Metric | Avg (ms) | p95 (ms) | RPS | Trend | Detail |\n`;
  summary += `|------|--------|----------|----------|-----|-------|--------|\n`;

  for (const row of rows) {
    const detail = row.detail.replace(/\|/g, "\\|");
    summary += `| ${row.test} | ${row.metric} | ${row.avgMs.toFixed(3)} | ${row.p95Ms.toFixed(3)} | ${Math.round(row.rps)} | ${row.icon} | ${detail} |\n`;
  }
  summary += "\n";

  return summary;
}

/** Write the current-run aggregate into the Current Run SUMMARY slot only. */
export function writeRunSummary(
  runEntries: JsonlRunEntry[],
  ctx: {
    runId: string;
    runMode: string;
    db: string;
    redis: boolean;
    invokedTestFiles?: Iterable<string>;
  },
  docPath?: string,
): void {
  if (!shouldRecord()) return;
  writeSummaryRunOverlay(buildRunSummaryTable(runEntries, ctx), docPath);
}

interface HistorySparklineRow {
  name: string;
  icon: string;
  sparkline: string;
  latestMs: number;
  runs: number;
  sortRank: number;
}

function historySqliteDetailLink(dbType: string, redis: boolean): string {
  const redisFlag = redis ? 1 : 0;
  return [
    `**Detail:** [\`${HISTORY_SQLITE_PATH}\`](../../../${HISTORY_SQLITE_PATH})`,
    `\`SELECT test_id, phase, avg_ms, p95_ms, rps, timestamp FROM runs WHERE db_type='${dbType}' AND redis=${redisFlag} ORDER BY timestamp DESC\``,
  ].join(" · ");
}

/**
 * Build Historical Trends sparklines from `history.sqlite` (compact — no full tables in MDX).
 * Never mixed with Current Run Summary content.
 */
export function buildHistoryArchiveTable(dbLabel?: string): string {
  const raw = dbLabel || getDbType();
  const dbType = raw.replace("-redis", "").replace("_redis", "");
  const redisEnabled = raw.includes("redis");
  const testIds = loadDistinctTestIds(dbType);
  const dateLabel = new Date().toISOString().slice(0, 10);
  if (testIds.length === 0) {
    return `\n### Historical Trends (${dateLabel})\n\n> \u23F3 No history recorded yet.\n`;
  }

  const rows: HistorySparklineRow[] = [];

  for (const testId of testIds) {
    for (const phase of ["warm", "cold", "mixed"] as const) {
      const history = loadHistory(testId, dbType, redisEnabled, phase);
      if (history.length === 0) continue;

      const samples = history.map((h) => h.avgMs);
      const current = history[history.length - 1]!;
      const prior = history.slice(0, -1);
      const trend = analyzeTrend(
        { name: testId, avgMs: current.avgMs, p95Ms: current.p95Ms, rps: current.rps },
        prior.length > 0 ? prior : history,
        testId,
        dbType,
        redisEnabled,
        phase,
      );

      const icon =
        trend.severity === "critical" || trend.severity === "regression"
          ? "\u{1F534}"
          : SEVERITY_ICON[trend.severity] || "\u{26AA}";

      rows.push({
        name: `${testId.replace(/-/g, " ").toUpperCase()} (${phase})`,
        icon,
        sparkline: renderSparkline(samples),
        latestMs: current.avgMs,
        runs: history.length,
        sortRank: SEVERITY_RANK[icon] ?? 0,
      });
    }
  }

  const dbDisplay = redisEnabled ? `${dbType}-redis` : dbType;
  const sorted = rows.sort((a, b) => b.sortRank - a.sortRank || a.name.localeCompare(b.name));

  let summary = `\n### Historical Trends (${dateLabel})\n\n`;
  summary +=
    "> **Scope:** Sparklines only — full run tables live in `history.sqlite` (link below). Runs = sparkline bar count.\n\n";
  summary += `${historySqliteDetailLink(dbType, redisEnabled)}\n\n`;
  summary += `**Series:** ${sorted.length} · **DB:** ${dbDisplay}\n\n`;
  const colW = SPARKLINE_WIDTH + 2;
  summary += `| Metric | Trend | Sparkline (last ${SPARKLINE_WIDTH}) | Latest |\n`;
  summary += `|--------|-------|${"-".repeat(colW)}|--------|\n`;

  for (const row of sorted) {
    const name = row.name.replace(/\|/g, "\\|");
    summary += `| ${name} | ${row.icon} | \`${row.sparkline}\` | ${row.latestMs.toFixed(3)}ms |\n`;
  }
  summary += "\n";

  return summary;
}

function countApplicableScripts(dbKey: string): number {
  try {
    const { BENCHMARK_SCRIPTS } =
      require("../../../scripts/benchmark-matrix/benchmark-scripts") as {
        BENCHMARK_SCRIPTS: Array<{ strategy: string; shortLabel: string }>;
      };
    const isSql =
      dbKey.includes("sqlite") || dbKey.includes("postgres") || dbKey.includes("mariadb");
    return BENCHMARK_SCRIPTS.filter(
      (s) =>
        s.strategy === "all" ||
        (s.strategy === "sql" && isSql) ||
        (s.strategy === "once" && dbKey.replace("-redis", "").replace("_redis", "") === "sqlite"),
    ).length;
  } catch {
    return 58;
  }
}

function writePartialExecutive(
  runEntries: JsonlRunEntry[],
  ctx: {
    runId: string;
    db: string;
    redis: boolean;
    invokedTestFiles?: Iterable<string>;
  },
  docPath: string,
): void {
  const scoped = filterInvocationRunEntries(runEntries, ctx.invokedTestFiles);
  if (scoped.length === 0 || !fs.existsSync(docPath)) return;

  const doc = fs.readFileSync(docPath, "utf8");
  const tagResolver = (testFile: string, shortLabel?: string) =>
    discoverTagInLedger(doc, testFile, shortLabel);

  const rollupRows = groupRunEntries(scoped).map((entry) => {
    const testFile = normalizeTestFile(entry.testFile);
    const tag = tagResolver(testFile, entry.layer) ?? "";
    return {
      testFile,
      metric: entry.metric,
      avgMs: entry.avgMs,
      p95Ms: entry.p95Ms,
      rps: entry.rps,
      layer: entry.layer,
      section: tag ? getSectionForTag(tag) : undefined,
    };
  });

  const testEntries = buildTestRollupEntriesFromRun(rollupRows, ctx.db, ctx.redis, tagResolver);
  const uniqueTests = new Set(scoped.map((e) => testFileToId(e.testFile))).size;
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19);
  const dbDisplay = ctx.redis ? `${ctx.db}-redis` : ctx.db;

  const latencyRows = testEntries.map((e) => ({
    scenario: e.label,
    latency: e.avgMs > 0 ? `${e.avgMs.toFixed(3)}ms` : "\u23F3 pending",
    trend: e.trendLabel,
    budget: e.budgetLabel,
    result: e.icon,
  }));

  const executiveBody = buildExecutiveReport({
    dbLabel: dbDisplay,
    timestamp,
    status: "SUCCESS",
    isPartial: true,
    recorded: uniqueTests,
    total: countApplicableScripts(ctx.redis ? `${ctx.db}-redis` : ctx.db),
    skipped: Math.max(
      0,
      countApplicableScripts(ctx.redis ? `${ctx.db}-redis` : ctx.db) - uniqueTests,
    ),
    hostLine: process.env.BUN_VERSION ? `Bun ${process.env.BUN_VERSION}` : "standalone run",
    latencyRows,
    testEntries,
    mermaidPoints: [],
  });

  const updated = patchBenchmarkZones(doc, { executive: executiveBody });
  writeMdxDocument(docPath, updated);
}

function writeCollapsedLedgerEntry(opts: {
  testFile: string;
  shortLabel?: string;
  trendLabel: string;
  insight: string;
  avgMs: number;
  deltaPct: number;
  icon: string;
}): void {
  const docPath = getDocPath();
  if (!fs.existsSync(docPath)) return;

  let doc = fs.readFileSync(docPath, "utf8");
  const tag =
    (opts.shortLabel ? shortLabelToTag(opts.shortLabel) : null) ||
    discoverTagInLedger(doc, opts.testFile, opts.shortLabel);
  if (!tag) return;

  const bounds = findLedgerTagBounds(doc, tag);
  let truth = "> \u23F3 Pending";
  if (bounds) {
    const block = doc.slice(bounds.start, bounds.end + bounds.endMarker.length);
    const inner = extractTagInner(block, tag);
    const truthMatch = inner.match(
      /<!-- LEDGER_TRUTH_START -->\s*([\s\S]*?)\s*<!-- LEDGER_TRUTH_END -->/,
    );
    if (truthMatch?.[1]?.trim()) truth = truthMatch[1].trim();
  }

  const label =
    opts.shortLabel ||
    path
      .basename(opts.testFile)
      .replace(/\.test\.ts$/i, "")
      .replace(/-/g, " ");
  const collapsed = buildCollapsedLedgerTagInner({
    tag,
    label,
    testPath: normalizeTestFile(opts.testFile),
    avgMs: opts.avgMs,
    icon: opts.icon,
    deltaPct: opts.deltaPct,
    trendLabel: opts.trendLabel,
    insight: opts.insight,
    truth,
  });
  doc = upsertLedgerSection(doc, tag, collapsed);
  writeMdxDocument(docPath, doc);
}

/** Write Historical Archive slot only — does not touch Current Run overlay. */
export function writeHistoryArchive(dbLabel?: string, docPath?: string): void {
  if (!shouldRecord()) return;
  const resolvedPath = docPath ?? getDocPathForDb(dbLabel || getDbType());
  writeSummaryHistoryArchive(buildHistoryArchiveTable(dbLabel), resolvedPath);
}

/** Refresh Historical Archive from `history.sqlite` (matrix / manual refresh). */
export function rebuildSummaryFromHistory(dbLabel?: string, docPath?: string): void {
  writeHistoryArchive(dbLabel, docPath);
}

/**
 * Finalize a benchmark run — surgical path updates LEDGER + SUMMARY only.
 * Matrix path delegates to `generateFinalReport()` (owns EXECUTIVE).
 */
export interface FinalizeReportOptions {
  /** Test files/ids that executed in this invocation (`exportResult` / `_reportedFiles`). */
  invokedTestFiles?: Iterable<string>;
}

export async function finalizeReport(
  runId: string,
  options: FinalizeReportOptions = {},
): Promise<void> {
  if (isMatrixRun()) {
    try {
      const { generateFinalReport } =
        await import("../../../scripts/benchmark-matrix/reporting").catch(() => ({
          generateFinalReport: null,
        }));
      if (generateFinalReport) await generateFinalReport();
    } catch {
      /* matrix reporting optional */
    }
    return;
  }

  const historyPath = path.resolve(process.cwd(), "tests/benchmarks/results/history.jsonl");
  if (!fs.existsSync(historyPath)) return;

  try {
    const raw = fs.readFileSync(historyPath, "utf8").trim().split("\n").filter(Boolean);
    const allEntries = raw.map((line) => JSON.parse(line));
    const runEntries = filterInvocationRunEntries(
      allEntries.filter((e) => e.runId === runId),
      options.invokedTestFiles,
    );
    if (runEntries.length === 0) return;

    const runMode = runEntries[0].runMode || "standalone";
    const db = runEntries[0].db || getDbType();
    const redis = runEntries[0].redis ?? false;
    // dbLabel constructed when needed for history writes

    const groups = new Map<string, any[]>();
    for (const entry of runEntries) {
      const key = `${entry.testFile}:${entry.metric}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(entry);
    }

    const previousSameMode = allEntries.filter((e) => e.runMode === runMode && e.runId !== runId);

    for (const [key, entries] of groups) {
      const current = entries[entries.length - 1];
      const testFile = normalizeTestFile(current.testFile);
      const testId = testFile.replace(/^tests\/benchmarks\//, "").replace(/\.test\.ts$/, "");
      const phase = inferPhase(testFile, current.phase);
      const shortLabel = current.layer || undefined;

      persistRun({
        runId,
        runMode,
        testId,
        dbType: db,
        redisEnabled: redis,
        phase,
        metric: current.metric,
        avgMs: current.avgMs,
        p95Ms: current.p95Ms || 0,
        rps: current.rps || 0,
        errorCount: 0,
        status: "SUCCESS",
      });

      if (!shouldRecord()) continue;

      // Prefer same-mode jsonl series for this exact metric (docs contract).
      // Fall back to metric-keyed sqlite history.
      const prevJsonl = previousSameMode.filter((e) => {
        const ef = normalizeTestFile(e.testFile);
        const et =
          ef.replace(/^tests\/benchmarks\//, "").replace(/\.test\.ts$/i, "") === testId ||
          e.testFile === current.testFile ||
          e.testFile === testId;
        return et && e.metric === current.metric && (e.db || db) === db;
      });
      const jsonlPrior = prevJsonl.slice(-7).map((e) => ({
        avgMs: e.avgMs,
        p95Ms: e.p95Ms || 0,
        rps: e.rps || 0,
        runMode: e.runMode,
      }));
      const sqliteHistory = loadHistory(testId, db, redis, phase, current.metric);
      const sqlitePrior = sqliteHistory.slice(0, -1);
      const prior = jsonlPrior.length > 0 ? jsonlPrior : sqlitePrior;
      const trend = analyzeTrend(
        {
          name: current.metric,
          avgMs: current.avgMs,
          p95Ms: current.p95Ms || 0,
          rps: current.rps || 0,
        },
        prior,
        testId,
        db,
        redis,
        phase,
      );

      const rootCause = classifyRootCause(
        trend.deltaPct,
        trend.p95DeltaPct,
        trend.rpsDeltaPct,
        runMode === "standalone",
        trend.sampleSize,
      );

      // Budget violations already checked via PER_DIMENSION_BUDGETS in benchmark-mdx
      checkBudgets(db, {
        [`${phase}_avg`]: current.avgMs,
        [`${phase}_p95`]: current.p95Ms || 0,
      });

      const insight = buildSpecificInsight(rootCause, []);
      const ts = (current.timestamp || new Date().toISOString()).replace("T", " ").slice(0, 19);
      const trendLabel = `${trend.label} (${ts})`;
      const icon = trendIcon(trend);

      writeCollapsedLedgerEntry({
        testFile,
        shortLabel,
        trendLabel,
        insight,
        avgMs: current.avgMs,
        deltaPct: trend.deltaPct,
        icon,
      });
    }

    if (shouldRecord()) {
      const docPath = getDocPathForDb(redis ? `${db}-redis` : db);
      writeRunSummary(
        runEntries,
        { runId, runMode, db, redis, invokedTestFiles: options.invokedTestFiles },
        docPath,
      );
      writeHistoryArchive(redis ? `${db}-redis` : db, docPath);
      writePartialExecutive(
        runEntries,
        { runId, db, redis, invokedTestFiles: options.invokedTestFiles },
        docPath,
      );
    }

    const totalTime = runEntries.reduce((s, e) => Math.max(s, e.wallClockMs || 0), 0);
    const avgMetric = runEntries.reduce((s, e) => s + e.avgMs, 0) / runEntries.length;
    console.log(
      `\n  [${runMode.toUpperCase()}] ${runEntries.length} metrics recorded · avg ${avgMetric.toFixed(2)}ms · ${(totalTime / 1000).toFixed(1)}s wall clock`,
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  finalizeReport error: ${msg}`);
  }
}

export function resetTrendGuard(): void {
  _lastTag = null;
  _lastTestFile = "unknown";
}
