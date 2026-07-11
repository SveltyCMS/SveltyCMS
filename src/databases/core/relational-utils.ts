/**
 * @file src/databases/core/relational-utils.ts
 * @description Standard utility functions for relational adapters. Zero-allocation where possible.
 *
 * ### 2027 Features:
 * - Schema-aware row conversion (per-table date/JSON column pre-computation)
 * - Zero-allocation iteration (for-in + hasOwnProperty everywhere)
 * - Ring-buffer conditions array pooling for filtered queries
 * - Centralized tenant filter logic (shouldBypass, getEffectiveTenantId, getTenantCondition, applyTenantFilter)
 */

import { generateUUID as uuidv4 } from "@utils/native-utils";
import { isoDateStringToDate, nowISODateString } from "@src/utils/date";
import type {
  BaseQueryOptions,
  DatabaseError,
  DatabaseId,
  PaginatedResult,
  PaginationOptions,
} from "../db-interface";
import { eq, isNull } from "drizzle-orm";

export { isoDateStringToDate, nowISODateString };

export const generateId = () => uuidv4().replace(/-/g, "") as DatabaseId;
export const validateId = (id: string) => /^[0-9a-f]{32}$/i.test(id) || /^[0-9a-f-]{36}$/i.test(id);

export const createDatabaseError = (
  code: string,
  message: string,
  originalError?: any,
  statusCode?: number,
): DatabaseError => ({
  code,
  message,
  statusCode,
  originalCode: originalError?.code || (originalError as any)?.originalError?.code,
  details: originalError,
});

export const normalizePath = (p: string) => p.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");

const JSON_FIELDS = new Set([
  "data",
  "metadata",
  "config",
  "settings",
  "payload",
  "translations",
  "collectionDef",
  "thumbnails",
  "quota",
  "usage",
  "roleIds",
  "permissions",
  "preferences",
  "details",
  "errorDetails",
  "instances",
]);
const DATE_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "publishedAt",
  "expires",
  "expiresAt",
  "lastLoginAt",
  "timestamp",
  "appliedAt",
  "nextRunAt",
  "lastError",
  "lastErrorAt",
  "deletedAt",
  "publishDate",
  "lastHit",
  "fetchedAt",
  "last2FAVerification",
]);

// ============================================================================
// 2027: SCHEMA-AWARE COLUMN PRE-COMPUTATION
// ============================================================================
// Instead of checking every row key against DATE_FIELDS/JSON_FIELDS Sets on
// every row read/write, we compute the intersection once per table schema.
// Eliminates per-row Set.has() calls for keys that are neither dates nor JSON,
// and enables targeted iteration (only the known columns, not all keys).

const _tableDateCols = new Map<string, string[]>();
const _tableJsonCols = new Map<string, string[]>();
const _tableSkipKeys = new Map<string, Set<string>>();

/** Registers a table's known date/JSON columns for zero-overhead conversion. Idempotent. */
export function registerTableSchema(table: string, columns: string[]): void {
  if (_tableDateCols.has(table)) return;
  const dateCols = columns.filter((c) => DATE_FIELDS.has(c));
  const jsonCols = columns.filter((c) => JSON_FIELDS.has(c));
  _tableDateCols.set(table, dateCols);
  _tableJsonCols.set(table, jsonCols);
  _tableSkipKeys.set(table, new Set([...dateCols, ...jsonCols]));
}

export function getTableDateColumns(table: string): string[] {
  return _tableDateCols.get(table) || [];
}

export function getTableJsonColumns(table: string): string[] {
  return _tableJsonCols.get(table) || [];
}

// ============================================================================
// 2027: CONDITIONS ARRAY POOL (for filtered queries)
// ============================================================================
// Every mapQuery call allocates `const conditions: SQL[] = []`. Instead, we
// provide a ring-buffer pool of reusable arrays. Callers acquire, build, pass
// to and(...), then implicitly release (array is cleared by next acquire).

const _condPoolSize = 128;
const _condPool: SQL[][] = Array.from({ length: _condPoolSize }, () => []);
let _condPoolIdx = 0;

/** Acquires a reusable conditions array from the ring-buffer pool. */
export function acquireConditionsArray(): SQL[] {
  const arr = _condPool[_condPoolIdx];
  _condPoolIdx = (_condPoolIdx + 1) % _condPoolSize;
  arr.length = 0; // clear without deallocation
  return arr;
}

import type { SQL } from "drizzle-orm";

// ============================================================================
// CORE TRANSFORMERS
// ============================================================================

export const safeDate = (input: any): Date => {
  if (input && typeof input === "object" && typeof (input as any).getTime === "function") {
    return new Date((input as any).getTime());
  }
  return new Date(input);
};

function isJsonString(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 1 &&
    (value[0] === "{" || value[0] === "[" || value[0] === '"')
  );
}

/** Parse string JSON columns; native jsonb objects (PostgreSQL) pass through unchanged. */
function normalizeJsonFieldValue(
  value: unknown,
  options?: { mariaDoubleParseJson?: boolean },
): unknown {
  let v = value;
  if (isJsonString(v)) {
    try {
      v = JSON.parse(v);
    } catch {}
  }
  if (options?.mariaDoubleParseJson && isJsonString(v)) {
    try {
      v = JSON.parse(v);
    } catch {}
  }
  return v;
}

function flattenDataColumn(result: Record<string, unknown>, key: string, value: unknown): void {
  if (key === "data" && value && typeof value === "object" && !Array.isArray(value)) {
    Object.assign(result, value);
  }
}

/**
 * Schema-aware row converter — only touches known date/JSON columns.
 * For unregistered tables, falls back to full-key iteration (backward compatible).
 */
export function convertDatesToISO(
  row: any,
  options?: { mariaDoubleParseJson?: boolean; table?: string },
): any {
  if (!row) return row;
  if (Array.isArray(row)) {
    return row.map((r) => convertDatesToISO(r, options));
  }

  const result: any = {};
  const table = options?.table;
  const hasSchema = table ? _tableDateCols.has(table) : false;
  const dateCols = hasSchema && table ? getTableDateColumns(table) : null;
  const jsonCols = hasSchema && table ? getTableJsonColumns(table) : null;

  if (dateCols && dateCols.length > 0) {
    // 🚀 2027 FAST PATH: Only convert known date columns
    for (let i = 0; i < dateCols.length; i++) {
      const k = dateCols[i];
      const v = row[k];
      if (
        v instanceof Date ||
        (v && typeof v === "object" && typeof (v as any).getTime === "function")
      ) {
        result[k] = (v instanceof Date ? v : new Date((v as any).getTime())).toISOString();
      } else {
        result[k] = v;
      }
    }
  }

  if (jsonCols && jsonCols.length > 0) {
    for (let i = 0; i < jsonCols.length; i++) {
      const k = jsonCols[i];
      const v = normalizeJsonFieldValue(row[k], options);
      flattenDataColumn(result, k, v);
      result[k] = v;
    }
  }

  // Copy remaining keys (neither date nor JSON) — only if schema registered
  if (dateCols) {
    // With schema: copy non-date, non-json keys (cached skipKeys Set — zero per-row allocation)
    const skipKeys = _tableSkipKeys.get(table!) || new Set([...dateCols, ...(jsonCols || [])]);
    for (const k in row) {
      if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
      if (skipKeys.has(k) || result[k] !== undefined) continue;
      result[k] = row[k];
    }
  } else {
    // No schema: fallback to full iteration (backward compatible)
    for (const k in row) {
      if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
      if (result[k] !== undefined) continue;
      let v = row[k];
      if (
        v instanceof Date ||
        (v && typeof v === "object" && typeof (v as any).getTime === "function")
      ) {
        v = (v instanceof Date ? v : new Date((v as any).getTime())).toISOString();
      } else if (JSON_FIELDS.has(k)) {
        v = normalizeJsonFieldValue(v, options);
        flattenDataColumn(result, k, v);
      }
      result[k] = v;
    }
  }

  return result;
}

export const convertArrayDatesToISO = (
  rows: any[],
  options?: { mariaDoubleParseJson?: boolean; table?: string },
) => {
  if (!rows || rows.length === 0) return [];
  return rows.map((r) => convertDatesToISO(r, options));
};

export function convertISOToDates(
  data: any,
  options?: { mariaDoubleParseJson?: boolean; table?: string },
): any {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map((d) => convertISOToDates(d, options));
  }

  const result: any = Object.assign({}, data);
  const table = options?.table;
  const hasSchema = table ? _tableDateCols.has(table) : false;
  const dateCols = hasSchema && table ? getTableDateColumns(table) : null;
  const jsonCols = hasSchema && table ? getTableJsonColumns(table) : null;

  if (dateCols && dateCols.length > 0) {
    for (let i = 0; i < dateCols.length; i++) {
      const key = dateCols[i];
      const val = result[key];
      if (typeof val === "string" && val.length > 5) {
        result[key] = isoDateStringToDate(val as any);
      } else if (val && typeof val === "object" && typeof (val as any).getTime === "function") {
        result[key] = new Date((val as any).getTime());
      }
    }
  }

  if (jsonCols && jsonCols.length > 0) {
    for (let i = 0; i < jsonCols.length; i++) {
      const key = jsonCols[i];
      const val = result[key];
      if (val !== null && typeof val === "object") {
        result[key] = Array.isArray(val) ? JSON.stringify(val) : val;
      }
    }
  }

  if (!dateCols) {
    // No schema: fallback to full iteration
    for (const key in result) {
      if (!Object.prototype.hasOwnProperty.call(result, key)) continue;
      const val = result[key];
      if (DATE_FIELDS.has(key)) {
        if (typeof val === "string" && val.length > 5) {
          result[key] = isoDateStringToDate(val as any);
        } else if (val && typeof val === "object" && typeof (val as any).getTime === "function") {
          result[key] = new Date((val as any).getTime());
        }
      } else if (JSON_FIELDS.has(key) && val !== null && typeof val === "object") {
        result[key] = Array.isArray(val) ? JSON.stringify(val) : val;
      }
    }
  }

  return result;
}

export function createPagination<T>(
  items: T[],
  options: PaginationOptions = {},
): PaginatedResult<T> {
  const page = options.page || 1;
  const pageSize = options.limit || 25;
  const total = items.length;
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    hasNextPage: page * pageSize < total,
    hasPreviousPage: page > 1,
  };
}

export const paginateResults = createPagination;
export const convertUserToISO = convertDatesToISO;
export const convertSessionToISO = convertDatesToISO;

export const parseJsonField = <T = any>(v: any, fallback?: T): T => {
  if (typeof v === "string" && (v.startsWith("{") || v.startsWith("["))) {
    try {
      return JSON.parse(v) as T;
    } catch {
      return (fallback !== undefined ? fallback : v) as T;
    }
  }
  return (v !== undefined && v !== null ? v : fallback !== undefined ? fallback : v) as T;
};

// ============================================================================
// TENANT FILTER LOGIC (centralized)
// ============================================================================

export function shouldBypassTenantCheck(options?: BaseQueryOptions): boolean {
  return !!(options as any)?.bypassTenantCheck;
}

export function getEffectiveTenantId(options?: BaseQueryOptions): DatabaseId | null | undefined {
  const t = options?.tenantId;
  if (t === undefined || t === "global") return undefined;
  return t as DatabaseId | null;
}

export function getTenantCondition(tenantCol: any, options?: BaseQueryOptions): any {
  if (shouldBypassTenantCheck(options)) return undefined;
  const tenantId = getEffectiveTenantId(options);
  if (tenantId === undefined) return undefined;
  if (tenantId === null) return isNull(tenantCol);
  return eq(tenantCol, tenantId);
}

export function applyTenantFilter(
  conditions: any[],
  tenantCol: any,
  options?: BaseQueryOptions,
): any[] {
  const cond = getTenantCondition(tenantCol, options);
  if (cond) conditions.push(cond);
  return conditions;
}

export function applyTenantFilterToObject<T extends Record<string, unknown>>(
  conditions: T,
  options?: BaseQueryOptions,
): T {
  if (shouldBypassTenantCheck(options)) return conditions;
  const tenantId = getEffectiveTenantId(options);
  if (tenantId === undefined) return conditions;
  return { ...conditions, tenantId } as T;
}

export function applyTenantFilterToMongoQuery<T extends Record<string, unknown>>(
  query: T,
  options?: BaseQueryOptions,
): T {
  if (shouldBypassTenantCheck(options)) return query;
  const tenantId = getEffectiveTenantId(options);
  if (tenantId === undefined) return query;
  if ((query as any).tenantId === tenantId) return query;
  return { ...query, tenantId } as T;
}

export function buildRawTenantFilter(
  options?: BaseQueryOptions,
  dialect: "mysql" | "postgres" | "sqlite" = "sqlite",
): string {
  if (options?.bypassTenantCheck || !options?.tenantId || options?.tenantId === "global") return "";
  const id = String(options.tenantId).replace(/'/g, "''");
  if (dialect === "mysql") return ` AND \`tenantId\` = '${id}'`;
  return ` AND "tenantId" = '${id}'`;
}
