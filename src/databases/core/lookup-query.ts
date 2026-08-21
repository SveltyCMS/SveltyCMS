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
 * - accepts `_id` or `id` with optional `tenantId`, scalar `status`, and `isDeleted: false`
 * - extract helpers for tenant + id without extra object spreads on miss
 */

export interface IdLookupResult {
  id: string;
  tenantId?: string | null;
  /** Scalar equality only (`status: "publish"`). Operator objects need full translation. */
  status?: string;
}

/**
 * Single-pass primary key lookup parser.
 * Returns `{ id, tenantId?, status? }` for `{ _id }` / `{ id }` plus optional
 * `tenantId`, scalar `status`, and `isDeleted: false`.
 * Returns `null` if the query contains other filters/operators.
 */
export function parseIdLookup(query: unknown): IdLookupResult | null {
  if (!query || typeof query !== "object" || Array.isArray(query)) return null;

  let count = 0;
  let id: string | null = null;
  let tenantId: string | null | undefined = undefined;
  let status: string | undefined;

  for (const key in query as Record<string, unknown>) {
    count++;
    if (count > 4) return null;
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
    } else if (key === "status") {
      const st = (query as Record<string, unknown>).status;
      if (typeof st !== "string" || st.length === 0) return null;
      status = st;
    } else if (key === "isDeleted") {
      const del = (query as Record<string, unknown>).isDeleted;
      if (del === false || del === 0 || del === undefined) {
        continue;
      }
      return null;
    } else {
      return null;
    }
  }

  if (id === null || count === 0) return null;
  const out: IdLookupResult = { id };
  if (tenantId !== undefined) out.tenantId = tenantId;
  if (status !== undefined) out.status = status;
  return out;
}

/**
 * After a PK fetch, drop the row when a scalar status predicate does not match.
 * Used so `{ _id, status: "publish" }` stays on the findById ultra path without
 * leaking drafts to publication-clamped callers.
 */
export function applyLookupStatus<T>(row: T | null | undefined, lookup: IdLookupResult): T | null {
  if (row == null) return null;
  if (lookup.status !== undefined && (row as { status?: unknown }).status !== lookup.status) {
    return null;
  }
  return row;
}

/**
 * True when `query` is a primary-key lookup (optional tenantId / scalar status /
 * isDeleted: false).
 */
export function isIdLookupQuery(query: unknown): boolean {
  return parseIdLookup(query) !== null;
}

/** Scalar status predicate on an id-lookup query, if any. */
export function extractLookupStatus(query: unknown): string | undefined {
  return parseIdLookup(query)?.status;
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
