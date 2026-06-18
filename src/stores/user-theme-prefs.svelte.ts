/**
 * @file src/stores/user-theme-prefs.svelte.ts
 * @description Client-side overlay for per-user theme preferences.
 *
 * Applies density/variant/accessibility overrides immediately after save
 * without a full page reload. Cleared when layout user data refreshes.
 *
 * ### Features:
 * - optimistic apply after save
 * - merge with server preferences in layout
 * - release on server sync
 */

import type { UserThemePreferences } from "@utils/theme-merge";

class UserThemePrefsStore {
  #optimistic = $state<UserThemePreferences | null>(null);

  /** Apply preferences immediately (before/while server revalidates) */
  apply(prefs: UserThemePreferences): void {
    const base = this.#optimistic ?? {};
    const next: UserThemePreferences = { ...base, ...prefs };
    if (prefs.layoutState !== undefined) {
      next.layoutState = { ...prefs.layoutState };
    }
    this.#optimistic = next;
  }

  /** Clear optimistic overlay — server data becomes authoritative */
  release(): void {
    this.#optimistic = null;
  }

  /** Merge optimistic overlay on top of server-stored preferences */
  getEffective(serverPrefs?: UserThemePreferences | null): UserThemePreferences | undefined {
    if (!serverPrefs && !this.#optimistic) return undefined;
    if (!this.#optimistic) return serverPrefs ?? undefined;
    return {
      ...serverPrefs,
      ...this.#optimistic,
      layoutState: {
        ...serverPrefs?.layoutState,
        ...this.#optimistic.layoutState,
      },
    };
  }
}

export const userThemePrefs = new UserThemePrefsStore();
