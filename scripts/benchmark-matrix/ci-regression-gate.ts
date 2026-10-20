/**
 * @file scripts/benchmark-matrix/ci-regression-gate.ts
 * @description Turns the CI core benchmark suite into an actionable performance signal.
 *
 * The benchmark tests only fail on functional errors, and `run-core-benchmarks.ts`
 * never consulted `detectRegressions()`. On a fresh CI runner `tests/benchmarks/results`
 * is empty (it is gitignored), so even the statistical detector had no baseline. The
 * result was silent performance drift: a red "skipped" bench node was the only signal.
 *
 * This gate closes that loop without checked-in, hardware-specific numbers:
 * - reads the metrics the current run just exported (`history.jsonl` + `matrix_metrics.json`)
 * - compares them to the median of the previous runs for the same adapter/mode
 * - enforces `PERFORMANCE_BUDGET` / `ADAPTER_BUDGET_OVERRIDES` as absolute ceilings
 * - persists the rolling baseline through `actions/cache` (one small JSON per adapter)
 * - emits GitHub annotations, a `$GITHUB_STEP_SUMMARY` table, and a JSON artifact
 *
 * Features:
 * - Baseline-building grace: the first runs only record the baseline, never fail on it
 * - Mode parity: a baseline recorded against a different server mode is discarded
 * - Warn-only on PRs, hard-fail on push runs (`BENCHMARK_GATE_POLICY` overrides)
 * - Severe drift needs two consecutive observations; the first one freezes the
 *   baseline so a noisy runner cannot both warn and re-baseline the value
 * - Pure `evaluateSamples()` core so the thresholds are unit-testable without I/O
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ADAPTER_BUDGET_OVERRIDES, PERFORMANCE_BUDGET } from "./config";

export type GatePolicy = "warn" | "fail";
export type GateSeverity = "ok" | "warn" | "fail";
export type GateStatus = "pass" | "warn" | "fail";

/** Relative drift that earns a warning / a failure on `main`. */
const WARN_PCT = 25;
const WARN_MIN_DELTA_MS = 0.25;
const FAIL_PCT = 100;
const FAIL_MIN_DELTA_MS = 1;

/**
 * Severe drift must be observed this many runs in a row before it fails the
 * build. Parallel CI runners routinely shift a sub-5 ms metric by >100 % for one
 * run; a single sample is not evidence of a code regression.
 */
const SEVERE_CONFIRMATIONS = 2;

/** Samples kept per metric in the rolling baseline. */
const BASELINE_WINDOW = 7;
/** Prior samples required before drift is judged (avoids noise on a cold cache). */
const MIN_BASELINE_RUNS = 2;

type BudgetKey = keyof typeof PERFORMANCE_BUDGET;

interface GateMetricSpec {
  /** Test file id (`tests/benchmarks/<id>.test.ts`) for `history.jsonl` sources. */
  testFile?: string;
  /** Metric label in `history.jsonl`. */
  metric?: string;
  /** Key in `matrix_metrics.json` for `exportMetric()` sources. */
  metricKey?: string;
  /** Which exported statistic to compare. */
  stat: "avg" | "p95";
  /** Budget key resolved through the adapter overrides. */
  budgetKey: BudgetKey;
  label: string;
}

/**
 * Core metrics that gate the build. The list is deliberately small: every entry
 * must be produced by one of the eight CI core benchmarks and be stable enough to
 * compare across runs.
 */
export const GATE_METRICS: readonly GateMetricSpec[] = [
  {
    testFile: "cold-start-phased",
    metric: "Cold Start (IDLE → HTTP READY)",
    stat: "avg",
    budgetKey: "coldStartMs",
    label: "Cold start (avg)",
  },
  {
    testFile: "truth-latency",
    metric: "HTTP End-to-End",
    metricKey: "truth.http.p95",
    stat: "p95",
    budgetKey: "collections",
    label: "Truth HTTP p95",
  },
  {
    testFile: "rest-api-performance",
    metric: "Collection Find (List Limit 20)",
    metricKey: "rest.list.p95_ms",
    stat: "p95",
    budgetKey: "collections",
    label: "REST list p95",
  },
  {
    testFile: "rest-api-performance",
    metric: "Single Document Read",
    metricKey: "rest.point_read.p95_ms",
    stat: "p95",
    budgetKey: "collections",
    label: "REST point read p95",
  },
  {
    testFile: "rest-api-performance",
    metric: "Collection Search Query",
    stat: "p95",
    budgetKey: "collections",
    label: "REST search p95",
  },
  {
    testFile: "hooks-performance",
    metric: "Full Security + Auth Pipeline",
    metricKey: "middleware.hooks.full_p95",
    stat: "p95",
    budgetKey: "securityMs",
    label: "Hooks/security p95",
  },
  {
    testFile: "database-performance",
    metric: "FIND ONE",
    stat: "p95",
    budgetKey: "dbRaw",
    label: "Adapter FIND ONE p95",
  },
  {
    testFile: "database-performance",
    metric: "FILTER (blob field, 1 match)",
    stat: "p95",
    budgetKey: "indexPressure",
    label: "Adapter dynamic filter p95",
  },
  {
    testFile: "cache-performance",
    metric: "Cache Hit (L1 Warm)",
    stat: "p95",
    budgetKey: "collections",
    label: "L1 cache hit p95",
  },
  {
    testFile: "transaction-acid",
    metric: "TX Commit",
    stat: "p95",
    budgetKey: "dbRaw",
    label: "TX commit p95",
  },
  {
    testFile: "virtual-query-federation",
    metric: "Virtual Read Passthrough (live WordPress REST)",
    stat: "p95",
    budgetKey: "indexPressure",
    label: "UDH WordPress REST p95",
  },
  {
    metricKey: "adapter.read.avg",
    stat: "avg",
    budgetKey: "dbRaw",
    label: "Adapter read avg",
  },
  {
    metricKey: "adapter.write.avg",
    stat: "avg",
    budgetKey: "dbRaw",
    label: "Adapter write avg",
  },
  {
    metricKey: "adapter.filter.dynamic.avg",
    stat: "avg",
    budgetKey: "indexPressure",
    label: "Adapter dynamic filter avg",
  },
];

interface HistoryEntry {
  db?: string;
  testFile?: string;
  metric?: string;
  avgMs?: number;
  p95Ms?: number;
  timestamp?: string;
  runMode?: string;
  serverMode?: string;
  status?: string;
}

interface ExportMetricEntry {
  _type?: string;
  name?: string;
  value?: number;
  timestamp?: string;
}

export interface GateSample {
  label: string;
  value: number;
  budget: number;
}

export interface GateMetricResult {
  label: string;
  current: number;
  baseline: number | null;
  changePct: number | null;
  budget: number;
  budgetExceeded: boolean;
  severity: GateSeverity;
  reason: string | null;
  /** Raw severe threshold met, independent of policy and confirmation. */
  severe: boolean;
  /** Consecutive severe observations, including this one. */
  streak: number;
}

export interface GateBaseline {
  version: 1;
  db: string;
  mode: { runMode: string; serverMode: string };
  updatedAt: string;
  series: Record<string, number[]>;
  /** Consecutive severe observations carried into the next run. */
  severeStreak?: Record<string, number>;
}

export interface GateResult {
  db: string;
  policy: GatePolicy;
  passed: boolean;
  status: GateStatus;
  generatedAt: string;
  baselineRuns: number;
  /** Samples required before drift is judged (UI progress: `building (1/2)`). */
  baselineTarget: number;
  metrics: GateMetricResult[];
  warnings: number;
  failures: number;
}

export interface GateOptions {
  db: string;
  /** ISO timestamp marking the start of this benchmark invocation. */
  sinceIso: string;
  policy?: GatePolicy;
  /** Defaults to `$RESULTS_DIR` or `tests/benchmarks/results`. */
  resultsDir?: string;
  /** Disable filesystem writes (unit tests). */
  write?: boolean;
}

function resultsDirFromEnv(explicit?: string): string {
  return (
    explicit ??
    process.env.RESULTS_DIR ??
    path.join(process.cwd(), "tests", "benchmarks", "results")
  );
}

function normalizeTestFile(testFile: string): string {
  return testFile
    .replaceAll("\\", "/")
    .replace(/^tests\/benchmarks\//, "")
    .replace(/\.test\.ts$/, "");
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Adapter override first, global budget second — same precedence as the matrix. */
export function budgetFor(db: string, key: BudgetKey): number {
  const overrides = ADAPTER_BUDGET_OVERRIDES[db.replace("-redis", "")] as
    | Partial<Record<BudgetKey, number>>
    | undefined;
  return overrides?.[key] ?? PERFORMANCE_BUDGET[key];
}

/**
 * Pure threshold evaluation. Exported so the policy can be unit-tested without
 * touching the filesystem or a benchmark run.
 */
export function evaluateSamples(
  db: string,
  policy: GatePolicy,
  current: readonly GateSample[],
  series: Record<string, number[]>,
  priorStreak: Record<string, number> = {},
): GateResult {
  const metrics: GateMetricResult[] = [];
  let warnings = 0;
  let failures = 0;
  let baselineRuns = 0;

  for (const sample of current) {
    const history = series[sample.label] ?? [];
    const hasBaseline = history.length >= MIN_BASELINE_RUNS;
    const baseline = hasBaseline ? median(history) : null;
    const budgetExceeded = sample.value > sample.budget;

    baselineRuns = Math.max(baselineRuns, history.length);

    let severity: GateSeverity = "ok";
    let reason: string | null = null;
    let changePct: number | null = null;
    let severe = false;
    let streak = 0;

    if (baseline !== null && baseline > 0) {
      const delta = sample.value - baseline;
      changePct = (delta / baseline) * 100;
      severe = changePct >= FAIL_PCT && delta >= FAIL_MIN_DELTA_MS;
      const moderate = changePct >= WARN_PCT && delta >= WARN_MIN_DELTA_MS;
      streak = severe ? (priorStreak[sample.label] ?? 0) + 1 : 0;

      if (severe) {
        if (streak >= SEVERE_CONFIRMATIONS) {
          severity = policy === "fail" ? "fail" : "warn";
          reason = `regressed ${changePct.toFixed(0)}% vs ${baseline.toFixed(3)}ms baseline (confirmed ${streak} runs)`;
        } else {
          // First observation: notify, but do not fail a single noisy run.
          severity = "warn";
          reason = `regressed ${changePct.toFixed(0)}% vs ${baseline.toFixed(3)}ms baseline — pending confirmation (${streak}/${SEVERE_CONFIRMATIONS})`;
        }
      } else if (moderate) {
        severity = "warn";
        reason = `drifted ${changePct.toFixed(0)}% vs ${baseline.toFixed(3)}ms baseline`;
      }
    }

    if (budgetExceeded) {
      // Absolute budgets are a documented SLA — they fail even on `next`.
      severity = "fail";
      reason = `budget exceeded: ${sample.value.toFixed(3)}ms > ${sample.budget}ms`;
    }

    if (severity === "fail") failures++;
    else if (severity === "warn") warnings++;

    metrics.push({
      label: sample.label,
      current: sample.value,
      baseline,
      changePct,
      budget: sample.budget,
      budgetExceeded,
      severity,
      reason,
      severe,
      streak,
    });
  }

  return {
    db,
    policy,
    passed: failures === 0,
    status: failures > 0 ? "fail" : warnings > 0 ? "warn" : "pass",
    generatedAt: new Date().toISOString(),
    baselineRuns,
    baselineTarget: MIN_BASELINE_RUNS,
    metrics,
    warnings,
    failures,
  };
}

function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function resolveMode(entries: readonly HistoryEntry[]): {
  runMode: string;
  serverMode: string;
} {
  const sample = entries.find((e) => e.runMode || e.serverMode);
  return {
    runMode: sample?.runMode ?? "standalone",
    serverMode:
      sample?.serverMode ?? (process.env.NODE_ENV === "production" ? "production" : "unknown"),
  };
}

/** Read the metrics this invocation exported, keyed by the spec label. */
function collectCurrentSamples(
  db: string,
  sinceIso: string,
  resultsDir: string,
): { samples: GateSample[]; mode: { runMode: string; serverMode: string } } {
  const current = new Map<string, number>();
  const historyEntries: HistoryEntry[] = [];

  const historyPath = path.join(resultsDir, "history.jsonl");
  if (existsSync(historyPath)) {
    const lines = readFileSync(historyPath, "utf8").trim().split("\n").filter(Boolean);
    for (const line of lines) {
      let entry: HistoryEntry;
      try {
        entry = JSON.parse(line) as HistoryEntry;
      } catch {
        continue;
      }
      if (entry.db !== db) continue;
      if ((entry.status ?? "SUCCESS") !== "SUCCESS") continue;
      if (!entry.timestamp || entry.timestamp < sinceIso) continue;
      historyEntries.push(entry);
    }
  }

  for (const spec of GATE_METRICS) {
    if (!spec.testFile || !spec.metric) continue;
    const match = historyEntries.findLast(
      (e) => normalizeTestFile(e.testFile ?? "") === spec.testFile && e.metric === spec.metric,
    );
    if (!match) continue;
    const value = spec.stat === "p95" ? match.p95Ms : match.avgMs;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      current.set(spec.label, value);
    }
  }

  const metricsPath = path.join(resultsDir, db, "matrix_metrics.json");
  const exported = readJson<Record<string, ExportMetricEntry>>(metricsPath);
  if (exported) {
    for (const spec of GATE_METRICS) {
      if (!spec.metricKey || current.has(spec.label)) continue;
      const entry = exported[spec.metricKey];
      if (!entry || entry._type !== "numeric-metric") continue;
      if (entry.timestamp && entry.timestamp < sinceIso) continue;
      if (typeof entry.value === "number" && Number.isFinite(entry.value) && entry.value > 0) {
        current.set(spec.label, entry.value);
      }
    }
  }

  const samples: GateSample[] = [];
  for (const spec of GATE_METRICS) {
    const value = current.get(spec.label);
    if (value === undefined) continue;
    samples.push({
      label: spec.label,
      value,
      budget: budgetFor(db, spec.budgetKey),
    });
  }

  return { samples, mode: resolveMode(historyEntries) };
}

/**
 * Evaluate the current run, persist the rolling baseline, and return the verdict.
 *
 * @returns `passed === false` only for budget breaches or (on `main`) severe drift.
 */
export function evaluateBenchmarkGate(options: GateOptions): GateResult {
  const { db, sinceIso, write = true } = options;
  const policy = options.policy ?? "warn";
  const resultsDir = resultsDirFromEnv(options.resultsDir);
  const baselinePath = path.join(resultsDir, `gate-baseline-${db}.json`);

  const { samples, mode } = collectCurrentSamples(db, sinceIso, resultsDir);

  const stored = readJson<GateBaseline>(baselinePath);
  const modeMatches =
    stored?.mode.runMode === mode.runMode && stored?.mode.serverMode === mode.serverMode;
  const series = modeMatches ? { ...stored.series } : {};
  const priorStreak = modeMatches ? (stored?.severeStreak ?? {}) : {};

  const result = evaluateSamples(db, policy, samples, series, priorStreak);

  if (write) {
    mkdirSync(resultsDir, { recursive: true });
    const severeStreak: Record<string, number> = {};
    for (const metric of result.metrics) {
      if (metric.streak > 0) severeStreak[metric.label] = metric.streak;
      // Freeze the baseline on an unconfirmed severe drift so the next run
      // compares against the pre-regression level instead of re-baselining it.
      const awaitingConfirmation =
        policy === "fail" && metric.severe && metric.streak < SEVERE_CONFIRMATIONS;
      if (awaitingConfirmation) continue;
      const next = [...(series[metric.label] ?? []), metric.current].slice(-BASELINE_WINDOW);
      series[metric.label] = next;
    }
    const baseline: GateBaseline = {
      version: 1,
      db,
      mode,
      updatedAt: result.generatedAt,
      series,
      severeStreak,
    };
    writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    writeFileSync(
      path.join(resultsDir, `gate-report-${db}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
    );
  }

  return result;
}

/** Human-readable table shared by the CLI and the CI step summary. */
export function renderGateMarkdown(result: GateResult): string {
  const icon = result.status === "fail" ? "🔴" : result.status === "warn" ? "🟠" : "🟢";
  const target = result.baselineTarget ?? 2;
  const building = result.baselineRuns < target;
  const baselineText = building
    ? `building (${result.baselineRuns}/${target} samples)`
    : `${result.baselineRuns} prior run(s)`;

  let md = `### ${icon} Performance gate — ${result.db.toUpperCase()}\n\n`;
  md += `Policy: \`${result.policy}\` · Baseline: ${baselineText}\n\n`;
  md += `| Metric | Current | Baseline | Δ | Budget | Verdict |\n`;
  md += `| :--- | ---: | ---: | ---: | ---: | :--- |\n`;

  for (const metric of result.metrics) {
    const baseline = metric.baseline === null ? "—" : `${metric.baseline.toFixed(3)}ms`;
    const change =
      metric.changePct === null
        ? "—"
        : `${metric.changePct >= 0 ? "+" : ""}${metric.changePct.toFixed(0)}%`;
    const verdict =
      metric.severity === "fail" ? "🔴 fail" : metric.severity === "warn" ? "🟠 warn" : "🟢 ok";
    md += `| ${metric.label} | ${metric.current.toFixed(3)}ms | ${baseline} | ${change} | ${metric.budget}ms | ${verdict} |\n`;
  }

  if (building) {
    md += `\n> Baseline building (${result.baselineRuns}/${target}): ${target - result.baselineRuns} more run(s) before drift is judged. Absolute budgets are already enforced.\n`;
  }
  return `${md}\n`;
}

/** Print annotations + step summary for a completed gate. */
export function reportBenchmarkGate(
  result: GateResult,
  markdown = renderGateMarkdown(result),
): void {
  if (result.metrics.length === 0) {
    console.warn(
      "⚠️  Performance gate found no exported metrics for this run — run with BENCHMARK_RECORD=1 (CI sets it).",
    );
    console.log(
      "::warning title=Performance gate::No metrics exported for this run — budget/trend evaluation was skipped.",
    );
  }

  for (const metric of result.metrics) {
    if (metric.severity === "fail") {
      console.log(
        `::error title=Performance gate (${result.db})::${metric.label}: ${metric.reason ?? "failed"}`,
      );
    } else if (metric.severity === "warn") {
      console.log(
        `::warning title=Performance drift (${result.db})::${metric.label}: ${metric.reason ?? "drifted"}`,
      );
    }
  }

  console.log(`\n${markdown}`);
  if (result.status === "fail") {
    console.error(
      `❌ Performance gate failed for ${result.db} (${result.failures} failure(s), ${result.warnings} warning(s)).`,
    );
  } else if (result.status === "warn") {
    console.warn(`⚠️  Performance gate warned for ${result.db} (${result.warnings} warning(s)).`);
  } else {
    console.log(`✅ Performance gate passed for ${result.db}.`);
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    try {
      writeFileSync(summaryPath, `${markdown}\n`, { flag: "a" });
    } catch {
      /* summary is best-effort */
    }
  }
}

function parseArgs(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (!token.startsWith("--")) continue;
    const [rawKey, inline] = token.slice(2).split("=", 2);
    if (!rawKey) continue;
    args[rawKey] = inline ?? argv[i + 1] ?? "";
    if (inline === undefined) i++;
  }
  return args;
}

function resolvePolicy(raw: string | undefined): GatePolicy {
  if (raw === "fail" || raw === "warn") return raw;
  const event = process.env.GITHUB_EVENT_NAME;
  return event && event !== "pull_request" ? "fail" : "warn";
}

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2));
  const db = args.db || process.env.DB_TYPE || "sqlite";

  const policy = resolvePolicy(args.policy ?? process.env.BENCHMARK_GATE_POLICY?.toLowerCase());
  const result = evaluateBenchmarkGate({
    db,
    sinceIso: args.since ?? "1970-01-01T00:00:00.000Z",
    policy,
  });
  reportBenchmarkGate(result);
  process.exit(result.passed ? 0 : 1);
}
