#!/usr/bin/env bun
/**
 * @file scripts/verify-benchmark-local.ts
 * @description Pre-flight safety checks before running local benchmarks.
 *
 * Ensures:
 * - Production build exists with full testing harness (bench mode)
 * - Live `config/private.ts` does not point at test/benchmark DB names
 * - Local profile isolation boundaries are printed for operator visibility
 *
 * Usage:
 *   COMPILE_ALL_ADAPTERS=true bun run build
 *   bun run verify:benchmark-local
 *   bun run benchmark --db=sqlite
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  assertBenchmarkDbIsolation,
  developerPrivateConfigExists,
  getBenchmarkIsolationSummary,
  resolveBenchmarkProfile,
} from "../src/utils/benchmark-sandbox.ts";
import {
  isConfigSourceSafeForTesting,
  isUnsafeLiveDeveloperDbName,
} from "../src/utils/test-db-safety.ts";

const ROOT = process.cwd();
const BUILD_ENTRY = join(ROOT, "build", "index.js");
const PRIVATE_TS = join(ROOT, "config", "private.ts");
const PRIVATE_TEST = join(ROOT, "config", "private.test.ts");

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function checkBuild(): void {
  if (!existsSync(BUILD_ENTRY)) {
    fail("build/index.js missing. Run: COMPILE_ALL_ADAPTERS=true bun run build");
  }

  const verify = spawnSync(
    "bun",
    ["run", "scripts/verify-prod-build-backdoor.ts", "--mode=bench"],
    {
      cwd: ROOT,
      stdio: "pipe",
      shell: process.platform === "win32",
    },
  );

  if (verify.status !== 0) {
    console.error(verify.stderr?.toString() || verify.stdout?.toString());
    fail("Benchmark build missing testing harness. Run: COMPILE_ALL_ADAPTERS=true bun run build");
  }
}

function checkLiveConfig(): void {
  if (!developerPrivateConfigExists()) {
    console.log("  ℹ️  No config/private.ts — benchmarks will use CI-fresh profile");
    return;
  }

  const live = readFileSync(PRIVATE_TS, "utf8");
  const liveDb = live.match(/DB_NAME\s*:\s*['"`]([^'"`]+)['"`]/)?.[1];
  if (isUnsafeLiveDeveloperDbName(liveDb)) {
    fail(
      `config/private.ts uses test DB name '${liveDb}'. ` +
        "Point live config at a non-test database (e.g. sveltycms.db) before benchmarking.",
    );
  }

  if (existsSync(PRIVATE_TEST)) {
    const testContent = readFileSync(PRIVATE_TEST, "utf8");
    const { safe, dbName } = isConfigSourceSafeForTesting(testContent);
    if (!safe && dbName) {
      fail(
        `config/private.test.ts has unsafe DB_NAME '${dbName}'. ` +
          "Delete it and let the harness regenerate an isolated test config.",
      );
    }
  }
}

/**
 * `raw.x` as a finite number, or null when the field is absent or malformed.
 * Percentiles are graded only when they were recorded — `0` is a legitimate
 * recorded value, so this cannot be a truthiness check.
 */
function finiteOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Age of a recorded run in days (1 decimal), or null when it carries no valid timestamp. */
function ageInDays(timestamp: unknown): number | null {
  if (typeof timestamp !== "string") return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return Number(((Date.now() - parsed) / 86_400_000).toFixed(1));
}

/**
 * Minimum samples behind a p99 claim. With fewer, the "99th percentile" **is** the
 * maximum of the sample: one OS preemption or GC pause would define the tail, and a
 * verdict built on it grades that single sample rather than the workload.
 */
const MIN_SAMPLES_FOR_P99 = 100;

/** The workload replica whose recorded run this report grades. */
const REPLICA_TEST_FILE = "competitive-workload-replica";

/**
 * The `--strict` verdict. Exported so the gate rule (a 🔴 tail or an unmeasured row
 * fails; 🟡/🔵 stay informational) is asserted directly instead of through stdout.
 */
export function latencyVariancePasses(summary: LatencyVarianceSummary): boolean {
  return summary.highVarianceCount === 0 && summary.unmeasuredCount === 0;
}

/** Right-aligned latency cell; `—` when the field was not recorded in the result JSON. */
function msCell(value: number | null, width: number, prefix = ""): string {
  return (value === null ? "—" : `${prefix}${value}ms`).padStart(width);
}

/**
 * Band contract (2026-09-27, replacing the ratio-only bands). The verdict is the
 * **absolute tail excess** `p99 − p50`:
 *
 * - `EXCELLENT` ≤ 1 ms — roughly twice the host's own warm-HTTP floor
 *   (`truth.http.p95` 0.525 ms measured on this machine), so it is achievable but strict.
 * - `ACCEPTABLE` ≤ 2 ms — the project's own sub-2 ms persistence goal (AGENTS.md §3.11).
 * - `WATCH` ≤ 4 ms · `HIGH_VARIANCE` beyond.
 *
 * Why not the ratio: `ratio ≈ 1 + S/p50`, so a fixed stall punishes the *fastest* rows
 * hardest. Three identical runs graded the same sub-millisecond row 🟢 and 🔴 — the ratio
 * was measuring the host, not the code. The ratio is still reported for context.
 */
const TAIL_EXCESS_BANDS_MS = { excellent: 1, acceptable: 2, watch: 4 } as const;

/** Bounded per-run history so a verdict is an ensemble, not one run's maximum. */
const VARIANCE_HISTORY_FILE = "variance-history.json";
/** Retained runs per adapter. */
const HISTORY_RUNS = 8;
/** Graded window — the median of the last N runs of the same metric. */
const ENSEMBLE_RUNS = 3;

/**
 * One recorded row as a series entry — null when it carries no metric name. Percentiles
 * stay nullable: a row without them must still be *reported* as UNMEASURED (fail-closed),
 * so it is carried through and only excluded from the ensemble window.
 */
function extractSeries(raw: Record<string, unknown>): SeriesRow | null {
  const metric = typeof raw.metric === "string" ? raw.metric : null;
  if (!metric) return null;
  return {
    metric,
    avgMs: Number(raw.avgMs || 0),
    p50Ms: finiteOrNull(raw.p50Ms),
    p95Ms: Number(raw.p95Ms || 0),
    p99Ms: finiteOrNull(raw.p99Ms),
    samples: finiteOrNull(raw.iterations) ?? 0,
    cvPct: Number(raw.cv || 0),
    slowRatePer1000: finiteOrNull(raw.slowRatePer1000) ?? 0,
  };
}

interface SeriesRow {
  metric: string;
  avgMs: number;
  p50Ms: number | null;
  p95Ms: number;
  p99Ms: number | null;
  samples: number;
  cvPct: number;
  slowRatePer1000: number;
}

interface HistoryRun {
  runId: string;
  sampledAt: string | null;
  rows: SeriesRow[];
}

interface VarianceHistory {
  runs: HistoryRun[];
}

function historyPath(dbDir: string): string {
  return join(dbDir, VARIANCE_HISTORY_FILE);
}

function loadVarianceHistory(dbDir: string): VarianceHistory {
  try {
    const parsed = JSON.parse(readFileSync(historyPath(dbDir), "utf8")) as VarianceHistory;
    return Array.isArray(parsed.runs) ? parsed : { runs: [] };
  } catch {
    return { runs: [] };
  }
}

/** Insert or replace the run (by `runId`) and keep the newest `HISTORY_RUNS`. */
function upsertVarianceHistory(dbDir: string, run: HistoryRun): VarianceHistory {
  const history = loadVarianceHistory(dbDir);
  const runs = history.runs.filter((entry) => entry.runId !== run.runId);
  runs.push(run);
  const capped: VarianceHistory = { runs: runs.slice(-HISTORY_RUNS) };
  try {
    writeFileSync(historyPath(dbDir), `${JSON.stringify(capped, null, 2)}\n`, "utf8");
  } catch {
    // A read-only results dir must not break the report — the ensemble degrades to
    // whatever is on disk, which is exactly one run.
  }
  return capped;
}

/** Median of a non-empty number list (0 for an empty one). */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * The graded value for one metric: the **median across the ensemble window** of each
 * statistic, so a single run's maximum cannot decide a verdict. `samples` is the minimum
 * of the window (conservative for the p99 sample floor).
 */
function ensembleFor(
  window: HistoryRun[],
  metric: string,
): {
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  cvPct: number;
  samples: number;
  runsUsed: number;
  slowRatePer1000: number;
} {
  const rows = window
    .map((run) => run.rows.find((row) => row.metric === metric))
    .filter((row): row is SeriesRow => row !== undefined)
    .filter(
      (row): row is SeriesRow & { p50Ms: number; p99Ms: number } =>
        row.p50Ms !== null && row.p99Ms !== null,
    );
  return {
    avgMs: median(rows.map((row) => row.avgMs)),
    p50Ms: median(rows.map((row) => row.p50Ms)),
    p95Ms: median(rows.map((row) => row.p95Ms)),
    p99Ms: median(rows.map((row) => row.p99Ms)),
    cvPct: median(rows.map((row) => row.cvPct)),
    samples: rows.length > 0 ? Math.min(...rows.map((row) => row.samples)) : 0,
    runsUsed: rows.length,
    slowRatePer1000: median(rows.map((row) => row.slowRatePer1000)),
  };
}

export interface LatencyVarianceItem {
  workload: string;
  avgMs: number;
  /** Real p50 from the recorded raw sample — null when the JSON predates the field. */
  p50Ms: number | null;
  p95Ms: number;
  /** Real p99 from the recorded raw sample — null when the JSON predates the field. */
  p99Ms: number | null;
  /** p99 − p50: the tail cost a caller actually feels. null when unmeasured. */
  tailExcessMs: number | null;
  tailRatio: number | null; // p99 / p50
  cvPct: number;
  /**
   * Slow-call rate: samples above `slowThresholdMs` per 1 000, from the recorded raw
   * sample. A converging statistic — `p99` of a few hundred samples is just the
   * 2nd-worst sample and swings several-fold between identical runs. null when the
   * result JSON predates the field.
   */
  slowRatePer1000: number | null;
  slowCount: number | null;
  slowThresholdMs: number | null;
  /** Iterations behind the percentiles; null when the JSON predates the field. */
  samples: number | null;
  /** Age of the recorded run in days; null when the JSON carries no timestamp. */
  ageDays: number | null;
  rps: number;
  status: "EXCELLENT" | "ACCEPTABLE" | "WATCH" | "HIGH_VARIANCE" | "UNMEASURED";
  /** Why the row could not be graded (only set for UNMEASURED). */
  note?: string;
  /** Recorded runs that contributed to the graded value (ensemble window). */
  runsUsed: number;
}

export interface LatencyVarianceSummary {
  db: string;
  totalWorkloads: number;
  excellentCount: number;
  acceptableCount: number;
  watchCount: number;
  highVarianceCount: number;
  unmeasuredCount: number;
  maxTailRatio: number;
  worstWorkload: string;
  /** Age of the oldest recorded row in days; null when no row carries a timestamp. */
  oldestSampleDays: number | null;
  /** `runId` of the graded run — all rows belong to this one run. */
  runId: string | null;
  /** Newest recorded timestamp of the graded run (ISO), or null when unrecorded. */
  sampledAt: string | null;
  /** Recorded rows that cannot carry a verdict by construction (aggregate rows). */
  excludedRows: string[];
}

/**
 * Result rows of the **newest** `competitive-workload-replica` run inside `dbDir`.
 *
 * Discovery is by content (`testFile`), not by filename. The previous revision
 * hardcoded ten filenames from an older metric-naming scheme
 * (`findById__Sequential_.json`), which the harness no longer writes — after the
 * estimation fallback was removed there was nothing left in those month-old files
 * to grade, so every row reported UNMEASURED. Rows are grouped by `runId` and only
 * the newest run is reported: metric names that a later naming scheme replaced stay
 * in the directory as history and must not resurface as phantom workloads.
 */
function newestReplicaRun(dbDir: string): Record<string, unknown>[] {
  if (!existsSync(dbDir)) return [];

  const byRun = new Map<string, { rows: Record<string, unknown>[]; newest: number }>();
  for (const file of readdirSync(dbDir)) {
    if (!file.endsWith(".json")) continue;
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(readFileSync(join(dbDir, file), "utf8")) as Record<string, unknown>;
    } catch {
      continue; // corrupt or non-result artifact (matrix_metrics.json, soak series, …)
    }
    if (raw.testFile !== REPLICA_TEST_FILE) continue;

    const runId = typeof raw.runId === "string" ? raw.runId : "unknown";
    const at = typeof raw.timestamp === "string" ? Date.parse(raw.timestamp) : Number.NaN;
    const bucket = byRun.get(runId) ?? { rows: [], newest: Number.NEGATIVE_INFINITY };
    bucket.rows.push(raw);
    if (Number.isFinite(at) && at > bucket.newest) bucket.newest = at;
    byRun.set(runId, bucket);
  }

  // Newest timestamp wins; equal/missing timestamps fall back to the bigger sample.
  const buckets = [...byRun.values()].sort(
    (a, b) => b.newest - a.newest || b.rows.length - a.rows.length,
  );
  return (buckets[0]?.rows ?? []).sort((a, b) =>
    String(a.metric ?? "").localeCompare(String(b.metric ?? "")),
  );
}

export function emptyVarianceSummary(db: string): LatencyVarianceSummary {
  return {
    db,
    totalWorkloads: 0,
    excellentCount: 0,
    acceptableCount: 0,
    watchCount: 0,
    highVarianceCount: 0,
    unmeasuredCount: 0,
    maxTailRatio: 0,
    worstWorkload: "none",
    oldestSampleDays: null,
    runId: null,
    sampledAt: null,
    excludedRows: [],
  };
}

export function generateLatencyVarianceReport(db: string = "sqlite"): {
  items: LatencyVarianceItem[];
  summary: LatencyVarianceSummary;
} {
  return generateLatencyVarianceReportFromDir(join(ROOT, "tests", "benchmarks", "results", db), db);
}

/** Directory-injectable core of {@link generateLatencyVarianceReport} — unit-testable. */
export function generateLatencyVarianceReportFromDir(
  dbDir: string,
  db: string,
): {
  items: LatencyVarianceItem[];
  summary: LatencyVarianceSummary;
} {
  const items: LatencyVarianceItem[] = [];
  const excludedRows: string[] = [];
  const rows = newestReplicaRun(dbDir);
  if (rows.length === 0) return { items, summary: emptyVarianceSummary(db) };

  // Identity of the graded run — every row below belongs to it.
  const firstRunId = rows[0]?.runId;
  const runId = typeof firstRunId === "string" ? firstRunId : null;
  let newestMs = Number.NEGATIVE_INFINITY;
  for (const raw of rows) {
    const at = typeof raw.timestamp === "string" ? Date.parse(raw.timestamp) : Number.NaN;
    if (Number.isFinite(at) && at > newestMs) newestMs = at;
  }
  const sampledAt = Number.isFinite(newestMs) ? new Date(newestMs).toISOString() : null;

  // 🔁 Ensemble window: record this run, then grade the **median of the last
  // ENSEMBLE_RUNS runs** of the same metric. A single run's p99 is a max-statistic —
  // three identical runs graded the same row 🟢, 🟡 and 🔴 — so one run cannot decide.
  const series: SeriesRow[] = [];
  for (const raw of rows) {
    const row = extractSeries(raw);
    if (!row) continue;
    if (row.p50Ms !== null && row.p50Ms <= 0) {
      excludedRows.push(
        `${row.metric} — p50 is ${row.p50Ms} ms (aggregate row, not a per-request distribution)`,
      );
      continue;
    }
    if (row.p50Ms !== null && row.p99Ms !== null) series.push(row);
  }
  const history = upsertVarianceHistory(dbDir, {
    runId: runId ?? "unknown",
    sampledAt,
    rows: series,
  });
  const window = history.runs.slice(-ENSEMBLE_RUNS);

  for (const raw of rows) {
    const current = extractSeries(raw);
    if (!current) continue;
    if (current.p50Ms !== null && current.p50Ms <= 0) continue; // excluded above

    // Every displayed statistic is the **median of the ensemble window**, so no single
    // run's maximum can decide a verdict (see ENSEMBLE_RUNS).
    const graded = ensembleFor(window, current.metric);
    const samples = finiteOrNull(raw.iterations);
    const ageDays = ageInDays(raw.timestamp);

    let status: LatencyVarianceItem["status"];
    let note: string | undefined;
    // Only a graded row carries a ratio and an excess: an empty cell always means
    // "no verdict" and can never read as a claim the row does not satisfy.
    let tailRatio: number | null = null;
    let tailExcessMs: number | null = null;
    if (current.p50Ms === null || current.p99Ms === null) {
      status = "UNMEASURED";
      note =
        "no recorded p50/p99 — this result JSON predates the percentile fields; re-run the workload";
    } else if (graded.runsUsed === 0) {
      status = "UNMEASURED";
      note = "no recorded run of this metric in the ensemble window";
    } else if (graded.samples < MIN_SAMPLES_FOR_P99) {
      status = "UNMEASURED";
      note = `p99 needs ≥${MIN_SAMPLES_FOR_P99} samples to be a percentile (recorded: ${graded.samples}) — below that it is the maximum`;
    } else {
      tailExcessMs = Number((graded.p99Ms - graded.p50Ms).toFixed(3));
      tailRatio = graded.p50Ms > 0 ? Number((graded.p99Ms / graded.p50Ms).toFixed(2)) : null;
      if (tailExcessMs <= TAIL_EXCESS_BANDS_MS.excellent) {
        status = "EXCELLENT";
      } else if (tailExcessMs <= TAIL_EXCESS_BANDS_MS.acceptable) {
        status = "ACCEPTABLE";
      } else if (tailExcessMs <= TAIL_EXCESS_BANDS_MS.watch) {
        status = "WATCH";
      } else {
        status = "HIGH_VARIANCE";
      }
    }

    items.push({
      workload: current.metric,
      avgMs: Number((graded.runsUsed > 0 ? graded.avgMs : current.avgMs).toFixed(2)),
      p50Ms: current.p50Ms === null ? null : Number(graded.p50Ms.toFixed(2)),
      p95Ms: Number((graded.runsUsed > 0 ? graded.p95Ms : current.p95Ms).toFixed(2)),
      p99Ms: current.p99Ms === null ? null : Number(graded.p99Ms.toFixed(2)),
      tailExcessMs,
      tailRatio,
      cvPct: Number((graded.runsUsed > 0 ? graded.cvPct : current.cvPct).toFixed(1)),
      samples,
      ageDays,
      slowRatePer1000: graded.runsUsed > 0 ? Number(graded.slowRatePer1000.toFixed(1)) : null,
      slowCount: finiteOrNull(raw.slowCount),
      slowThresholdMs: finiteOrNull(raw.slowThresholdMs),
      rps: Number(current.avgMs > 0 ? Number(raw.rps || raw.warmRps || 0).toFixed(1) : 0),
      runsUsed: graded.runsUsed,
      status,
      ...(note ? { note } : {}),
    });
  }

  let maxTailRatio = 0;
  let worstWorkload = "none";
  const counts: Record<LatencyVarianceItem["status"], number> = {
    EXCELLENT: 0,
    ACCEPTABLE: 0,
    WATCH: 0,
    HIGH_VARIANCE: 0,
    UNMEASURED: 0,
  };
  let oldestSampleDays: number | null = null;

  for (const item of items) {
    counts[item.status]++;
    if (item.tailRatio !== null && item.tailRatio > maxTailRatio) {
      maxTailRatio = item.tailRatio;
      worstWorkload = item.workload;
    }
    if (item.ageDays !== null && (oldestSampleDays === null || item.ageDays > oldestSampleDays)) {
      oldestSampleDays = item.ageDays;
    }
  }

  return {
    items,
    summary: {
      db,
      totalWorkloads: items.length,
      excellentCount: counts.EXCELLENT,
      acceptableCount: counts.ACCEPTABLE,
      watchCount: counts.WATCH,
      highVarianceCount: counts.HIGH_VARIANCE,
      unmeasuredCount: counts.UNMEASURED,
      maxTailRatio,
      worstWorkload,
      oldestSampleDays,
      runId,
      sampledAt,
      excludedRows,
    },
  };
}

export function printLatencyVarianceReport(db: string = "sqlite", dbDir?: string): boolean {
  const { items, summary } = dbDir
    ? generateLatencyVarianceReportFromDir(dbDir, db)
    : generateLatencyVarianceReport(db);

  if (items.length === 0) {
    console.log(`\n  ℹ️  No benchmark latency results found in tests/benchmarks/results/${db}`);
    return true;
  }

  console.log(`\n📊 Latency Variance & Tail Stability Report [${db.toUpperCase()}]`);
  const runLabel = summary.runId ? `run ${summary.runId.slice(0, 8)}` : "run unknown";
  const sampledLabel = summary.sampledAt
    ? `${summary.sampledAt.replace("T", " ").slice(0, 16)} UTC`
    : "sampled unknown";
  console.log(
    `   competitive-workload-replica · ${runLabel} · ${sampledLabel} · ${summary.totalWorkloads} workloads`,
  );
  console.log(
    "   p50/p99 are that run's recorded percentiles (raw sample), averaged and p95 from the same rows —" +
      " not a live measurement of the current host. SLOW‰ = samples above 3× p50 per 1 000 (a converging" +
      " rate; p99 of a few hundred samples is a maximum, so it flaps — CV% stays in the model and the JSON).",
  );
  console.log("─".repeat(112));
  console.log(
    `${"Workload".padEnd(36)} ${"N".padStart(6)} ${"Avg".padStart(8)} ${"P50".padStart(8)} ${"P95".padStart(8)} ${"P99".padStart(8)} ${"P99-P50".padStart(9)} ${"P99/P50".padStart(8)} ${"SLOW‰".padStart(7)}  ${"Stability"}`,
  );
  console.log("─".repeat(112));

  for (const item of items) {
    const statusIcon =
      item.status === "EXCELLENT"
        ? "🟢 EXCELLENT"
        : item.status === "ACCEPTABLE"
          ? "🔵 ACCEPTABLE"
          : item.status === "WATCH"
            ? "🟡 WATCH"
            : item.status === "HIGH_VARIANCE"
              ? "🔴 JITTER ALERT"
              : "⚪ UNMEASURED";

    console.log(
      `${item.workload.padEnd(36)} ` +
        `${(item.samples === null ? "—" : String(item.samples)).padStart(6)} ` +
        `${msCell(item.avgMs, 8)} ` +
        `${msCell(item.p50Ms, 8)} ` +
        `${msCell(item.p95Ms, 8)} ` +
        `${msCell(item.p99Ms, 8)} ` +
        `${msCell(item.tailExcessMs, 9, "+")} ` +
        `${item.tailRatio === null ? "—".padStart(8) : (item.tailRatio + "x").padStart(8)} ` +
        `${item.slowRatePer1000 === null ? "—" : item.slowRatePer1000.toFixed(1)}`.padStart(7) +
        ` ` +
        `${item.runsUsed > 1 ? `×${item.runsUsed}` : "  "}` +
        `  ${statusIcon}`,
    );
    if (item.note) console.log(`  ${"".padEnd(36)} ${item.note}`);
  }

  for (const reason of summary.excludedRows) {
    console.log(`  ⏭ excluded — ${reason}`);
  }

  console.log("─".repeat(112));
  console.log(
    `  Total: ${summary.totalWorkloads} workloads | ` +
      `🟢 ${summary.excellentCount} | 🔵 ${summary.acceptableCount} | 🟡 ${summary.watchCount} | ` +
      `🔴 ${summary.highVarianceCount} | ⚪ ${summary.unmeasuredCount} unmeasured | ` +
      `Peak Tail Ratio: ${summary.maxTailRatio}x (${summary.worstWorkload})`,
  );
  if (summary.oldestSampleDays !== null) {
    const age = summary.oldestSampleDays;
    console.log(
      `  Sampled ${age}d ago` +
        (age > 7
          ? "  ⚠ stale — re-run competitive-workload-replica before trusting these verdicts"
          : ""),
    );
  }

  // Strict gate: 🔴 is a real tail signal, and a row without a recorded distribution
  // cannot be called stable — an unmeasured claim must fail closed, not default green.
  // 🟡 WATCH and 🔵 ACCEPTABLE stay informational.
  return latencyVariancePasses(summary);
}

/**
 * Names the failing bands so a red `--strict` run is actionable instead of saying
 * "threshold exceeded" — an unmeasured row and a 🔴 tail need different fixes.
 */
function describeVarianceFailure(db: string): string {
  const { summary } = generateLatencyVarianceReport(db);
  const parts: string[] = [];
  if (summary.highVarianceCount > 0) {
    parts.push(
      `${summary.highVarianceCount} workload(s) in JITTER ALERT (peak ${summary.maxTailRatio}x on ${summary.worstWorkload})`,
    );
  }
  if (summary.unmeasuredCount > 0) {
    parts.push(
      `${summary.unmeasuredCount} workload(s) unmeasured — no recorded p50/p99 over ≥${MIN_SAMPLES_FOR_P99} iterations`,
    );
  }
  return parts.join("; ") || "no failing band recorded";
}

function main(): void {
  const args = process.argv.slice(2);
  const dbArg =
    args.find((a) => a.startsWith("--db="))?.split("=")[1] || process.env.DB_TYPE || "sqlite";
  const strict = args.includes("--strict") || args.includes("--strict-variance");
  // `--report=variance` is documented (docs/tests/test-status.mdx) — match the flag
  // family, not just the bare form that used to run the whole pre-flight instead.
  const reportOnly = args.some(
    (a) => a === "--report" || a.startsWith("--report=") || a.startsWith("--latency"),
  );

  if (reportOnly) {
    const ok = printLatencyVarianceReport(dbArg);
    if (strict && !ok) {
      fail(`Latency variance gate on ${dbArg}: ${describeVarianceFailure(dbArg)}.`);
    }
    return;
  }

  console.log("\n🛡️  Local Benchmark Pre-flight\n");

  checkBuild();
  console.log("  ✅ Benchmark build includes testing harness");

  checkLiveConfig();
  console.log("  ✅ Live config DB name is safe");

  assertBenchmarkDbIsolation(dbArg);

  const profile = resolveBenchmarkProfile();
  const summary = getBenchmarkIsolationSummary(dbArg);

  console.log(`\n  Profile: ${profile}`);
  if (summary.liveConfigProtected) {
    console.log("  Isolation (local sandbox — live data protected):");
    console.log(`    database          → ${summary.dbName}`);
    console.log(`    compiled/manifest → ${summary.compiledRoot}`);
    console.log(`    media             → ${summary.mediaRoot}`);
    console.log("    external services → Redis/SMTP/AI/webhooks disabled");
  } else {
    console.log("  CI-fresh mode: setup wizard may write private.test.ts only");
    console.log(`    database          → ${summary.dbName}`);
  }

  // Print latency variance report if data is present
  const varianceOk = printLatencyVarianceReport(dbArg);

  if (strict && !varianceOk) {
    fail(
      `Pre-flight rejected — latency variance gate on ${dbArg}: ${describeVarianceFailure(dbArg)}.`,
    );
  }

  console.log("\n✅ Local benchmark pre-flight passed\n");
}

// Only auto-run as a CLI entry point: the variance report lives in this module and is
// unit-tested, so importing it must not spawn the pre-flight (or `process.exit`).
if (import.meta.main) main();
