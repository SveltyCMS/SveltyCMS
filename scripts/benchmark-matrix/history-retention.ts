/**
 * @file scripts/benchmark-matrix/history-retention.ts
 * @description Bounded retention for `tests/benchmarks/results/history.sqlite`.
 *
 * The trend store is append-mostly: every matrix adapter run appends one
 * `matrix_runs` snapshot row plus one `runs` row per test × metric, and the
 * per-test writer only trims its own series tail. Nothing ever reclaimed the
 * freed pages, so the file grew to 629 MB while holding only a few dozen
 * samples per series. This module applies the window once, at the end of a
 * matrix run, and returns the space to the filesystem.
 *
 * ### Features:
 * - newest-N window per metric series (`runs`) and per adapter (`matrix_runs`)
 * - `VACUUM` + WAL truncate after a delete so the file actually shrinks
 * - never throws — a locked/read-only ledger must not fail a benchmark run
 * - SQLite rows only: `gate-baseline-*.json` and the other result files are
 *   never read, moved or deleted here
 */

import type { Database } from "bun:sqlite";
import { log } from "./logger";

/**
 * Newest samples kept per retention key.
 *
 * `runs` is keyed by series (test × adapter × redis × phase × metric) and
 * `matrix_runs` by adapter; 50 is comfortably above the 20-sample read window
 * used by trend analysis and the regression detector, so pruning can never
 * starve a comparison — it only drops samples that no reader would reach.
 */
export const HISTORY_RETENTION_RUNS = 50;

export interface RetentionResult {
  /** `runs` rows removed inside this call. */
  deletedRunRows: number;
  /** `matrix_runs` rows removed inside this call. */
  deletedMatrixRows: number;
  /** True when the freed pages were reclaimed (`VACUUM` ran). */
  vacuumed: boolean;
}

function hasTable(db: Database, name: string): boolean {
  return Boolean(
    db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name),
  );
}

function changesOf(result: unknown): number {
  const changes = (result as { changes?: unknown } | null)?.changes;
  return typeof changes === "number" ? changes : 0;
}

/**
 * Keep the newest `keepRuns` rows per series / adapter and reclaim freed pages.
 *
 * Ordering is by `id` (insertion order), so rows newer than the window are never
 * candidates and an in-flight writer's tail row survives even if its timestamp
 * is coarse.
 *
 * @param db Open handle on the history database (WAL or rollback journal).
 * @param keepRuns Retention window; values < 1 are clamped to 1.
 */
export function pruneBenchmarkHistory(
  db: Database,
  keepRuns: number = HISTORY_RETENTION_RUNS,
): RetentionResult {
  const keep = Math.max(1, Math.trunc(keepRuns));
  const result: RetentionResult = { deletedRunRows: 0, deletedMatrixRows: 0, vacuumed: false };

  try {
    if (hasTable(db, "runs")) {
      result.deletedRunRows = changesOf(
        db
          .query(
            `DELETE FROM runs WHERE id NOT IN (
               SELECT id FROM (
                 SELECT id, ROW_NUMBER() OVER (
                   PARTITION BY test_id, db_type, redis, phase, metric
                   ORDER BY id DESC
                 ) AS rn FROM runs
               ) WHERE rn <= ?
             )`,
          )
          .run(keep),
      );
    }

    if (hasTable(db, "matrix_runs")) {
      result.deletedMatrixRows = changesOf(
        db
          .query(
            `DELETE FROM matrix_runs WHERE id NOT IN (
               SELECT id FROM (
                 SELECT id, ROW_NUMBER() OVER (
                   PARTITION BY db_key ORDER BY id DESC
                 ) AS rn FROM matrix_runs
               ) WHERE rn <= ?
             )`,
          )
          .run(keep),
      );
    }
  } catch (err) {
    log.warn(
      `History retention skipped (${err instanceof Error ? err.message : String(err)}) — run continues.`,
    );
    return result;
  }

  // Only pay for the rewrite when this call actually freed pages: a clean window
  // costs nothing, and the file is already at its natural size.
  if (result.deletedRunRows > 0 || result.deletedMatrixRows > 0) {
    try {
      db.query("VACUUM").run();
      result.vacuumed = true;
      // `VACUUM` writes through the write-ahead log; truncating it is what makes
      // the *on-disk* total actually drop instead of moving into `-wal`.
      try {
        db.query("PRAGMA wal_checkpoint(TRUNCATE)").get();
      } catch {
        /* not in WAL mode / another connection is reading — harmless */
      }
    } catch (err) {
      log.warn(
        `History VACUUM failed (${err instanceof Error ? err.message : String(err)}) — rows were pruned, file size unchanged.`,
      );
    }
  }

  if (result.deletedRunRows > 0 || result.deletedMatrixRows > 0) {
    log.info(
      `History retention: pruned ${result.deletedRunRows} trend rows + ${result.deletedMatrixRows} matrix snapshots (keep ${keep}/series)${result.vacuumed ? ", vacuumed" : ""}.`,
    );
  }

  return result;
}
