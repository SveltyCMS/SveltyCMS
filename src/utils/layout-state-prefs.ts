/**
 * @file src/utils/layout-state-prefs.ts
 * @description Layout preference utilities for per-user layout region overrides.
 *
 * ### Hardening (audit 2026-07):
 * - diffLayoutPrefsFromTenant: defaults tenant to "full" so user overrides aren't silently dropped
 * - uiStateToLayoutPrefs: actually filters out "full" defaults (was copying all keys)
 * - applyLayoutPrefsToUiState: checks state[key] !== val to prevent Svelte 5 reactivity thrashing
 * - getLayoutPrefLabel: module-scope dictionary — O(1) zero-allocation lookup
 * - Validation uses O(1) Set instead of inline triple-check
 */

import type { UIState, UIVisibility } from "@src/stores/ui-store.svelte.ts";
import type { TenantAdminThemeConfig } from "./theme-merge";

export type LayoutPrefKey = keyof Pick<
  UIState,
  "leftSidebar" | "rightSidebar" | "pageheader" | "pagefooter" | "header" | "footer"
>;

export const USER_LAYOUT_PREF_KEYS: LayoutPrefKey[] = [
  "leftSidebar",
  "rightSidebar",
  "pageheader",
  "pagefooter",
  "header",
  "footer",
];

const LAYOUT_PREF_LABELS: Record<LayoutPrefKey, string> = {
  leftSidebar: "Left Sidebar",
  rightSidebar: "Right Sidebar",
  pageheader: "Page Header",
  pagefooter: "Page Footer",
  header: "App Header",
  footer: "App Footer",
};

const VALID_VISIBILITIES = new Set<UIVisibility>(["hidden", "full", "collapsed"]);

export function getLayoutPrefLabel(key: LayoutPrefKey): string {
  return LAYOUT_PREF_LABELS[key] || String(key);
}

export function uiVisibilityToLayoutPref(visibility: UIVisibility): UIVisibility {
  return visibility === "collapsed" ? "full" : visibility;
}

export function uiStateToLayoutPrefs(state: UIState): Partial<Record<LayoutPrefKey, UIVisibility>> {
  const prefs: Partial<Record<LayoutPrefKey, UIVisibility>> = {};

  for (const key of USER_LAYOUT_PREF_KEYS) {
    const prefVal = uiVisibilityToLayoutPref(state[key]);
    if (prefVal !== "full") {
      prefs[key] = prefVal;
    }
  }
  return prefs;
}

export function applyLayoutPrefsToUiState(
  prefs: Partial<Record<LayoutPrefKey, UIVisibility>> | undefined | null,
  state: UIState,
): void {
  if (!prefs) return;

  for (const key of USER_LAYOUT_PREF_KEYS) {
    const val = prefs[key];
    // Prevent unnecessary Svelte 5 reactive updates
    if (val && VALID_VISIBILITIES.has(val) && state[key] !== val) {
      state[key] = val;
    }
  }
}

export function diffLayoutPrefsFromTenant(
  userPrefs: Partial<Record<LayoutPrefKey, string>> | undefined | null,
  tenantConfig: TenantAdminThemeConfig | undefined | null,
): Partial<Record<LayoutPrefKey, UIVisibility>> {
  const diff: Partial<Record<LayoutPrefKey, UIVisibility>> = {};
  if (!userPrefs) return diff;

  const tenantDefaults = tenantConfig?.layoutState ?? {};

  for (const key of USER_LAYOUT_PREF_KEYS) {
    const userVal = userPrefs[key];
    if (!userVal) continue;

    // Default tenant to "full" so explicit user overrides are correctly detected
    const tenantVal = tenantDefaults[key] ?? "full";

    if (userVal !== tenantVal) {
      diff[key] = userVal as UIVisibility;
    }
  }
  return diff;
}
