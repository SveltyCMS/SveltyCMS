/**
 * @file src/utils/layout-state-prefs.ts
 * @description Convert between runtime UI visibility and per-user layout preferences.
 *
 * UI store uses `collapsed` at runtime; persisted prefs store only `full` | `hidden`.
 *
 * ### Features:
 * - ui state to layout prefs conversion
 * - diff against tenant defaults for auto-save
 * - apply prefs to ui state
 */

import { DEFAULT_LAYOUT_STATE, type LayoutState } from "@components/ui/theme-context.svelte";
import type { UIState, UIVisibility } from "@stores/ui-store.svelte";

export const USER_LAYOUT_PREF_KEYS = [
  "leftSidebar",
  "rightSidebar",
  "pageheader",
  "pagefooter",
  "header",
  "footer",
] as const;

export type LayoutPrefKey = (typeof USER_LAYOUT_PREF_KEYS)[number];
export type StoredLayoutPref = "full" | "hidden";
export type UserLayoutPreferences = Partial<Record<LayoutPrefKey, StoredLayoutPref>>;

const LAYOUT_PREF_LABELS: Record<LayoutPrefKey, string> = {
  leftSidebar: "Left sidebar",
  rightSidebar: "Right sidebar",
  pageheader: "Page header",
  pagefooter: "Page footer",
  header: "Global header",
  footer: "Global footer",
};

export function getLayoutPrefLabel(key: LayoutPrefKey): string {
  return LAYOUT_PREF_LABELS[key];
}

/** Map runtime visibility (incl. collapsed) to a storable layout preference */
export function uiVisibilityToLayoutPref(visibility: UIVisibility): StoredLayoutPref {
  return visibility === "hidden" ? "hidden" : "full";
}

export function uiStateToLayoutPrefs(state: Pick<UIState, LayoutPrefKey>): UserLayoutPreferences {
  const prefs: UserLayoutPreferences = {};
  for (const key of USER_LAYOUT_PREF_KEYS) {
    prefs[key] = uiVisibilityToLayoutPref(state[key]);
  }
  return prefs;
}

export function applyLayoutPrefsToUiState(
  prefs: UserLayoutPreferences | null | undefined,
  target: Pick<UIState, LayoutPrefKey>,
  keys: readonly LayoutPrefKey[] = USER_LAYOUT_PREF_KEYS,
): void {
  if (!prefs) return;
  for (const key of keys) {
    const val = prefs[key];
    if (val === "full" || val === "hidden") {
      target[key] = val;
    }
  }
}

/** Keys that differ from tenant defaults — used for non-admin auto-save */
export function diffLayoutPrefsFromTenant(
  current: UserLayoutPreferences,
  tenant: Partial<LayoutState> | null | undefined,
): UserLayoutPreferences {
  const diff: UserLayoutPreferences = {};
  for (const key of USER_LAYOUT_PREF_KEYS) {
    const cur = current[key];
    if (!cur) continue;
    const tenantVal = tenant?.[key] ?? DEFAULT_LAYOUT_STATE[key];
    if (cur !== tenantVal) diff[key] = cur;
  }
  return diff;
}

export function hasLayoutPrefOverrides(prefs: UserLayoutPreferences | null | undefined): boolean {
  return !!prefs && Object.keys(prefs).length > 0;
}
