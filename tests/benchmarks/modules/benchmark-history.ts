/**
 * @file tests/benchmarks/modules/benchmark-history.ts
 * @description Metric-keyed SQLite history store for benchmark trend analysis.
 *
 * Trends MUST compare the same metric over time (e.g. BULK INSERT vs BULK INSERT).
 * The slim store used only `test_id`, which mixed INSERT (~0.13ms) with BULK (~3ms)
 * and produced false +2000% "severe degradation" alerts.
 *
 * ### Features:
 * - per-metric series (`metric` column + unique key)
 * - runMode isolation (matrix vs standalone)
 * - backward-compatible schema migration for older history.sqlite files
 */

import { Database } from "bun:sqlite";
import path from "node:path";

const RESULTS_DIR = path.resolve("tests/benchmarks/results");

function getDb(): Database {
  const dbPath = path.join(RESULTS_DIR, "history.sqlite");
  const db = new Database(dbPath, { create: true });
  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA synchronous=NORMAL");
  db.run(
    `CREATE TABLE IF NOT EXISTS runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id TEXT,
          run_mode TEXT DEFAULT 'standalone',
          test_id TEXT NOT NULL,
          db_type TEXT NOT NULL,
          redis INTEGER DEFAULT 0,
          phase TEXT DEFAULT 'warm',
          metric TEXT NOT NULL DEFAULT '',
          avg_ms REAL NOT NULL,
          p95_ms REAL,
          rps REAL,
          error_count INTEGER DEFAULT 0,
          status TEXT DEFAULT 'SUCCESS',
          timestamp TEXT DEFAULT (datetime('now'))
        )`,
  );

  // Migrate pre-metric schemas (CREATE TABLE IF NOT EXISTS does not add columns)
  try {
    const cols = db.query("PRAGMA table_info(runs)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "metric")) {
      db.run("ALTER TABLE runs ADD COLUMN metric TEXT NOT NULL DEFAULT ''");
    }
  } catch {
    /* best-effort */
  }

  // Replace legacy unique index (no metric) with metric-keyed dedup
  try {
    db.run("DROP INDEX IF EXISTS idx_runs_dedup");
  } catch {
    /* ignore */
  }
  db.run(
    "CREATE INDEX IF NOT EXISTS idx_runs_lookup ON runs(test_id, db_type, redis, phase, metric)",
  );
  db.run(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_dedup ON runs(run_id, run_mode, test_id, db_type, redis, phase, metric)",
  );
  return db;
}

export interface HistoryEntry {
  runId?: string;
  runMode?: string;
  testId: string;
  dbType: string;
  redisEnabled: boolean;
  phase: string;
  /** Scenario / metric name — required for correct multi-metric trends */
  metric?: string;
  avgMs: number;
  p95Ms: number;
  rps: number;
  errorCount: number;
  status: string;
}

function normalizeMetric(metric?: string): string {
  return (metric ?? "").trim() || "avg";
}

export function persistRun(entry: HistoryEntry): void {
  try {
    const db = getDb();
    const metric = normalizeMetric(entry.metric);
    db.run(
      "INSERT OR IGNORE INTO runs (run_id, run_mode, test_id, db_type, redis, phase, metric, avg_ms, p95_ms, rps, error_count, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      entry.runId ?? (null as any),
      entry.runMode || "standalone",
      entry.testId,
      entry.dbType,
      entry.redisEnabled ? 1 : 0,
      entry.phase,
      metric,
      entry.avgMs,
      entry.p95Ms,
      entry.rps,
      entry.errorCount,
      entry.status,
    );
    // Keep only last 50 runs per test+metric to stay lean
    db.run(
      "DELETE FROM runs WHERE id IN (SELECT id FROM runs WHERE test_id = ? AND db_type = ? AND metric = ? ORDER BY id DESC LIMIT -1 OFFSET 50)",
      entry.testId as any,
      entry.dbType as any,
      metric as any,
    );
    db.close();
  } catch {
    /* best-effort */
  }
}

export function loadHistory(
  testId: string,
  dbType: string,
  redisEnabled: boolean,
  phase: string,
  metric?: string,
): { avgMs: number; p95Ms: number; rps: number; runMode?: string; metric?: string }[] {
  try {
    const db = getDb();
    const metricKey = metric !== undefined ? normalizeMetric(metric) : null;
    const rows = (
      metricKey !== null
        ? db
            .query(
              "SELECT avg_ms, p95_ms, rps, run_mode, metric FROM runs WHERE test_id = ? AND db_type = ? AND redis = ? AND phase = ? AND metric = ? AND status = 'SUCCESS' ORDER BY timestamp ASC",
            )
            .all(testId, dbType, redisEnabled ? 1 : 0, phase, metricKey)
        : db
            .query(
              "SELECT avg_ms, p95_ms, rps, run_mode, metric FROM runs WHERE test_id = ? AND db_type = ? AND redis = ? AND phase = ? AND status = 'SUCCESS' ORDER BY timestamp ASC",
            )
            .all(testId, dbType, redisEnabled ? 1 : 0, phase)
    ) as any[];
    db.close();
    return rows.map((r) => ({
      avgMs: r.avg_ms,
      p95Ms: r.p95_ms || 0,
      rps: r.rps || 0,
      runMode: r.run_mode || "standalone",
      metric: r.metric || "avg",
    }));
  } catch {
    return [];
  }
}

export function buildHistoryKey(
  testId: string,
  dbType: string,
  redis: boolean,
  phase: string,
  metric?: string,
): string {
  return `${testId}:${dbType}:${redis ? "redis" : "plain"}:${phase}:${normalizeMetric(metric)}`;
}

export function isBaselinePhase(
  testId: string,
  dbType: string,
  redis: boolean,
  phase: string,
  metric?: string,
): boolean {
  return loadHistory(testId, dbType, redis, phase, metric).length < 2;
}

export function buildBenchmarkMetricId(opts: {
  testId: string;
  dbType: string;
  redisEnabled: boolean;
  phase: string;
  metric?: string;
}): string {
  const redis = opts.redisEnabled ? "redis-on" : "redis-off";
  return `${opts.testId}/${opts.dbType}/${redis}/${opts.phase}/${normalizeMetric(opts.metric)}`;
}

export function loadDistinctTestIds(dbType: string): string[] {
  try {
    const db = getDb();
    const rows = db
      .query(
        "SELECT DISTINCT test_id FROM runs WHERE db_type = ? AND status = 'SUCCESS' ORDER BY test_id ASC",
      )
      .all(dbType) as { test_id: string }[];
    db.close();
    return rows.map((r) => r.test_id);
  } catch {
    return [];
  }
}

/** Return the metric with the most samples for a test (used for sparkline overview). */
export function loadPrimaryMetricForTest(
  testId: string,
  dbType: string,
  redisEnabled: boolean,
  phase: string,
): string | null {
  try {
    const db = getDb();
    const rows = db
      .query(
        "SELECT metric, COUNT(*) as cnt FROM runs WHERE test_id = ? AND db_type = ? AND redis = ? AND phase = ? AND status = 'SUCCESS' GROUP BY metric ORDER BY cnt DESC LIMIT 1",
      )
      .all(testId, dbType, redisEnabled ? 1 : 0, phase) as { metric: string; cnt: number }[];
    db.close();
    return rows[0]?.metric ?? null;
  } catch {
    return null;
  }
}

export function closeHistory(): void {
  // SQLite databases are opened and closed per-operation in the simplified adapter
}
