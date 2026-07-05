/**
 * @file scripts/benchmark-matrix/utils.ts
 * @description Metric extraction, trend analysis, and statistical utilities for benchmark reporting.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

export const MIN_RUNS_FOR_TREND = 3;

// ── Metric Extraction ────────────────────────────────────────────────────────

export function extractMetrics(
  metrics: Record<string, any>,
  _dbType: string,
): Record<string, number> {
  const result: Record<string, number> = {};
  if (metrics) {
    for (const [key, value] of Object.entries(metrics)) {
      if (typeof value === "number") result[key] = value;
    }
  }
  return result;
}

// ── History Loading ───────────────────────────────────────────────────────────

export function loadMetricHistory(dbKey: string, metric: string): number[] {
  try {
    const historyPath = join(process.cwd(), "tests", "benchmarks", "results", "history.sqlite");
    if (!existsSync(historyPath)) return [];

    // Read from the SQLite history DB
    const Database = require("better-sqlite3");
    const db = new Database(historyPath, { readonly: true });
    const rows = db
      .prepare(
        `SELECT json_extract(metrics_json, '$.' || ? || '.p95Ms') as val
         FROM runs WHERE db_key = ? AND status = 'SUCCESS'
         ORDER BY timestamp DESC LIMIT 20`,
      )
      .all(metric, dbKey) as { val: number | null }[];
    db.close();

    return rows.map((r) => r.val).filter((v): v is number => v != null && v > 0);
  } catch {
    return [];
  }
}

// ── Statistics ────────────────────────────────────────────────────────────────

export function linearRegression(values: number[]): {
  slope: number;
  intercept: number;
  r2: number;
} {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, r2: 0 };

  const indices = values.map((_, i) => i);
  const sumX = indices.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = indices.reduce((sum, x, i) => sum + x * values[i], 0);
  const sumX2 = indices.reduce((sum, x) => sum + x * x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const meanY = sumY / n;
  const ssRes = values.reduce((sum, y, i) => sum + (y - (slope * i + intercept)) ** 2, 0);
  const ssTot = values.reduce((sum, y) => sum + (y - meanY) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, r2 };
}

export function weightedAverage(values: number[], weights?: number[]): number {
  if (values.length === 0) return 0;
  if (!weights || weights.length !== values.length) {
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight === 0) return 0;
  return values.reduce((sum, v, i) => sum + v * weights[i], 0) / totalWeight;
}

export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

// ── Trend Classification ──────────────────────────────────────────────────────

export function classifyTrend(
  current: number,
  history: number[],
): { icon: string; pct: string; direction: "up" | "down" | "stable" } {
  if (history.length < MIN_RUNS_FOR_TREND) {
    return { icon: "⚪", pct: "—", direction: "stable" };
  }

  const recentAvg =
    history.slice(0, Math.min(5, history.length)).reduce((a, b) => a + b, 0) /
    Math.min(5, history.length);

  if (recentAvg <= 0 || current <= 0) {
    return { icon: "⚪", pct: "—", direction: "stable" };
  }

  const pct = Math.max(-100, Math.min(100, ((current - recentAvg) / recentAvg) * 100));
  const absPct = Math.abs(pct);

  if (absPct < 5)
    return { icon: "⚪", pct: `${sign(pct)}${absPct.toFixed(1)}%`, direction: "stable" };
  if (pct < 0) return { icon: "🟢", pct: `${pct.toFixed(1)}%`, direction: "down" };
  return { icon: "🔴", pct: `+${pct.toFixed(1)}%`, direction: "up" };
}

function sign(n: number): string {
  return n >= 0 ? "+" : "";
}

export function classifyRootCause(metric: string, _history: number[]): string {
  const patterns: Record<string, string> = {
    cold_start_ms: "Server initialization overhead",
    collections_p95: "Database query performance",
    graphql_avg: "GraphQL resolver complexity",
    memGrowth: "Memory allocation patterns",
    hooks: "Middleware pipeline overhead",
    indexPressure: "Index efficiency under scale",
  };
  return patterns[metric] || "General performance variation";
}

export function isWarmingUp(history: number[], current: number): boolean {
  if (history.length < 2) return true;
  const recent = history.slice(0, 3);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  return current > avg * 1.3; // 30% above recent average = still warming
}

// ── Trend Details ─────────────────────────────────────────────────────────────

export async function getTrendDetails(
  _db: any,
  _dbKey: string,
  currentValue: number,
  historyKey: string,
): Promise<{ icon: string; pct: string }> {
  if (!currentValue) return { icon: "⚪", pct: "—" };
  try {
    const history = loadMetricHistory(_dbKey, historyKey);
    const trend = classifyTrend(currentValue, history);
    return { icon: trend.icon, pct: trend.pct };
  } catch {
    return { icon: "⚪", pct: "—" };
  }
}

// ── Budget Check ──────────────────────────────────────────────────────────────

export function checkBudget(metrics: Record<string, number>, coldStartMs: number): string[] {
  const violations: string[] = [];
  if (coldStartMs > 5000) violations.push("coldStart");
  if ((metrics.collections || 0) > 5) violations.push("collections");
  if ((metrics.graphqlAvg || 0) > 12) violations.push("graphqlAvg");
  if ((metrics.dbRaw || 0) > 50) violations.push("dbRaw");
  if ((metrics.hooks || 0) > 2.0) violations.push("hooks");
  if ((metrics.memGrowth || 0) > 60) violations.push("memGrowth");
  return violations;
}

// ── Port Management ───────────────────────────────────────────────────────────

export async function freePort(port: number): Promise<void> {
  try {
    const { execSync } = await import("node:child_process");
    if (process.platform === "win32") {
      execSync(`netstat -ano | findstr :${port}`, { stdio: "pipe" });
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null`, { stdio: "pipe" });
    }
  } catch {
    // Port is free or we couldn't free it
  }
}

// ── Environment Validation ────────────────────────────────────────────────────

export function validateEnvironment(
  _dbType: string,
  _useRedis: boolean,
): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (!process.env.DB_TYPE) warnings.push("DB_TYPE not set");
  return { ok: warnings.length === 0, warnings };
}
