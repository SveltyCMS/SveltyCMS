/**
 * @file tests/benchmarks/modules/benchmark-history.ts
 * @description Metric-keyed SQLite history store for benchmark trend analysis.
 *
 * Trends MUST compare the same metric over time (e.g. BULK INSERT vs BULK INSERT).
 * The slim store used only `test_id`, which mixed INSERT (~0.13ms) with BULK (~3ms)
 * and produced false +2000% "severe degradation" alerts.
 *
 * ### Mode parity (see docs/tests/benchmark-matrix.mdx)
 * A trend row is only comparable to rows measured under the SAME server mode.
 * `run_mode` says which harness wrote the row (matrix vs standalone), but says
 * nothing about the server it measured: a `BENCHMARK_MATRIX=1` run against a
 * TEST_MODE server is still matrix-labelled. `server_mode` closes that hole by
 * stamping the authoritative `SVELTY_BENCHMARK_SERVER_MODE` marker:
 * - `production` — NODE_ENV=production, no TEST_MODE (rate limit / WAF / audit live)
 * - `test` — dev-mode server with TEST_MODE (bypasses the security path)
 * - `unknown` — marker absent; not usable for trend comparison
 *
 * ### Features:
 * - per-metric series (`metric` column + unique key)
 * - runMode + serverMode isolation (mode-parity-aware trend queries)
 * - matrix-contract guard: mode-variant matrix rows are refused, never stored
 * - backward-compatible schema migration for older history.sqlite files
 */

import { Database } from "bun:sqlite";
import fs from "node:fs";
import path from "node:path";
import { logger } from "@utils/logger";

// `RESULTS_DIR` override keeps module tests (and surgical runs) from touching the
// real trend ledger — mirrors the convention in benchmark-utils.ts. Resolved
// LAZILY: a module-scope read would happen before a test file's own env setup
// (ESM imports evaluate first), which silently wrote test rows into the ledger.
function resultsDir(): string {
  return path.resolve(process.env.RESULTS_DIR ?? "tests/benchmarks/results");
}

/** Server mode a benchmark measured — the axis trends must not mix. */
export type BenchmarkServerMode = "production" | "test" | "unknown";

/**
 * Resolve the mode of the server a benchmark process is measuring.
 *
 * `SVELTY_BENCHMARK_SERVER_MODE` is the authoritative marker: the matrix runner
 * stamps it into every test child (production parity) and `setupBenchmarkServer()`
 * stamps it for standalone runs (production | test). When it is absent the ambient
 * TEST_MODE/PLAYWRIGHT_TEST then NODE_ENV decide, and anything else stays `unknown`.
 */
export function resolveServerMode(): BenchmarkServerMode {
  const marker = (process.env.SVELTY_BENCHMARK_SERVER_MODE || "").toLowerCase();
  if (marker === "production" || marker === "test") return marker;
  if (process.env.TEST_MODE === "true" || process.env.PLAYWRIGHT_TEST === "true") return "test";
  if (process.env.NODE_ENV === "production") return "production";
  return "unknown";
}

/** Log the first mode-parity refusal loudly, later ones at debug. */
let _modeRefusalLogged = false;

/**
 * Announce a refused (mode-variant) measurement.
 *
 * Uses `console.error` on the first refusal **and** `logger.warn`: the harness sets
 * `LOG_LEVEL=error` for benchmark processes, so a logger-only warning would be
 * invisible precisely when rows start disappearing from the ledger.
 */
export function reportModeRefusal(testLabel: string, reason: string): void {
  const message = `[Benchmark] Refusing to record "${testLabel}": ${reason}`;
  if (!_modeRefusalLogged) {
    _modeRefusalLogged = true;
    console.error(message);
  }
  logger.warn(message);
}

/**
 * Matrix-contract guard: a row labelled `matrix` MUST come from a production-parity
 * server (the matrix runner always boots one — see serverEnv in
 * scripts/benchmark-matrix/index.ts). A matrix-labelled row from a TEST_MODE/
 * dev-mode server is a measurement artifact (e.g. the 0.538 ms cache-invalidation
 * run of 2026-09-18) and must never enter the ledger.
 */
export function isModeContaminated(
  runMode: string,
  serverMode: BenchmarkServerMode,
): { contaminated: boolean; reason: string } {
  if (runMode !== "matrix") return { contaminated: false, reason: "" };
  if (serverMode === "production") return { contaminated: false, reason: "" };
  return {
    contaminated: true,
    reason:
      `matrix rows require a production-parity server ` +
      `(SVELTY_BENCHMARK_SERVER_MODE=production, NODE_ENV=production, no TEST_MODE) — got "${serverMode}"`,
  };
}

function getDb(): Database {
  const dbPath = path.join(resultsDir(), "history.sqlite");
  // A `RESULTS_DIR` override may point at a directory that does not exist yet
  // (isolated module tests) — bun:sqlite would otherwise fail to create the file
  // and every persist silently degraded to a warning.
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  } catch {
    /* exists / racing writer */
  }
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
          server_mode TEXT NOT NULL DEFAULT 'unknown',
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
    if (!cols.some((c) => c.name === "server_mode")) {
      db.run("ALTER TABLE runs ADD COLUMN server_mode TEXT NOT NULL DEFAULT 'unknown'");
    }
  } catch (err) {
    logger.debug(`[benchmark-history] schema migration skipped: ${String(err)}`);
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
  /** Server mode the row was measured in — trends must not mix modes. */
  serverMode?: BenchmarkServerMode;
  avgMs: number;
  p95Ms: number;
  rps: number;
  errorCount: number;
  status: string;
}

function normalizeMetric(metric?: string): string {
  return (metric ?? "").trim() || "avg";
}

/** Log the first persist failure loudly, the rest at debug (no console spam). */
let _persistFailureLogged = false;

/**
 * Persist a passing run to history.sqlite (canonical trend store).
 *
 * Never throws: the ledger is auxiliary telemetry. A locked/read-only sqlite file
 * (Windows WAL contention between concurrent test processes, read-only CI worktree)
 * must not fail a benchmark run — but it must not be swallowed either, so the first
 * failure is reported at `warn` and later ones at `debug`.
 *
 * @returns true when the row was written.
 */
export function persistRun(entry: HistoryEntry): boolean {
  try {
    const db = getDb();
    const metric = normalizeMetric(entry.metric);
    db.run(
      "INSERT OR IGNORE INTO runs (run_id, run_mode, test_id, db_type, redis, phase, metric, server_mode, avg_ms, p95_ms, rps, error_count, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      entry.runId ?? (null as any),
      entry.runMode || "standalone",
      entry.testId,
      entry.dbType,
      entry.redisEnabled ? 1 : 0,
      entry.phase,
      metric,
      entry.serverMode || "unknown",
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
    _persistFailureLogged = false;
    return true;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (!_persistFailureLogged) {
      _persistFailureLogged = true;
      logger.warn(
        `[benchmark-history] persistRun failed for ${entry.testId}/${entry.metric ?? "avg"} — trend row lost (ledger is auxiliary, run continues): ${detail}`,
      );
    } else {
      logger.debug(`[benchmark-history] persistRun failed again: ${detail}`);
    }
    return false;
  }
}

/** Trend query filter — mode parity is enforced by the caller, never assumed. */
export interface HistoryModeFilter {
  /** `matrix` | `standalone` — which harness wrote the row. */
  runMode?: string;
  /** Server mode the row was measured in (mode parity). */
  serverMode?: BenchmarkServerMode;
}

/**
 * Load the metric series for a test.
 *
 * Pass a {@link HistoryModeFilter} whenever the series feeds a comparison —
 * mixing modes is what produced the false 1.089 vs 0.595 ms "regression".
 */
export function loadHistory(
  testId: string,
  dbType: string,
  redisEnabled: boolean,
  phase: string,
  metric?: string,
  filter?: HistoryModeFilter,
): {
  avgMs: number;
  p95Ms: number;
  rps: number;
  runMode?: string;
  serverMode?: BenchmarkServerMode;
  metric?: string;
}[] {
  try {
    const db = getDb();
    const metricKey = metric !== undefined ? normalizeMetric(metric) : null;
    const where = ["test_id = ?", "db_type = ?", "redis = ?", "phase = ?", "status = 'SUCCESS'"];
    const params: (string | number)[] = [testId, dbType, redisEnabled ? 1 : 0, phase];
    if (metricKey !== null) {
      where.push("metric = ?");
      params.push(metricKey);
    }
    if (filter?.runMode) {
      where.push("run_mode = ?");
      params.push(filter.runMode);
    }
    if (filter?.serverMode) {
      where.push("COALESCE(NULLIF(server_mode, ''), 'unknown') = ?");
      params.push(filter.serverMode);
    }

    const rows = db
      .query(
        `SELECT avg_ms, p95_ms, rps, run_mode, server_mode, metric FROM runs WHERE ${where.join(" AND ")} ORDER BY timestamp ASC`,
      )
      .all(...(params as any[])) as any[];
    db.close();
    return rows.map((r) => ({
      avgMs: r.avg_ms,
      p95Ms: r.p95_ms || 0,
      rps: r.rps || 0,
      runMode: r.run_mode || "standalone",
      serverMode: (r.server_mode || "unknown") as BenchmarkServerMode,
      metric: r.metric || "avg",
    }));
  } catch (err) {
    logger.debug(`[benchmark-history] loadHistory(${testId}/${dbType}) failed: ${String(err)}`);
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

export function loadDistinctTestIds(dbType: string, filter?: HistoryModeFilter): string[] {
  try {
    const db = getDb();
    const where = ["db_type = ?", "status = 'SUCCESS'"];
    const params: (string | number)[] = [dbType];
    if (filter?.runMode) {
      where.push("run_mode = ?");
      params.push(filter.runMode);
    }
    if (filter?.serverMode) {
      where.push("COALESCE(NULLIF(server_mode, ''), 'unknown') = ?");
      params.push(filter.serverMode);
    }
    const rows = db
      .query(`SELECT DISTINCT test_id FROM runs WHERE ${where.join(" AND ")} ORDER BY test_id ASC`)
      .all(...(params as any[])) as { test_id: string }[];
    db.close();
    return rows.map((r) => r.test_id);
  } catch (err) {
    logger.debug(`[benchmark-history] loadDistinctTestIds(${dbType}) failed: ${String(err)}`);
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
