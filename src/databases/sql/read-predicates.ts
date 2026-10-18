/**
 * @file src/databases/sql/read-predicates.ts
 * @description
 * Pure predicates shared by the SQL read paths: soft-delete row detection for
 * raw point reads and filter introspection for the automatic live-row clamp.
 *
 * ### Features:
 * - normalized `isDeleted` truthiness across SQLite (0/1), PostgreSQL/MariaDB
 *   (boolean) and stringified wire payloads
 * - top-level and `$and`-nested `isDeleted` detection (the keyset merge wraps
 *   the caller filter in `$and`, so an explicit trash filter must still win)
 */

/** True when a raw point-read row carries the soft-delete flag set. */
export function isSoftDeletedRow(row: unknown): boolean {
  const value = (row as { isDeleted?: unknown } | null | undefined)?.isDeleted;
  return value === true || value === 1 || value === "1" || value === "true";
}

/**
 * True when a filter already pins `isDeleted` — top level or inside `$and`.
 * An explicit filter wins over the automatic live-row clamp.
 */
export function queryHasSoftDeleteKey(query: unknown): boolean {
  if (!query || typeof query !== "object") return false;
  const rec = query as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(rec, "isDeleted")) return true;
  const and = rec.$and;
  if (Array.isArray(and)) {
    for (let i = 0; i < and.length; i++) {
      if (queryHasSoftDeleteKey(and[i])) return true;
    }
  }
  return false;
}
