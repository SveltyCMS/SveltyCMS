/**
 * @file src/stores/themeStore.svelte.ts
 * @description Centralized, rune-based theme management store.
 * Supports explicit theme preferences: 'system', 'light', 'dark'
 * Pure Tailwind CSS implementation - no Skeleton Labs dependencies
 */
import { browser } from '$app/environment';
import type { Theme } from '@src/databases/dbInterface';
import { nowISODateString } from '@src/utils/dateUtils';
import type { ISODateString } from '@src/content/types';
import { logger } from '@utils/logger';

// --- Theme Preference Type ---
export type ThemePreference = 'system' | 'light' | 'dark' | 'unknown';

// --- State Shape ---
interface ThemeState {
	currentTheme: Theme | null;
	isLoading: boolean;
	error: string | null;
	lastUpdateAttempt: ISODateString | null;
	themePreference: ThemePreference; // User's explicit preference
	resolvedDarkMode: boolean; // Computed dark mode state (considering system preference)
	autoRefreshEnabled: boolean;
}

// --- Core State ---
const state = $state<ThemeState>({
	currentTheme: null,
	isLoading: false,
	error: null,
	lastUpdateAttempt: null,
	themePreference: 'unknown',
	resolvedDarkMode: false,
	autoRefreshEnabled: false
});

// --- Derived State ---
const currentTheme = $derived(state.currentTheme);
const hasTheme = $derived(!!state.currentTheme);
const themeName = $derived(state.currentTheme?.name ?? 'default');
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
	}
};

// --- Actions ---

let systemThemeListener: ((this: MediaQueryList, ev: MediaQueryListEvent) => void) | null = null;
const THEME_COOKIE_KEY = 'theme';

/**
 * Get the system's preferred color scheme
 */
function getSystemPreference(): boolean {
	if (!browser) return false;
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Resolve the actual dark mode state based on preference
 */
function resolveDarkMode(preference: ThemePreference): boolean {
	switch (preference) {
		case 'dark':
			return true;
		case 'light':
			return false;
		case 'system':
			return getSystemPreference();
		case 'unknown':
			return getSystemPreference();
		default:
			return false;
	}
}

/**
 * Initializes the dark mode state from cookie/DOM and syncs Skeleton.
 * The DOM state is set pre-render by the script in app.html.
 * This MUST be called from a component's onMount lifecycle hook.
 */
export function initializeDarkMode() {
	if (!browser) return;

	// 1. Read theme preference from cookie
	const cookieValue = document.cookie
		.split('; ')
		.find((c) => c.startsWith(`${THEME_COOKIE_KEY}=`))
		?.split('=')[1] as ThemePreference | undefined;

	// 2. Check current DOM state (already set by SSR script)
	const currentlyDark = document.documentElement.classList.contains('dark');

	// 3. Determine user's preference (default to 'system' if no cookie)
	let preference: ThemePreference = 'system';

	if (cookieValue === 'dark' || cookieValue === 'light' || cookieValue === 'system') {
		preference = cookieValue;
	} else if (cookieValue) {
		console.warn('[Theme Init] Unknown cookie value, defaulting to system:', cookieValue);
		preference = 'system';
	}

	// 4. Update state WITHOUT touching the DOM (SSR script already set it correctly)
	state.themePreference = preference;
	state.resolvedDarkMode = currentlyDark; // Use current DOM state

	// 5. Save preference if not set
	if (!cookieValue) {
		_setCookie(preference);
		logger.debug('[Theme Init] Set cookie to:', preference);
	}

	// 6. Clean up old 'darkMode' cookie if it exists
	if (document.cookie.includes('darkMode=')) {
		document.cookie = 'darkMode=; path=/; max-age=0';
		logger.debug('[Theme Init] Cleaned up old darkMode cookie');
	}

	// 7. Listen for system preference changes (only if using 'system' preference)
	_setupSystemListener();
} /**
 * Apply dark mode state to DOM
 */
function _applyThemeToDOM(isDark: boolean) {
	if (!browser) return;

	if (isDark) {
		document.documentElement.classList.add('dark');
		logger.debug('[Theme] Applied dark class to DOM');
	} else {
		document.documentElement.classList.remove('dark');
		logger.debug('[Theme] Removed dark class from DOM');
	}

	// Ensure the base theme attribute is always present for Skeleton v4
	if (document.body.getAttribute('data-theme') !== 'sveltycms') {
		document.body.setAttribute('data-theme', 'sveltycms');
	}
}

/**
 * Set the theme cookie
 */
function _setCookie(preference: ThemePreference) {
	if (!browser) return;

	// Overwrite cookie with explicit path and max-age
	// Note: We don't need to explicitly delete it first; overwriting with the same name and path works.
	document.cookie = `${THEME_COOKIE_KEY}=${preference}; path=/; max-age=31536000; SameSite=Lax`;
	logger.debug('[Theme] Updated cookie to:', preference);
}

/**
 * Setup listener for system preference changes
 */
function _setupSystemListener() {
	if (!browser) return;

	const mq = window.matchMedia('(prefers-color-scheme: dark)');

	// Remove old listener if exists
	if (systemThemeListener) {
		mq.removeEventListener('change', systemThemeListener);
	}

	systemThemeListener = (e: MediaQueryListEvent) => {
		// Only react to system changes if user has 'system' preference
		if (state.themePreference === 'system') {
			logger.debug('[Theme] System preference changed to:', e.matches ? 'dark' : 'light');
			state.resolvedDarkMode = e.matches;
			_applyThemeToDOM(e.matches);
		}
	};

	mq.addEventListener('change', systemThemeListener);
}

/**
 * Set theme preference explicitly
 * @param preference - 'system', 'light', or 'dark'
 */
export function setThemePreference(preference: ThemePreference) {
	if (!browser) return;
	if (preference === 'unknown') {
		console.warn('[Theme] Cannot set preference to "unknown", defaulting to "system"');
		preference = 'system';
	}

	logger.debug('[Theme] Setting preference to:', preference);

	// Update state
	state.themePreference = preference;
	state.resolvedDarkMode = resolveDarkMode(preference);

	// Apply to DOM
	_applyThemeToDOM(state.resolvedDarkMode);

	// Save to cookie
	_setCookie(preference);

	// Re-setup system listener (in case preference changed to/from 'system')
	_setupSystemListener();
}

/**
 * Toggle between light and dark modes (ignoring system preference)
 * If currently on 'system', will switch to explicit light/dark
 */
export function toggleDarkMode(force?: boolean) {
	if (!browser) return;

	let newPreference: ThemePreference;

	if (force !== undefined) {
		// Force specific mode
		newPreference = force ? 'dark' : 'light';
	} else {
		// Toggle current state
		if (state.themePreference === 'system') {
			// If on system, toggle to opposite of current resolved state
			newPreference = state.resolvedDarkMode ? 'light' : 'dark';
		} else {
			// Toggle between light and dark
			newPreference = state.themePreference === 'dark' ? 'light' : 'dark';
		}
	}

	setThemePreference(newPreference);
}

/**
 * Reset to system preference
 */
export function useSystemPreference() {
	setThemePreference('system');
} // ... (Rest of your themeStore.svelte.ts file) ...
export async function initializeThemeStore() {
	state.isLoading = true;
	state.error = null;
	try {
		const response = await fetch('/api/theme/default');
		if (!response.ok) {
			throw new Error(`Failed to fetch theme: ${response.statusText}`);
		}
		const themeData: Theme = await response.json();
		state.currentTheme = themeData ?? null;
		state.lastUpdateAttempt = nowISODateString();
		return themeData;
	} catch (err) {
		state.error = err instanceof Error ? err.message : 'Failed to initialize theme';
		throw err;
	} finally {
		state.isLoading = false;
	}
}

export async function updateTheme(newThemeName: string) {
	state.isLoading = true;
	state.error = null;
	try {
		const response = await fetch('/api/theme/update-theme', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ themeName: newThemeName })
		});
		if (!response.ok) throw new Error(`Failed to update theme: ${response.statusText}`);

		const updatedTheme: Theme = await response.json();
		state.currentTheme = updatedTheme;
		state.lastUpdateAttempt = nowISODateString();
		return updatedTheme;
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Failed to update theme';
		state.error = errorMessage;
		throw new Error(errorMessage);
	} finally {
		state.isLoading = false;
	}
}

export function clearError() {
	state.error = null;
}

// --- 6. Auto-Refresh Management ---
export function startAutoRefresh() {
	state.autoRefreshEnabled = true;
}

export function stopAutoRefresh() {
	state.autoRefreshEnabled = false;
}
