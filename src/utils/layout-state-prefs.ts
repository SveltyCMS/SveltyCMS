/**
 * @file src/utils/layout-state-prefs.ts
 * @description Layout preference utilities for per-user layout region overrides.
 *
 * Maps between UIState visibility keys and user preference storage format.
 * Used by the appearance settings page to let users customize which layout
 * regions are visible per content area.
 *
 * ### Features:
 * - Typed layout preference keys matching UIState
 * - Human-readable labels for settings UI
 * - Bidirectional conversion between UI state and preference storage
 */

import type { UIState, UIVisibility } from "@src/stores/ui-store.svelte.ts";
import type { TenantAdminThemeConfig } from "./theme-merge";

/** The set of layout regions users can override */
export type LayoutPrefKey = keyof Pick<
  UIState,
  "leftSidebar" | "rightSidebar" | "pageheader" | "pagefooter" | "header" | "footer"
>;

/** Ordered list of all layout preference keys */
export const USER_LAYOUT_PREF_KEYS: LayoutPrefKey[] = [
  "leftSidebar",
  "rightSidebar",
  "pageheader",
  "pagefooter",
  "header",
  "footer",
];

/** Human-readable label for each layout region */
export function getLayoutPrefLabel(key: LayoutPrefKey): string {
  const labels: Record<LayoutPrefKey, string> = {
    leftSidebar: "Left Sidebar",
    rightSidebar: "Right Sidebar",
    pageheader: "Page Header",
    pagefooter: "Page Footer",
    header: "App Header",
    footer: "App Footer",
  };
  return labels[key];
}

/**
 * Converts UI visibility state to a layout preference value.
 * "collapsed" is not a valid persistence state, so it maps to "full".
 */
export function uiVisibilityToLayoutPref(visibility: UIVisibility): UIVisibility {
  return visibility === "collapsed" ? "full" : visibility;
}

/**
 * Extract layout preferences from the current UI state for storage.
 * Only includes values that differ from the default ("full").
 */
export function uiStateToLayoutPrefs(state: UIState): Partial<Record<LayoutPrefKey, UIVisibility>> {
  const prefs: Partial<Record<LayoutPrefKey, UIVisibility>> = {};
  for (const key of USER_LAYOUT_PREF_KEYS) {
    prefs[key] = uiVisibilityToLayoutPref(state[key]);
  }
  return prefs;
}

/**
 * Apply stored layout preferences to a UI state object.
 * Mutates the state in place (Svelte 5 $state reactivity picks up the changes).
 */
export function applyLayoutPrefsToUiState(
  prefs: Partial<Record<LayoutPrefKey, UIVisibility>> | undefined | null,
  state: UIState,
): void {
  if (!prefs) return;
  for (const key of USER_LAYOUT_PREF_KEYS) {
    const val = prefs[key];
    if (val === "hidden" || val === "full" || val === "collapsed") {
      state[key] = val;
    }
  }
}

/**
 * Compute diff between user layout prefs and tenant defaults.
 * Returns only the keys where the user has explicitly overridden the tenant default.
 */
export function diffLayoutPrefsFromTenant(
  userPrefs: Partial<Record<LayoutPrefKey, string>> | undefined | null,
  _tenantConfig: TenantAdminThemeConfig | undefined | null,
): Partial<Record<LayoutPrefKey, UIVisibility>> {
  const diff: Partial<Record<LayoutPrefKey, UIVisibility>> = {};
  if (!userPrefs) return diff;

  const tenantDefaults = _tenantConfig?.layoutState ?? {};

  for (const key of USER_LAYOUT_PREF_KEYS) {
    const userVal = userPrefs[key];
    const tenantVal = tenantDefaults[key];
    if (tenantVal !== undefined && userVal !== tenantVal) {
      diff[key] = userVal as UIVisibility;
    }
  }
  return diff;
}
