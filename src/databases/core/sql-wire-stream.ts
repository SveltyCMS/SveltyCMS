/**
 * @file src/databases/core/sql-wire-stream.ts
 * @description
 * Native direct-to-wire read streaming for SQL database adapters.
 * Bypasses full ORM / JavaScript deserialization overhead by querying pre-serialized
 * JSON payloads directly from SQLite/PostgreSQL/MariaDB wire engines.
 *
 * ### Features:
 * - Direct-to-wire point reads with automated ETag computation
 * - Publication-gated point reads with fallback to trimmed domain plane
 * - Direct-to-wire list query streaming with sorting and pagination
 * - Discriminated results: found, missing, or declined
 */

import type {
  BaseEntity,
  BaseQueryOptions,
  DatabaseResult,
  DatabaseId,
  QueryFilter,
} from "../db-interface";
import { serializeSuccessEnvelope } from "@utils/fast-json";
import { trimPointReadEnvelope } from "@utils/point-read-payload";
import { versionTokenString } from "@utils/optimistic-lock";
import { isPublishedStatus } from "@src/utils/security/publication-policy";
import { assertSafeSqlIdentifier } from "./relational-utils";
import { getMaterializedFieldColumns } from "./drizzle-sql-helpers";
import { hasTenantBypass } from "../system-tenant-scope";

/**
 * Outcome of a native direct-to-wire point read (`rawFindPointWireStream`).
 *
 * - `found`    — the engine produced a pre-serialized wire body.
 * - `missing`  — the SELECT ran and returned no row (id absent or
 *                publication-clamped away). Definitively not servable by the
 *                wire plane.
 * - `declined` — the engine/table cannot produce a native wire body.
 */
export type RawPointWireStreamResult =
  | { kind: "found"; wireBody: string; etag: string }
  | { kind: "missing" }
  | { kind: "declined" };

/**
 * Outcome of a native direct-to-wire list read (`rawFindListWireStream`).
 *
 * - `found`    — the engine produced a pre-serialized JSON array wire body.
 * - `declined` — the engine declines (e.g. client-server DBs where JS stringification is faster).
 */
export type RawListWireStreamResult =
  | { kind: "found"; wireBody: string; etag: string }
  | { kind: "declined" };

/**
 * Structural contract required by the direct-to-wire read runner.
 */
export interface SqlWireStreamContext {
  getTable(collection: string): any;
  rawFindPointWireStream(
    table: any,
    collection: string,
    id: DatabaseId,
    options: BaseQueryOptions,
  ): Promise<RawPointWireStreamResult>;
  rawFindListWireStream(
    table: any,
    collection: string,
    options: BaseQueryOptions & {
      limit?: number;
      offset?: number;
      requirePublished?: boolean;
      sortField?: string;
      sortDirection?: "asc" | "desc";
      fields?: string[];
    },
  ): Promise<RawListWireStreamResult>;
  findOne<T extends BaseEntity>(
    collection: string,
    query: QueryFilter<T>,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T | null>>;
  wrap<T>(
    operation: () => Promise<T>,
    errorCode: string,
    metricName?: string,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>>;
}

/**
 * Point-read direct-to-wire pipeline.
 */
export async function executeFindPointWireStream(
  ctx: SqlWireStreamContext,
  collection: string,
  id: DatabaseId,
  options: BaseQueryOptions = {},
): Promise<DatabaseResult<{ wireBody: string; etag: string } | null>> {
  if (typeof collection !== "string" || !id) {
    return {
      success: false,
      message: "Invalid collection or id",
      error: { code: "INVALID_QUERY", message: "Invalid collection or id" },
    };
  }
  const table = ctx.getTable(collection);
  if (!table) {
    return {
      success: false,
      message: `Collection table not found: ${collection}`,
      error: {
        code: "COLLECTION_NOT_FOUND",
        message: `Collection table not found: ${collection}`,
      },
    };
  }

  // The raw stream self-catches and reports found / missing / declined.
  const rawWire = await ctx.rawFindPointWireStream(table, collection, id, options);
  // Fast path: the engine already produced the serialized wire body — return it
  // without `wrap()` (which would re-enter the queue gate / AsyncLocalStorage /
  // traceSpan for an in-memory object).
  if (rawWire.kind === "found") {
    return { success: true, data: { wireBody: rawWire.wireBody, etag: rawWire.etag } };
  }
  if (rawWire.kind === "missing") {
    return {
      success: false,
      message: "Entry not found",
      error: { code: "RECORD_NOT_FOUND", message: "Entry not found" },
    };
  }

  return ctx.wrap(async () => {
    // Engine declined (no native JSON support, etc.) → findOne fallback.
    const findRes = await ctx.findOne(collection, { _id: id } as any, options as any);
    const record =
      findRes && typeof findRes === "object" && "success" in findRes
        ? ((findRes as { success: boolean; data?: unknown }).data ?? null)
        : findRes;
    if (!record) return null;
    // Wire Plane publication guarantee: check status if required
    if (options.requirePublished === true && !isPublishedStatus(record)) return null;
    const trimmed = trimPointReadEnvelope({ success: true, data: record }) as {
      data?: unknown;
    };
    const wireBody = serializeSuccessEnvelope(JSON.stringify(trimmed.data ?? null));
    const etag = `"${String((record as any)._id ?? id)}-${versionTokenString((record as any).updatedAt)}"`;
    return { wireBody, etag };
  }, "FIND_POINT_WIRE_STREAM_FAILED");
}

/**
 * List-read direct-to-wire pipeline.
 */
export async function executeFindListWireStream(
  ctx: SqlWireStreamContext,
  collection: string,
  options: BaseQueryOptions & {
    limit?: number;
    offset?: number;
    requirePublished?: boolean;
    sortField?: string;
    sortDirection?: "asc" | "desc";
    fields?: string[];
  } = {},
): Promise<DatabaseResult<{ wireBody: string; etag: string } | null>> {
  if (typeof collection !== "string") {
    return {
      success: false,
      message: "Invalid collection",
      error: { code: "INVALID_QUERY", message: "Invalid collection" },
    };
  }
  const table = ctx.getTable(collection);
  if (!table) {
    return {
      success: false,
      message: `Collection table not found: ${collection}`,
      error: {
        code: "COLLECTION_NOT_FOUND",
        message: `Collection table not found: ${collection}`,
      },
    };
  }

  const rawWire = await ctx.rawFindListWireStream(table, collection, options);
  if (rawWire.kind === "found") {
    return { success: true, data: { wireBody: rawWire.wireBody, etag: rawWire.etag } };
  }

  return {
    success: false,
    message: "Direct-to-wire list declined",
    error: { code: "DECLINED", message: "Direct-to-wire list declined" },
  };
}

// ---------------------------------------------------------------------------
// Direct-to-wire compilation, validation, and tenant-binding helpers
// ---------------------------------------------------------------------------

const SAFE_IDENT_RE = /^[A-Za-z0-9_]+$/;
/**
 * Plain top-level JSON keys eligible for type-preserving `data->'key'` projection.
 * Mirrors the `onDynamicSort` gate: dotted/nested paths are never inlined, and the
 * key must be a plain identifier (leading letter/underscore, alphanumeric after).
 */
const JSON_PROJECTION_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface WireColumnLookup {
  getColumn(table: unknown, colName: string): unknown;
}

/**
 * One projected field in the ordered direct-to-wire select list.
 *
 * `kind: "column"` references a physical column; `kind: "data"` references a
 * top-level key inside the `data` jsonb blob and must be rendered as
 * `data->'name'` (type-preserving jsonb), never as a quoted column identifier.
 */
export interface WireProjectedField {
  name: string;
  kind: "column" | "data";
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
  projectedFields: WireProjectedField[];
  sortCol: string;
  sortDirection: "ASC" | "DESC";
  orderClause: string;
  cacheKey: string;
  limit: number;
  offset: number;
}

/** Per-table materialized-column validation, cached so names are checked once. */
const safeMaterializedColumnsCache = new WeakMap<object, string[] | null>();

/**
 * Validates and returns safe materialized column names for a Drizzle table,
 * or `null` if any column name violates the identifier policy.
 */
export function collectSafeMaterializedColumns(table: unknown): string[] | null {
  const tableObj = table as object;
  const cached = safeMaterializedColumnsCache.get(tableObj);
  if (cached !== undefined) return cached;

  const cols: string[] = [];
  for (const rawName of getMaterializedFieldColumns(table)) {
    try {
      cols.push(assertSafeSqlIdentifier(rawName, "column"));
    } catch {
      safeMaterializedColumnsCache.set(tableObj, null);
      return null;
    }
  }
  safeMaterializedColumnsCache.set(tableObj, cols);
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
 * Validated projection/sort result, minus the per-call `limit`/`offset`.
 * Cached per table + raw request key so repeated list reads never re-run the
 * identifier regex, column lookups, or identifier assertion on a warm key.
 */
interface CachedWireListValidation {
  isProjected: boolean;
  dedupedProjectedCols: string[];
  projectedFields: WireProjectedField[];
  sortCol: string;
  sortDirection: "ASC" | "DESC";
  orderClause: string;
  cacheKey: string;
}

const wireListValidationCache = new WeakMap<object, Map<string, CachedWireListValidation | null>>();

/**
 * Validates `fields`, `sortField`, `sortDirection`, `limit`, and `offset` for
 * `findListWireStream`, returning quoted identifiers, cache key, and a
 * deterministic `ORDER BY` clause with an `_id` tie-breaker on custom sorts.
 *
 * The validated projection/sort is cached against the raw request inputs, so
 * the hot path only re-computes the per-call `limit`/`offset`.
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
  /**
   * When `true`, a projected field with no physical column is accepted as a
   * top-level `data` jsonb key (`data->'key'`, type-preserving) instead of
   * declining. PostgreSQL opts in; SQLite/MariaDB keep declining (JSON keys
   * there are either not jsonb or not index-served).
   */
  allowJsonProjection = false,
): ValidatedWireListInput | null {
  if (!executor.getColumn(table, "data")) return null;

  // Per-call pagination is never part of the cached result or the cache key.
  const limit = typeof options.limit === "number" && options.limit > 0 ? options.limit : 50;
  const offset = typeof options.offset === "number" && options.offset >= 0 ? options.offset : 0;

  const sortField = options.sortField;
  const requestedFields = options.fields;
  const fieldsKey = Array.isArray(requestedFields) ? requestedFields.join(",") : "";
  const rawKey = `${sortField ?? ""}\u0000${options.sortDirection ?? ""}\u0000${fieldsKey}`;

  const tableObj = table as object;
  let perTable = wireListValidationCache.get(tableObj);
  if (!perTable) {
    perTable = new Map();
    wireListValidationCache.set(tableObj, perTable);
  } else if (perTable.has(rawKey)) {
    const cached = perTable.get(rawKey)!;
    if (cached === null) return null;
    return { ...cached, limit, offset };
  }

  const isProjected = Array.isArray(requestedFields) && requestedFields.length > 0;
  const dedupedProjectedCols: string[] = [];
  const projectedFields: WireProjectedField[] = [];

  if (isProjected) {
    const seen = new Set<string>();
    for (const f of requestedFields) {
      // SAFE_IDENT_RE rejects dotted/nested paths (`.` is not in the class), so a
      // data-only projection can never emit a nested `data->'a.b'` expression.
      if (!SAFE_IDENT_RE.test(f) || f === "data") {
        perTable.set(rawKey, null);
        return null;
      }
      const colName = f === "id" ? "_id" : f;
      const isPhysical = !!executor.getColumn(table, colName);
      if (!isPhysical) {
        // PostgreSQL-only: serve the field from the `data` jsonb blob, but only
        // for a plain top-level key (same gate as onDynamicSort).
        if (!allowJsonProjection || !JSON_PROJECTION_KEY_RE.test(colName)) {
          perTable.set(rawKey, null);
          return null;
        }
      }
      if (!seen.has(colName)) {
        seen.add(colName);
        const safe = assertSafeSqlIdentifier(colName, "column");
        if (isPhysical) {
          dedupedProjectedCols.push(safe);
          projectedFields.push({ name: safe, kind: "column" });
        } else {
          projectedFields.push({ name: safe, kind: "data" });
        }
      }
    }
    if (!seen.has("_id") && executor.getColumn(table, "_id")) {
      dedupedProjectedCols.unshift("_id");
      projectedFields.unshift({ name: "_id", kind: "column" });
    }
  }

  const defaultIdCol = `${quoteChar}_id${quoteChar}`;
  const sortDirection = options.sortDirection === "asc" ? "ASC" : "DESC";
  let sortCol = defaultIdCol;

  if (sortField) {
    if (!SAFE_IDENT_RE.test(sortField) || !executor.getColumn(table, sortField)) {
      perTable.set(rawKey, null);
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

  const result: CachedWireListValidation = {
    isProjected,
    dedupedProjectedCols,
    projectedFields,
    sortCol,
    sortDirection,
    orderClause,
    cacheKey,
  };
  perTable.set(rawKey, result);
  return { ...result, limit, offset };
}
