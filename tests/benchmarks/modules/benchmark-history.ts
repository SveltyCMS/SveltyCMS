/**
 * @file tests/benchmark./modules/benchmark-history.ts
 * @description Canonical SQLite history store for benchmark runs.
 *
 * ### Schema
 * Stable composite key: testId/db/redisMode/phase/metric
 * Metadata columns: commitSha, branch, os, runtime, timestamp
 *
 * ### Concurrency
 * All writes use SQLite transactions (serialized via WAL mode).
 */
import { Database } from "bun:sqlite";
import path from "node:path";
import fs from "node:fs";

const HISTORY_DIR = path.resolve(process.cwd(), "tests/benchmarks/results");
const DB_PATH = path.join(HISTORY_DIR, "history.sqlite");

let _db: Database | null = null;

function getDb(): Database {
  if (!_db) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
    _db = new Database(DB_PATH);
    _db.exec("PRAGMA journal_mode=WAL");
    _db.exec("PRAGMA busy_timeout=5000");
    _db.exec(`
      CREATE TABLE IF NOT EXISTS benchmark_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT,
        test_id TEXT NOT NULL,
        test_file TEXT NOT NULL,
        db_type TEXT NOT NULL,
        redis_enabled INTEGER DEFAULT 0,
        phase TEXT DEFAULT 'warm',
        scenario TEXT DEFAULT '',
        commit_sha TEXT,
        branch TEXT,
        os TEXT,
        runtime TEXT,
        avg_ms REAL,
        p50_ms REAL,
        p95_ms REAL,
        p99_ms REAL,
        p99_9_ms REAL,
        min_ms REAL,
        max_ms REAL,
        rps REAL,
        cv REAL,
        ci95_margin_ms REAL,
        memory_heap_mb REAL,
        memory_rss_mb REAL,
        error_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'SUCCESS',
        extra_json TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    _db.exec(`
      CREATE INDEX IF NOT EXISTS idx_bench_runs_lookup
        ON benchmark_runs(test_id, db_type, redis_enabled, phase)
    `);
    _db.exec(`
      CREATE INDEX IF NOT EXISTS idx_bench_runs_timestamp ON benchmark_runs(timestamp)
    `);
    // Idempotency: if run_id is provided, same run_id+test_id+db = same logical run
    _db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bench_runs_dedup
        ON benchmark_runs(run_id, test_id, db_type, redis_enabled, phase)
    `);
  }
  return _db;
}

export interface HistoryEntry {
  runId?: string;
  testId: string;
  testFile: string;
  dbType: string;
  redisEnabled: boolean;
  phase: "cold" | "warm" | "mixed";
  scenario: string;
  commitSha?: string;
  branch?: string;
  os?: string;
  runtime?: string;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  p99_9Ms: number;
  minMs: number;
  maxMs: number;
  rps: number;
  cv: number;
  ci95MarginMs: number;
  memoryHeapMb?: number;
  memoryRssMb?: number;
  errorCount: number;
  status: string;
  extra?: Record<string, unknown>;
}

/** Build a stable key for history lookups — single source of truth. */
export function buildBenchmarkMetricId(opts: {
  testId: string;
  dbType: string;
  redisEnabled: boolean;
  phase: string;
  metric?: string;
}): string {
  const redis = opts.redisEnabled ? "redis-on" : "redis-off";
  const metric = opts.metric || "avg";
  return `${opts.testId}/${opts.dbType}/${redis}/${opts.phase}/${metric}`;
}

/** @deprecated Use buildBenchmarkMetricId instead. */
export function buildHistoryKey(
  testId: string,
  dbType: string,
  redisEnabled: boolean,
  phase: string,
): string {
  return buildBenchmarkMetricId({ testId, dbType, redisEnabled, phase });
}

/** Persist a benchmark result to the history store. */
export function persistRun(entry: HistoryEntry): void {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO benchmark_runs (
      run_id,
      test_id, test_file, db_type, redis_enabled, phase, scenario,
      commit_sha, branch, os, runtime,
      avg_ms, p50_ms, p95_ms, p99_ms, p99_9_ms, min_ms, max_ms,
      rps, cv, ci95_margin_ms,
      memory_heap_mb, memory_rss_mb,
      error_count, status, extra_json
    ) VALUES (
      ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?
    )
  `);

  db.transaction(() => {
    insert.run(
      entry.runId || null,
      entry.testId,
      entry.testFile,
      entry.dbType,
      entry.redisEnabled ? 1 : 0,
      entry.phase,
      entry.scenario,
      entry.commitSha || null,
      entry.branch || null,
      entry.os || null,
      entry.runtime || null,
      entry.avgMs,
      entry.p50Ms,
      entry.p95Ms,
      entry.p99Ms,
      entry.p99_9Ms,
      entry.minMs,
      entry.maxMs,
      entry.rps,
      entry.cv,
      entry.ci95MarginMs,
      entry.memoryHeapMb || null,
      entry.memoryRssMb || null,
      entry.errorCount,
      entry.status,
      entry.extra ? JSON.stringify(entry.extra) : null,
    );
  })();
}

/** Load recent history for a specific test/db/phase combination. */
export function loadHistory(
  testId: string,
  dbType: string,
  redisEnabled: boolean,
  phase: string,
  limit = 50,
): Array<{
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  rps: number;
  cv: number;
  timestamp: string;
}> {
  const db = getDb();
  const rows = db
    .query(
      `SELECT avg_ms, p95_ms, p99_ms, rps, cv, timestamp
       FROM benchmark_runs
       WHERE test_id = ? AND db_type = ? AND redis_enabled = ? AND phase = ?
         AND status = 'SUCCESS' AND avg_ms > 0
       ORDER BY timestamp DESC
       LIMIT ?`,
    )
    .all(testId, dbType, redisEnabled ? 1 : 0, phase, limit) as any[];

  return rows.map((r: any) => ({
    avgMs: r.avg_ms,
    p95Ms: r.p95_ms,
    p99Ms: r.p99_ms,
    rps: r.rps,
    cv: r.cv,
    timestamp: r.timestamp,
  }));
}

/** Count total runs for a test/db/phase combination. */
export function countRuns(
  testId: string,
  dbType: string,
  redisEnabled: boolean,
  phase: string,
): number {
  const db = getDb();
  const row = db
    .query(
      `SELECT COUNT(*) as cnt FROM benchmark_runs
       WHERE test_id = ? AND db_type = ? AND redis_enabled = ? AND phase = ?
         AND status = 'SUCCESS'`,
    )
    .get(testId, dbType, redisEnabled ? 1 : 0, phase) as any;
  return row?.cnt || 0;
}

/** Detect if we're still building a baseline (<5 runs). */
export function isBaselinePhase(
  testId: string,
  dbType: string,
  redisEnabled: boolean,
  phase: string,
): boolean {
  return countRuns(testId, dbType, redisEnabled, phase) < 5;
}

/** Get commit SHA if available. */
export function detectCommitSha(): string | undefined {
  try {
    const { execSync } = require("node:child_process");
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

/** Get current branch if available. */
export function detectBranch(): string | undefined {
  try {
    const { execSync } = require("node:child_process");
    return execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
    }).trim();
  } catch {
    return undefined;
  }
}

/** Get OS info. */
export function detectOS(): string {
  return `${process.platform} ${process.arch}`;
}

/** Get runtime info. */
export function detectRuntime(): string {
  if (typeof Bun !== "undefined") return `bun ${Bun.version}`;
  return `node ${process.version}`;
}

/** Close the database connection (for cleanup). */
export function closeHistory(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
