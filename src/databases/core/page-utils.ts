/**
 * @file src/databases/core/page-utils.ts
 * @description
 * Shared pure helpers for findPage (limit+1 hasMore), keyset cursors, and count modes.
 * Used by SQL and Mongo adapters so product semantics stay engine-agnostic.
 *
 * ### Features:
 * - empty-filter detection (zero Object.keys allocation path)
 * - estimate eligibility for count(mode)
 * - opaque keyset cursor encode/decode (id + optional sort field)
 * - merge keyset into Mongo-style query filters (SQL mapQuery understands $lt/$gt/$or/$and)
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

/** Opaque keyset payload (encoded into nextCursor). */
export interface PageCursorPayload {
  /** Last row `_id` */
  id: string;
  /** Sort field when not pure `_id` keyset */
  f?: string;
  /** Sort field value at the cursor row */
  v?: string | number | boolean | null;
  /** Sort direction (default desc) */
  d?: "asc" | "desc";
}

export interface ResolvedPageSort {
  field: string;
  direction: "asc" | "desc";
}

/** Normalize FindOptions.sort into a single primary field + direction. */
export function resolvePageSort(sort?: unknown): ResolvedPageSort {
  if (!sort) return { field: "_id", direction: "desc" };
  if (typeof sort === "string") {
    const desc = sort.startsWith("-");
    return { field: desc ? sort.slice(1) : sort, direction: desc ? "desc" : "asc" };
  }
  if (Array.isArray(sort) && sort.length > 0) {
    const first = sort[0] as any;
    if (typeof first === "string") {
      const desc = first.startsWith("-");
      return { field: desc ? first.slice(1) : first, direction: desc ? "desc" : "asc" };
    }
    if (Array.isArray(first) && first.length >= 1) {
      const field = String(first[0]);
      const direction = first[1] === "asc" || first[1] === 1 ? "asc" : "desc";
      return { field, direction };
    }
    if (first && typeof first === "object") {
      const field = String(first.field ?? first.column ?? "_id");
      const direction =
        first.direction === "asc" || first.dir === "asc" || first.order === "asc" ? "asc" : "desc";
      return { field, direction };
    }
  }
  if (typeof sort === "object" && sort !== null && !Array.isArray(sort)) {
    const entries = Object.entries(sort as Record<string, unknown>);
    if (entries.length > 0) {
      const [field, dir] = entries[0];
      const direction = dir === 1 || dir === "asc" || dir === "ASC" ? "asc" : "desc";
      return { field, direction };
    }
  }
  return { field: "_id", direction: "desc" };
}

/**
 * Stable default sort for keyset pagination when caller omits sort.
 * `updatedAt` desc (most recently updated first) — the universal CMS list
 * default and the only default served directly by the (tenantId, updatedAt)
 * composite index on all SQL engines (no temp B-tree sort / filesort).
 * The keyset cursor carries the sort-field value + `_id` tiebreaker, so the
 * non-unique `updatedAt` ordering stays seek-stable across pages.
 */
export function defaultPageSortOption(): { updatedAt: -1 } {
  return { updatedAt: -1 };
}

/**
 * Appends the deterministic `_id` tiebreaker to a sort spec so keyset
 * pagination stays seek-stable.
 *
 * `mergeKeysetFilter` emits a compound (field, _id) cursor — that contract
 * only holds when the ORDER BY uses the SAME secondary `_id` direction. Rows
 * sharing a non-unique sort value (e.g. `updatedAt` set to one timestamp by a
 * bulk seed) previously came back in arbitrary order, so page N+1 overlapped
 * page N (or silently skipped rows). Pure `_id` sorts are already unique and
 * pass through unchanged.
 */
export function withIdTiebreaker(sort: unknown): unknown {
  const primary = resolvePageSort(sort);
  if (primary.field === "_id") return sort;
  const secondary = primary.direction === "asc" ? { _id: 1 } : { _id: -1 };
  if (Array.isArray(sort)) {
    // Tuples / objects array — append the secondary tuple.
    const tuple = primary.direction === "asc" ? ["_id", "asc"] : ["_id", "desc"];
    return [...sort, tuple];
  }
  if (typeof sort === "string") {
    // "-field"/"field" shorthand — convert to an explicit two-key object.
    return primary.direction === "asc"
      ? { [primary.field]: 1, _id: 1 }
      : { [primary.field]: -1, _id: -1 };
  }
  if (sort && typeof sort === "object") {
    return { ...(sort as Record<string, unknown>), ...secondary };
  }
  return { ...(sort as Record<string, unknown>), ...secondary };
}

export function encodePageCursor(payload: PageCursorPayload): string {
  const json = JSON.stringify(payload);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(json, "utf8").toString("base64url");
  }
  // Browser / edge fallback
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodePageCursor(cursor: string | undefined | null): PageCursorPayload | null {
  if (!cursor || typeof cursor !== "string") return null;
  try {
    let json: string;
    if (typeof Buffer !== "undefined") {
      json = Buffer.from(cursor, "base64url").toString("utf8");
    } else {
      const b64 = cursor.replace(/-/g, "+").replace(/_/g, "/");
      json = decodeURIComponent(escape(atob(b64)));
    }
    const parsed = JSON.parse(json) as PageCursorPayload;
    if (!parsed || typeof parsed.id !== "string" || !parsed.id) return null;
    return parsed;
  } catch {
    // Legacy plain _id cursor (pre-keyset)
    if (/^[a-zA-Z0-9_-]{6,128}$/.test(cursor)) {
      return { id: cursor, d: "desc" };
    }
    return null;
  }
}

/**
 * Merge a decoded keyset cursor into a Mongo-style filter.
 * mapQuery on SQL and Mongo both understand $lt/$gt/$or/$and.
 */
export function mergeKeysetFilter(
  query: Record<string, unknown> | undefined | null,
  cursor: PageCursorPayload,
): Record<string, unknown> {
  const base =
    query && typeof query === "object" && !Array.isArray(query)
      ? { ...(query as Record<string, unknown>) }
      : {};
  const direction = cursor.d === "asc" ? "asc" : "desc";
  const cmp = direction === "asc" ? "$gt" : "$lt";
  const field = cursor.f && cursor.f !== "_id" ? cursor.f : "_id";

  let keyset: Record<string, unknown>;
  if (field === "_id") {
    keyset = { _id: { [cmp]: cursor.id } };
  } else {
    // (field, _id) compound keyset — tie-break on _id
    const fieldCmp = { [field]: { [cmp]: cursor.v } };
    const tie = {
      $and: [{ [field]: cursor.v }, { _id: { [cmp]: cursor.id } }],
    };
    keyset = { $or: [fieldCmp, tie] };
  }

  if (isEmptyQueryFilter(base)) return keyset;
  return { $and: [base, keyset] };
}

/**
 * Build a FindPageResult from a limit+1 row fetch.
 * Pure — no DB access.
 */
export function buildFindPageResult<T extends BaseEntity>(
  rows: T[],
  pageSize: number,
  totalMeta?: { total: number; estimated: boolean },
  sort?: ResolvedPageSort,
): FindPageResult<T> {
  const size = pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE;
  const hasMore = rows.length > size;
  const items = hasMore ? rows.slice(0, size) : rows;
  const last = items.length > 0 ? items[items.length - 1] : undefined;

  let nextCursor: string | undefined;
  if (hasMore && last && (last as any)._id !== undefined && (last as any)._id !== null) {
    const field = sort?.field ?? "_id";
    const direction = sort?.direction ?? "desc";
    const payload: PageCursorPayload = {
      id: String((last as any)._id),
      d: direction,
    };
    if (field !== "_id") {
      payload.f = field;
      payload.v = (last as any)[field] ?? null;
    }
    nextCursor = encodePageCursor(payload);
  }

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
