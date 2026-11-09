/**
 * @file scripts/benchmark-matrix/regression-detector.ts
 * @description Statistical regression detection with root cause classification.
 *
 * ### Two-Pass Architecture:
 * Pass 1: Build MetricTrend[] per adapter using linearRegression + computeTrendSlopeFromStats
 * Pass 2: Classify root cause across all trends using correlation rules
 *
 * ### Post-Pass Enhancements (July 2026):
 * - Flapping detection: identifies metrics that alternate pass/fail across runs
 * - Improvement detection: flags significant positive changes (pct < -20%)
 * - Cross-DB correlation: same metric degrading across multiple adapters
 * - Budget forecasting: projects runs until budget breach using linear slope
 *
 * ### Features:
 * - linear regression slope analysis (not simple avg delta)
 * - cross-metric correlation for root cause classification
 * - sample-size guards prevent false alarms during baseline-building
 * - warming-up detection via reset_events table
 * - per-adapter budget overrides from ADAPTER_BUDGET_OVERRIDES
 * - in-memory history cache (avoids redundant SQLite reads per metric)
 *
 * > [!IMPORTANT]
 * > **Empirical Verification Required** (per AGENTS.md):
 * > When modifying this detector, always re-run with BENCHMARK_RECORD=1 and
 * > inspect the generated MDX reports in `docs/project/benchmarks/`.
 * >
 * > ```bash
 * > BENCHMARK_RECORD=1 bun test tests/benchmarks/auth-performance.test.ts
 * > bun run scripts/benchmark-matrix/index.ts --sql
 * > ```
 */

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  extractMetrics,
  loadMetricHistory,
  linearRegression,
  weightedAverage,
  stddev,
  isWarmingUp,
  MIN_RUNS_FOR_TREND,
} from "./utils";
import {
  PERFORMANCE_BUDGET,
  ADAPTER_BUDGET_OVERRIDES,
  CORRELATION_RULES,
  ROOT_RESULTS_DIR,
} from "./config";
import type {
  BenchmarkResult,
  MetricTrend,
  RegressionResult,
  EnhancedRegressionReport,
  DetectRegressionsResult,
} from "./types";

// ── Local Wrappers ──────────────────────────────────────────────────────────────

/**
 * In-memory cache for history loads — avoids redundant SQLite queries.
 *
 * Arrays are frozen: `loadHistoryCached` returns the cached reference directly
 * when the caller wants the whole series (no slice allocation), so a caller that
 * sorted/mutated a series would poison it for every later read. Freezing turns
 * that class of bug into an immediate throw instead of a silent false negative.
 */
const _historyCache = new Map<string, number[]>();

/** Cached `-redis` strip per adapter key (budget + folder lookups hit it constantly). */
const _baseKeyCache = new Map<string, string>();

/** `sqlite-redis` → `sqlite`, computed once per distinct adapter key. */
function baseAdapterKey(dbKey: string): string {
  let key = _baseKeyCache.get(dbKey);
  if (key === undefined) {
    key = dbKey.replace("-redis", "");
    _baseKeyCache.set(dbKey, key);
  }
  return key;
}

function _cacheKey(dbKey: string, histKey: string): string {
  return `${dbKey}::${histKey}`;
}

/** Stable dedup key for an emitted regression (`db::metric` exactly as pushed). */
function dedupKey(dbKey: string, metric: string): string {
  return `${dbKey}::${metric}`;
}

/** Load metric history from SQLite with in-memory caching. */
function loadHistoryCached(dbKey: string, histKey: string, limit: number): number[] {
  const key = _cacheKey(dbKey, histKey);
  let cached = _historyCache.get(key);
  if (!cached) {
    // `.slice()` guarantees a private copy before freezing; the loader already
    // returns a fresh array, but this keeps the invariant explicit.
    cached = Object.freeze(loadMetricHistory(dbKey, histKey).slice()) as number[];
    _historyCache.set(key, cached);
  }
  // Whole series requested → return the cached array (frozen, read-only) with
  // no slice allocation. A limited view → hand back a fresh, mutable copy.
  return limit >= cached.length ? cached : cached.slice(0, limit);
}

/**
 * Compute a MetricTrend-compatible direction and confidence from statistics that
 * are already computed (slope / r² from `linearRegression`, `sd` from `stddev`).
 * Avoids a second pass over the series.
 */
function computeTrendSlopeFromStats(
  sampleSize: number,
  current: number,
  budget: number,
  slope: number,
  r2: number,
  sd: number,
): { direction: string; confidence: number } {
  const absSlope = Math.abs(slope);
  const isSignificant = sd > 0 ? absSlope / (sd / Math.sqrt(sampleSize)) > 0.5 : absSlope > 0.001;

  if (!isSignificant || absSlope < 0.0001) {
    return { direction: "stable", confidence: Math.min(r2, 0.5) };
  }

  if (slope > 0) {
    const projectedRuns = Math.ceil((budget - current) / slope);
    const direction = current >= budget || projectedRuns <= 5 ? "critical" : "degrading";
    return { direction, confidence: Math.min(r2, 0.95) };
  }

  return { direction: "improving", confidence: Math.min(r2, 0.9) };
}

/**
 * 🎯 COLD/WARM RATIO CHECK: for metrics recorded in BOTH phases (runs.phase),
 * trend the cold/warm latency ratio across runs. A degraded ratio (>20%) with
 * flat warm latency is the signature of cache/schema-path regressions
 * (per-request schema rebuilds, turbo/response-cache misses) that avg-based
 * checks stay green on. Latent until a benchmark records both phases.
 */
/** Minimal structural type for the prepared cold/warm scan (prepared once per run). */
type ColdWarmQuery = { all: (dbType: string) => unknown[] };

function detectColdWarmRatioRegressions(
  query: ColdWarmQuery,
  dbKey: string,
  regressions: RegressionResult[],
  seenKeys: Set<string>,
): void {
  try {
    const baseDb = baseAdapterKey(dbKey);
    // The statement is prepared once for the whole run (see detectRegressions)
    // and the unused `timestamp` column is dropped to keep the 600-row scan lean.
    const rows = query.all(baseDb) as {
      metric: string;
      phase: string;
      avg_ms: number;
    }[];

    // Group newest-first per metric + phase
    const byMetric = new Map<string, { cold: number[]; warm: number[] }>();
    for (const row of rows) {
      if (row.phase !== "cold" && row.phase !== "warm") continue;
      let entry = byMetric.get(row.metric);
      if (!entry) {
        entry = { cold: [], warm: [] };
        byMetric.set(row.metric, entry);
      }
      entry[row.phase]!.push(row.avg_ms);
    }

    for (const [metric, { cold, warm }] of byMetric) {
      if (cold.length < 2 || warm.length < 2) continue;
      const latestRatio = cold[0]! / warm[0]!;
      if (!Number.isFinite(latestRatio) || latestRatio <= 0) continue;

      const priorRatios: number[] = [];
      const n = Math.min(cold.length, warm.length);
      for (let i = 1; i < n; i++) {
        if (warm[i]! > 0) priorRatios.push(cold[i]! / warm[i]!);
      }
      if (priorRatios.length === 0) continue;

      const sorted = [...priorRatios].sort((a, b) => a - b);
      const baseline = sorted[Math.floor(sorted.length / 2)]!;
      if (baseline <= 0) continue;

      const deltaPct = ((latestRatio - baseline) / baseline) * 100;
      if (deltaPct > 20) {
        const metricLabel = `${metric} (cold/warm ratio)`;
        const key = dedupKey(dbKey, metricLabel);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        regressions.push({
          db: dbKey,
          metric: metricLabel,
          current: latestRatio,
          previousAvg: baseline,
          changePct: deltaPct,
          isRegression: true,
          reason: `Cold/warm latency ratio degraded ${deltaPct.toFixed(0)}% (${latestRatio.toFixed(2)} vs ${baseline.toFixed(2)} baseline) — cache/schema-path regression signature while warm latency may stay flat.`,
          direction: "degrading",
          confidence: 0.7,
          rootCause: "cache-path-cold-degradation",
          severity: "warn",
          forecastRuns: null,
        });
      }
    }
  } catch {
    /* history query is best-effort */
  }
}

/**
 * Classify root cause by matching the set of degrading metrics against
 * correlation rules (e.g. middleware, adapter, native).
 */
function classifyRootCauseFromSet(
  degradingSet: Set<string>,
  rules: readonly { name: string; primaryMetric: string; correlatedMetrics: readonly string[] }[],
): string {
  for (const rule of rules) {
    if (!degradingSet.has(rule.primaryMetric)) continue;
    if (rule.correlatedMetrics.some((m) => degradingSet.has(m))) return rule.name;
  }
  if (degradingSet.size >= 2) return "multi-metric";
  return "unknown";
}

// ── Internal Types ──────────────────────────────────────────────────────────────

interface RegressionCheck {
  key: string;
  value: number;
  histKey: string;
  label: string;
  trendMetric?: string;
}

// ── Budget Helpers ──────────────────────────────────────────────────────────────

function getEffectiveBudget(dbKey: string, metricKey: string): number {
  const overrides = ADAPTER_BUDGET_OVERRIDES[baseAdapterKey(dbKey)] || {};
  return (overrides as any)[metricKey] ?? (PERFORMANCE_BUDGET as any)[metricKey] ?? 999;
}

// ── Flapping Detection ──────────────────────────────────────────────────────────

function detectFlapping(history: number[]): { isFlapping: boolean; flipCount: number } {
  if (history.length < 4) return { isFlapping: false, flipCount: 0 };

  let flipCount = 0;
  let pairCount = 0;
  let prevDirection: number | null = null;

  for (let i = 1; i < history.length; i++) {
    const current = history[i]!;
    const previous = history[i - 1]!;
    const delta = current - previous;

    const threshold = Math.max(Math.abs(previous) * 0.005, 0.001);
    let direction: number;
    if (delta > threshold) direction = 1;
    else if (delta < -threshold) direction = -1;
    else direction = 0;

    if (direction === 0) continue;

    pairCount++;
    if (prevDirection !== null && direction !== prevDirection) {
      flipCount++;
    }
    prevDirection = direction;
  }

  const flipRatio = pairCount > 0 ? flipCount / pairCount : 0;
  const isFlapping = flipCount >= 2 && flipRatio >= 0.6;

  return { isFlapping, flipCount };
}

// ── Budget Forecasting ──────────────────────────────────────────────────────────

function computeBudgetForecast(
  current: number,
  slope: number,
  budget: number,
): { runsUntilBreach: number; projectedValue: number } | null {
  if (current >= budget) return { runsUntilBreach: 0, projectedValue: current };
  if (slope <= 0) return null;

  const runsUntilBreach = Math.ceil((budget - current) / slope);
  if (runsUntilBreach > 1000) return null;

  const projectedValue = current + slope * runsUntilBreach;
  return { runsUntilBreach, projectedValue };
}

// ── Improvement Threshold ───────────────────────────────────────────────────────

const IMPROVEMENT_THRESHOLD_PCT = -20;

// ── Static Check Registry ───────────────────────────────────────────────────────

interface CheckDef {
  key: string;
  histKey: string;
  label: string;
  trendMetric: string;
}

/** Static check registry — `buildChecks` only fills the per-run values. */
const CHECK_DEFS: readonly CheckDef[] = [
  {
    key: "collections",
    histKey: "collections_p95",
    label: "REST/Collections p95",
    trendMetric: "collections",
  },
  { key: "graphqlAvg", histKey: "graphql_avg", label: "GraphQL Avg", trendMetric: "graphqlAvg" },
  {
    key: "hooks",
    histKey: "middleware_hooks_p95",
    label: "Hooks/Middleware",
    trendMetric: "hooks",
  },
  { key: "memGrowth", histKey: "mem_growth", label: "Memory Growth", trendMetric: "memGrowth" },
  {
    key: "indexPressure",
    histKey: "index_pressure_p95",
    label: "Index Pressure",
    trendMetric: "indexPressure",
  },
  { key: "dbRaw", histKey: "adapter_read_avg", label: "DB Raw p95", trendMetric: "dbRaw" },
  {
    key: "mixedAvg",
    histKey: "mixed_workload_aggregate",
    label: "Mixed Workload",
    trendMetric: "mixedAvg",
  },
];

/** O(1) label lookup (replaces a `checks.find` per emitted regression). */
const LABEL_BY_METRIC = new Map<string, string>(
  CHECK_DEFS.map((d) => [d.trendMetric, d.label] as const),
);

function labelForMetric(metric: string): string {
  return LABEL_BY_METRIC.get(metric) ?? metric;
}

function buildChecks(m: Record<string, number>): RegressionCheck[] {
  const checks: RegressionCheck[] = [];
  for (const def of CHECK_DEFS) {
    checks.push({
      key: def.key,
      value: m[def.trendMetric] ?? 0,
      histKey: def.histKey,
      label: def.label,
      trendMetric: def.trendMetric,
    });
  }
  return checks;
}

// ── Per-Adapter Trend Building ──────────────────────────────────────────────────

interface AdapterTrends {
  trends: MetricTrend[];
  /** Series loaded for this adapter, keyed by BOTH `histKey` and `trendMetric`. */
  histories: Map<string, number[]>;
}

function buildAdapterTrends(
  dbKey: string,
  checks: RegressionCheck[],
  historyLimit: number,
): AdapterTrends {
  const trends: MetricTrend[] = [];
  const histories = new Map<string, number[]>();

  for (const check of checks) {
    if (!check.value || check.value <= 0) continue;

    const history = loadHistoryCached(dbKey, check.histKey, historyLimit);
    // Register under both names so flapping reuses the exact series the trend was
    // computed on (it previously reloaded `trend.metric` — the wrong key).
    histories.set(check.histKey, history);
    histories.set(check.trendMetric || check.key, history);

    if (history.length < MIN_RUNS_FOR_TREND) continue;

    const { slope, r2 } = linearRegression(history);
    const baseline = weightedAverage(history);
    const sd = stddev(history);
    const budget = getEffectiveBudget(dbKey, check.key);
    const { direction, confidence } = computeTrendSlopeFromStats(
      history.length,
      check.value,
      budget,
      slope,
      r2,
      sd,
    );

    trends.push({
      adapter: dbKey,
      metric: check.trendMetric || check.key,
      category: check.key === "memGrowth" ? "native_memory" : "latency",
      current: check.value,
      baseline,
      stddev: sd,
      slope,
      r2,
      sampleSize: history.length,
      direction: direction as any,
      confidence,
      forecastModel: check.key === "memGrowth" ? "exponential" : "linear",
      forecastRunsToBreach: null,
    });
  }
  return { trends, histories };
}

// ── Baseline-Building Pushes ────────────────────────────────────────────────────

function emitBaselineAlerts(
  dbKey: string,
  checks: RegressionCheck[],
  regressions: RegressionResult[],
  seenKeys: Set<string>,
): void {
  for (const check of checks) {
    if (!check.value || check.value <= 0) continue;
    const history = loadHistoryCached(dbKey, check.histKey, 20);
    if (history.length >= MIN_RUNS_FOR_TREND) continue;

    const baseline = history.length > 0 ? weightedAverage(history) : 0;
    const pct = baseline > 0 ? ((check.value - baseline) / baseline) * 100 : 0;
    if (Math.abs(pct) > 15) {
      const key = dedupKey(dbKey, check.label);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      regressions.push({
        db: dbKey,
        metric: check.label,
        current: check.value,
        previousAvg: baseline,
        changePct: pct,
        isRegression: pct > 15,
        reason: pct > 15 ? "Delta exceeds 15% threshold (baseline-building)" : "Within threshold",
        direction: "stable",
        confidence: 0,
        rootCause: "unknown",
        severity: "info",
      });
    }
  }
}

// ── Budget Violation Flags ──────────────────────────────────────────────────────

function emitBudgetViolations(
  dbKey: string,
  checks: RegressionCheck[],
  regressions: RegressionResult[],
  seenKeys: Set<string>,
): void {
  for (const check of checks) {
    if (!check.value || check.value <= 0) continue;
    const budget = getEffectiveBudget(dbKey, check.key);
    if (check.value > budget) {
      const key = dedupKey(dbKey, check.label);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        regressions.push({
          db: dbKey,
          metric: check.label,
          current: check.value,
          previousAvg: 0,
          changePct: ((check.value - budget) / budget) * 100,
          isRegression: true,
          reason: `Exceeded budget: ${check.value.toFixed(3)}ms > ${budget}ms`,
          direction: "critical",
          confidence: 1.0,
          rootCause: "unknown",
          severity: "critical",
        });
      }
    }
  }
}

// ── Cross-DB Analysis ───────────────────────────────────────────────────────────

function detectCrossCutting(
  allGlobalTrends: MetricTrend[],
  regressions: RegressionResult[],
  seenKeys: Set<string>,
): EnhancedRegressionReport["crossCutting"] {
  const crossCutting: EnhancedRegressionReport["crossCutting"] = [];
  const byMetric = new Map<string, MetricTrend[]>();

  for (const trend of allGlobalTrends) {
    if (trend.direction !== "degrading" && trend.direction !== "critical") continue;
    const key = trend.metric;
    if (!byMetric.has(key)) byMetric.set(key, []);
    byMetric.get(key)!.push(trend);
  }

  for (const [metric, trends] of byMetric) {
    if (trends.length < 2) continue;

    const adapters = trends.map((t) => t.adapter);
    const avgPct =
      trends.reduce((sum, t) => {
        const pct = t.baseline > 0 ? ((t.current - t.baseline) / t.baseline) * 100 : 0;
        return sum + pct;
      }, 0) / trends.length;

    const maxDirection = trends.some((t) => t.direction === "critical")
      ? ("critical" as const)
      : ("warn" as const);

    const reason =
      trends.length >= 3
        ? `Cross-cutting regression across ${trends.length} adapters (${adapters.join(", ")}). This is likely a code-level change affecting all backends, not a DB-specific issue.`
        : `Same metric degrading on ${trends.length} adapters (${adapters.join(", ")}) — possible shared code path regression.`;

    crossCutting.push({
      metric,
      affectedAdapters: adapters,
      avgChangePct: avgPct,
      severity: maxDirection,
      reason,
    });

    for (const t of trends) {
      const pct = t.baseline > 0 ? ((t.current - t.baseline) / t.baseline) * 100 : 0;
      const key = dedupKey(t.adapter, t.metric);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        regressions.push({
          db: t.adapter,
          metric: t.metric,
          current: t.current,
          previousAvg: t.baseline,
          changePct: pct,
          isRegression: true,
          reason: `Cross-cutting: ${reason}`,
          slope: t.slope,
          direction: t.direction,
          confidence: t.confidence,
          rootCause: "cross-cutting",
          severity: maxDirection,
          forecastRuns: t.forecastRunsToBreach ?? null,
        });
      }
    }
  }

  return crossCutting;
}

// ── Budget Forecasts Summary ────────────────────────────────────────────────────

function buildForecastSummary(
  allGlobalTrends: MetricTrend[],
): EnhancedRegressionReport["budgetForecasts"] {
  const forecasts: EnhancedRegressionReport["budgetForecasts"] = [];
  for (const trend of allGlobalTrends) {
    if (
      trend.forecastRunsToBreach !== null &&
      trend.forecastRunsToBreach !== undefined &&
      trend.forecastRunsToBreach > 0
    ) {
      const budget = getEffectiveBudget(trend.adapter, trend.metric);
      forecasts.push({
        adapter: trend.adapter,
        metric: trend.metric,
        label: trend.metric,
        current: trend.current,
        budget,
        slope: trend.slope,
        estimatedRunsUntilBreach: trend.forecastRunsToBreach,
        projectedBreachValue: trend.current + trend.slope * trend.forecastRunsToBreach,
      });
    }
  }
  return forecasts;
}

// ── Main Orchestrator ───────────────────────────────────────────────────────────

/**
 * Detects performance regressions using statistical analysis.
 *
 * Returns a clean DetectRegressionsResult (replaces old __enhanced hack).
 */
export async function detectRegressions(
  results: BenchmarkResult[],
  _options: { strict?: boolean; singleTestMode?: boolean } = {},
): Promise<DetectRegressionsResult> {
  const regressions: RegressionResult[] = [];
  const sqliteHistoryFile = path.join(ROOT_RESULTS_DIR, "history.sqlite");

  // Shared dedup set: keyed by `db::metric` exactly as emitted, so baseline,
  // budget, trend, cold/warm and cross-cutting emitters never double-list.
  const seenKeys = new Set<string>();

  // Clear cache per invocation
  _historyCache.clear();

  if (!existsSync(sqliteHistoryFile)) {
    console.log("ℹ No benchmark history yet — skipping regression detection.");
    return { regressions: [], report: emptyReport() };
  }

  let db: Database | null = null;

  try {
    // Read-only: the detector only reads. Fall back to a writable handle when the
    // WAL/SHM cannot be opened read-only (e.g. a read-only mount).
    try {
      db = new Database(sqliteHistoryFile, { readonly: true });
    } catch {
      db = new Database(sqliteHistoryFile);
    }

    // Both branches above assigned a handle; narrow once for the rest of the run.
    const handle = db;

    const tableExists = handle
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='runs'")
      .get();

    if (!tableExists) {
      console.log("ℹ No benchmark history yet — skipping regression detection.");
      return { regressions: [], report: emptyReport() };
    }

    // Prepared once for the whole run — not once per adapter.
    const coldWarmQuery = handle.query(
      `SELECT metric, phase, avg_ms FROM runs
       WHERE db_type = ? AND status = 'SUCCESS' AND avg_ms > 0
         AND run_mode = 'matrix'
         AND COALESCE(NULLIF(server_mode, ''), 'unknown') = 'production'
       ORDER BY timestamp DESC LIMIT 600`,
    );

    const allGlobalTrends: MetricTrend[] = [];

    // ── Process each adapter result ──
    for (const res of results) {
      if (res.status !== "SUCCESS") continue;

      const m = extractMetrics(res.metrics || {}, baseAdapterKey(res.db));
      const dbKey = res.db;

      // Skip if still warming up
      const warmupHistory = loadHistoryCached(dbKey, "collections_p95", 20);
      if (isWarmingUp(warmupHistory, m.collections || 0)) continue;

      const checks = buildChecks(m);

      // Baseline-building alerts (not enough history for statistical analysis)
      emitBaselineAlerts(dbKey, checks, regressions, seenKeys);

      // 🎯 Cold/warm ratio check (cache/schema-path regression signature)
      detectColdWarmRatioRegressions(coldWarmQuery, dbKey, regressions, seenKeys);

      // Build trend data + the loaded series (shared with flapping below).
      const { trends: adapterTrends, histories } = buildAdapterTrends(dbKey, checks, 20);

      // ── Root cause classification (uses pre-flapping directions) ──
      const validTrends = adapterTrends.filter(
        (t) => t.direction !== "stable" && t.confidence > 0.5,
      );
      const degradingSet = new Set(validTrends.map((t) => t.metric));
      const rootCause =
        validTrends.length > 0
          ? classifyRootCauseFromSet(degradingSet, CORRELATION_RULES)
          : "unknown";

      // ── Single pass: flapping → budget forecast → regression / improvement ──
      for (const trend of adapterTrends) {
        const label = labelForMetric(trend.metric);

        // Flapping reuses the exact series the trend was computed on.
        const rawHistory =
          histories.get(trend.metric) ?? loadHistoryCached(dbKey, trend.metric, 20);
        const { isFlapping, flipCount } = detectFlapping(rawHistory);
        if (isFlapping) {
          trend.direction = "flapping" as any;
          const key = dedupKey(dbKey, label);
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            regressions.push({
              db: dbKey,
              metric: label,
              current: trend.current,
              previousAvg: trend.baseline,
              changePct:
                trend.baseline > 0 ? ((trend.current - trend.baseline) / trend.baseline) * 100 : 0,
              isRegression: false,
              reason: `Metric is flapping — ${flipCount} direction flips across ${rawHistory.length} runs. Likely a non-deterministic test or environmental noise.`,
              direction: "flapping",
              confidence: 0.8,
              rootCause: "non-deterministic",
              severity: "warn",
              isFlapping: true,
              forecastRuns: null,
            });
          }
          continue;
        }

        // Budget forecast (stable metrics have no slope to project).
        if (trend.direction !== "stable" && trend.slope > 0) {
          const budget = getEffectiveBudget(dbKey, trend.metric);
          const forecast = computeBudgetForecast(trend.current, trend.slope, budget);
          if (forecast) trend.forecastRunsToBreach = forecast.runsUntilBreach;
        }

        // Regression
        if (trend.direction === "degrading" || trend.direction === "critical") {
          const key = dedupKey(dbKey, label);
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            const pct =
              trend.baseline > 0 ? ((trend.current - trend.baseline) / trend.baseline) * 100 : 0;
            const severity: "warn" | "critical" =
              trend.direction === "critical" ? "critical" : "warn";

            let reason =
              rootCause !== "unknown"
                ? `Statistical regression — likely root cause: ${rootCause}`
                : `Statistical regression detected (${trend.direction}, confidence: ${(trend.confidence * 100).toFixed(0)}%)`;

            if (trend.forecastRunsToBreach !== null && trend.forecastRunsToBreach !== undefined) {
              reason += ` | Budget breach forecast: ~${trend.forecastRunsToBreach} runs if trend continues (slope: ${trend.slope.toFixed(4)})`;
            }

            regressions.push({
              db: dbKey,
              metric: label,
              current: trend.current,
              previousAvg: trend.baseline,
              changePct: pct,
              isRegression: true,
              reason,
              slope: trend.slope,
              direction: trend.direction,
              confidence: trend.confidence,
              rootCause,
              severity,
              forecastRuns: trend.forecastRunsToBreach ?? null,
            });
          }
          continue;
        }

        // Improvement
        const pct =
          trend.baseline > 0 ? ((trend.current - trend.baseline) / trend.baseline) * 100 : 0;
        if (pct < IMPROVEMENT_THRESHOLD_PCT) {
          const key = dedupKey(dbKey, label);
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            regressions.push({
              db: dbKey,
              metric: label,
              current: trend.current,
              previousAvg: trend.baseline,
              changePct: pct,
              isRegression: false,
              reason: `Performance improved by ${Math.abs(pct).toFixed(1)}% — baseline: ${trend.baseline.toFixed(2)}ms → current: ${trend.current.toFixed(2)}ms. Possible optimization or cache warming.`,
              slope: trend.slope,
              direction: "improving",
              confidence: trend.confidence,
              rootCause: "improvement",
              severity: "info",
              isImprovement: true,
              forecastRuns: null,
            });
          }
        }
      }

      // Budget violation checks
      emitBudgetViolations(dbKey, checks, regressions, seenKeys);

      // Collect for cross-DB analysis
      for (const trend of adapterTrends) allGlobalTrends.push(trend);
    }

    // ── Cross-DB correlation ──
    const crossCutting = detectCrossCutting(allGlobalTrends, regressions, seenKeys);

    // ── Budget forecasts summary ──
    const budgetForecasts = buildForecastSummary(allGlobalTrends);

    // ── Build structured report (single pass instead of three filters) ──
    const improvements: RegressionResult[] = [];
    const flappingAlerts: RegressionResult[] = [];
    const actualRegressions: RegressionResult[] = [];
    for (const r of regressions) {
      if (r.isImprovement) improvements.push(r);
      else if (r.isFlapping) flappingAlerts.push(r);
      else actualRegressions.push(r);
    }

    return {
      regressions: actualRegressions,
      report: {
        regressions: actualRegressions,
        improvements,
        flappingAlerts,
        crossCutting,
        budgetForecasts,
      },
    };
  } catch (err: any) {
    console.warn(`⚠️ Regression detection failed: ${err.message}`);
    return { regressions: [], report: emptyReport() };
  } finally {
    db?.close();
  }
}

function emptyReport(): EnhancedRegressionReport {
  return {
    regressions: [],
    improvements: [],
    flappingAlerts: [],
    crossCutting: [],
    budgetForecasts: [],
  };
}
