/**
 * @file src/databases/sql/wire-stream-shared.ts
 * @description
 * Shared compilation, validation, and tenant-binding helpers for the Direct-to-Wire
 * SQL streaming engines (PostgreSQL, SQLite, MariaDB).
 *
 * ### Features:
 * - Centralized identifier & projection validation (`validateWireListInput`)
 * - Deterministic `_id` tie-breaking on custom `ORDER BY` sorts across all SQL dialects
 * - Shared point-read SQL statement template builder (`buildPointWireSqlTemplates`)
 * - Shared point-read parameter binding (`resolvePointWireQuery`)
 * - Shared materialized column iteration (`collectSafeMaterializedColumns`)
 */

import { assertSafeSqlIdentifier } from "../core/relational-utils";
import { getMaterializedFieldColumns } from "../core/drizzle-sql-helpers";
import { hasTenantBypass } from "../system-tenant-scope";
import type { BaseQueryOptions, DatabaseId } from "../db-interface";

const SAFE_IDENT_RE = /^[A-Za-z0-9_]+$/;

export interface WireColumnLookup {
  getColumn(table: unknown, colName: string): unknown;
}

export interface PointWireSqlTemplates {
  selectPrefix: string;
  base: string;
  tenant: string;
  tenantNull: string;
  basePub: string | null;
  tenantPub: string | null;
  tenantPubNull: string | null;
  idColName?: string;
  declined?: boolean;
}

export interface ValidatedWireListInput {
  isProjected: boolean;
  dedupedProjectedCols: string[];
  sortCol: string;
  sortDirection: "ASC" | "DESC";
  orderClause: string;
  cacheKey: string;
  limit: number;
  offset: number;
}

/**
 * Validates and returns safe materialized column names for a Drizzle table,
 * or `null` if any column name violates the identifier policy.
 */
export function collectSafeMaterializedColumns(table: unknown): string[] | null {
  const cols: string[] = [];
  for (const rawName of getMaterializedFieldColumns(table)) {
    if (!SAFE_IDENT_RE.test(rawName)) return null;
    cols.push(assertSafeSqlIdentifier(rawName, "column"));
  }
  return cols;
}

/**
 * Builds the 6 pre-compiled point-read SQL variants (`base`, `tenant`, `tenantNull`,
 * `basePub`, `tenantPub`, `tenantPubNull`) for any SQL dialect.
 */
export function buildPointWireSqlTemplates(opts: {
  selectPrefix: string;
  idExpr: string;
  tenantExpr: string;
  tenantColQuoted: string;
  statusColQuoted: string;
  hasStatusCol: boolean;
  delSuffix: string;
  idColName?: string;
}): PointWireSqlTemplates {
  const {
    selectPrefix,
    idExpr,
    tenantExpr,
    tenantColQuoted,
    statusColQuoted,
    hasStatusCol,
    delSuffix,
    idColName,
  } = opts;
  const pubClause = `${statusColQuoted} IN ('publish', 'published')`;

  return {
    selectPrefix,
    base: `${selectPrefix} WHERE ${idExpr}${delSuffix} LIMIT 1`,
    tenant: `${selectPrefix} WHERE ${idExpr} AND ${tenantExpr}${delSuffix} LIMIT 1`,
    tenantNull: `${selectPrefix} WHERE ${idExpr} AND ${tenantColQuoted} IS NULL${delSuffix} LIMIT 1`,
    basePub: hasStatusCol
      ? `${selectPrefix} WHERE ${idExpr} AND ${pubClause}${delSuffix} LIMIT 1`
      : null,
    tenantPub: hasStatusCol
      ? `${selectPrefix} WHERE ${idExpr} AND ${pubClause} AND ${tenantExpr}${delSuffix} LIMIT 1`
      : null,
    tenantPubNull: hasStatusCol
      ? `${selectPrefix} WHERE ${idExpr} AND ${pubClause} AND ${tenantColQuoted} IS NULL${delSuffix} LIMIT 1`
      : null,
    idColName,
  };
}

/**
 * Selects the appropriate pre-compiled point-read SQL template and binds parameters
 * based on `requirePublished`, `tenantId`, and tenant bypass rules.
 */
export function resolvePointWireQuery(
  cached: PointWireSqlTemplates,
  id: DatabaseId,
  options?: BaseQueryOptions,
): { sqlText: string; params: unknown[] } | null {
  const wantPublished = options?.requirePublished === true;
  if (wantPublished && !cached.basePub) return null;

  const bypass = hasTenantBypass(options);
  const rawTenant = bypass ? undefined : options?.tenantId;
  const tenantId = rawTenant === undefined || rawTenant === "global" ? undefined : rawTenant;

  if (tenantId !== undefined && tenantId !== null) {
    return {
      sqlText: wantPublished ? cached.tenantPub! : cached.tenant,
      params: [String(id), String(tenantId)],
    };
  }
  if (tenantId === null) {
    return {
      sqlText: wantPublished ? cached.tenantPubNull! : cached.tenantNull,
      params: [String(id)],
    };
  }
  return {
    sqlText: wantPublished ? cached.basePub! : cached.base,
    params: [String(id)],
  };
}

/**
 * Validates `fields`, `sortField`, `sortDirection`, `limit`, and `offset` for
 * `findListWireStream`, returning quoted identifiers, cache key, and a
 * deterministic `ORDER BY` clause with an `_id` tie-breaker on custom sorts.
 */
export function validateWireListInput(
  executor: WireColumnLookup,
  table: unknown,
  options: {
    limit?: number;
    offset?: number;
    sortField?: string;
    sortDirection?: "asc" | "desc";
    fields?: string[];
  },
  quoteChar: '"' | "`",
): ValidatedWireListInput | null {
  if (!executor.getColumn(table, "data")) return null;

  const requestedFields = options.fields;
  const isProjected = Array.isArray(requestedFields) && requestedFields.length > 0;
  const dedupedProjectedCols: string[] = [];

  if (isProjected) {
    const seen = new Set<string>();
    for (const f of requestedFields) {
      if (!SAFE_IDENT_RE.test(f) || f === "data") return null;
      const colName = f === "id" ? "_id" : f;
      if (!executor.getColumn(table, colName)) return null;
      if (!seen.has(colName)) {
        seen.add(colName);
        dedupedProjectedCols.push(assertSafeSqlIdentifier(colName, "column"));
      }
    }
    if (!seen.has("_id") && executor.getColumn(table, "_id")) {
      dedupedProjectedCols.unshift("_id");
    }
  }

  const defaultIdCol = `${quoteChar}_id${quoteChar}`;
  const sortField = options.sortField;
  const sortDirection = options.sortDirection === "asc" ? "ASC" : "DESC";
  let sortCol = defaultIdCol;

  if (sortField) {
    if (!SAFE_IDENT_RE.test(sortField) || !executor.getColumn(table, sortField)) {
      return null;
    }
    sortCol = `${quoteChar}${assertSafeSqlIdentifier(sortField, "column")}${quoteChar}`;
  }

  const orderClause =
    sortField && sortCol !== defaultIdCol
      ? `ORDER BY ${sortCol} ${sortDirection}, ${defaultIdCol} ${sortDirection}`
      : `ORDER BY ${sortCol} ${sortDirection}`;

  const sortKey = `${sortCol}:${sortDirection}`;
  const cacheKey = isProjected ? `${sortKey}:f:${requestedFields.join(",")}` : sortKey;
  const limit = typeof options.limit === "number" && options.limit > 0 ? options.limit : 50;
  const offset = typeof options.offset === "number" && options.offset >= 0 ? options.offset : 0;

  return {
    isProjected,
    dedupedProjectedCols,
    sortCol,
    sortDirection,
    orderClause,
    cacheKey,
    limit,
    offset,
  };
}
