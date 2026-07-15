/**
 * @file src/components/ui/smart-table/layout-prefs.ts
 * @description
 * Persist Smart Table density / column order / visibility in localStorage.
 * Pure helpers — no Svelte runes (safe for unit tests and SSR guards).
 */

import type { SmartTableLayoutPrefs, TableDensity } from "./types";

const PREFIX = "smartTableLayout:";

function isBrowser(): boolean {
  return typeof localStorage !== "undefined";
}

export function loadTableLayout(layoutKey: string): SmartTableLayoutPrefs | null {
  if (!isBrowser() || !layoutKey) return null;
  try {
    const raw = localStorage.getItem(PREFIX + layoutKey);
    if (!raw) return null;
    return JSON.parse(raw) as SmartTableLayoutPrefs;
  } catch {
    return null;
  }
}

export function saveTableLayout(layoutKey: string, prefs: SmartTableLayoutPrefs): void {
  if (!isBrowser() || !layoutKey) return;
  try {
    localStorage.setItem(PREFIX + layoutKey, JSON.stringify(prefs));
  } catch {
    // quota / private mode — ignore
  }
}

export function mergeLayoutIntoColumns<T extends { key: string; visible?: boolean }>(
  columns: T[],
  prefs: SmartTableLayoutPrefs | null,
): T[] {
  if (!prefs) return columns;

  let next = columns.map((c) => {
    const vis = prefs.visibility?.[c.key];
    return vis === undefined ? c : { ...c, visible: vis };
  });

  if (prefs.columnOrder?.length) {
    const map = new Map(next.map((c) => [c.key, c]));
    const ordered: T[] = [];
    for (const key of prefs.columnOrder) {
      const col = map.get(key);
      if (col) {
        ordered.push(col);
        map.delete(key);
      }
    }
    for (const col of map.values()) ordered.push(col);
    next = ordered;
  }

  return next;
}

export function isValidDensity(value: unknown): value is TableDensity {
  return value === "compact" || value === "normal" || value === "comfortable";
}
