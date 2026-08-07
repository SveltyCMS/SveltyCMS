/**
 * @file src/databases/core/lookup-query.ts
 * @description Shared primary-key lookup detection for all adapters (SQL + Mongo).
 *
 * Used to route hot `findOne({ _id })` / `findOne({ _id, tenantId })` through
 * the optimized `findById` path (SQLite raw SELECT, Postgres/MariaDB eq+limit,
 * Mongo lean findOne) instead of full query translation.
 *
 * ### Features:
 * - zero-allocation field walk (no Object.keys)
 * - accepts `_id` or `id` with optional `tenantId` only
 * - extract helpers for tenant + id without extra object spreads on miss
 */

/**
 * True when `query` is a pure primary-key lookup:
 * `{ _id }` / `{ id }` optionally with `tenantId` — nothing else.
 */
export function isIdLookupQuery(query: unknown): boolean {
  if (!query || typeof query !== "object" || Array.isArray(query)) return false;

  let count = 0;
  let hasId = false;

  for (const key in query as Record<string, unknown>) {
    count++;
    if (count > 2) return false;
    if (key === "_id" || key === "id") {
      const val = (query as Record<string, unknown>)[key];
      // Reject operator objects ($in, $eq, …) — those need full translation
      if (val !== null && typeof val === "object") return false;
      if (val === undefined || val === null || val === "") return false;
      hasId = true;
    } else if (key !== "tenantId") {
      return false;
    }
  }

  return hasId && count > 0;
}

/**
 * Extract scalar primary key from an id-lookup query, or null if not a lookup.
 */
export function extractLookupId(query: unknown): string | null {
  if (!isIdLookupQuery(query)) return null;
  const q = query as Record<string, unknown>;
  const id = q._id ?? q.id;
  return id == null ? null : String(id);
}

/**
 * Tenant id present on the query object (if any).
 */
export function extractLookupTenantId(query: unknown): string | null | undefined {
  if (!query || typeof query !== "object") return undefined;
  const tid = (query as Record<string, unknown>).tenantId;
  if (tid === undefined) return undefined;
  if (tid === null || tid === "") return null;
  return String(tid);
}
