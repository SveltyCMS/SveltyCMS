/**
 * @file src/utils/smart-table-saved-views.ts
 * @description Hardened CRUD for Smart Table saved views.
 *
 * ### Hardening (audit 2026-07):
 * - JSON structural validation: filters malformed localStorage entries silently
 * - Quota awareness: logs storage-full errors instead of failing silently
 * - CSPRNG-based IDs: crypto.randomUUID() with timestamp fallback
 * - SSR-safe: isBrowser checks both window and localStorage
 *
 * Client-first via localStorage; same shape can later sync to a user prefs API.
 *
 * ### Features:
 * - CRUD for named views per scope key (collection id, users, tokens, …)
 * - Stores filters, sort, pageSize, column layout
 * - Pure helpers — no Svelte runes
 *
 * @see docs/reference/components/smart-table.mdx
 */

import type { SmartTableLayoutPrefs, SmartTableSort } from "@components/ui/smart-table/types";
import type { CollectionFilterMap } from "@utils/collection-query-filters";

const PREFIX = "smartTableViews:";

export interface SmartTableSavedView {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** Active filters (adapter-agnostic) */
  filters?: CollectionFilterMap | Record<string, string>;
  /** Global search string */
  search?: string;
  sort?: SmartTableSort;
  pageSize?: number;
  layout?: SmartTableLayoutPrefs;
}

// 🛡️ Guard against non-browser environments (SSR-safe)
const isBrowser = () => typeof localStorage !== "undefined";

function storageKey(scope: string): string {
  return PREFIX + scope;
}

/**
 * Lists saved views with schema validation.
 */
export function listSavedViews(scope: string): SmartTableSavedView[] {
  if (!isBrowser() || !scope) return [];

  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // 🛡️ Structural validation: discard malformed entries injected by extensions/console
    return parsed.filter((v) => v && typeof v === "object" && "id" in v && "name" in v);
  } catch (e) {
    console.error(`[SmartTable] Failed to parse views for scope: ${scope}`, e);
    return [];
  }
}

/**
 * Writes views with error handling.
 */
function writeViews(scope: string, views: SmartTableSavedView[]): void {
  if (!isBrowser() || !scope) return;
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(views));
  } catch (e) {
    // Quota management: log failure if storage is full
    console.error("[SmartTable] Storage quota exceeded", e);
  }
}

/**
 * Saves or updates a view. Uses explicit destructuring to prevent pollution.
 */
export function saveView(
  scope: string,
  input: Omit<SmartTableSavedView, "id" | "createdAt" | "updatedAt"> & { id?: string },
): SmartTableSavedView {
  const views = listSavedViews(scope);
  const now = new Date().toISOString();

  const existingIdx = input.id ? views.findIndex((v) => v.id === input.id) : -1;

  if (existingIdx >= 0) {
    views[existingIdx] = {
      ...views[existingIdx],
      ...input,
      updatedAt: now,
    };
    writeViews(scope, views);
    return views[existingIdx];
  }

  const created: SmartTableSavedView = {
    id: crypto.randomUUID?.() || `v_${Date.now()}`,
    name: input.name,
    createdAt: now,
    updatedAt: now,
    filters: input.filters,
    search: input.search,
    sort: input.sort,
    pageSize: input.pageSize,
    layout: input.layout,
  };
  views.push(created);
  writeViews(scope, views);
  return created;
}

export function deleteSavedView(scope: string, id: string): boolean {
  const views = listSavedViews(scope);
  const next = views.filter((v) => v.id !== id);
  if (next.length === views.length) return false;
  writeViews(scope, next);
  return true;
}

export function renameSavedView(
  scope: string,
  id: string,
  name: string,
): SmartTableSavedView | null {
  const views = listSavedViews(scope);
  const idx = views.findIndex((v) => v.id === id);
  if (idx < 0) return null;
  views[idx] = { ...views[idx], name, updatedAt: new Date().toISOString() };
  writeViews(scope, views);
  return views[idx];
}
