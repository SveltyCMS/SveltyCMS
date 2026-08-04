/**
 * @file src/databases/core/page-utils.ts
 * @description
 * Shared pure helpers for findPage (limit+1 hasMore) and count mode resolution.
 * Used by SQL and Mongo adapters so product semantics stay engine-agnostic.
 *
 * ### Features:
 * - empty-filter detection (zero Object.keys allocation path)
 * - estimate eligibility for count(mode)
 * - limit+1 → FindPageResult slicing
 */

import type { BaseEntity, CountMode, FindPageResult } from "../db-interface";

/** True when the caller supplied no filter keys (empty object / null / undefined). */
export function isEmptyQueryFilter(query: unknown): boolean {
  if (query === undefined || query === null) return true;
  if (typeof query !== "object" || Array.isArray(query)) return false;
  for (const _k in query as object) {
    if (Object.prototype.hasOwnProperty.call(query, _k)) return false;
  }
  return true;
}

/**
 * Whether count may use metadata/stats estimate instead of exact scan.
 * Estimate is only safe for unfiltered, untenanted, non-soft-delete-scoped calls —
 * otherwise multi-tenant isolation would return the wrong cardinality.
 */
export function shouldUseEstimateCount(
  query: unknown,
  options?: {
    mode?: CountMode;
    tenantId?: string | null;
    includeDeleted?: boolean;
  },
): boolean {
  const mode = options?.mode ?? "auto";
  if (mode === "exact") return false;
  if (mode !== "estimate" && mode !== "auto") return false;
  if (!isEmptyQueryFilter(query)) return false;
  // Tenant-scoped counts must be exact (or cached) — never whole-table stats.
  if (options?.tenantId !== undefined && options.tenantId !== null && options.tenantId !== "") {
    return false;
  }
  if (options?.includeDeleted) return false;
  return true;
}

export const DEFAULT_PAGE_SIZE = 50;

/**
 * Build a FindPageResult from a limit+1 row fetch.
 * Pure — no DB access.
 */
export function buildFindPageResult<T extends BaseEntity>(
  rows: T[],
  pageSize: number,
  totalMeta?: { total: number; estimated: boolean },
): FindPageResult<T> {
  const size = pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
  const hasMore = rows.length > size;
  const items = hasMore ? rows.slice(0, size) : rows;
  const last = items.length > 0 ? items[items.length - 1] : undefined;
  const nextCursor =
    hasMore && last && (last as any)._id !== undefined && (last as any)._id !== null
      ? String((last as any)._id)
      : undefined;

  const result: FindPageResult<T> = {
    items,
    hasMore,
    pageSize: size,
  };
  if (nextCursor !== undefined) result.nextCursor = nextCursor;
  if (totalMeta) {
    result.total = totalMeta.total;
    if (totalMeta.estimated) result.totalEstimated = true;
  }
  return result;
}
