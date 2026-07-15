/**
 * @file src/services/core/collection-filter-engine.ts
 * @description
 * **Core platform capability: schema-driven, secure, cache-aware collection filtering.**
 *
 * Elevates list filtering beyond entry-list UI into a reusable service used by
 * SSR loaders, CollectionService, and (optionally) REST/GraphQL/LocalCMS.
 *
 * ### Guarantees
 * 1. **Schema + widgets** — only fields derived from collection definitions
 * 2. **FLAC** — field-level read permission via `canAccessField` (RBAC roles)
 * 3. **Query-builder safety** — compiles to portable eq / between / search clauses
 *    (never passes raw `{ contains }` objects that break SQL `eq`)
 * 4. **Cacheable** — stable `queryHash` for L1/L2 keys; prefix `collection:{id}:`
 * 5. **Zero frontend deps** — pure compile path is DB-adapter free; apply step
 *    only needs QueryBuilder interface
 *
 * @see docs/reference/architecture/collection-filtering.mdx
 * @see docs/reference/architecture/cache-system.mdx
 */

import type { FieldInstance, Schema } from "@src/content/types";
import type { User } from "@src/databases/auth/types";
import type { QueryBuilder } from "@src/databases/db-interface";
import {
  buildFilterDefinitions,
  parseNumberRange,
  type FilterControlType,
  type SmartFilterDefinition,
} from "@utils/collection-filter-defs";
import {
  getSearchableFieldNames,
  hashQueryPayload,
  type CollectionFilterMap,
} from "@utils/collection-query-filters";
import { canAccessField } from "@utils/field-access";
import { getFieldName } from "@utils/schema/field-utils";
import { logger } from "@utils/logger";

// ─── Types ───────────────────────────────────────────────────────────────────

export type FilterRejectReason =
  | "unknown_field"
  | "unsafe_widget"
  | "field_permission"
  | "invalid_value"
  | "empty";

export interface FilterRejection {
  field: string;
  reason: FilterRejectReason;
  detail?: string;
}

/** Portable IR applied via QueryBuilder methods (adapter-agnostic). */
export interface CompiledCollectionFilter {
  /** Exact match fields → `qb.where({ ... })` */
  equality: Record<string, string | number | boolean>;
  /** Numeric/date ranges → `qb.whereBetween` (both bounds required by adapters) */
  ranges: Array<{ field: string; min: string | number; max: string | number }>;
  /** Multi-value match → `qb.whereIn` */
  inLists: Array<{ field: string; values: Array<string | number | boolean> }>;
  /** Null checks → `qb.whereNull` / `whereNotNull` */
  nullChecks: Array<{ field: string; isNull: boolean }>;
  /**
   * Partial text matches → `qb.search(value, [field])` when no multi-field conflict.
   * Multiple text filters fall back to equality for portable AND semantics.
   */
  textSearch: Array<{ field: string; value: string }>;
  /** Keys dropped during compile (security / validation). */
  rejected: FilterRejection[];
  /** Final allow-list of field ids that survived compile. */
  allowedFieldIds: string[];
  /** Stable hash of accepted filter payload (for cache keys). */
  queryHash: string;
  /** Definitions used (schema ∩ FLAC). */
  definitions: SmartFilterDefinition[];
}

export interface CompileFilterOptions {
  /** When true, log rejected filter keys at debug level. Default true. */
  logRejections?: boolean;
}

export interface ApplyFilterOptions {
  /** Always merged first (e.g. tenantId, _id for edit mode). */
  baseWhere?: Record<string, unknown>;
  /** Global in-collection search string (from `?search=`). */
  globalSearch?: string;
  /** Collection schema for searchable field resolution. */
  collection?: Schema | null;
  /** User for FLAC on searchable fields (optional). */
  user?: User | { _id: string; role: string } | null;
}

// ─── Resolve (schema + FLAC) ─────────────────────────────────────────────────

function fieldById(collection: Schema | null | undefined, id: string): FieldInstance | null {
  if (!collection?.fields?.length) return null;
  for (const raw of collection.fields) {
    const field = raw as FieldInstance;
    const name = field.db_fieldName || getFieldName(field);
    if (name === id) return field;
  }
  return null;
}

/**
 * Filter definitions the user is allowed to use (schema + safe widgets + FLAC read).
 * System fields (status, timestamps) are allowed when includeSystemFields is true.
 */
export function resolveFilterableFields(
  collection: Schema | null | undefined,
  user?: User | { _id: string; role: string } | null,
  options: { includeSystemFields?: boolean } = {},
): SmartFilterDefinition[] {
  const defs = buildFilterDefinitions(collection, {
    includeSystemFields: options.includeSystemFields !== false,
  });

  if (!user) return defs;

  return defs.filter((def) => {
    // System columns are not FieldInstances — allowed for list filtering
    if (
      def.widgetName === "system" ||
      ["status", "createdAt", "updatedAt", "_id"].includes(def.id)
    ) {
      return true;
    }
    const field = fieldById(collection, def.id);
    if (!field) return def.safeForFiltering;
    return canAccessField(field, user, "read");
  });
}

/**
 * Searchable field names restricted by FLAC (for global `?search=`).
 */
export function resolveSearchableFields(
  collection: Schema | null | undefined,
  user?: User | { _id: string; role: string } | null,
): string[] {
  const all = getSearchableFieldNames(collection);
  if (!user || !collection?.fields?.length) return all;

  return all.filter((name) => {
    if (["_id", "status", "createdBy", "updatedBy"].includes(name)) return true;
    const field = fieldById(collection, name);
    if (!field) return true;
    return canAccessField(field, user, "read");
  });
}

// ─── Compile ─────────────────────────────────────────────────────────────────

function parseBoolean(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return null;
}

function parseNumber(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function openUpperBound(sample: string | number): string | number {
  return typeof sample === "number" ? Number.MAX_SAFE_INTEGER : "9999-12-31T23:59:59.999Z";
}

function openLowerBound(sample: string | number): string | number {
  return typeof sample === "number" ? Number.MIN_SAFE_INTEGER : "0000-01-01T00:00:00.000Z";
}

/** Expand a calendar day (YYYY-MM-DD) to inclusive UTC day bounds for whereBetween. */
export function dayBoundsFromDateInput(value: string): { min: string; max: string } | null {
  const v = value.trim();
  // Full day only
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const start = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(`${v}T23:59:59.999Z`);
  return { min: start.toISOString(), max: end.toISOString() };
}

/** Parse comma-separated list for `in` operator (URL-safe). */
export function parseInList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

type CompileOk = {
  ok: true;
  equality?: string | number | boolean;
  range?: { min: string | number; max: string | number };
  inList?: Array<string | number | boolean>;
  isNull?: boolean;
  text?: string;
};

function compileValueForType(
  type: FilterControlType,
  _fieldId: string,
  raw: string,
): CompileOk | { ok: false; reason: FilterRejectReason; detail?: string } {
  const value = raw.trim();
  if (!value) return { ok: false, reason: "empty" };

  // Universal null sentinels (URL-safe)
  if (value === "__null__" || value.toLowerCase() === "is:null") {
    return { ok: true, isNull: true };
  }
  if (value === "__notnull__" || value.toLowerCase() === "is:notnull") {
    return { ok: true, isNull: false };
  }

  // Multi-value: a,b,c → whereIn
  if (value.includes(",") && (type === "select" || type === "text" || type === "boolean")) {
    const parts = parseInList(value);
    if (parts.length > 1) {
      if (type === "boolean") {
        const bools = parts.map(parseBoolean).filter((b): b is boolean => b !== null);
        if (bools.length === 0) return { ok: false, reason: "invalid_value" };
        return { ok: true, inList: bools };
      }
      return { ok: true, inList: parts };
    }
  }

  switch (type) {
    case "select": {
      return { ok: true, equality: value };
    }
    case "boolean": {
      const b = parseBoolean(value);
      if (b === null) return { ok: false, reason: "invalid_value", detail: "expected boolean" };
      return { ok: true, equality: b };
    }
    case "date": {
      // Full day → real inclusive range (no fake equality on partial ISO)
      const day = dayBoundsFromDateInput(value);
      if (day) return { ok: true, range: day };

      // Explicit range: start:end (ISO or YYYY-MM-DD)
      if (value.includes(":")) {
        const [a, b] = value.split(":");
        const minDay = dayBoundsFromDateInput(a || "")?.min ?? a;
        const maxDay = dayBoundsFromDateInput(b || "")?.max ?? b;
        if (minDay && maxDay)
          return { ok: true, range: { min: minDay.trim(), max: maxDay.trim() } };
      }

      if (Number.isNaN(Date.parse(value)) && !/^\d{4}(-\d{2})?(-\d{2})?$/.test(value)) {
        return { ok: false, reason: "invalid_value", detail: "invalid date" };
      }
      // Partial year/month: treat as prefix equality (adapters store ISO strings)
      return { ok: true, equality: value };
    }
    case "numberRange": {
      const { min, max } = parseNumberRange(value);
      const minN = min ? parseNumber(min) : null;
      const maxN = max ? parseNumber(max) : null;
      if (min && minN === null)
        return { ok: false, reason: "invalid_value", detail: "invalid min" };
      if (max && maxN === null)
        return { ok: false, reason: "invalid_value", detail: "invalid max" };
      if (minN === null && maxN === null) return { ok: false, reason: "empty" };

      if (minN !== null && maxN !== null) {
        return { ok: true, range: { min: minN, max: maxN } };
      }
      // Open range: adapters require both bounds for whereBetween — document sentinels
      if (minN !== null) {
        return { ok: true, range: { min: minN, max: openUpperBound(minN) } };
      }
      return { ok: true, range: { min: openLowerBound(maxN as number), max: maxN as number } };
    }
    case "text":
    default: {
      return { ok: true, text: value };
    }
  }
}

/**
 * Compile client filter map into a secure, portable IR.
 *
 * Security order:
 * 1. Resolve filterable fields (schema + widgets + FLAC)
 * 2. Drop unknown / unsafe / unauthorized keys
 * 3. Type-validate values
 * 4. Hash accepted payload for cache keys
 */
export function compileSecureFilters(
  raw: CollectionFilterMap | Record<string, unknown>,
  collection: Schema | null | undefined,
  user?: User | { _id: string; role: string } | null,
  options: CompileFilterOptions = {},
): CompiledCollectionFilter {
  const definitions = resolveFilterableFields(collection, user);
  const defMap = new Map(definitions.map((d) => [d.id, d]));
  const allowedFieldIds = definitions.map((d) => d.id);

  const equality: Record<string, string | number | boolean> = {};
  const ranges: CompiledCollectionFilter["ranges"] = [];
  const inLists: CompiledCollectionFilter["inLists"] = [];
  const nullChecks: CompiledCollectionFilter["nullChecks"] = [];
  const textSearch: CompiledCollectionFilter["textSearch"] = [];
  const rejected: FilterRejection[] = [];

  for (const [key, op] of Object.entries(raw || {})) {
    const def = defMap.get(key);
    if (!def) {
      rejected.push({ field: key, reason: "unknown_field" });
      continue;
    }
    if (!def.safeForFiltering) {
      rejected.push({ field: key, reason: "unsafe_widget" });
      continue;
    }

    // Structured operators (preferred for API clients)
    if (op && typeof op === "object" && !Array.isArray(op)) {
      const o = op as Record<string, unknown>;

      if (typeof o.isNull === "boolean") {
        nullChecks.push({ field: key, isNull: o.isNull });
        continue;
      }
      if (Array.isArray(o.in) && o.in.length > 0) {
        inLists.push({ field: key, values: o.in as Array<string | number | boolean> });
        continue;
      }
      if (o.eq !== undefined && o.eq !== null && String(o.eq) !== "") {
        equality[key] = o.eq as string | number | boolean;
        continue;
      }
      if (o.gte != null || o.lte != null) {
        const min = o.gte != null ? o.gte : openLowerBound((o.lte as string | number) ?? 0);
        const max = o.lte != null ? o.lte : openUpperBound((o.gte as string | number) ?? 0);
        // Date day bounds if both are YYYY-MM-DD
        let rangeMin = min as string | number;
        let rangeMax = max as string | number;
        if (typeof min === "string" && dayBoundsFromDateInput(min)) {
          rangeMin = dayBoundsFromDateInput(min)!.min;
        }
        if (typeof max === "string" && dayBoundsFromDateInput(max)) {
          rangeMax = dayBoundsFromDateInput(max)!.max;
        }
        ranges.push({ field: key, min: rangeMin, max: rangeMax });
        continue;
      }
    }

    // Normalize string / contains to typed compile
    let rawValue = "";
    if (typeof op === "string") {
      rawValue = op;
    } else if (op && typeof op === "object") {
      const o = op as Record<string, unknown>;
      if (typeof o.contains === "string") rawValue = o.contains;
    }

    const compiled = compileValueForType(def.type, key, rawValue);
    if (!compiled.ok) {
      rejected.push({ field: key, reason: compiled.reason, detail: compiled.detail });
      continue;
    }

    if (compiled.equality !== undefined) equality[key] = compiled.equality;
    if (compiled.range) {
      ranges.push({ field: key, min: compiled.range.min, max: compiled.range.max });
    }
    if (compiled.inList) inLists.push({ field: key, values: compiled.inList });
    if (compiled.isNull !== undefined) nullChecks.push({ field: key, isNull: compiled.isNull });
    if (compiled.text !== undefined) textSearch.push({ field: key, value: compiled.text });
  }

  if (options.logRejections !== false && rejected.length > 0) {
    logger.debug("[CollectionFilterEngine] Rejected filter keys", {
      collectionId: collection?._id,
      rejected,
    });
  }

  const acceptedPayload = {
    equality,
    ranges: ranges.map((r) => ({ field: r.field, min: r.min, max: r.max })),
    inLists,
    nullChecks,
    textSearch,
  };

  return {
    equality,
    ranges,
    inLists,
    nullChecks,
    textSearch,
    rejected,
    allowedFieldIds,
    queryHash: hashQueryPayload(acceptedPayload),
    definitions,
  };
}

// ─── Apply to QueryBuilder ───────────────────────────────────────────────────

/**
 * Apply compiled filters to a QueryBuilder using only portable methods:
 * `where`, `whereBetween`, `whereIn`, `whereNull`, `whereNotNull`, `search`.
 *
 * @returns the same builder (fluent) and the searchable field list used for global search
 */
export function applyFiltersToQueryBuilder<T>(
  qb: QueryBuilder<T>,
  compiled: CompiledCollectionFilter,
  options: ApplyFilterOptions = {},
): { qb: QueryBuilder<T>; searchableFields: string[] } {
  const { baseWhere = {}, globalSearch = "", collection = null, user = null } = options;

  // 1. Equality + base (tenantId, edit id, …)
  const whereMap: Record<string, unknown> = { ...baseWhere, ...compiled.equality };

  // Multiple text filters: portable AND via exact equality (partial match is multi-field ambiguous)
  if (compiled.textSearch.length > 1) {
    for (const t of compiled.textSearch) {
      whereMap[t.field] = t.value;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let next = qb.where(whereMap as any);

  // 2. Ranges (date day bounds + number ranges)
  for (const r of compiled.ranges) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    next = next.whereBetween(r.field as any, r.min as any, r.max as any);
  }

  // 3. IN lists
  for (const list of compiled.inLists ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    next = next.whereIn(list.field as any, list.values as any);
  }

  // 4. Null checks
  for (const n of compiled.nullChecks ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    next = n.isNull ? next.whereNull(n.field as any) : next.whereNotNull(n.field as any);
  }

  // 5. Search: global and/or single-field text
  const searchableFields = resolveSearchableFields(collection, user);
  const global = globalSearch.trim();

  if (global) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    next = next.search(global, searchableFields as any);
  } else if (compiled.textSearch.length === 1) {
    const t = compiled.textSearch[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    next = next.search(t.value, [t.field] as any);
  }

  return { qb: next, searchableFields };
}

/**
 * One-shot: compile raw filters + apply to a builder (convenience for services).
 */
export function compileAndApplyFilters<T>(
  qb: QueryBuilder<T>,
  raw: CollectionFilterMap | Record<string, unknown>,
  collection: Schema | null | undefined,
  user?: User | { _id: string; role: string } | null,
  options: ApplyFilterOptions & CompileFilterOptions = {},
): {
  qb: QueryBuilder<T>;
  compiled: CompiledCollectionFilter;
  searchableFields: string[];
} {
  const compiled = compileSecureFilters(raw, collection, user, options);
  const applied = applyFiltersToQueryBuilder(qb, compiled, {
    ...options,
    collection,
    user,
  });
  return { qb: applied.qb, compiled, searchableFields: applied.searchableFields };
}

/**
 * Hash suitable for CollectionService cache keys: accepted filters + search + sort.
 */
export function hashCollectionListQuery(input: {
  compiled: CompiledCollectionFilter;
  search?: string;
  sort?: { field: string; direction: "asc" | "desc" };
}): string {
  return hashQueryPayload({
    filter: {
      equality: input.compiled.equality,
      ranges: input.compiled.ranges,
      inLists: input.compiled.inLists,
      nullChecks: input.compiled.nullChecks,
      textSearch: input.compiled.textSearch,
    },
    search: (input.search || "").trim(),
    sort: input.sort || { field: "_createdAt", direction: "desc" },
  });
}

// ─── Facets (P1) ─────────────────────────────────────────────────────────────

export type StatusFacetCounts = Partial<Record<string, number>>;

/**
 * Count entries by `status` for filter chips / faceted UI.
 * Uses portable QueryBuilder; FLAC not applied to status (system field).
 * Callers must already have collection:read.
 */
export async function countStatusFacets(input: {
  queryBuilder: (table: string) => QueryBuilder<Record<string, unknown>>;
  collectionTableName: string;
  baseWhere?: Record<string, unknown>;
  statuses?: string[];
}): Promise<StatusFacetCounts> {
  const {
    queryBuilder,
    collectionTableName,
    baseWhere = {},
    statuses = ["publish", "draft", "unpublish", "schedule", "archive"],
  } = input;

  const counts: StatusFacetCounts = {};
  await Promise.all(
    statuses.map(async (status) => {
      try {
        const qb = queryBuilder(collectionTableName).where({
          ...baseWhere,
          status,
        } as Record<string, unknown>);
        const result = await qb.count();
        counts[status] = result.success ? Number(result.data ?? 0) : 0;
      } catch {
        counts[status] = 0;
      }
    }),
  );
  return counts;
}
