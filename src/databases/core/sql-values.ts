/**
 * @file src/databases/core/sql-values.ts
 * @description
 * Value normalization, preparation, and default synthesizing for SQL database writes.
 * Implements column date coercion, JSON data payload extraction, timestamp handling,
 * and sparse insert row reconstruction.
 *
 * ### Features:
 * - Pre-computed per-table date-column resolution (getDateColumnKeys)
 * - Dialect-specific date coercion (Date objects vs ISO strings)
 * - Dynamic data blob extraction vs physical column mapping
 * - Insertion default synthesizing (sparse insert reconstruction)
 * - Safe tenant isolation on updates (immutable tenantId)
 * - Pure value-preparation primitives (date detection, coercion, defaults)
 */

import { getTableColumns, getTableName } from "drizzle-orm";
import { hasIsoDateTimePrefix } from "@src/utils/date";
import { convertISOToDates, shouldBypassTenantCheck } from "./relational-utils";
import { setJsonDataPatch } from "./query-primitives";

// ---------------------------------------------------------------------------
// Pure value-preparation primitives (shared by every SQL dialect)
// ---------------------------------------------------------------------------

/** Physical column metadata used by the date-column heuristics. */
interface DateColumnMetadata {
  dataType?: unknown;
  columnType?: unknown;
  config?: {
    dataType?: unknown;
    columnType?: unknown;
  } | null;
}

/** One client-side default to apply when an INSERT omits the column. */
export interface InsertDefaultEntry {
  name: string;
  def?: unknown;
  isBooleanDef?: boolean;
  defaultFn?: () => unknown;
  isTimestamp?: boolean;
}

/**
 * True when the column name is one of the always-temporal pair or carries a
 * date/time-looking suffix (`createdAt`, `publishDate`, `startTime`, …).
 */
export function isDateLikeColumnName(name: string): boolean {
  return (
    name === "createdAt" ||
    name === "updatedAt" ||
    name.includes("Date") ||
    name.includes("date") ||
    name.includes("At") ||
    name.includes("Time") ||
    name.includes("time")
  );
}

/**
 * The historical per-key date predicate: `createdAt`/`updatedAt` always count,
 * everything else only when the name looks temporal AND the column metadata
 * says date/timestamp. Preserved exactly so writes do not start coercing TEXT
 * columns that merely end in `Date`/`At`.
 */
export function isDateColumnKey(name: string, column: unknown): boolean {
  const isSpecialTimestamp = name === "createdAt" || name === "updatedAt";
  if (isSpecialTimestamp) return true;
  if (!isDateLikeColumnName(name)) return false;
  const col = column as DateColumnMetadata | null | undefined;
  return Boolean(
    col?.dataType === "date" ||
    (col?.columnType && String(col.columnType).includes("Timestamp")) ||
    col?.config?.dataType === "date" ||
    (col?.config?.columnType && String(col.config.columnType).includes("Timestamp")),
  );
}

/**
 * Date-column key set for a table def, evaluated once per table instead of per
 * key per write. The caller caches the result; this function is pure.
 */
export function collectDateColumnKeys(schemaCols: Record<string, unknown>): Set<string> {
  const keys = new Set<string>();
  for (const name in schemaCols) {
    if (!Object.hasOwn(schemaCols, name)) continue;
    if (isDateColumnKey(name, schemaCols[name])) keys.add(name);
  }
  return keys;
}

/**
 * Coerce a caller-supplied temporal value to the dialect's bind shape:
 *
 * - `persistTimestampsAsDate` engines (SQLite) store `Date` objects, so numeric
 *   epochs and ISO strings are converted to `Date`.
 * - ISO-bind engines (PostgreSQL) store text, so `Date` instances and numeric
 *   epochs become ISO strings.
 *
 * Unrecognized values are returned unchanged.
 */
export function coerceDateBindValue(value: unknown, persistTimestampsAsDate: boolean): unknown {
  if (persistTimestampsAsDate) {
    if (typeof value === "number" && value > 0) return new Date(value);
    if (typeof value === "string" && hasIsoDateTimePrefix(value)) {
      const ts = Date.parse(value);
      if (!Number.isNaN(ts)) return new Date(ts);
    }
    return value;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && value > 0) return new Date(value).toISOString();
  return value;
}

/** Objects (but never `null` or `Date`) must be JSON-serialized for TEXT columns. */
export function isJsonSerializableValue(value: unknown): boolean {
  return typeof value === "object" && value !== null && !(value instanceof Date);
}

/**
 * Build the insert-default plan for a table's column map. Cached by the
 * adapter in a `WeakMap` keyed on the column object.
 */
export function buildInsertDefaultsPlan(tableCols: Record<string, unknown>): InsertDefaultEntry[] {
  const plan: InsertDefaultEntry[] = [];
  for (const name in tableCols) {
    if (!Object.hasOwn(tableCols, name)) continue;
    const col = tableCols[name] as {
      default?: unknown;
      defaultFn?: () => unknown;
    };
    const def = col.default;
    const isTimestamp = name === "createdAt" || name === "updatedAt";
    if (
      def !== undefined &&
      (typeof def !== "object" || Object.getPrototypeOf(def) === Object.prototype)
    ) {
      plan.push({
        name,
        def,
        isBooleanDef: typeof def === "boolean",
      });
    } else if (typeof col.defaultFn === "function") {
      plan.push({
        name,
        defaultFn: col.defaultFn,
      });
    } else if (isTimestamp) {
      plan.push({
        name,
        isTimestamp: true,
      });
    }
  }
  return plan;
}

/**
 * Apply a plan to prepared values, leaving columns with neither a value nor a
 * default out of the INSERT entirely (DB DEFAULT applies). `stamp` is called
 * lazily and at most once for the `createdAt`/`updatedAt` pair.
 */
export function applyInsertDefaults(
  values: Record<string, unknown>,
  plan: readonly InsertDefaultEntry[],
  stamp: () => Date | string,
  opts?: { intBooleans?: boolean; inPlace?: boolean },
): Record<string, unknown> {
  const result: Record<string, unknown> = opts?.inPlace ? values : { ...values };
  let stamped: Date | string | undefined;
  for (let i = 0; i < plan.length; i++) {
    const item = plan[i];
    const name = item.name;
    if (result[name] !== undefined) continue;

    if (item.isTimestamp) {
      result[name] = stamped ??= stamp();
    } else if (item.defaultFn) {
      result[name] = item.defaultFn();
    } else if (item.def !== undefined) {
      result[name] = opts?.intBooleans && item.isBooleanDef ? (item.def ? 1 : 0) : item.def;
    }
  }
  return result;
}

/**
 * Structural contract required by the value preparation pipeline.
 */
export interface SqlValuesContext {
  readonly persistTimestampsAsDate: boolean;
  readonly shouldJsonSerializeInPrepare: boolean;
  readonly convertDatesOptions: Record<string, any>;
  getTableColumnsCache(): Map<any, Record<string, any>>;
  getDateKeyCache(): WeakMap<object, Set<string>>;
  getInsertDefaultsPlanCache(): WeakMap<object, InsertDefaultEntry[]>;
  getColumn(table: any, name: string): any;
  writeNow(): Date | string;
}

/**
 * Date-column key set for a table def — mirrors the original per-key
 * predicate exactly (createdAt/updatedAt always; name-suffix heuristic AND
 * date/timestamp column metadata otherwise) but evaluated ONCE per table def
 * instead of per key per write.
 */
export function getSqlDateColumnKeys(
  ctx: SqlValuesContext,
  schemaCols: Record<string, any>,
): Set<string> {
  const cache = ctx.getDateKeyCache();
  let keys = cache.get(schemaCols);
  if (keys) return keys;

  keys = collectDateColumnKeys(schemaCols);
  cache.set(schemaCols, keys);
  return keys;
}

/**
 * Retrieve or build the insert defaults execution plan for a table's columns.
 */
export function getSqlInsertDefaultsPlan(
  ctx: SqlValuesContext,
  tableCols: Record<string, any>,
): InsertDefaultEntry[] {
  const cache = ctx.getInsertDefaultsPlanCache();
  let plan = cache.get(tableCols);
  if (plan) return plan;

  plan = buildInsertDefaultsPlan(tableCols);
  cache.set(tableCols, plan);
  return plan;
}

/**
 * Reconstruct the inserted row from prepared values + column defaults.
 * Sparse: omit columns with neither a value nor a client-side default so
 * the INSERT lists only bound params.
 */
export function synthesizeSqlInsertRow(
  ctx: SqlValuesContext,
  table: any,
  values: Record<string, any>,
  opts?: { intBooleans?: boolean },
): Record<string, any> {
  const colsCache = ctx.getTableColumnsCache();
  const cached = colsCache.get(table);
  const tableCols = cached ?? getTableColumns(table);
  if (!cached && tableCols) colsCache.set(table, tableCols as any);
  if (!tableCols) return { ...values };

  const plan = getSqlInsertDefaultsPlan(ctx, tableCols);
  let now: Date | string | undefined;
  return applyInsertDefaults(values, plan, () => (now ??= ctx.writeNow()), {
    ...opts,
    inPlace: true,
  });
}

/**
 * Prepare values for SQL write operations. Handles date coercions, physical vs JSON
 * data blob separation, timestamps, and tenant immutability.
 */
export function prepareSqlValues(
  ctx: SqlValuesContext,
  table: any,
  data: any,
  id: any,
  now: Date | string,
  options: any,
  isUpdateOverride = false,
): any {
  const isUpdate =
    isUpdateOverride || options?.isUpdate === true || options?.operation === "update";
  const values: any = {};
  if (id && !isUpdate) {
    values._id = id;
  }

  const colsCache = ctx.getTableColumnsCache();
  let schemaCols: Record<string, any> | undefined = colsCache.get(table);
  if (!schemaCols) {
    try {
      const resolvedCols = getTableColumns(table);
      if (resolvedCols && Object.keys(resolvedCols).length > 0) {
        schemaCols = resolvedCols as any;
        colsCache.set(table, schemaCols!);
      }
    } catch {
      /* safe fallback */
    }
  }

  const dateKeys = schemaCols ? getSqlDateColumnKeys(ctx, schemaCols) : null;
  const hasDataCol = schemaCols ? schemaCols["data"] : ctx.getColumn(table, "data");
  let dynamicData: Record<string, unknown> | null = null;
  let hasDynamicKeys = false;

  for (const k in data) {
    if (!Object.hasOwn(data, k)) continue;
    if (k === "_id" || k === "id") continue;
    if (isUpdate && k === "createdAt") continue;
    if (isUpdate && k === "tenantId" && !shouldBypassTenantCheck(options)) continue;

    const isPhysical = schemaCols ? schemaCols[k] : ctx.getColumn(table, k);

    if (isPhysical) {
      if (data[k] !== undefined) {
        let val = data[k];
        let isDateColumn = false;
        if (dateKeys) {
          isDateColumn = dateKeys.has(k);
        } else {
          isDateColumn = isDateColumnKey(k, isPhysical);
        }

        if (isDateColumn) {
          val = coerceDateBindValue(val, ctx.persistTimestampsAsDate);
        } else if (ctx.shouldJsonSerializeInPrepare && isJsonSerializableValue(val)) {
          val = JSON.stringify(val);
        }
        values[k] = val;
      }
    } else if (hasDataCol && k !== "tenantId" && k !== "createdAt" && k !== "updatedAt") {
      if (!dynamicData) dynamicData = {};
      dynamicData[k] = data[k];
      hasDynamicKeys = true;
    }
  }

  if (id && !isUpdate) {
    const idCol = schemaCols
      ? schemaCols["_id"] || schemaCols["id"]
      : ctx.getColumn(table, "_id") || ctx.getColumn(table, "id");
    if (idCol) {
      values[idCol.name] = id;
    }
  }

  if (
    !isUpdate &&
    options?.tenantId &&
    (schemaCols ? schemaCols["tenantId"] : ctx.getColumn(table, "tenantId"))
  ) {
    values.tenantId = options.tenantId;
  }

  if (
    !isUpdate &&
    (schemaCols ? schemaCols["createdAt"] : ctx.getColumn(table, "createdAt")) &&
    values.createdAt === undefined
  ) {
    values.createdAt = now;
  }
  if (schemaCols ? schemaCols["updatedAt"] : ctx.getColumn(table, "updatedAt")) {
    values.updatedAt = now;
  }

  if (
    (schemaCols ? schemaCols["collection"] : ctx.getColumn(table, "collection")) &&
    "collection" in data
  ) {
    values.collection = data.collection;
  }

  if (schemaCols ? schemaCols["publishedAt"] : ctx.getColumn(table, "publishedAt")) {
    const pubAt = data.publishedAt || data.metadata?.publishedAt;
    if (pubAt !== undefined) {
      values.publishedAt = pubAt;
    }
  }

  if ((schemaCols ? schemaCols["slug"] : ctx.getColumn(table, "slug")) && "slug" in data) {
    values.slug = data.slug;
  }
  if ((schemaCols ? schemaCols["locale"] : ctx.getColumn(table, "locale")) && "locale" in data) {
    values.locale = data.locale;
  }

  if (hasDataCol && (!isUpdate || hasDynamicKeys || "data" in data)) {
    const resolvedDynamic = dynamicData ?? {};
    const suppliedPhysicalData = values.data !== undefined;
    if (!suppliedPhysicalData) {
      values.data = ctx.shouldJsonSerializeInPrepare
        ? JSON.stringify(resolvedDynamic) || "{}"
        : resolvedDynamic;
    }
    if (
      !suppliedPhysicalData &&
      isUpdate &&
      hasDynamicKeys &&
      (options as { replaceData?: boolean })?.replaceData !== true
    ) {
      setJsonDataPatch(values, resolvedDynamic);
    }
  }

  if (!ctx.persistTimestampsAsDate) {
    return values;
  }

  const result = convertISOToDates(values, {
    ...ctx.convertDatesOptions,
    table: getTableName(table),
  });

  return result;
}
