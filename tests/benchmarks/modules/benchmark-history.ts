/**
 * @file tests/benchmarks/modules/benchmark-history.ts
 * @description Slim history store — persist/load benchmark runs for trend analysis.
 * Uses a local SQLite database. Kept minimal; the MDX report is the primary display.
 */
import { Database, type Statement } from "bun:sqlite";
import path from "node:path";

const RESULTS_DIR = path.resolve("tests/benchmarks/results");

// Reusable cached prepared statement bindings
let _insertStmt: Statement | null = null;
let _queryStmt: Statement | null = null;
let _countStmt: Statement | null = null;

// Lazy environment strings cached at startup initialization layer
const _cachedCommitSha = lazyDetectCommitSha();
const _cachedBranch = lazyDetectBranch();
const _cachedOS = `${process.platform} ${process.arch}`;
const _cachedRuntime =
  typeof Bun !== "undefined" ? `bun ${Bun.version}` : `node ${process.version}`;

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
          avg_ms REAL NOT NULL,
          p95_ms REAL,
          rps REAL,
          error_count INTEGER DEFAULT 0,
          status TEXT DEFAULT 'SUCCESS',
          timestamp TEXT DEFAULT (datetime('now'))
        )`,
  );
  db.run("CREATE INDEX IF NOT EXISTS idx_runs_lookup ON runs(test_id, db_type, redis, phase)");
  db.run(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_dedup ON runs(run_id, run_mode, test_id, db_type, redis, phase)",
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
  avgMs: number;
  p95Ms: number;
  rps: number;
  errorCount: number;
  status: string;
}

export function persistRun(entry: HistoryEntry): void {
  try {
    const db = getDb();
    db.run(
      "INSERT OR IGNORE INTO runs (run_id, run_mode, test_id, db_type, redis, phase, avg_ms, p95_ms, rps, error_count, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      entry.runId || null,
      entry.runMode || "standalone",
      entry.testId,
      entry.dbType,
      entry.redisEnabled ? 1 : 0,
      entry.phase,
      entry.avgMs,
      entry.p95Ms,
      entry.rps,
      entry.errorCount,
      entry.status,
    );
    // Keep only last 50 runs per test to stay lean
    db.run(
      "DELETE FROM runs WHERE id IN (SELECT id FROM runs WHERE test_id = ? AND db_type = ? ORDER BY id DESC LIMIT -1 OFFSET 50)",
      entry.testId,
      entry.dbType,
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
): { avgMs: number; p95Ms: number; rps: number; runMode?: string }[] {
  try {
    const db = getDb();
    const rows = db
      .query(
        "SELECT avg_ms, p95_ms, rps, run_mode FROM runs WHERE test_id = ? AND db_type = ? AND redis = ? AND phase = ? AND status = 'SUCCESS' ORDER BY timestamp ASC",
      )
      .all(testId, dbType, redisEnabled ? 1 : 0, phase) as any[];
    db.close();
    return rows.map((r) => ({
      avgMs: r.avg_ms,
      p95Ms: r.p95_ms || 0,
      rps: r.rps || 0,
      runMode: r.run_mode || "standalone",
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
): string {
  return `${testId}:${dbType}:${redis ? "redis" : "plain"}:${phase}`;
}

export function isBaselinePhase(
  testId: string,
  dbType: string,
  redis: boolean,
  phase: string,
): boolean {
  return loadHistory(testId, dbType, redis, phase).length < 2;
}

export function buildBenchmarkMetricId(opts: {
  testId: string;
  dbType: string;
  redisEnabled: boolean;
  phase: string;
  metric?: string;
}): string {
  const redis = opts.redisEnabled ? "redis-on" : "redis-off";
  return `${opts.testId}/${opts.dbType}/${redis}/${opts.phase}/${opts.metric || "avg"}`;
}

export function closeHistory(): void {
  // SQLite databases are opened and closed per-operation in the simplified adapter
}
