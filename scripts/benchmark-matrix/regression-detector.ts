/**
 * @file scripts/benchmark-matrix/regression-detector.ts
 * @description Statistical regression detection with root cause classification.
 *
 * ### Two-Pass Architecture:
 * Pass 1: Build MetricTrend[] per adapter using linearRegression + computeTrendSlope
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

/** In-memory cache for history loads — avoids redundant SQLite queries. */
const _historyCache = new Map<string, number[]>();

function _cacheKey(dbKey: string, histKey: string): string {
  return `${dbKey}::${histKey}`;
}

/** Load metric history from SQLite with in-memory caching. */
function loadHistoryCached(dbKey: string, histKey: string, limit: number): number[] {
  const key = _cacheKey(dbKey, histKey);
  if (!_historyCache.has(key)) {
    _historyCache.set(key, loadMetricHistory(dbKey, histKey));
  }
  return _historyCache.get(key)!.slice(0, limit);
}

/**
 * Compute a MetricTrend-compatible direction and confidence from raw history.
 */
function computeTrendSlope(
  history: number[],
  current: number,
  budget: number,
): { direction: string; confidence: number } {
  const { slope, r2 } = linearRegression(history);
  const sd = stddev(history);

  const absSlope = Math.abs(slope);
  const isSignificant =
    sd > 0 ? absSlope / (sd / Math.sqrt(history.length)) > 0.5 : absSlope > 0.001;

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
 * Classify root cause by matching the set of degrading metrics against
 * correlation rules (e.g. middleware, adapter, native).
 */
function classifyRootCauseFromSet(
  degradingSet: Set<string>,
  rules: readonly { name: string; primaryMetric: string; correlatedMetrics: readonly string[] }[],
): string {
  for (const rule of rules) {
    if (!degradingSet.has(rule.primaryMetric)) continue;
    const correlatedCount = rule.correlatedMetrics.filter((m: string) =>
      degradingSet.has(m),
    ).length;
    if (correlatedCount >= 1) return rule.name;
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
  const overrides = ADAPTER_BUDGET_OVERRIDES[dbKey.replace("-redis", "")] || {};
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

function buildChecks(m: Record<string, number>): RegressionCheck[] {
  return [
    {
      key: "collections",
      value: m.collections,
      histKey: "collections_p95",
      label: "REST/Collections p95",
      trendMetric: "collections",
    },
    {
      key: "graphqlAvg",
      value: m.graphqlAvg,
      histKey: "graphql_avg",
      label: "GraphQL Avg",
      trendMetric: "graphqlAvg",
    },
    {
      key: "hooks",
      value: m.hooks,
      histKey: "middleware_hooks_p95",
      label: "Hooks/Middleware",
      trendMetric: "hooks",
    },
    {
      key: "memGrowth",
      value: m.memGrowth,
      histKey: "mem_growth",
      label: "Memory Growth",
      trendMetric: "memGrowth",
    },
    {
      key: "indexPressure",
      value: m.indexPressure,
      histKey: "index_pressure_p95",
      label: "Index Pressure",
      trendMetric: "indexPressure",
    },
    {
      key: "dbRaw",
      value: m.dbRaw,
      histKey: "adapter_read_avg",
      label: "DB Raw p95",
      trendMetric: "dbRaw",
    },
    {
      key: "mixedAvg",
      value: m.mixedAvg,
      histKey: "mixed_workload_aggregate",
      label: "Mixed Workload",
      trendMetric: "mixedAvg",
    },
  ];
}

function findCheckLabel(checks: RegressionCheck[], trend: MetricTrend): string {
  return (
    checks.find((c) => c.trendMetric === trend.metric || c.key === trend.metric)?.label ||
    trend.metric
  );
}

// ── Per-Adapter Trend Building ──────────────────────────────────────────────────

function buildAdapterTrends(
  dbKey: string,
  checks: RegressionCheck[],
  historyLimit: number,
): MetricTrend[] {
  const trends: MetricTrend[] = [];
  for (const check of checks) {
    if (!check.value || check.value <= 0) continue;

    const history = loadHistoryCached(dbKey, check.histKey, historyLimit);

    if (history.length < MIN_RUNS_FOR_TREND) continue;

    const { slope, r2 } = linearRegression(history);
    const baseline = weightedAverage(history);
    const sd = stddev(history);
    const budget = getEffectiveBudget(dbKey, check.key);
    const { direction, confidence } = computeTrendSlope(history, check.value, budget);

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
  return trends;
}

// ── Baseline-Building Pushes ────────────────────────────────────────────────────

function emitBaselineAlerts(
  dbKey: string,
  checks: RegressionCheck[],
  regressions: RegressionResult[],
): void {
  for (const check of checks) {
    if (!check.value || check.value <= 0) continue;
    const history = loadHistoryCached(dbKey, check.histKey, 20);
    if (history.length >= MIN_RUNS_FOR_TREND) continue;

    const baseline = history.length > 0 ? weightedAverage(history) : 0;
    const pct = baseline > 0 ? ((check.value - baseline) / baseline) * 100 : 0;
    if (Math.abs(pct) > 15) {
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
): void {
  for (const check of checks) {
    if (!check.value || check.value <= 0) continue;
    const budget = getEffectiveBudget(dbKey, check.key);
    if (check.value > budget) {
      const alreadyListed = regressions.some((r) => r.db === dbKey && r.metric === check.label);
      if (!alreadyListed) {
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
      const alreadyListed = regressions.some(
        (r) => r.db === t.adapter && r.metric.includes(t.metric),
      );
      if (!alreadyListed) {
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

  // Clear cache per invocation
  _historyCache.clear();

  let db: Database | null = null;

  try {
    db = new Database(sqliteHistoryFile);

    const tableExists = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='runs'")
      .get();

    if (!tableExists) {
      console.log("ℹ No benchmark history yet — skipping regression detection.");
      return { regressions: [], report: emptyReport() };
    }

    const allGlobalTrends: MetricTrend[] = [];

    // ── Process each adapter result ──
    for (const res of results) {
      if (res.status !== "SUCCESS") continue;

      const m = extractMetrics(res.metrics || {}, res.db.replace("-redis", ""));
      const dbKey = res.db;

      // Skip if still warming up
      const warmupHistory = loadHistoryCached(dbKey, "collections_p95", 20);
      if (isWarmingUp(warmupHistory, m.collections || 0)) continue;

      const checks = buildChecks(m);

      // Baseline-building alerts (not enough history for stat analysis)
      emitBaselineAlerts(dbKey, checks, regressions);

      // Build trend data
      const adapterTrends = buildAdapterTrends(dbKey, checks, 20);

      // ── Root cause classification ──
      const validTrends = adapterTrends.filter(
        (t) => t.direction !== "stable" && t.confidence > 0.5,
      );
      const degradingSet = new Set(validTrends.map((t) => t.metric));
      const rootCause =
        validTrends.length > 0
          ? classifyRootCauseFromSet(degradingSet, CORRELATION_RULES)
          : "unknown";

      // ── Flapping detection ──
      for (const trend of adapterTrends) {
        const rawHistory = loadHistoryCached(dbKey, trend.metric, 20);
        const { isFlapping, flipCount } = detectFlapping(rawHistory);
        if (isFlapping) {
          trend.direction = "flapping" as any;
          regressions.push({
            db: dbKey,
            metric: findCheckLabel(checks, trend),
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
      }

      // ── Budget forecasting ──
      for (const trend of adapterTrends) {
        if (trend.direction === "flapping" || trend.direction === "stable") continue;
        if (trend.slope <= 0) continue;
        const budget = getEffectiveBudget(dbKey, trend.metric);
        const forecast = computeBudgetForecast(trend.current, trend.slope, budget);
        if (forecast) trend.forecastRunsToBreach = forecast.runsUntilBreach;
      }

      // ── Emit regressions ──
      for (const trend of adapterTrends) {
        if (trend.direction !== "degrading" && trend.direction !== "critical") continue;

        const pct =
          trend.baseline > 0 ? ((trend.current - trend.baseline) / trend.baseline) * 100 : 0;
        const severity: "warn" | "critical" = trend.direction === "critical" ? "critical" : "warn";

        let reason =
          rootCause !== "unknown"
            ? `Statistical regression — likely root cause: ${rootCause}`
            : `Statistical regression detected (${trend.direction}, confidence: ${(trend.confidence * 100).toFixed(0)}%)`;

        if (trend.forecastRunsToBreach !== null && trend.forecastRunsToBreach !== undefined) {
          reason += ` | Budget breach forecast: ~${trend.forecastRunsToBreach} runs if trend continues (slope: ${trend.slope.toFixed(4)})`;
        }

        regressions.push({
          db: dbKey,
          metric: findCheckLabel(checks, trend),
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

      // ── Improvement detection ──
      for (const trend of adapterTrends) {
        if (
          trend.direction === "degrading" ||
          trend.direction === "critical" ||
          trend.direction === "flapping"
        )
          continue;
        const pct =
          trend.baseline > 0 ? ((trend.current - trend.baseline) / trend.baseline) * 100 : 0;
        if (pct < IMPROVEMENT_THRESHOLD_PCT) {
          regressions.push({
            db: dbKey,
            metric: findCheckLabel(checks, trend),
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

      // Budget violation checks
      emitBudgetViolations(dbKey, checks, regressions);

      // Collect for cross-DB analysis
      for (const trend of adapterTrends) {
        allGlobalTrends.push(trend);
      }
    }

    // ── Cross-DB correlation ──
    const crossCutting = detectCrossCutting(allGlobalTrends, regressions);

    // ── Budget forecasts summary ──
    const budgetForecasts = buildForecastSummary(allGlobalTrends);

    // ── Build structured report ──
    const improvements = regressions.filter((r) => r.isImprovement);
    const flappingAlerts = regressions.filter((r) => r.isFlapping);
    const actualRegressions = regressions.filter((r) => !r.isImprovement && !r.isFlapping);

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
