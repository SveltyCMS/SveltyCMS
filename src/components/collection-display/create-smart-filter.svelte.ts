/**
 * @file src/components/collection-display/create-smart-filter.svelte.ts
 * @description
 * Reactive UI facade for the **collection filtering platform capability**.
 *
 * Zero DB dependencies. Schema/widget definitions live in
 * `@utils/collection-filter-defs`; server security/compile/apply live in
 * `collection-filter-engine`. This module only holds Svelte 5 filter state
 * and URL sync for admin tables (entry-list and future surfaces).
 *
 * ### Features:
 * - Svelte 5 rune state (`$state` / `$derived`)
 * - Schema-driven control definitions (reuses platform pure helpers)
 * - URL param encode/decode (`filter_{field}`)
 * - Active filter badges helpers
 *
 * @see docs/reference/architecture/collection-filtering.mdx
 */

import type { Schema } from "@src/content/types";
import {
  buildFilterDefinitions,
  parseNumberRange,
  type FilterControlType,
  type SmartFilterDefinition,
} from "@utils/collection-filter-defs";
import {
  FILTER_URL_PREFIX,
  hashQueryPayload,
  type CollectionFilterMap,
} from "@utils/collection-query-filters";

// Platform pure helpers (browser-safe)
export {
  buildFilterDefinitions,
  encodeNumberRange,
  fieldToFilterDefinition,
  parseNumberRange,
  type FilterControlType,
  type SmartFilterDefinition,
  type SmartFilterOption,
} from "@utils/collection-filter-defs";

// URL / cache helpers shared with SSR
export {
  FILTER_URL_PREFIX,
  buildCollectionQueryCacheKey,
  hashQueryPayload,
  parseCollectionListQuery,
  parseUrlFilterParams,
  whitelistFilterParams,
} from "@utils/collection-query-filters";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateSmartFilterOptions {
  /** Include system columns (status, createdAt, updatedAt) when missing from schema. Default true. */
  includeSystemFields?: boolean;
  /** URL prefix for filter params. Default `filter_`. */
  urlPrefix?: string;
}

export interface SmartFilterApi {
  readonly filters: Record<string, string>;
  readonly definitions: SmartFilterDefinition[];
  readonly definitionMap: Map<string, SmartFilterDefinition>;
  readonly activeCount: number;
  readonly activeFilters: Array<{
    id: string;
    label: string;
    value: string;
    type: FilterControlType;
    displayValue: string;
  }>;
  readonly allowedFieldIds: Set<string>;
  setFilter: (id: string, value: string | null | undefined) => void;
  clearFilter: (id: string) => void;
  clearAll: () => void;
  syncFromURL: (searchParams: URLSearchParams) => boolean;
  toURLParams: () => Record<string, string | null>;
  toFilterQuery: () => CollectionFilterMap;
  toPlainObject: () => Record<string, string>;
  toQueryHash: (search?: string) => string;
  getDefinition: (id: string) => SmartFilterDefinition | undefined;
  isAllowedField: (id: string) => boolean;
}

// ─── Display helpers ─────────────────────────────────────────────────────────

function formatDisplayValue(def: SmartFilterDefinition | undefined, value: string): string {
  if (!def) return value;
  if (def.type === "select" || def.type === "boolean") {
    const match = def.options?.find((o) => o.value === value);
    return match?.label ?? value;
  }
  if (def.type === "numberRange") {
    const { min, max } = parseNumberRange(value);
    if (min && max) return `${min} – ${max}`;
    if (min) return `≥ ${min}`;
    if (max) return `≤ ${max}`;
    return value;
  }
  return value;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a reactive smart-filter controller for a collection table.
 *
 * Server still compiles via `compileSecureFilters` (schema + FLAC + QueryBuilder).
 *
 * @example
 * ```ts
 * const smartFilter = createSmartFilter(() => collection.value);
 * smartFilter.setFilter('status', 'publish');
 * updateURL({ ...smartFilter.toURLParams(), page: '1' });
 * ```
 */
export function createSmartFilter(
  getCollection: () => Schema | null | undefined,
  options: CreateSmartFilterOptions = {},
): SmartFilterApi {
  const urlPrefix = options.urlPrefix ?? FILTER_URL_PREFIX;
  const filters = $state<Record<string, string>>({});

  const definitions = $derived.by((): SmartFilterDefinition[] =>
    buildFilterDefinitions(getCollection(), options),
  );

  const definitionMap = $derived.by((): Map<string, SmartFilterDefinition> => {
    const map = new Map<string, SmartFilterDefinition>();
    for (const def of definitions) {
      map.set(def.id, def);
    }
    return map;
  });

  const allowedFieldIds = $derived.by((): Set<string> => {
    const set = new Set<string>();
    for (const def of definitions) {
      if (def.safeForFiltering) set.add(def.id);
    }
    return set;
  });

  const activeCount = $derived(
    Object.values(filters).filter((v) => typeof v === "string" && v.trim() !== "").length,
  );

  const activeFilters = $derived.by(() => {
    const items: Array<{
      id: string;
      label: string;
      value: string;
      type: FilterControlType;
      displayValue: string;
    }> = [];

    for (const [id, value] of Object.entries(filters)) {
      if (!value || value.trim() === "") continue;
      const def = definitionMap.get(id);
      items.push({
        id,
        label: def?.label ?? id,
        value,
        type: def?.type ?? "text",
        displayValue: formatDisplayValue(def, value),
      });
    }
    return items;
  });

  function setFilter(id: string, value: string | null | undefined) {
    if (!id) return;
    if (value != null && String(value).trim() !== "") {
      filters[id] = String(value).trim();
    } else {
      delete filters[id];
    }
  }

  function clearFilter(id: string) {
    delete filters[id];
  }

  function clearAll() {
    for (const key of Object.keys(filters)) {
      delete filters[key];
    }
  }

  function syncFromURL(searchParams: URLSearchParams): boolean {
    let hasChanges = false;
    const seen = new Set<string>();
    const anyFilterInUrl = [...searchParams.keys()].some((k) => k.startsWith(urlPrefix));

    for (const [key, value] of searchParams.entries()) {
      if (!key.startsWith(urlPrefix)) continue;
      const filterId = key.slice(urlPrefix.length);
      if (!filterId) continue;

      seen.add(filterId);
      const next = value?.trim() ?? "";
      if (next) {
        if (filters[filterId] !== next) {
          filters[filterId] = next;
          hasChanges = true;
        }
      } else if (filters[filterId] !== undefined) {
        delete filters[filterId];
        hasChanges = true;
      }
    }

    if (anyFilterInUrl) {
      for (const key of Object.keys(filters)) {
        if (!seen.has(key)) {
          delete filters[key];
          hasChanges = true;
        }
      }
    }

    return hasChanges;
  }

  function toURLParams(): Record<string, string | null> {
    const params: Record<string, string | null> = {};
    for (const def of definitions) {
      const value = filters[def.id];
      params[`${urlPrefix}${def.id}`] = value && value.trim() !== "" ? value : null;
    }
    for (const [key, value] of Object.entries(filters)) {
      const urlKey = `${urlPrefix}${key}`;
      if (!(urlKey in params)) {
        params[urlKey] = value && value.trim() !== "" ? value : null;
      }
    }
    return params;
  }

  function toFilterQuery(): CollectionFilterMap {
    const query: CollectionFilterMap = {};
    for (const [key, value] of Object.entries(filters)) {
      if (!value || value.trim() === "") continue;
      query[key] = { contains: value };
    }
    return query;
  }

  function toPlainObject(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value && value.trim() !== "") out[key] = value;
    }
    return out;
  }

  function toQueryHash(search = ""): string {
    return hashQueryPayload({
      filter: toFilterQuery(),
      search: search.trim(),
      sort: { field: "_createdAt", direction: "desc" as const },
    });
  }

  function getDefinition(id: string): SmartFilterDefinition | undefined {
    return definitionMap.get(id);
  }

  function isAllowedField(id: string): boolean {
    return allowedFieldIds.has(id);
  }

  return {
    get filters() {
      return filters;
    },
    get definitions() {
      return definitions;
    },
    get definitionMap() {
      return definitionMap;
    },
    get activeCount() {
      return activeCount;
    },
    get activeFilters() {
      return activeFilters;
    },
    get allowedFieldIds() {
      return allowedFieldIds;
    },
    setFilter,
    clearFilter,
    clearAll,
    syncFromURL,
    toURLParams,
    toFilterQuery,
    toPlainObject,
    toQueryHash,
    getDefinition,
    isAllowedField,
  };
}
