/**
 * @file src/databases/core/sql-page-runner.ts
 * @description
 * Keyset-pagination and row estimation runner for SQL database adapters.
 * Executes cursor-based and offset-based pagination with parallelized count
 * estimations across PostgreSQL, MariaDB, and SQLite.
 *
 * ### Features:
 * - Keyset-stable pagination with deterministic _id tiebreakers
 * - Parallel execution of data fetching and row count estimation
 * - Engine-native table row estimation (pg_class.reltuples, information_schema, sqlite_stat1)
 * - Safe cursor decoding and filter merging
 */

import type {
  BaseEntity,
  DatabaseResult,
  CountOptions,
  FindOptions,
  FindPageOptions,
  FindPageResult,
  QueryFilter,
} from "../db-interface";
import { getTableName } from "drizzle-orm";
import {
  buildFindPageResult,
  DEFAULT_PAGE_SIZE,
  decodePageCursor,
  defaultPageSortOption,
  mergeKeysetFilter,
  resolvePageSort,
  shouldUseEstimateCount,
  withIdTiebreaker,
} from "./page-utils";

/**
 * Structural contract required by the page runner from the SQL adapter.
 */
export interface SqlPageRunnerContext {
  readonly type: string;
  readonly raw: {
    execute(sql: string, params?: any[]): Promise<any>;
  };
  findMany<T extends BaseEntity>(
    collection: string,
    query?: QueryFilter<T>,
    options?: FindOptions<T>,
  ): Promise<DatabaseResult<T[]>>;
  count<T extends BaseEntity>(
    collection: string,
    query?: QueryFilter<T>,
    options?: CountOptions,
  ): Promise<DatabaseResult<number>>;
}

/**
 * Normalize raw.execute / driver rows into a non-negative integer estimate.
 */
export function extractEstimateNumber(rows: unknown, field: string): number | null {
  if (rows == null) return null;
  let row: any;
  if (Array.isArray(rows)) {
    row = rows[0];
  } else if (typeof rows === "object" && rows !== null && "rows" in (rows as object)) {
    row = (rows as any).rows?.[0];
  } else if (typeof rows === "object") {
    row = rows;
  }
  if (!row) return null;
  const raw = row[field] ?? row[0];
  const n = typeof raw === "bigint" ? Number(raw) : Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/**
 * Fast table row estimation via engine metadata.
 */
export async function estimateSqlTableRows(
  ctx: SqlPageRunnerContext,
  table: any,
  _collection: string,
): Promise<number | null> {
  const tableName = getTableName(table);
  if (!tableName) return null;

  try {
    const dbType = (ctx.type || "").toLowerCase();

    if (dbType === "postgresql" || dbType === "postgres") {
      // pg_class.reltuples — planner estimate; free vs sequential COUNT(*)
      const rows = await ctx.raw.execute(
        `SELECT GREATEST(reltuples::bigint, 0) AS n FROM pg_class WHERE relname = $1 LIMIT 1`,
        [tableName],
      );
      return extractEstimateNumber(rows, "n");
    }

    if (dbType === "mariadb" || dbType === "mysql") {
      const rows = await ctx.raw.execute(
        `SELECT TABLE_ROWS AS n FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
        [tableName],
      );
      return extractEstimateNumber(rows, "n");
    }

    if (dbType === "sqlite") {
      // sqlite_stat1 after ANALYZE; if missing, exact COUNT is already sub-ms
      const rows = await ctx.raw.execute(
        `SELECT SUM(CAST(substr(stat, 1, instr(stat || ' ', ' ') - 1) AS INTEGER)) AS n
         FROM sqlite_stat1 WHERE tbl = ?`,
        [tableName],
      );
      const n = extractEstimateNumber(rows, "n");
      if (n === null || n === 0) return null;
      return n;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Executes a paginated query on a collection table with optional total count.
 */
export async function executeSqlFindPage<T extends BaseEntity>(
  ctx: SqlPageRunnerContext,
  collection: string,
  query: QueryFilter<T> = {},
  options: FindPageOptions<T> = {},
): Promise<DatabaseResult<FindPageResult<T>>> {
  const pageSize = options.limit && options.limit > 0 ? options.limit : DEFAULT_PAGE_SIZE;
  // Keyset-stable ordering: append the _id tiebreaker in the same direction
  // as the primary sort (matches mergeKeysetFilter's compound (field, _id)
  // cursor).
  const sortOpt = withIdTiebreaker(
    options.sort ?? defaultPageSortOption(),
  ) as FindOptions<T>["sort"];
  const resolvedSort = resolvePageSort(sortOpt);
  const cursor = decodePageCursor(options.cursor);
  const pageQuery = cursor
    ? (mergeKeysetFilter(query as Record<string, unknown>, cursor) as QueryFilter<T>)
    : query;

  const fetchOpts: FindOptions<T> = {
    ...options,
    sort: sortOpt,
    limit: pageSize + 1,
    offset: cursor ? 0 : options.offset,
  };

  const totalMode = options.total ?? "none";
  // Parallel: page fetch + optional total
  const countPromise =
    totalMode !== "none"
      ? ctx.count(collection, query, {
          tenantId: options.tenantId,
          systemScope: options.systemScope,
          includeDeleted: options.includeDeleted,
          bypassSafeQuery: options.bypassSafeQuery,
          skipMeta: true,
          mode: totalMode,
        })
      : null;

  const [rowsRes, countRes] = await Promise.all([
    ctx.findMany<T>(collection, pageQuery, fetchOpts),
    countPromise ?? Promise.resolve(null),
  ]);

  if (!rowsRes.success) {
    return {
      success: false,
      message: rowsRes.message,
      error: rowsRes.error,
    };
  }

  let totalMeta: { total: number; estimated: boolean } | undefined;
  if (countRes && countRes.success && typeof countRes.data === "number") {
    totalMeta = {
      total: countRes.data,
      estimated: shouldUseEstimateCount(query, {
        mode: totalMode === "none" ? "auto" : totalMode,
        tenantId: options.tenantId,
        includeDeleted: options.includeDeleted,
      }),
    };
  }

  return {
    success: true,
    data: buildFindPageResult(rowsRes.data ?? [], pageSize, totalMeta, resolvedSort),
  };
}
