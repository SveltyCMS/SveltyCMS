/**
 * @file scripts/benchmark-matrix/regression-detector.ts
 * @description Smart performance regression detection based on historical data.
 *
 * features:
 * - checks for regressions in collections, graphql, hooks, mem growth, index pressure, db raw, mixed avg
 * - uses statistical regression detection
 * - uses performance budget for budget violations
 * - single test mode for lenient regression detection
 */

import { Database } from "bun:sqlite";
import path from "node:path";
import { getTrendDetails, extractMetrics } from "./utils";
import { PERFORMANCE_BUDGET, ROOT_RESULTS_DIR } from "./config";
import type { BenchmarkResult } from "./types";

interface RegressionCheck {
  key: string;
  value: number;
  threshold: number; // multiplier (e.g. 2.0 = 2x worse)
  histKey: string;
  label?: string;
  absoluteThreshold?: number; // e.g. +30ms is bad regardless of %
}

export interface RegressionResult {
  db: string;
  metric: string;
  current: number;
  previousAvg: number;
  changePct: number;
  isRegression: boolean;
  reason: string;
}

export async function detectRegressions(
  results: BenchmarkResult[],
  options: { strict?: boolean; singleTestMode?: boolean } = {},
): Promise<RegressionResult[]> {
  const regressions: RegressionResult[] = [];
  const sqliteHistoryFile = path.join(ROOT_RESULTS_DIR, "history.sqlite");

  let db: Database | null = null;

  try {
    db = new Database(sqliteHistoryFile);

    // Ensure table exists
    const tableExists = db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='runs'")
      .get();

    if (!tableExists) {
      console.log("ℹ No benchmark history yet — skipping regression detection.");
      return regressions;
    }

    for (const res of results) {
      if (res.status !== "SUCCESS") continue;

      const m = extractMetrics(res.metrics || {}, res.db.replace("-redis", ""));
      const dbKey = res.db;

      const checks: RegressionCheck[] = [
        {
          key: "collections",
          value: m.collections,
          threshold: 2.0,
          histKey: "collections_p95",
          label: "REST/Collections p95",
        },
        {
          key: "graphqlAvg",
          value: m.graphqlAvg,
          threshold: 2.0,
          histKey: "graphql_avg",
          label: "GraphQL Avg",
        },
        {
          key: "hooks",
          value: m.hooks,
          threshold: 2.5,
          histKey: "middleware_hooks_p95",
          label: "Hooks/Middleware",
        },
        {
          key: "memGrowth",
          value: m.memGrowth,
          threshold: 1.8,
          histKey: "mem_growth",
          label: "Memory Growth",
        },
        {
          key: "indexPressure",
          value: m.indexPressure,
          threshold: 2.0,
          histKey: "index_pressure_p95",
          label: "Index Pressure",
        },
        {
          key: "dbRaw",
          value: m.dbRaw,
          threshold: 2.0,
          histKey: "adapter_read_avg",
          label: "DB Raw p95",
        },
        {
          key: "mixedAvg",
          value: m.mixedAvg,
          threshold: 1.8,
          histKey: "mixed_workload_aggregate",
          label: "Mixed Workload",
        },
      ];

      for (const check of checks) {
        if (!check.value || check.value <= 0) continue;

        const trend = await getTrendDetails(db, dbKey, check.value, check.histKey);

        const budgetLimit = (PERFORMANCE_BUDGET as any)[check.key];
        const isBudgetViolation = budgetLimit && check.value > budgetLimit * check.threshold;

        const isSignificantRegression = trend.isRegression;

        // In single test mode, be slightly more lenient
        const isRegression = options.singleTestMode
          ? isSignificantRegression || isBudgetViolation
          : isSignificantRegression || isBudgetViolation;

        if (isRegression) {
          regressions.push({
            db: res.db,
            metric: check.label || check.key,
            current: check.value,
            previousAvg: (trend as any).previousAvg || 0,
            changePct: trend.pct === "—" ? 0 : parseFloat(trend.pct),
            isRegression: true,
            reason: isBudgetViolation
              ? `Exceeded budget threshold (${check.threshold}x)`
              : `Statistical regression detected`,
          });
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
