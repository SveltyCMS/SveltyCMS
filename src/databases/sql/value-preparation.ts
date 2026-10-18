/**
 * @file src/databases/sql/value-preparation.ts
 * @description
 * Pure value-preparation helpers shared by every SQL adapter: date/timestamp
 * column detection, temporal bind coercion, JSON-serializable value detection,
 * and the sparse insert-default plan that lets `synthesizeInsertRow` rebuild a
 * row without binding NULLs for unused columns.
 *
 * Nothing here touches a database or adapter instance, so the helpers are
 * trivially testable and the dialect hooks stay in `SqlAdapterCore`.
 *
 * ### Features:
 * - date-column key collection mirroring the historical per-key predicate
 * - ISO ↔ Date bind coercion driven by `persistTimestampsAsDate`
 * - JSON-blob serialization predicate (objects, not Dates/null)
 * - cached-insert-default plan builder + application (intBoolean dialect flag)
 */

import { hasIsoDateTimePrefix } from "@src/utils/date";

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
  opts?: { intBooleans?: boolean },
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...values };
  let stamped: Date | string | undefined;
  const stampOnce = () => (stamped ??= stamp());
  for (let i = 0; i < plan.length; i++) {
    const item = plan[i];
    const name = item.name;
    if (result[name] !== undefined) continue;

    if (item.isTimestamp) {
      result[name] = stampOnce();
    } else if (item.defaultFn) {
      result[name] = item.defaultFn();
    } else if (item.def !== undefined) {
      result[name] = opts?.intBooleans && item.isBooleanDef ? (item.def ? 1 : 0) : item.def;
    }
  }
  return result;
}
