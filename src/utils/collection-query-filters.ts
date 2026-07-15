/**
 * @file src/utils/collection-query-filters.ts
 * @description
 * Database-agnostic helpers for collection list query params, filter
 * whitelisting, and stable cache-key fragments.
 *
 * Used by:
 * - SSR loaders (`+page.server.ts`) — parse `filter_*` + `search` URL params
 * - `CollectionService` — stable L1/L2 cache keys with filter hashes
 * - `createSmartFilter` — shared prefix + query shape (no DB imports)
 *
 * ### Features:
 * - URL param parsing (`filter_{field}`, `search`, sort)
 * - Schema field whitelist (never trust client field names)
 * - Stable serialization + short hash for cache keys
 * - Adapter-agnostic filter payload `{ field: { contains } }`
 *
 * @see docs/reference/architecture/cache-system.mdx
 * @see docs/reference/api/content.mdx
 * @see docs/reference/components/entry-list.mdx
 */

import type { FieldInstance, Schema } from "@src/content/types";
import { getFieldName } from "@utils/schema/field-utils";

// ─── Constants ───────────────────────────────────────────────────────────────

/** URL query prefix for per-column filters (entry-list / createSmartFilter). */
export const FILTER_URL_PREFIX = "filter_";

/** System columns always allowed for filtering (when present on entries). */
export const SYSTEM_FILTER_FIELDS = ["status", "createdAt", "updatedAt", "_id"] as const;

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Adapter-agnostic per-field filter operators.
 * URL layer often sends `{ contains: string }`; advanced clients may send eq/in/isNull/gte/lte.
 */
export type CollectionFilterOp =
  | { contains: string }
  | { eq: string | number | boolean }
  | { in: Array<string | number | boolean> }
  | { isNull: boolean }
  | { gte?: string | number; lte?: string | number }
  | string;

/** Map of field id → operator, ready for QueryBuilder / CollectionService. */
export type CollectionFilterMap = Record<string, CollectionFilterOp>;

export interface ParsedCollectionQuery {
  page: number;
  pageSize: number;
  search: string;
  sort: { field: string; direction: "asc" | "desc" };
  filter: CollectionFilterMap;
  /** Short hash of filter+search+sort for cache keys */
  queryHash: string;
}

export interface BuildCollectionCacheKeyParams {
  collectionId: string;
  page: number;
  pageSize: number;
  queryHash: string;
  language: string;
  tenantId?: string | null;
  userId?: string;
  editEntryId?: string | null;
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Stable JSON serialization with sorted object keys.
 * Prevents cache key drift when filter key insertion order differs.
 */
export function stableSerialize(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const obj = val as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(obj).sort()) {
        sorted[k] = obj[k];
      }
      return sorted;
    }
    return val;
  });
}

/**
 * Portable short hash (djb2a) for cache key fragments.
 * Not cryptographic — only for key bucketing / uniqueness.
 */
export function hashQueryPayload(payload: unknown): string {
  const str = typeof payload === "string" ? payload : stableSerialize(payload);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  // Unsigned 32-bit hex
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Field ids allowed for filtering: schema fields + system columns.
 * Media / rich-text etc. may still appear in schema; callers that want
 * "safe only" should intersect with createSmartFilter definitions.
 */
export function getAllowedFilterFieldIds(collection: Schema | null | undefined): Set<string> {
  const allowed = new Set<string>(SYSTEM_FILTER_FIELDS);

  if (!collection?.fields?.length) return allowed;

  for (const raw of collection.fields) {
    const field = raw as Partial<FieldInstance> & { label?: string; db_fieldName?: string };
    if (field.db_fieldName) {
      allowed.add(field.db_fieldName);
    }
    if (field.label) {
      try {
        const name = getFieldName(field as Partial<FieldInstance> & { label: string });
        if (name) allowed.add(name);
      } catch {
        // ignore malformed field
      }
    }
    const asRecord = field as Record<string, unknown>;
    for (const key of ["name", "path", "key"] as const) {
      const v = asRecord[key];
      if (typeof v === "string" && v) allowed.add(v);
    }
  }

  return allowed;
}

/**
 * Drop filter keys not in the schema whitelist.
 * Security: never pass unvalidated client field names to the DB layer.
 * Accepts contains / eq / in / isNull / gte+lte shapes.
 */
export function whitelistFilterParams(
  raw: CollectionFilterMap | Record<string, unknown>,
  allowed: Set<string>,
): CollectionFilterMap {
  const out: CollectionFilterMap = {};
  for (const [key, op] of Object.entries(raw || {})) {
    if (!allowed.has(key)) continue;
    if (op == null) continue;

    if (typeof op === "string") {
      const value = op.trim();
      if (value) out[key] = { contains: value };
      continue;
    }
    if (typeof op !== "object") continue;
    const o = op as Record<string, unknown>;

    if (typeof o.contains === "string" && o.contains.trim()) {
      out[key] = { contains: o.contains.trim() };
    } else if (o.eq !== undefined && o.eq !== null && String(o.eq).trim() !== "") {
      out[key] = { eq: o.eq as string | number | boolean };
    } else if (Array.isArray(o.in) && o.in.length > 0) {
      out[key] = { in: o.in as Array<string | number | boolean> };
    } else if (typeof o.isNull === "boolean") {
      out[key] = { isNull: o.isNull };
    } else if (o.gte != null || o.lte != null) {
      out[key] = {
        gte: o.gte as string | number | undefined,
        lte: o.lte as string | number | undefined,
      };
    }
  }
  return out;
}

/**
 * Parse `filter_{field}=value` pairs from URLSearchParams into a filter map.
 * Does **not** whitelist — call `whitelistFilterParams` with schema ids next.
 */
export function parseUrlFilterParams(searchParams: URLSearchParams): CollectionFilterMap {
  const filter: CollectionFilterMap = {};

  for (const [key, value] of searchParams.entries()) {
    if (!key.startsWith(FILTER_URL_PREFIX)) continue;
    const filterKey = key.slice(FILTER_URL_PREFIX.length);
    if (!filterKey || !value?.trim()) continue;

    // Soft date sanity check (keep invalid dates out of the query)
    if (
      (filterKey === "createdAt" || filterKey === "updatedAt") &&
      Number.isNaN(Date.parse(value)) &&
      !/^\d+$/.test(value)
    ) {
      continue;
    }

    filter[filterKey] = { contains: value.trim() };
  }

  return filter;
}

/**
 * Parse full collection list query from a page URL (search, page, filters, sort).
 */
export function parseCollectionListQuery(
  searchParams: URLSearchParams,
  collection: Schema | null | undefined,
  defaults: { pageSize?: number; sortField?: string; sortDirection?: "asc" | "desc" } = {},
): ParsedCollectionQuery {
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.max(
    1,
    Math.min(500, Number(searchParams.get("pageSize") ?? defaults.pageSize ?? 10) || 10),
  );
  const search = (searchParams.get("search") || "").trim();
  const sortField = searchParams.get("sort") || defaults.sortField || "_createdAt";
  const sortOrderRaw = (
    searchParams.get("order") ||
    defaults.sortDirection ||
    "desc"
  ).toLowerCase();
  const direction: "asc" | "desc" = sortOrderRaw === "asc" ? "asc" : "desc";

  const rawFilters = parseUrlFilterParams(searchParams);
  const allowed = getAllowedFilterFieldIds(collection);
  const filter = whitelistFilterParams(rawFilters, allowed);

  const queryHash = hashQueryPayload({ filter, search, sort: { field: sortField, direction } });

  return {
    page,
    pageSize,
    search,
    sort: { field: sortField, direction },
    filter,
    queryHash,
  };
}

/**
 * Build a prefix-bucketed collection query cache key.
 *
 * Pattern: `collection:{id}:query:{hash}:page:{n}:size:{s}:lang:{l}:tenant:{t}:user:{u}`
 *
 * Prefix `collection:{id}:` enables O(1) invalidation via
 * `cacheService.invalidateCollection(id)` / `clearByPattern("collection:{id}:")`.
 *
 * @see docs/reference/architecture/cache-system.mdx — Prefix-Bucketed Invalidation
 */
export function buildCollectionQueryCacheKey(params: BuildCollectionCacheKeyParams): string {
  const {
    collectionId,
    page,
    pageSize,
    queryHash,
    language,
    tenantId = null,
    userId = "anon",
    editEntryId = null,
  } = params;

  const edit = editEntryId || "none";
  const tenant = tenantId ?? "global";

  return `collection:${collectionId}:query:${queryHash}:page:${page}:size:${pageSize}:lang:${language}:tenant:${tenant}:user:${userId}:edit:${edit}`;
}

/**
 * Searchable field names for global FTS within a collection (list + count).
 */
export function getSearchableFieldNames(collection: Schema | null | undefined): string[] {
  const names: string[] = [];
  if (collection?.fields?.length) {
    for (const field of collection.fields) {
      const fieldObj = field as Record<string, unknown>;
      const name = (fieldObj.name || fieldObj.path || fieldObj.key || fieldObj.db_fieldName) as
        | string
        | null;
      if (typeof name === "string" && name) names.push(name);
    }
  }
  names.push("_id", "status", "createdBy", "updatedBy");
  return names;
}
