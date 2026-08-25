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
import { hasTenantBypass } from "../system-tenant-scope";
import { eq, isNull } from "drizzle-orm";
import { assertTenantContext } from "@src/utils/security/safe-query";
import { normalizeCollectionTableName } from "./collection-name";

export { isoDateStringToDate, nowISODateString };

export const generateId = () => uuidv4().replace(/-/g, "") as DatabaseId;

function isHex32(str: string): boolean {
  for (let i = 0; i < 32; i++) {
    const c = str.charCodeAt(i);
    if (!((c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102))) return false;
  }
  return true;
}

function isUuid36(str: string): boolean {
  if (
    str.charCodeAt(8) !== 45 ||
    str.charCodeAt(13) !== 45 ||
    str.charCodeAt(18) !== 45 ||
    str.charCodeAt(23) !== 45
  ) {
    return false;
  }
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) continue;
    const c = str.charCodeAt(i);
    if (!((c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102))) return false;
  }
  return true;
}

export const validateId = (id: string): boolean => {
  if (typeof id !== "string") return false;
  const len = id.length;
  if (len === 32) return isHex32(id);
  if (len === 36) return isUuid36(id);
  return false;
};

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
const _tableBoolCols = new Map<string, Set<string>>();
/** Physical columns per table — the flatten merge must NOT let the `data`
 * blob override column values (columns are authoritative; data fills gaps). */
const _tableMergeSkipKeys = new Map<string, Set<string>>();

/**
 * SINGLE SOURCE OF TRUTH for a table's schema knowledge. The five legacy maps
 * above are DERIVED views of this record (kept for O(1) hot-path reads) — they
 * are written ONLY from here, so the parallel-registry drift class (late
 * boolean registration never updating the map, etc.) is structurally impossible.
 */
export interface TableMeta {
  table: string;
  /** All physical columns (base + materialized). */
  columns: string[];
  /** Date/timestamp columns (DATE_FIELDS ∩ columns). */
  dateCols: string[];
  /** JSON blob columns (JSON_FIELDS ∩ columns). */
  jsonCols: string[];
  /** date+json keys — skipped during the copy-remaining-keys pass. */
  skipKeys: Set<string>;
  /** Physical columns — the `data` blob merge must not override them. */
  mergeSkipKeys: Set<string>;
  /** Boolean columns — 0/1 coerced to true/false on raw reads. */
  boolCols: Set<string>;
}

const _tableMeta = new Map<string, TableMeta>();

/** The TableMeta record for a table (logical or physical name). */
export function getTableMeta(table: string): TableMeta | undefined {
  return _tableMeta.get(table);
}

/**
 * Consistency guard for the registry: every derived view must match the
 * TableMeta record. Throws on drift — used by unit tests and diagnostics.
 */
export function assertTableRegistryConsistent(table: string): void {
  const meta = _tableMeta.get(table);
  if (!meta) return;
  const fail = (what: string) => {
    throw new Error(`TableMeta drift for "${table}": ${what}`);
  };
  const expectedDate = meta.columns.filter((c) => DATE_FIELDS.has(c)).sort();
  const expectedJson = meta.columns.filter((c) => JSON_FIELDS.has(c)).sort();
  if (JSON.stringify([...meta.dateCols].sort()) !== JSON.stringify(expectedDate)) {
    fail(`dateCols != DATE_FIELDS ∩ columns`);
  }
  if (JSON.stringify([...meta.jsonCols].sort()) !== JSON.stringify(expectedJson)) {
    fail(`jsonCols != JSON_FIELDS ∩ columns`);
  }
  for (const c of meta.dateCols) {
    if (!meta.columns.includes(c)) fail(`dateCol "${c}" not in columns`);
  }
  for (const c of meta.jsonCols) {
    if (!meta.columns.includes(c)) fail(`jsonCol "${c}" not in columns`);
  }
  for (const c of meta.boolCols) {
    if (!meta.columns.includes(c)) fail(`boolCol "${c}" not in columns`);
  }
  for (const c of meta.mergeSkipKeys) {
    if (!meta.columns.includes(c)) fail(`mergeSkip "${c}" not in columns`);
  }
}

/**
 * Column names that are authoritative for a table — the `data` blob merge
 * skips them (row-store hybrid: materialized/base fields live in columns;
 * data fills only non-column gaps).
 */
export function getTableMergeSkipKeys(table: string): Set<string> | undefined {
  return _tableMergeSkipKeys.get(table);
}

/**
 * Boolean columns per table — the raw read paths return 0/1 for INTEGER/TINYINT
 * columns; the API contract expects real booleans (parity with the Drizzle
 * mode:"boolean" path). Conversion coerces 0/1 → false/true for these.
 */
export function getTableBooleanColumns(table: string): Set<string> | undefined {
  return _tableBoolCols.get(table);
}

/** Registers a table's known date/JSON columns for zero-overhead conversion under both physical and logical table names. Registrations are ADDITIVE — knowledge only grows (a later registration with materialized/boolean columns augments an earlier base-only one; a later partial registration never shrinks the maps). The five legacy maps are derived from the single TableMeta record. */
export function registerTableSchema(
  table: string,
  columns: string[],
  booleanCols?: string[],
): void {
  if (!table) return;
  const dateCols = columns.filter((c) => DATE_FIELDS.has(c));
  const jsonCols = columns.filter((c) => JSON_FIELDS.has(c));
  const skipSet = new Set([...dateCols, ...jsonCols]);
  const boolSet = new Set(booleanCols || []);

  const registerKey = (key: string) => {
    const prev = _tableMeta.get(key);
    const merged: TableMeta = prev
      ? {
          table: key,
          columns: [...new Set([...prev.columns, ...columns])],
          dateCols: [...new Set([...prev.dateCols, ...dateCols])],
          jsonCols: [...new Set([...prev.jsonCols, ...jsonCols])],
          skipKeys: new Set([...prev.skipKeys, ...skipSet]),
          mergeSkipKeys: new Set([...prev.mergeSkipKeys, ...columns]),
          boolCols: new Set([...prev.boolCols, ...boolSet]),
        }
      : {
          table: key,
          columns: [...columns],
          dateCols,
          jsonCols,
          skipKeys: skipSet,
          mergeSkipKeys: new Set(columns),
          boolCols: boolSet,
        };
    _tableMeta.set(key, merged);
    // Derived views — hot-path readers keep O(1) map lookups, zero change.
    _tableDateCols.set(key, merged.dateCols);
    _tableJsonCols.set(key, merged.jsonCols);
    _tableSkipKeys.set(key, merged.skipKeys);
    _tableMergeSkipKeys.set(key, merged.mergeSkipKeys);
    _tableBoolCols.set(key, merged.boolCols);
  };

  registerKey(table);
  // Canonical physical-name variant: normalizeCollectionTableName strips
  // hyphens so the variant key matches the physical table name getTable
  // produces for hyphenated ids (the old prefix-toggle kept the hyphens in
  // the variant key, which never matched the physical table).
  registerKey(normalizeCollectionTableName(table));
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
  // Parse through every JSON-string layer — legacy rows may be double-encoded
  // ("stringified string") from older write paths; a single pass leaves them
  // as strings and permission bitsets silently degrade to empty.
  const maxLayers = options?.mariaDoubleParseJson ? 3 : 3;
  for (let i = 0; i < maxLayers; i++) {
    if (!isJsonString(v)) break;
    try {
      const next = JSON.parse(v as string);
      if (next === v) break;
      v = next;
    } catch {
      break;
    }
  }
  return v;
}

function flattenDataColumn(
  result: Record<string, unknown>,
  key: string,
  value: unknown,
  skipMerge?: Set<string> | null,
): void {
  if (key === "data" && value && typeof value === "object" && !Array.isArray(value)) {
    if (!skipMerge || skipMerge.size === 0) {
      Object.assign(result, value);
      return;
    }
    // Row-store hybrid: columns are authoritative — data fills only gaps.
    const src = value as Record<string, unknown>;
    const keys = Object.keys(src);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (!skipMerge.has(k)) {
        result[k] = src[k];
      }
    }
  }
}

/** Coerce 0/1 column values to booleans for registered boolean columns (raw
 * paths return INTEGER/TINYINT — the API contract expects true/false). */
function coerceBooleanCols(row: Record<string, unknown>, table: string | undefined): void {
  const bools = table ? getTableBooleanColumns(table) : undefined;
  if (!bools || bools.size === 0) return;
  for (const k of bools) {
    const v = row[k];
    if (v === 0 || v === 1) row[k] = v === 1;
  }
}

/**
 * True when a value is an epoch-millisecond timestamp (> 1973-03-10, i.e. a
 * real timestamp, never a small int column value like a count or error code).
 * SQLite raw paths store timestamps as INTEGER ms — reads MUST normalize them
 * to ISODateString at the adapter boundary (single representation contract).
 */
function isEpochMs(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 100_000_000_000;
}

/**
 * postgres.js renders timestamptz as "2026-08-09 22:25:38.488+00" (space
 * separator, hour-only offset) — valid for the DB but NOT ISO 8601. Normalize
 * to ISODateString at the adapter boundary (single representation contract).
 */
const PG_TS_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}(:\d{2})?$/;

function isPgTimestampString(v: unknown): v is string {
  if (typeof v !== "string" || v.length < 19 || v.length > 35) return false;
  if (v[4] !== "-" || v[7] !== "-" || v[10] !== " ") return false;
  return PG_TS_RE.test(v);
}

function pgTimestampToIso(v: string): string {
  // V8's Date parser requires minute-precision offsets (`+00:00`, not `+00`).
  const withMinuteOffset = v.replace(/[+-]\d{2}$/, (m) => `${m}:00`);
  return new Date(withMinuteOffset.replace(" ", "T")).toISOString();
}

/**
 * Schema-aware row converter — only touches known date/JSON columns.
 * For unregistered tables, falls back to full-key iteration (backward compatible).
 */
export function convertDatesToISO(
  row: any,
  options?: {
    mariaDoubleParseJson?: boolean;
    table?: string;
    inPlace?: boolean;
    skipJson?: boolean;
  },
): any {
  if (!row) return row;
  if (Array.isArray(row)) {
    if (options?.inPlace) {
      for (let i = 0; i < row.length; i++) {
        row[i] = convertDatesToISO(row[i], options);
      }
      return row;
    }
    return row.map((r) => convertDatesToISO(r, options));
  }

  const table = options?.table;
  const hasSchema = table ? _tableDateCols.has(table) : false;
  const dateCols = hasSchema && table ? getTableDateColumns(table) : null;
  const jsonCols = hasSchema && table ? getTableJsonColumns(table) : null;
  const skipJson = options?.skipJson === true;

  if (options?.inPlace && hasSchema && dateCols) {
    // 🚀 ZERO-WORK FAST PATH: if the row carries no Date instances, no epoch-ms
    // timestamps and no JSON-string columns (content collections store ISO
    // strings + already parsed objects), the conversion is a no-op — return
    // the row untouched.
    let needsWork = false;
    for (let i = 0; i < dateCols.length; i++) {
      const v = row[dateCols[i]];
      if (
        v instanceof Date ||
        (v && typeof v === "object" && typeof (v as any).getTime === "function") ||
        isEpochMs(v) ||
        isPgTimestampString(v)
      ) {
        needsWork = true;
        break;
      }
    }
    if (!needsWork && !skipJson && jsonCols && jsonCols.length > 0) {
      for (let i = 0; i < jsonCols.length; i++) {
        const v = row[jsonCols[i]];
        if (typeof v === "string" && isJsonString(v)) {
          needsWork = true;
          break;
        }
      }
    }
    if (!needsWork) {
      // Zero-work fast path — but an already-parsed blob (PostgreSQL jsonb
      // arrives as an object, not a string) still needs its fields flattened
      // into the row; skipping it left blob fields invisible on PG reads.
      if (!skipJson && jsonCols && jsonCols.length > 0) {
        const skipMerge = table ? getTableMergeSkipKeys(table) : null;
        for (let i = 0; i < jsonCols.length; i++) {
          const k = jsonCols[i];
          const v = row[k];
          if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
            flattenDataColumn(row, k, v, skipMerge);
          }
        }
      }
      coerceBooleanCols(row, table);
      return row;
    }

    for (let i = 0; i < dateCols.length; i++) {
      const k = dateCols[i];
      const v = row[k];
      if (v instanceof Date) {
        row[k] = v.toISOString();
      } else if (v && typeof v === "object" && typeof (v as any).getTime === "function") {
        row[k] = new Date((v as any).getTime()).toISOString();
      } else if (isEpochMs(v)) {
        // SQLite raw reads return INTEGER ms — normalize to ISODateString.
        row[k] = new Date(v).toISOString();
      } else if (isPgTimestampString(v)) {
        // postgres.js timestamptz "2026-08-09 22:25:38.488+00" — normalize.
        row[k] = pgTimestampToIso(v);
      }
    }
    if (!skipJson && jsonCols && jsonCols.length > 0) {
      const skipMerge = table ? getTableMergeSkipKeys(table) : null;
      for (let i = 0; i < jsonCols.length; i++) {
        const k = jsonCols[i];
        const v = normalizeJsonFieldValue(row[k], options);
        flattenDataColumn(row, k, v, skipMerge);
        row[k] = v;
      }
    }
    coerceBooleanCols(row, table);
    return row;
  }

  const result: any = {};

  if (dateCols && dateCols.length > 0) {
    // 🚀 2027 FAST PATH: Only convert known date columns
    for (let i = 0; i < dateCols.length; i++) {
      const k = dateCols[i];
      const v = row[k];
      if (v instanceof Date) {
        result[k] = v.toISOString();
      } else if (v && typeof v === "object" && typeof (v as any).getTime === "function") {
        result[k] = new Date((v as any).getTime()).toISOString();
      } else if (isEpochMs(v)) {
        result[k] = new Date(v).toISOString();
      } else if (isPgTimestampString(v)) {
        result[k] = pgTimestampToIso(v);
      } else {
        result[k] = v;
      }
    }
  }

  if (!skipJson && jsonCols && jsonCols.length > 0) {
    const skipMerge = table ? getTableMergeSkipKeys(table) : null;
    for (let i = 0; i < jsonCols.length; i++) {
      const k = jsonCols[i];
      const v = normalizeJsonFieldValue(row[k], options);
      flattenDataColumn(result, k, v, skipMerge);
      result[k] = v;
    }
  }

  // Copy remaining keys (neither date nor JSON) — only if schema registered
  if (dateCols) {
    // With schema: copy non-date, non-json keys (cached skipKeys Set — zero per-row allocation)
    const skipKeys = _tableSkipKeys.get(table!) || new Set([...dateCols, ...(jsonCols || [])]);
    for (const k in row) {
      if (!Object.hasOwn(row, k)) continue;
      if (skipKeys.has(k) || result[k] !== undefined) continue;
      result[k] = row[k];
    }
  } else {
    // No schema: fallback to full iteration (backward compatible)
    for (const k in row) {
      if (!Object.hasOwn(row, k)) continue;
      if (result[k] !== undefined) continue;
      let v = row[k];
      if (
        v instanceof Date ||
        (v && typeof v === "object" && typeof (v as any).getTime === "function")
      ) {
        v = (v instanceof Date ? v : new Date((v as any).getTime())).toISOString();
      } else if (DATE_FIELDS.has(k) && isEpochMs(v)) {
        // Unregistered table + SQLite INTEGER ms timestamp — still normalize.
        v = new Date(v).toISOString();
      } else if (DATE_FIELDS.has(k) && isPgTimestampString(v)) {
        // Unregistered table + postgres.js timestamptz — still normalize.
        v = pgTimestampToIso(v);
      } else if (JSON_FIELDS.has(k)) {
        v = normalizeJsonFieldValue(v, options);
        flattenDataColumn(result, k, v);
      }
      result[k] = v;
    }
  }

  coerceBooleanCols(result, table);

  return result;
}

export const convertArrayDatesToISO = (
  rows: any[],
  options?: {
    mariaDoubleParseJson?: boolean;
    table?: string;
    inPlace?: boolean;
    skipJson?: boolean;
  },
) => {
  if (!rows || rows.length === 0) return [];
  if (options?.inPlace) {
    for (let i = 0; i < rows.length; i++) {
      rows[i] = convertDatesToISO(rows[i], options);
    }
    return rows;
  }
  return rows.map((r) => convertDatesToISO(r, options));
};

export function convertISOToDates(
  data: any,
  options?: { mariaDoubleParseJson?: boolean; table?: string; inPlace?: boolean },
): any {
  if (!data) return data;
  if (Array.isArray(data)) {
    if (options?.inPlace) {
      for (let i = 0; i < data.length; i++) {
        data[i] = convertISOToDates(data[i], options);
      }
      return data;
    }
    return data.map((d) => convertISOToDates(d, options));
  }

  const result: any = options?.inPlace ? data : Object.assign({}, data);
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
  if (typeof v === "string" && v.length > 0) {
    const c = v.charCodeAt(0);
    if (c === 123 || c === 91 || c === 34) {
      try {
        let parsed: unknown = v;
        for (let i = 0; i < 3; i++) {
          const next = JSON.parse(parsed as string);
          if (next === parsed) break;
          parsed = next;
          if (typeof parsed !== "string") break;
        }
        return parsed as T;
      } catch {
        return (fallback !== undefined ? fallback : v) as T;
      }
    }
  }
  return (v !== undefined && v !== null ? v : fallback !== undefined ? fallback : v) as T;
};

// ============================================================================
// TENANT FILTER LOGIC (centralized)
// ============================================================================

export function shouldBypassTenantCheck(options?: BaseQueryOptions): boolean {
  return hasTenantBypass(options);
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

/**
 * Apply tenant predicate + fail-closed MULTI_TENANT check (SQL/Mongo parity).
 * Single-tenant / bypass paths: near-zero cost.
 */
export function applyTenantFilter(
  conditions: any[],
  tenantCol: any,
  options?: BaseQueryOptions,
): any[] {
  assertTenantContext(options, "sql.applyTenantFilter");
  if (!tenantCol) return conditions;
  const cond = getTenantCondition(tenantCol, options);
  if (cond) conditions.push(cond);
  return conditions;
}

export function applyTenantFilterToObject<T extends Record<string, unknown>>(
  conditions: T,
  options?: BaseQueryOptions,
): T {
  assertTenantContext(options, "sql.applyTenantFilterToObject");
  if (shouldBypassTenantCheck(options)) return conditions;
  const tenantId = getEffectiveTenantId(options);
  if (tenantId === undefined) return conditions;
  return { ...conditions, tenantId } as T;
}

export function applyTenantFilterToMongoQuery<T extends Record<string, unknown>>(
  query: T,
  options?: BaseQueryOptions,
): T {
  assertTenantContext(options, "mongo.applyTenantFilter");
  if (shouldBypassTenantCheck(options)) return query;
  const tenantId = getEffectiveTenantId(options);
  if (tenantId === undefined) return query;
  if ((query as any).tenantId === tenantId) return query;
  return { ...query, tenantId } as T;
}

/**
 * Validate a SQL identifier before embedding in raw SQL (column/JSON key names).
 * Never use for values — bind those as parameters instead.
 *
 * Also enforces Postgres's NAMEDATALEN (63) identifier limit: PG silently
 * truncates longer identifiers, which can collide two distinct names onto one
 * column (PayloadCMS ea0d69d class). 63 is the strictest bound across
 * supported dialects (MySQL 64, SQLite unbounded), so failing here keeps all
 * adapters consistent and fails at DDL time instead of on silent truncation.
 */
const _safeSqlIdentifierSet = new Set<string>();
const SAFE_SQL_IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Physical columns present on every collection table — skip regex after the type check. */
const COMMON_SQL_IDENTIFIERS = new Set([
  "_id",
  "tenantId",
  "status",
  "data",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "isDeleted",
  "slug",
  "locale",
  "collection",
  "publishedAt",
]);

export function assertSafeSqlIdentifier(name: string, label = "field"): string {
  if (typeof name !== "string") {
    throw new Error(`Invalid SQL identifier for ${label}: ${String(name)}`);
  }
  if (COMMON_SQL_IDENTIFIERS.has(name) || _safeSqlIdentifierSet.has(name)) return name;
  if (!SAFE_SQL_IDENTIFIER_REGEX.test(name)) {
    throw new Error(`Invalid SQL identifier for ${label}: ${String(name)}`);
  }
  if (name.length > 63) {
    throw new Error(
      `SQL identifier for ${label} exceeds 63 chars (Postgres NAMEDATALEN) and would be silently truncated: ${name.slice(0, 40)}… (${name.length} chars)`,
    );
  }
  if (_safeSqlIdentifierSet.size < 4096) {
    _safeSqlIdentifierSet.add(name);
  }
  return name;
}

/** Coerce + validate numeric amount for atomicIncrement-style SQL. */
export function assertFiniteAmount(amount: number | string): number {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n)) {
    throw new Error(`atomicIncrement amount must be a finite number, got: ${String(amount)}`);
  }
  return n;
}

/**
 * @deprecated Prefer {@link buildRawTenantClause} with bound parameters.
 * Kept for call sites that still embed filters as literals (quote-escaped only).
 */
export function buildRawTenantFilter(
  options?: BaseQueryOptions,
  dialect: "mysql" | "postgres" | "sqlite" = "sqlite",
): string {
  const { sql } = buildRawTenantClause(options, dialect, { parameterized: false });
  return sql;
}

/**
 * Tenant WHERE fragment for raw SQL paths.
 *
 * Prefer `parameterized: true` (default) and pass `params` to the driver —
 * never interpolate untrusted tenant IDs into SQL strings.
 *
 * Placeholders:
 * - mysql / sqlite → `?`
 * - postgres → `$N` starting at `paramIndex` (default 1)
 */
const EMPTY_TENANT_CLAUSE: { sql: string; params: string[] } = Object.freeze({
  sql: "",
  params: [],
});

export function buildRawTenantClause(
  options?: BaseQueryOptions,
  dialect: "mysql" | "postgres" | "sqlite" = "sqlite",
  opts: { parameterized?: boolean; paramIndex?: number } = {},
): { sql: string; params: string[] } {
  if (options?.bypassTenantCheck || !options?.tenantId || options?.tenantId === "global") {
    return EMPTY_TENANT_CLAUSE;
  }
  const parameterized = opts.parameterized !== false;
  const col = dialect === "mysql" ? "`tenantId`" : `"tenantId"`;
  if (parameterized) {
    if (dialect === "postgres") {
      const idx = opts.paramIndex ?? 1;
      return { sql: ` AND ${col} = $${idx}`, params: [String(options.tenantId)] };
    }
    return { sql: ` AND ${col} = ?`, params: [String(options.tenantId)] };
  }
  // Legacy literal path — quote-escape only (avoid for new code)
  const id = String(options.tenantId).replace(/'/g, "''");
  return { sql: ` AND ${col} = '${id}'`, params: [] };
}

/**
 * Checks if all updates in a batch share identical data payload keys and values,
 * enabling single-query optimizations (e.g. UPDATE ... WHERE _id IN (...)).
 */
export function sameBatchPayload<T>(
  updates: Array<{ data?: Partial<T> | Record<string, unknown> }>,
): boolean {
  if (updates.length <= 1) return true;
  const first = updates[0]?.data as Record<string, unknown> | undefined;
  if (!first) return true;
  const keys = Object.keys(first);
  for (let i = 1; i < updates.length; i++) {
    const next = updates[i]?.data as Record<string, unknown> | undefined;
    if (!next || Object.keys(next).length !== keys.length) return false;
    for (const key of keys) {
      if (next[key] !== first[key]) return false;
    }
  }
  return true;
}
