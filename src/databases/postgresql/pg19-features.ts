/**
 * @file src/databases/postgresql/pg19-features.ts
 * @description Pure PostgreSQL 19.0+ SQL builders, version detection, and safety validators.
 *
 * Keeps PostgreSQL 19 capabilities cleanly version-gated so deployments on
 * PostgreSQL 16–18 continue working with zero syntax errors while PostgreSQL 19+
 * automatically leverages native online operations:
 *
 * ### Features:
 * - Numeric & banner major-version parsing (`server_version_num` 190000 → 19)
 * - Native online `REPACK (CONCURRENTLY)` bloat reclamation (PG 19+), falling
 *   back to non-blocking `VACUUM (ANALYZE)` on PG ≤ 18
 * - Native standby `WAIT FOR LSN` SQL builder with strict LSN validation for
 *   replica Read-Your-Writes consistency without blind primary pinning (PG 19+)
 * - `pg_stat_user_tables` dead-tuple bloat candidate query
 * - Atomic `INSERT ... ON CONFLICT (...) DO SELECT RETURNING ...` builder (PG 19+)
 */

import { assertSafeSqlIdentifier } from "../core/relational-utils";

/** Minimum supported PostgreSQL major version (`18.0` -> `180000`). */
export const PG_MIN_SUPPORTED_MAJOR_VERSION = 18;
export const PG_MIN_SUPPORTED_VERSION_NUM = 180_000;

/** Minimum PostgreSQL major version supporting REPACK, WAIT FOR LSN, and ON CONFLICT DO SELECT. */
export const PG19_MAJOR_VERSION = 19;

/** Strict PostgreSQL WAL LSN format: two 1–8 hex digit segments separated by `/`. */
const PG_LSN_RE = /^[0-9A-Fa-f]{1,8}\/[0-9A-Fa-f]{1,8}$/;

/** Maximum allowed `WAIT FOR LSN` timeout to prevent runaway replica stalls (ms). */
const MAX_WAIT_FOR_LSN_TIMEOUT_MS = 60_000;

/**
 * Parse a PostgreSQL major version from `server_version_num` (e.g. `190000` → `19`,
 * `"180007"` → `18`) or a `SELECT version()` banner (`"PostgreSQL 19.0 ..."` → `19`).
 * Returns `0` when unparseable.
 */
export function parsePgMajorVersion(
  versionNumOrBanner: number | string | null | undefined,
): number {
  if (typeof versionNumOrBanner === "number") {
    if (!Number.isFinite(versionNumOrBanner) || versionNumOrBanner <= 0) return 0;
    return versionNumOrBanner >= 10_000
      ? Math.floor(versionNumOrBanner / 10_000)
      : Math.trunc(versionNumOrBanner);
  }
  if (typeof versionNumOrBanner !== "string") return 0;
  const trimmed = versionNumOrBanner.trim();
  if (!trimmed) return 0;

  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    return num >= 10_000 ? Math.floor(num / 10_000) : Math.trunc(num);
  }

  const match = /\bPostgreSQL\s+(\d+)(?:\.\d+)?/i.exec(trimmed) ?? /^(\d+)(?:\.\d+)?/.exec(trimmed);
  if (!match) return 0;
  const major = Number(match[1]);
  return Number.isFinite(major) && major > 0 ? major : 0;
}

/** True when `lsn` matches PostgreSQL's strict `XXXXXXXX/XXXXXXXX` hex LSN syntax. */
export function isValidPgLsn(lsn: string | null | undefined): lsn is string {
  return typeof lsn === "string" && PG_LSN_RE.test(lsn);
}

/**
 * Build PostgreSQL 19+ `WAIT FOR LSN` statement for hot-standby Read-Your-Writes.
 * Throws on invalid LSN format so untrusted strings can never reach SQL.
 */
export function buildWaitForLsnSql(lsn: string, timeoutMs = 2_000, noThrow = true): string {
  if (!isValidPgLsn(lsn)) {
    throw new Error(`Invalid PostgreSQL WAL LSN: "${String(lsn)}"`);
  }
  const boundedTimeout = Math.min(
    MAX_WAIT_FOR_LSN_TIMEOUT_MS,
    Math.max(1, Math.trunc(Number.isFinite(timeoutMs) ? timeoutMs : 2_000)),
  );
  return noThrow
    ? `WAIT FOR LSN '${lsn}' WITH (TIMEOUT '${boundedTimeout}ms', NO_THROW)`
    : `WAIT FOR LSN '${lsn}' WITH (TIMEOUT '${boundedTimeout}ms')`;
}

export interface RepackTableSqlOptions {
  /** Detected PostgreSQL major version (`>= 19` enables native `REPACK`). */
  pgMajorVersion: number;
  /** Keep reads and writes unblocked during repack (default `true`). */
  concurrently?: boolean;
  /** Update planner statistics in the same pass (default `true`). */
  analyze?: boolean;
  /** Optional schema qualifier (must pass identifier safety validation). */
  schema?: string;
}

/**
 * Build an online table maintenance / bloat-reclamation statement:
 * - PostgreSQL 19+: `REPACK (CONCURRENTLY, ANALYZE) "table"` (zero-downtime MVCC compaction
 *   replacing blocking `VACUUM FULL` and the external `pg_repack` extension)
 * - PostgreSQL ≤ 18: `VACUUM (ANALYZE) "table"` (non-blocking fallback)
 */
export function buildRepackTableSql(
  tableName: string,
  options: RepackTableSqlOptions,
): { sql: string; mode: "repack" | "vacuum-analyze" } {
  const safeTable = assertSafeSqlIdentifier(tableName, "table");
  const target = options.schema
    ? `"${assertSafeSqlIdentifier(options.schema, "schema")}"."${safeTable}"`
    : `"${safeTable}"`;

  if (options.pgMajorVersion >= PG19_MAJOR_VERSION) {
    const opts: string[] = [];
    if (options.concurrently !== false) opts.push("CONCURRENTLY");
    if (options.analyze !== false) opts.push("ANALYZE");
    return {
      sql: opts.length > 0 ? `REPACK (${opts.join(", ")}) ${target}` : `REPACK ${target}`,
      mode: "repack",
    };
  }

  return {
    sql: `VACUUM (ANALYZE) ${target}`,
    mode: "vacuum-analyze",
  };
}

export interface BloatCandidateRow {
  schemaname: string;
  relname: string;
  n_live_tup: number | string | bigint | null;
  n_dead_tup: number | string | bigint | null;
  dead_ratio: number | string | null;
  table_size_bytes: number | string | bigint | null;
}

export interface BloatQueryOptions {
  /** Schema to inspect (default `"public"`). */
  schema?: string;
  /** Minimum dead tuples required before flagging a table (default `10_000`). */
  minDeadTuples?: number;
  /** Minimum dead/(live+dead) ratio before flagging (default `0.2` = 20%). */
  minDeadRatio?: number;
  /** Maximum rows to return (default `5`). */
  limit?: number;
}

/**
 * Query `pg_stat_user_tables` for tables with significant dead-tuple MVCC bloat
 * that are good candidates for PG 19 `REPACK (CONCURRENTLY)`.
 */
export function buildBloatCandidatesSql(options: BloatQueryOptions = {}): string {
  const safeSchema = assertSafeSqlIdentifier(options.schema ?? "public", "schema");
  const minDeadTuples = Math.max(1, Math.trunc(options.minDeadTuples ?? 10_000));
  const minDeadRatio = Math.min(0.99, Math.max(0.01, Number(options.minDeadRatio ?? 0.2)));
  const limit = Math.min(50, Math.max(1, Math.trunc(options.limit ?? 5)));

  return `SELECT
  s.schemaname,
  s.relname,
  s.n_live_tup,
  s.n_dead_tup,
  ROUND((s.n_dead_tup::numeric / GREATEST(s.n_live_tup + s.n_dead_tup, 1)), 4) AS dead_ratio,
  pg_total_relation_size(s.relid) AS table_size_bytes
FROM pg_stat_user_tables AS s
WHERE s.schemaname = '${safeSchema}'
  AND s.n_dead_tup >= ${minDeadTuples}
  AND (s.n_dead_tup::numeric / GREATEST(s.n_live_tup + s.n_dead_tup, 1)) >= ${minDeadRatio}
ORDER BY s.n_dead_tup DESC, pg_total_relation_size(s.relid) DESC
LIMIT ${limit}`;
}

/**
 * Build a PostgreSQL 19+ single-round-trip atomic get-or-create statement:
 * `INSERT INTO "table" (...) VALUES (...) ON CONFLICT (...) DO SELECT RETURNING ...`
 *
 * Returns `null` when `pgMajorVersion < 19` so callers gracefully use the
 * portable PG 16–18 path.
 */
export function buildInsertOnConflictDoSelectSql(opts: {
  pgMajorVersion: number;
  tableName: string;
  insertColumns: readonly string[];
  conflictColumns: readonly string[];
  returningColumns?: readonly string[];
}): string | null {
  if (opts.pgMajorVersion < PG19_MAJOR_VERSION) return null;
  if (opts.insertColumns.length === 0 || opts.conflictColumns.length === 0) return null;

  const safeTable = assertSafeSqlIdentifier(opts.tableName, "table");
  const safeInsert = opts.insertColumns.map((c) => `"${assertSafeSqlIdentifier(c, "column")}"`);
  const safeConflict = opts.conflictColumns.map((c) => `"${assertSafeSqlIdentifier(c, "column")}"`);
  const placeholders = opts.insertColumns.map((_, idx) => `$${idx + 1}`);
  const returning =
    opts.returningColumns && opts.returningColumns.length > 0
      ? opts.returningColumns.map((c) => `"${assertSafeSqlIdentifier(c, "column")}"`).join(", ")
      : "*";

  return `INSERT INTO "${safeTable}" (${safeInsert.join(", ")}) VALUES (${placeholders.join(", ")}) ON CONFLICT (${safeConflict.join(", ")}) DO SELECT RETURNING ${returning}`;
}
