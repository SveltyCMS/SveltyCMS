/**
 * @file src/stores/theme-store.svelte.ts
 * @description Centralized, rune-based theme management store.
 * Supports explicit theme preferences: 'system', 'light', 'dark'
 * Pure Tailwind CSS implementation - no third-party UI dependencies
 */

import type { ISODateString } from "@src/content/types";
import type { Theme } from "@src/databases/db-interface";
import type { UserThemePreferences } from "@utils/theme-merge";
import { nowISODateString } from "@src/utils/date";
import { logger } from "@utils/logger";
import { browser } from "$app/env";

// --- Theme Preference Type ---
export type ThemePreference = "system" | "light" | "dark" | "unknown";

// --- State Shape ---
interface ThemeState {
  autoRefreshEnabled: boolean;
  currentTheme: Theme | null;
  error: string | null;
  isLoading: boolean;
  lastUpdateAttempt: ISODateString | null;
  resolvedDarkMode: boolean; // Computed dark mode state (considering system preference)
  themePreference: ThemePreference; // User's explicit preference
}

// --- Core State ---
const state = $state<ThemeState>({
  currentTheme: null,
  isLoading: false,
  error: null,
  lastUpdateAttempt: null,
  themePreference: "unknown",
  resolvedDarkMode: true, // Default to true to match app.html
  autoRefreshEnabled: false,
});

// --- Derived State ---
const currentTheme = $derived(state.currentTheme);
const hasTheme = $derived(!!state.currentTheme);
const themeName = $derived(state.currentTheme?.name ?? "default");
const isLoading = $derived(state.isLoading);
const error = $derived(state.error);
const themePreference = $derived(state.themePreference);
const isDarkMode = $derived(state.resolvedDarkMode);
const autoRefreshEnabled = $derived(state.autoRefreshEnabled);

// --- Exported Store Object ---
export const themeStore = {
  get currentTheme() {
    return currentTheme;
  },
  get hasTheme() {
    return hasTheme;
  },
  get themeName() {
    return themeName;
  },
  get isLoading() {
    return isLoading;
  },
  get error() {
    return error;
  },
  get themePreference() {
    return themePreference;
  },
  get isDarkMode() {
    return isDarkMode;
  },
  get autoRefreshEnabled() {
    return autoRefreshEnabled;
  },
};

// --- Actions ---

let systemThemeListener: ((this: MediaQueryList, ev: MediaQueryListEvent) => void) | null = null;
const THEME_COOKIE_KEY = "theme";

/**
 * Resolve the actual dark mode state based on preference
 */
function resolveDarkMode(preference: ThemePreference): boolean {
  if (!browser) {
    return true; // Default dark for SSR
  }

  const systemPrefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;

  switch (preference) {
    case "dark":
      return true;
    case "light":
      return false;
    default:
      // Priority System: if light is preferred, use it. Otherwise dark.
      return !systemPrefersLight;
  }
}

/**
 * Initializes the dark mode state from cookie/DOM.
 * The DOM state is set pre-render by the script in app.html.
 * This MUST be called from a component's onMount lifecycle hook.
 */
export function initializeDarkMode(initialPreference?: ThemePreference) {
  if (!browser) {
    return;
  }

  // 1. Read theme preference from cookie or fallback to localStorage
  const cookieMatch = document.cookie.match(/(?:^|;\s*)theme=([^;]+)/);
  const cookieValue = cookieMatch
    ? (decodeURIComponent(cookieMatch[1].trim()) as ThemePreference)
    : undefined;

  let localValue: ThemePreference | undefined;
  try {
    const rawLocal = localStorage.getItem(THEME_COOKIE_KEY);
    if (rawLocal === "dark" || rawLocal === "light" || rawLocal === "system") {
      localValue = rawLocal;
    }
  } catch {}

  // 2. Determine user's preference (default to 'system' if not stored)
  let preference: ThemePreference = "system";

  if (
    initialPreference &&
    (initialPreference === "dark" ||
      initialPreference === "light" ||
      initialPreference === "system")
  ) {
    preference = initialPreference;
  } else if (cookieValue === "dark" || cookieValue === "light" || cookieValue === "system") {
    preference = cookieValue;
  } else if (localValue === "dark" || localValue === "light" || localValue === "system") {
    preference = localValue;
  } else if (cookieValue) {
    logger.warn("[Theme Init] Unknown cookie value, defaulting to system:", cookieValue);
    preference = "system";
  } else {
    preference = "system";
  }

  // 3. Resolve the actual dark mode state based on preference and enforce on DOM
  state.themePreference = preference;
  state.resolvedDarkMode = resolveDarkMode(preference);
  applyThemeToDom(state.resolvedDarkMode);

  // 4. Save preference if cookie was missing or out of sync
  if (!cookieValue || cookieValue !== preference) {
    setCookie(preference);
    logger.debug("[Theme Init] Synced cookie to preference:", preference);
  }

  // 5. Ensure localStorage is in sync as resilient secondary store
  try {
    if (localStorage.getItem(THEME_COOKIE_KEY) !== preference) {
      localStorage.setItem(THEME_COOKIE_KEY, preference);
    }
  } catch {}

  // 6. Clean up old 'darkMode' cookie if it exists
  if (document.cookie.includes("darkMode=")) {
    document.cookie = "darkMode=; path=/; max-age=0";
    logger.debug("[Theme Init] Cleaned up old darkMode cookie");
  }

  // 7. Listen for system preference changes (only if using 'system' preference)
  setupSystemListener();
} /**
 * Apply dark mode state to DOM
 */
function applyThemeToDom(isDark: boolean) {
  if (!browser) {
    return;
  }

  const h = document.documentElement;

  if (isDark) {
    h.classList.add("dark");
    h.classList.remove("light");
    logger.debug("[Theme] Applied dark/removed light from DOM");
  } else {
    h.classList.add("light");
    h.classList.remove("dark");
    logger.debug("[Theme] Applied light/removed dark from DOM");
  }

  // Ensure the base theme attribute is always present
  if (document.body.getAttribute("data-theme") !== "sveltycms") {
    document.body.setAttribute("data-theme", "sveltycms");
  }
}

/**
 * Set the theme cookie and localStorage
 */
function setCookie(preference: ThemePreference) {
  if (!browser) {
    return;
  }

  // Overwrite cookie with explicit path and max-age
  document.cookie = `${THEME_COOKIE_KEY}=${preference}; path=/; max-age=31536000; SameSite=Lax`;
  try {
    localStorage.setItem(THEME_COOKIE_KEY, preference);
  } catch {}
  logger.debug("[Theme] Updated cookie and localStorage to:", preference);
}

/**
 * Setup listener for system preference changes
 */
function setupSystemListener() {
  if (!browser) {
    return;
  }

  const mq = window.matchMedia("(prefers-color-scheme: dark)");

  // Remove old listener if exists
  if (systemThemeListener) {
    mq.removeEventListener("change", systemThemeListener);
  }

  systemThemeListener = (e: MediaQueryListEvent) => {
    // Only react to system changes if user has 'system' preference
    if (state.themePreference === "system") {
      logger.debug("[Theme] System preference changed to:", e.matches ? "dark" : "light");
      state.resolvedDarkMode = e.matches;
      applyThemeToDom(e.matches);
    }
  };

  mq.addEventListener("change", systemThemeListener);
}

/**
 * Set theme preference explicitly
 * @param preference - 'system', 'light', or 'dark'
 */
export function setThemePreference(preference: ThemePreference) {
  if (!browser) {
    return;
  }
  if (preference === "unknown") {
    logger.warn('[Theme] Cannot set preference to "unknown", defaulting to "system"');
    preference = "system";
  }

  logger.debug("[Theme] Setting preference to:", preference);

  // Update state
  state.themePreference = preference;
  state.resolvedDarkMode = resolveDarkMode(preference);

  // Apply to DOM
  applyThemeToDom(state.resolvedDarkMode);

  // Save to cookie
  setCookie(preference);

  // Re-setup system listener (in case preference changed to/from 'system')
  setupSystemListener();
}

/**
 * Toggle between light and dark modes (ignoring system preference)
 * If currently on 'system', will switch to explicit light/dark
 */
export function toggleDarkMode(force?: boolean) {
  if (!browser) {
    return;
  }

  let newPreference: ThemePreference;

  if (force !== undefined) {
    // Force specific mode
    newPreference = force ? "dark" : "light";
  } else {
    // Toggle current state
    if (state.themePreference === "system") {
      // If on system, toggle to opposite of current resolved state
      newPreference = state.resolvedDarkMode ? "light" : "dark";
    } else {
      // Toggle between light and dark
      newPreference = state.themePreference === "dark" ? "light" : "dark";
    }
  }

  setThemePreference(newPreference);
}

/**
 * Reset to system preference
 */
export function useSystemPreference() {
  setThemePreference("system");
} // ... (Rest of your themeStore.svelte.ts file) ...
export async function initializeThemeStore() {
  state.isLoading = true;
  state.error = null;
  try {
    // `get-current-theme` returns the active theme record (`Theme`) — the shape the
    // themes manager lists. The former `/api/theme/default` was a dead action name,
    // so it never resolved to a handler and only produced an unauthorized error.
    const response = await fetch("/api/theme/get-current-theme");
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      // Pre-auth surface (/login, /setup) or a fresh install with no active theme
      // yet — neither is an error. The SSR payload already paints the active theme;
      // the client store simply stays empty until a session can read it.
      state.currentTheme = null;
      state.lastUpdateAttempt = nowISODateString();
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch theme: ${response.statusText}`);
    }
    const themeData: Theme = await response.json();
    state.currentTheme = themeData ?? null;
    state.lastUpdateAttempt = nowISODateString();
    return themeData;
  } catch (err) {
    state.error = err instanceof Error ? err.message : "Failed to initialize theme";
    throw err;
  } finally {
    state.isLoading = false;
  }
}

export function clearError() {
  state.error = null;
}

// --- 6. Auto-Refresh Management ---
// These only toggle the feature flag; the actual interval lives in the root
// layout's effect so it can be cleaned up on unmount. SSR-safe (no-op on server).
export function startAutoRefresh() {
  if (!browser) {
    return;
  }
  state.autoRefreshEnabled = true;
}

export function stopAutoRefresh() {
  if (!browser) {
    return;
  }
  state.autoRefreshEnabled = false;
}

// --- 7. Optimistic User Theme/Layout Preferences ---
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
