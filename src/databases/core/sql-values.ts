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
 */

import { getTableColumns, getTableName } from "drizzle-orm";
import {
  applyInsertDefaults,
  buildInsertDefaultsPlan,
  coerceDateBindValue,
  collectDateColumnKeys,
  isDateColumnKey,
  isJsonSerializableValue,
  type InsertDefaultEntry,
} from "../sql/value-preparation";
import { convertISOToDates, shouldBypassTenantCheck } from "./relational-utils";
import { setJsonDataPatch } from "./query-primitives";

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
  return applyInsertDefaults(values, plan, () => (now ??= ctx.writeNow()), opts);
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
