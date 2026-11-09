/**
 * @file src/databases/postgresql/postgres-utils.ts
 * @description PostgreSQL driver parameter tuning, timestamp text parsing, and identifier bounds utilities.
 *
 * Features:
 * - Driver-level ISO 8601 timestamp string passthrough avoiding Date allocation
 * - Idle connection pool timeout resolution with Dockerfile parity
 * - Connection-level startup parameter resolution (synchronous_commit, work_mem, JIT)
 * - Deterministic NAMEDATALEN=63 index name hashing and truncation
 */

import { assertSafeSqlIdentifier, normalizePgTimestampText } from "../core/relational-utils";

/**
 * Keep date/timestamp as ISO text. postgres.js default-parses timestamptz to
 * Date; convertDatesToISO then allocates another string. Normalizing PG wire
 * strings ("YYYY-MM-DD HH:mm:ss.sss+00") directly to ISO 8601 at driver parse
 * time avoids Date/regex allocations and lets `convertDatesToISO` take its
 * zero-work fast path on PostgreSQL reads and writes.
 */
export const PG_TEXT_DATE_TYPES = {
  date: {
    to: 1184,
    from: [1082, 1114, 1184],
    serialize: (x: unknown) => x,
    parse: normalizePgTimestampText,
  },
};

/**
 * Idle reclaim for every postgres.js pool (shared, replica, dedicated tenant).
 *
 * `DATABASE_IDLE_TIMEOUT` is documented in `Dockerfile` / `docker-compose.example.yml`
 * ("0 keeps the pool permanently warm") but was never read — the shared pool hardcoded
 * 30 s and replica/tenant pools left the driver default, so the documented setting was
 * silently ignored. `0` disables the reclaim; non-finite or negative values fall back to
 * 30 s.
 */
export function pgIdleTimeout(override?: unknown): number {
  const raw = Number(override ?? process.env.DATABASE_IDLE_TIMEOUT ?? 30);
  return Number.isFinite(raw) && raw >= 0 ? raw : 30;
}

/**
 * Resolves connection-level PostgreSQL parameters (GUC settings sent at startup).
 *
 * Supports documented tuning knobs:
 * - `PG_SYNCHRONOUS_COMMIT` / `DATABASE_SYNCHRONOUS_COMMIT` (e.g. "off" or "local"
 *   for benchmark & high-throughput local dev, bypassing per-transaction fdatasync)
 * - `PG_WORK_MEM` / `DATABASE_WORK_MEM` (e.g. "32MB" preventing temp disk spill)
 * - `PG_JIT` / `DATABASE_JIT` (defaults to "off" for fast OLTP point reads & updates)
 */
export function pgConnectionParameters(
  override?: Record<string, unknown>,
): Record<string, string | number | boolean | undefined> {
  const sync =
    process.env.PG_SYNCHRONOUS_COMMIT ||
    process.env.DATABASE_SYNCHRONOUS_COMMIT ||
    process.env.POSTGRES_SYNCHRONOUS_COMMIT;
  const workMem =
    process.env.PG_WORK_MEM || process.env.DATABASE_WORK_MEM || process.env.POSTGRES_WORK_MEM;
  const jit = process.env.PG_JIT || process.env.DATABASE_JIT || process.env.POSTGRES_JIT || "off";

  return {
    application_name: "sveltycms",
    statement_timeout: 30000,
    ...(jit ? { jit } : {}),
    ...(sync ? { synchronous_commit: sync } : {}),
    ...(workMem ? { work_mem: workMem } : {}),
    ...override,
  } as Record<string, string | number | boolean | undefined>;
}

/** Ensure an index name does not exceed PostgreSQL's NAMEDATALEN (63 characters). */
export function pgSafeIndexName(name: string): string {
  if (name.length <= 63) return name;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const suffix = `_${hash.toString(16).padStart(8, "0")}`;
  return `${name.slice(0, 63 - suffix.length)}${suffix}`;
}

/** Input for the lazy published-list covering index. */
export interface PublishedListIndexSpec {
  tableName: string;
  column: string;
  direction: "asc" | "desc";
  /** A tenant equality exists in the compiled query, so the index leads with `tenantId`. */
  withTenant: boolean;
  /** The table carries `isDeleted`; the wire query adds `= false`, so the predicate can too. */
  hasDeleted: boolean;
}

/**
 * DDL for the publication-clamped list index.
 *
 * The wire list compiles `status IN ('publish','published')`; a btree leading
 * with `status` cannot preserve sort order across two values, so a partial index
 * carries that exact predicate and the requested order instead. `IF NOT EXISTS`
 * keeps the lazy scheduler idempotent across processes and restarts.
 */
export function buildPublishedListIndexDdl(spec: PublishedListIndexSpec): {
  indexName: string;
  safeTable: string;
  ddl: string;
} {
  const safeTable = assertSafeSqlIdentifier(spec.tableName, "table");
  const safeCol = assertSafeSqlIdentifier(spec.column, "column");
  const dir = spec.direction === "desc" ? "DESC" : "ASC";
  const indexName = assertSafeSqlIdentifier(
    pgSafeIndexName(`${spec.tableName}_${spec.column}_${spec.withTenant ? "t" : "o"}_pub_list_id`),
    "index",
  );
  const cols = spec.withTenant
    ? `("tenantId", "${safeCol}" ${dir}, "_id" ${dir})`
    : `("${safeCol}" ${dir}, "_id" ${dir})`;
  const predicate = `"status" IN ('publish', 'published')${spec.hasDeleted ? ' AND "isDeleted" = false' : ""}`;
  return {
    indexName,
    safeTable,
    ddl: `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${indexName}" ON "${safeTable}" ${cols} WHERE ${predicate}`,
  };
}
