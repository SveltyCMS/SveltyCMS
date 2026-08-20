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

export interface IdLookupResult {
  id: string;
  tenantId?: string | null;
}

/**
 * Single-pass primary key lookup parser.
 * Returns `{ id, tenantId }` if the query is `{ _id }` / `{ id }` with optional `tenantId`,
 * or `null` if the query contains other filters/operators needing full translation.
 */
export function parseIdLookup(query: unknown): IdLookupResult | null {
  if (!query || typeof query !== "object" || Array.isArray(query)) return null;

  let count = 0;
  let id: string | null = null;
  let tenantId: string | null | undefined = undefined;

  for (const key in query as Record<string, unknown>) {
    count++;
    if (count > 2) return null;
    if (key === "_id" || key === "id") {
      const val = (query as Record<string, unknown>)[key];
      // Reject operator objects ($in, $eq, …) — those need full translation
      if (val !== null && typeof val === "object") return null;
      if (val === undefined || val === null || val === "") return null;
      id = String(val);
    } else if (key === "tenantId") {
      const tid = (query as Record<string, unknown>).tenantId;
      if (tid === undefined) {
        tenantId = undefined;
      } else if (tid === null || tid === "") {
        tenantId = null;
      } else {
        tenantId = String(tid);
      }
    } else {
      return null;
    }
  }

  if (id === null || count === 0) return null;
  return tenantId !== undefined ? { id, tenantId } : { id };
}

/**
 * True when `query` is a pure primary-key lookup:
 * `{ _id }` / `{ id }` optionally with `tenantId` — nothing else.
 */
export function isIdLookupQuery(query: unknown): boolean {
  return parseIdLookup(query) !== null;
}

/**
 * Extract scalar primary key from an id-lookup query, or null if not a lookup.
 */
export function extractLookupId(query: unknown): string | null {
  return parseIdLookup(query)?.id ?? null;
}

/**
 * Tenant id present on the query object (if any).
 */
export function extractLookupTenantId(query: unknown): string | null | undefined {
  return parseIdLookup(query)?.tenantId;
}
