/**
 * @file scripts/benchmark-matrix/regression-detector.ts
 * @description Statistical regression detection with root cause classification.
 *
 * ### Two-Pass Architecture:
 * Pass 1: Build MetricTrend[] per adapter using linearRegression + classifyTrend
 * Pass 2: classifyRootCause(allTrends, CORRELATION_RULES) → emit SmartAlerts
 *
 * Features:
 * - linear regression slope analysis (not simple avg delta)
 * - cross-metric correlation for root cause classification
 * - sample-size guards prevent false alarms during baseline-building
 * - warming-up detection via reset_events table
 * - per-adapter budget overrides from ADAPTER_BUDGET_OVERRIDES
 */

import { Database } from "bun:sqlite";
import path from "node:path";
import {
  extractMetrics,
  loadMetricHistory,
  linearRegression,
  weightedAverage,
  stddev,
  classifyTrend,
  classifyRootCause,
  isWarmingUp,
  MIN_RUNS_FOR_TREND,
} from "./utils";
import {
  PERFORMANCE_BUDGET,
  ADAPTER_BUDGET_OVERRIDES,
  CORRELATION_RULES,
  ROOT_RESULTS_DIR,
} from "./config";
import type { BenchmarkResult, MetricTrend } from "./types";

export interface RegressionResult {
  db: string;
  metric: string;
  current: number;
  previousAvg: number;
  changePct: number;
  isRegression: boolean;
  reason: string;
  // 🚀 New fields from statistical engine
  slope?: number;
  direction?: string;
  confidence?: number;
  rootCause?: string;
  severity?: "info" | "warn" | "critical";
  forecastRuns?: number | null;
}

interface RegressionCheck {
  key: string;
  value: number;
  histKey: string;
  label: string;
  /** metric key for MetricTrend (maps to MetricCategory) */
  trendMetric?: string;
}

/** Get the effective budget for a metric, considering adapter overrides */
function getEffectiveBudget(dbKey: string, metricKey: string): number {
  const overrides = ADAPTER_BUDGET_OVERRIDES[dbKey.replace("-redis", "")] || {};
  return (overrides as any)[metricKey] ?? (PERFORMANCE_BUDGET as any)[metricKey] ?? 999;
}

export async function detectRegressions(
  results: BenchmarkResult[],
  _options: { strict?: boolean; singleTestMode?: boolean } = {},
): Promise<RegressionResult[]> {
  const regressions: RegressionResult[] = [];
  const sqliteHistoryFile = path.join(ROOT_RESULTS_DIR, "history.sqlite");

  let db: Database | null = null;

  try {
    db = new Database(sqliteHistoryFile);

    const tableExists = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='runs'")
      .get();

    if (!tableExists) {
      console.log("ℹ No benchmark history yet — skipping regression detection.");
      return regressions;
    }

    // ── PASS 1: Build MetricTrend[] per adapter ──
    for (let r = 0; r < results.length; r++) {
      const res = results[r]!;
      if (res.status !== "SUCCESS") continue;

      const m = extractMetrics(res.metrics || {}, res.db.replace("-redis", ""));
      const dbKey = res.db;

      // Skip if still warming up after a baseline reset
      if (isWarmingUp(db, dbKey)) continue;

      const checks: RegressionCheck[] = [
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

      const adapterTrends: MetricTrend[] = [];

      for (let c = 0; c < checks.length; c++) {
        const check = checks[c]!;
        if (!check.value || check.value <= 0) continue;

        // Load raw history and compute statistical trend
        const history = loadMetricHistory(db, dbKey, check.histKey, 20);

        if (history.length < MIN_RUNS_FOR_TREND) {
          // Baseline-building: use weighted avg only, no slope
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
              reason:
                pct > 15 ? "Delta exceeds 15% threshold (baseline-building)" : "Within threshold",
              direction: "stable",
              confidence: 0,
              rootCause: "unknown",
              severity: "info",
            });
          }
          continue;
        }

        const points = history.map((v, i) => [i, v] as [number, number]);
        const { slope, r2 } = linearRegression(points);
        const baseline = weightedAverage(history);
        const sd = stddev(history);
        const budget = getEffectiveBudget(dbKey, check.key);
        const { direction, confidence } = classifyTrend(
          slope,
          sd,
          budget,
          check.value,
          history.length,
        );

        adapterTrends.push({
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

      // ── PASS 2: Classify root cause across all adapter trends ──
      const validTrends = adapterTrends.filter(
        (t) => t.direction !== "stable" && t.confidence > 0.5,
      );

      let rootCause = "unknown";
      if (validTrends.length > 0) {
        const degradingSet = new Set(validTrends.map((t) => t.metric));
        rootCause = classifyRootCause(degradingSet, CORRELATION_RULES as any);
      }

      // Emit enriched regression results
      for (let t = 0; t < adapterTrends.length; t++) {
        const trend = adapterTrends[t]!;
        if (trend.direction !== "degrading" && trend.direction !== "critical") continue;

        const pct =
          trend.baseline > 0 ? ((trend.current - trend.baseline) / trend.baseline) * 100 : 0;

        const severity: "warn" | "critical" = trend.direction === "critical" ? "critical" : "warn";

        const reason =
          rootCause !== "unknown"
            ? `Statistical regression — likely root cause: ${rootCause}`
            : `Statistical regression detected (${trend.direction}, confidence: ${(trend.confidence * 100).toFixed(0)}%)`;

        regressions.push({
          db: dbKey,
          metric:
            checks.find((c) => c.trendMetric === trend.metric || c.key === trend.metric)?.label ||
            trend.metric,
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
          forecastRuns: trend.forecastRunsToBreach,
        });
      }

      // Also flag budget violations even without regression
      for (let c = 0; c < checks.length; c++) {
        const check = checks[c]!;
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
  } catch (err: any) {
    console.warn(`⚠️ Regression detection failed: ${err.message}`);
  } finally {
    db?.close();
  }

  return regressions;
}
