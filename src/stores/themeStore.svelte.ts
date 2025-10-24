/**
 * @file src/stores/themeStore.svelte.ts
 * @description Centralized, rune-based theme management store.
 * Now uses 'theme' cookie with 'dark' | 'light' values.
 */
import { browser } from '$app/environment';
import type { Theme } from '@src/databases/dbInterface';
import { nowISODateString } from '@src/utils/dateUtils';
import type { ISODateString } from '@src/content/types';
import { setModeCurrent, setModeUserPrefers } from '@skeletonlabs/skeleton';

// --- State Shape ---
interface ThemeState {
	currentTheme: Theme | null;
	isLoading: boolean;
	error: string | null;
	lastUpdateAttempt: ISODateString | null;
	darkMode: boolean; // Internal state remains boolean
	autoRefreshEnabled: boolean;
}

// --- Core State ---
const state = $state<ThemeState>({
	currentTheme: null,
	isLoading: false,
	error: null,
	lastUpdateAttempt: null,
	darkMode: false, // Will be set by initializeDarkMode
	autoRefreshEnabled: false
});

// --- Derived State ---
const currentTheme = $derived(state.currentTheme);
const hasTheme = $derived(!!state.currentTheme);
const themeName = $derived(state.currentTheme?.name ?? 'default');
const isLoading = $derived(state.isLoading);
const error = $derived(state.error);
const isDarkMode = $derived(state.darkMode); // The reactive boolean
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
	get isDarkMode() {
		return isDarkMode;
	},
	get autoRefreshEnabled() {
		return autoRefreshEnabled;
	}
};

// --- Actions ---

let systemThemeListener: ((this: MediaQueryList, ev: MediaQueryListEvent) => any) | null = null;
const THEME_COOKIE_KEY = 'theme';

/**
 * Initializes the dark mode state *from the DOM* and syncs Skeleton.
 * The DOM state is set pre-render by the script in app.html.
 * This MUST be called from a component's onMount lifecycle hook.
 */
export function initializeDarkMode() {
	if (!browser) return;

	// 1. Read the state from the DOM (set by app.html script)
	const isDark = document.documentElement.classList.contains('dark');

	// 2. Sync Svelte store state
	state.darkMode = isDark;

	// 3. Sync Skeleton Labs
	setModeCurrent(isDark);
	setModeUserPrefers(isDark);

	// 4. Listen for system preference changes
	const mq = window.matchMedia('(prefers-color-scheme: dark)');
	if (systemThemeListener) {
		mq.removeEventListener('change', systemThemeListener);
	}

	systemThemeListener = (e: MediaQueryListEvent) => {
		// Only act if there is NO explicit user cookie
		const cookieExists = document.cookie.split('; ').some((row) => row.startsWith(THEME_COOKIE_KEY + '='));

		if (!cookieExists) {
			_setDarkMode(e.matches, false); // false = don't set cookie
		}
	};
	mq.addEventListener('change', systemThemeListener);
}

/**
 * Internal helper to set dark mode state, update DOM, and sync Skeleton.
 * @param isDark The new dark mode state
 * @param setCookie Whether to write the cookie (user's explicit choice)
 */
function _setDarkMode(isDark: boolean, setCookie: boolean) {
	if (!browser) return;

	// 1. Update internal state
	state.darkMode = isDark;

	// 2. Update DOM
	if (isDark) {
		document.documentElement.classList.add('dark');
	} else {
		document.documentElement.classList.remove('dark');
	}

	// 3. Sync with Skeleton Labs
	setModeUserPrefers(isDark);
	setModeCurrent(isDark);

	// 4. Save user's explicit preference (if requested)
	if (setCookie) {
		const themeValue = isDark ? 'dark' : 'light';
		const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
		const cookieOptions = isLocalhost ? `path=/; max-age=31536000; SameSite=Lax` : `path=/; max-age=31536000; SameSite=Lax; Secure`;
		document.cookie = `${THEME_COOKIE_KEY}=${themeValue}; ${cookieOptions}`;
	}
}

/**
 * Toggles dark mode or sets it to a specific state.
 * This action *always* sets a cookie, as it represents an
 * explicit user choice.
 */
export function toggleDarkMode(force?: boolean) {
	if (!browser) return;

	const nextIsDark = force !== undefined ? force : !state.darkMode;

	// Call the internal function, explicitly setting the cookie
	_setDarkMode(nextIsDark, true);
}

// ... (Rest of your themeStore.svelte.ts file) ...
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
		return updated.Theme;
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
