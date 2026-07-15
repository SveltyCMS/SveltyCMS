/**
 * @file src/utils/smart-table-saved-views.ts
 * @description
 * Named filter/sort/column layouts for Smart Table (editor "saved views").
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

function isBrowser(): boolean {
  return typeof localStorage !== "undefined";
}

function storageKey(scope: string): string {
  return PREFIX + scope;
}

export function listSavedViews(scope: string): SmartTableSavedView[] {
  if (!isBrowser() || !scope) return [];
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SmartTableSavedView[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeViews(scope: string, views: SmartTableSavedView[]): void {
  if (!isBrowser() || !scope) return;
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(views));
  } catch {
    // ignore quota
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `view_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function getSavedView(scope: string, id: string): SmartTableSavedView | null {
  return listSavedViews(scope).find((v) => v.id === id) ?? null;
}

export function saveView(
  scope: string,
  input: Omit<SmartTableSavedView, "id" | "createdAt" | "updatedAt"> & { id?: string },
): SmartTableSavedView {
  const views = listSavedViews(scope);
  const now = new Date().toISOString();
  if (input.id) {
    const idx = views.findIndex((v) => v.id === input.id);
    if (idx >= 0) {
      const updated: SmartTableSavedView = {
        ...views[idx],
        ...input,
        id: input.id,
        updatedAt: now,
      };
      views[idx] = updated;
      writeViews(scope, views);
      return updated;
    }
  }
  const created: SmartTableSavedView = {
    id: input.id || newId(),
    name: input.name,
    filters: input.filters,
    search: input.search,
    sort: input.sort,
    pageSize: input.pageSize,
    layout: input.layout,
    createdAt: now,
    updatedAt: now,
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
