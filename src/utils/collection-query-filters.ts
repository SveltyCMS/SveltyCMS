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
import {
  compileBooleanFilterGroup,
  decodeBooleanFilterParam,
  type BooleanFilterGroup,
} from "@utils/boolean-filter";

// ─── Constants ───────────────────────────────────────────────────────────────

/** URL query prefix for per-column filters (entry-list / createSmartFilter). */
export const FILTER_URL_PREFIX = "filter_";

/** System columns always allowed for filtering (when present on entries). */
export const SYSTEM_FILTER_FIELDS = ["status", "createdAt", "updatedAt", "_id"] as const;

/** Map Mongo-style / snake_case sort keys onto stored column names. */
const SORT_FIELD_ALIASES: Record<string, string> = {
  _createdAt: "createdAt",
  _updatedAt: "updatedAt",
  created_at: "createdAt",
  updated_at: "updatedAt",
};

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
  /** Multi-column sort in priority order (includes the primary `sort`). */
  sorts: Array<{ field: string; direction: "asc" | "desc" }>;
  filter: CollectionFilterMap;
  /** Advanced AND/OR group from `filterLogic` (null when absent). */
  filterLogic: BooleanFilterGroup | null;
  /** Portable OR equality clauses compiled from filterLogic. */
  orGroups: Array<Record<string, string | number | boolean | null>>;
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
      const sorted: Record<string, unknown> = Object.create(null);
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

/** Field names a schema field can be addressed by (storage name, label, name/path/key). */
function fieldStorageNames(
  field: Partial<FieldInstance> & { label?: string; db_fieldName?: string },
): string[] {
  const names = new Set<string>();
  if (field.db_fieldName) names.add(field.db_fieldName);
  if (field.label) {
    try {
      const name = getFieldName(field as Partial<FieldInstance> & { label: string });
      if (name) names.add(name);
    } catch {
      // ignore malformed field
    }
  }
  const asRecord = field as Record<string, unknown>;
  for (const key of ["name", "path", "key"] as const) {
    const value = asRecord[key];
    if (typeof value === "string" && value) names.add(value);
  }
  return [...names];
}

/**
 * Field ids allowed for filtering: schema fields + system columns.
 * Media / rich-text etc. may still appear in schema; callers that want
 * "safe only" should intersect with createSmartFilter definitions.
 */
export function getAllowedFilterFieldIds(collection: Schema | null | undefined): Set<string> {
  if (!collection) return new Set<string>(SYSTEM_FILTER_FIELDS);
  if ((collection as any)._allowedFilterFieldIds instanceof Set) {
    return (collection as any)._allowedFilterFieldIds as Set<string>;
  }

  const allowed = new Set<string>(SYSTEM_FILTER_FIELDS);

  if (!collection.fields?.length) {
    (collection as any)._allowedFilterFieldIds = allowed;
    return allowed;
  }

  for (const raw of collection.fields) {
    const field = raw as Partial<FieldInstance> & { label?: string; db_fieldName?: string };
    for (const name of fieldStorageNames(field)) allowed.add(name);
  }

  (collection as any)._allowedFilterFieldIds = allowed;
  return allowed;
}

/**
 * Nested-path index: top-level root → every addressable child path below it.
 * Cached on the schema (like the field allow-list) because it is only rebuilt
 * when the schema object is replaced by a recompile.
 */
export type NestedFilterIndex = ReadonlyMap<string, ReadonlySet<string>>;

/** Relative paths of every declared field below `fields`, recursively. */
function collectChildPaths(fields: readonly unknown[]): Set<string> {
  const out = new Set<string>();
  for (const raw of fields) {
    const field = raw as Record<string, unknown>;
    const names = fieldStorageNames(
      field as Partial<FieldInstance> & { label?: string; db_fieldName?: string },
    );
    for (const name of names) out.add(name);
    if (Array.isArray(field.fields)) {
      const children = collectChildPaths(field.fields);
      for (const name of names) {
        for (const child of children) out.add(`${name}.${child}`);
      }
    }
  }
  return out;
}

/**
 * Roots whose stored value is a nested object, mapped to the child paths that
 * exist beneath them, so `meta.title` is accepted and `meta.typo` is not.
 */
export function getNestedFilterPaths(collection: Schema | null | undefined): NestedFilterIndex {
  if (!collection) return new Map<string, ReadonlySet<string>>();
  const cached = (collection as any)._nestedFilterPaths;
  if (cached instanceof Map) return cached as NestedFilterIndex;

  const index = new Map<string, ReadonlySet<string>>();
  for (const raw of collection.fields ?? []) {
    const field = raw as Record<string, unknown>;
    if (!(field.type === "object" || Array.isArray(field.fields))) continue;
    const children = Array.isArray(field.fields)
      ? collectChildPaths(field.fields)
      : new Set<string>();
    for (const name of fieldStorageNames(
      field as Partial<FieldInstance> & { label?: string; db_fieldName?: string },
    )) {
      index.set(name, children);
    }
  }

  (collection as any)._nestedFilterPaths = index;
  return index;
}

/** Mongo-style logical operators that may appear at the top level of a filter. */
const LOGICAL_OPERATOR_KEYS = new Set(["$and", "$or", "$nor", "$not"]);

/** Remove array-index segments (`items.0.title` → `items.title`). */
function withoutArrayIndices(path: string): string {
  if (!path.includes(".")) return path;
  return path
    .split(".")
    .filter((segment) => !/^\d+$/.test(segment))
    .join(".");
}

/**
 * True when `key` addresses a filterable field: an allow-listed name, a logical
 * operator, or a declared dotted path under a nested (object/repeater) root.
 */
export function isFilterablePath(
  key: string,
  allowed: Set<string>,
  nested: NestedFilterIndex,
): boolean {
  if (LOGICAL_OPERATOR_KEYS.has(key)) return true;
  if (allowed.has(key)) return true;
  const dot = key.indexOf(".");
  if (dot <= 0 || dot === key.length - 1) return false;
  const children = nested.get(key.slice(0, dot));
  if (!children) return false;
  return children.has(withoutArrayIndices(key.slice(dot + 1)));
}

/** Keys a caller sent that this schema cannot filter on (empty when all are valid). */
export function rejectedFilterKeys(
  raw: Record<string, unknown> | null | undefined,
  allowed: Set<string>,
  nested: NestedFilterIndex,
): string[] {
  if (!raw || typeof raw !== "object") return [];
  const rejected: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!isFilterablePath(key, allowed, nested)) rejected.push(key);
  }
  return rejected;
}

/** Shared empty index — callers without a schema should not allocate per query. */
const EMPTY_NESTED: NestedFilterIndex = new Map<string, ReadonlySet<string>>();

/**
 * Drop filter keys not in the schema whitelist.
 * Security: never pass unvalidated client field names to the DB layer.
 * Accepts contains / eq / in / isNull / gte+lte shapes.
 */
export function whitelistFilterParams(
  raw: CollectionFilterMap | Record<string, unknown>,
  allowed: Set<string>,
  nested: NestedFilterIndex = EMPTY_NESTED,
): CollectionFilterMap {
  const out: CollectionFilterMap = Object.create(null);
  if (!raw || typeof raw !== "object") return out;

  for (const [key, op] of Object.entries(raw)) {
    if (!isFilterablePath(key, allowed, nested)) continue;
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
    } else if (Array.isArray(o.in) && o.in.length > 0 && o.in.length < 100) {
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
  const rawFilters = parseUrlFilterParams(searchParams);
  const allowed = getAllowedFilterFieldIds(collection);
  const nestedPaths = getNestedFilterPaths(collection);
  const filter = whitelistFilterParams(rawFilters, allowed, nestedPaths);

  const rawSort =
    searchParams.get("sort") || searchParams.get("sortField") || defaults.sortField || "createdAt";
  const sorts = parseSortDescriptors(
    rawSort,
    searchParams.get("order") || searchParams.get("sortDirection"),
    allowed,
    defaults,
  );
  const sort = sorts[0] ?? {
    field: defaults.sortField || "createdAt",
    direction: defaults.sortDirection || "desc",
  };

  const filterLogic = decodeBooleanFilterParam(searchParams.get("filterLogic"));
  let orGroups: Array<Record<string, string | number | boolean | null>> = [];
  if (filterLogic) {
    const compiledLogic = compileBooleanFilterGroup(filterLogic);
    Object.assign(filter, whitelistFilterParams(compiledLogic.andFilter, allowed, nestedPaths));
    orGroups = compiledLogic.orGroups
      .map((group) => {
        const next: Record<string, string | number | boolean | null> = {};
        for (const [k, v] of Object.entries(group)) {
          if (isFilterablePath(k, allowed, nestedPaths)) next[k] = v;
        }
        return next;
      })
      .filter((g) => Object.keys(g).length > 0);
  }

  const queryHash = hashQueryPayload({
    filter,
    search,
    sort,
    sorts,
    filterLogic,
    orGroups,
  });

  return {
    page,
    pageSize,
    search,
    sort,
    sorts,
    filter,
    filterLogic,
    orGroups,
    queryHash,
  };
}

/**
 * Parse `sort=title:asc,createdAt:desc` (multi) or `sort=title&order=asc` (single).
 */
export function parseSortDescriptors(
  rawSort: string,
  rawOrder: string | null,
  allowed: Set<string>,
  defaults: { sortField?: string; sortDirection?: "asc" | "desc" } = {},
): Array<{ field: string; direction: "asc" | "desc" }> {
  const fallbackField = defaults.sortField || "createdAt";
  const fallbackDir: "asc" | "desc" = defaults.sortDirection === "asc" ? "asc" : "desc";

  if (rawSort.includes(",") || rawSort.includes(":")) {
    const out: Array<{ field: string; direction: "asc" | "desc" }> = [];
    for (const part of rawSort.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const [rawField, rawDir] = trimmed.split(":");
      const aliased = SORT_FIELD_ALIASES[rawField] || rawField;
      if (!allowed.has(aliased)) continue;
      const direction: "asc" | "desc" =
        rawDir === "desc" || rawField.startsWith("-") ? "desc" : "asc";
      out.push({ field: aliased, direction });
    }
    return out.length > 0 ? out : [{ field: fallbackField, direction: fallbackDir }];
  }

  const aliasedSort = SORT_FIELD_ALIASES[rawSort] || rawSort;
  const sortField = allowed.has(aliasedSort) ? aliasedSort : fallbackField;
  const sortOrderRaw = (rawOrder || fallbackDir).toLowerCase();
  const direction: "asc" | "desc" = sortOrderRaw === "asc" ? "asc" : "desc";
  return [{ field: sortField, direction }];
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

  // 🛡️ Sanitize inputs to prevent cache key injection via colons
  const sanitize = (s: string | null | undefined) => (s ?? "none").replace(/[:]/g, "");

  const edit = sanitize(editEntryId);
  const tenant = sanitize(tenantId) || "global";
  const user = sanitize(userId) || "anon";
  const lang = sanitize(language);

  return `collection:${collectionId}:query:${queryHash}:page:${page}:size:${pageSize}:lang:${lang}:tenant:${tenant}:user:${user}:edit:${edit}`;
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
      if (typeof name === "string" && name && fieldObj.encrypt !== true) names.push(name);
    }
  }
  names.push("_id", "status", "createdBy", "updatedBy");
  return names;
}
