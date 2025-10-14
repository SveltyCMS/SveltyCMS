/**
 * @file src/stores/themeStore.svelte.ts
 * @description Modern, rune-based theme management store for Svelte 5.
 *
 * ### Features
 * - A single, clean, and fully reactive store object.
 * - Uses $state for core data, $derived for computed values.
 * - Manages dark mode state and persists it to cookies.
 * - Handles fetching and updating the active theme via API.
 * - Includes an optional auto-refresh mechanism using $effect for robust lifecycle management.
 */
import { browser } from '$app/environment';
import type { Theme } from '@src/databases/dbInterface';
import { nowISODateString } from '@src/utils/dateUtils';
import type { ISODateString } from '@src/content/types';

// --- 1. Define the state shape ---
interface ThemeState {
	currentTheme: Theme | null;
	isLoading: boolean;
	error: string | null;
	lastUpdateAttempt: ISODateString | null;
	darkMode: boolean;
	autoRefreshEnabled: boolean;
}

// --- 2. Create the core reactive state using $state ---
const state = $state<ThemeState>({
	currentTheme: null,
	isLoading: false,
	error: null,
	lastUpdateAttempt: null,
	// Set initial dark mode state safely, avoiding server-side errors
	darkMode: browser
		? document.cookie.includes('darkMode=true') ||
			(!document.cookie.includes('darkMode=') && window.matchMedia('(prefers-color-scheme: dark)').matches)
		: false,
	autoRefreshEnabled: false
});

// --- 3. Create derived values at the top level of the module ---
const currentTheme = $derived(state.currentTheme);
const hasTheme = $derived(!!state.currentTheme);
const themeName = $derived(state.currentTheme?.name ?? 'default');
const isLoading = $derived(state.isLoading);
const error = $derived(state.error);
const isDarkMode = $derived(state.darkMode);

// --- 4. The exported store object with reactive properties ---
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
	}
};

// --- Standalone Svelte 5-compatible methods (Actions) ---
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

export function toggleDarkMode(force?: boolean) {
	const nextIsDark = force !== undefined ? force : !state.darkMode;
	state.darkMode = nextIsDark;
	if (browser) {
		document.documentElement.classList.toggle('dark', nextIsDark);
		const cookieOptions = `path=/; max-age=31536000; SameSite=Lax; Secure`;
		document.cookie = `darkMode=${nextIsDark}; ${cookieOptions}`;
	}
}

export function clearError() {
	state.error = null;
}

// --- Modern Auto-Refresh Management ---
export function startAutoRefresh() {
	state.autoRefreshEnabled = true;
}

export function stopAutoRefresh() {
	state.autoRefreshEnabled = false;
}

// Use $effect for declarative, self-cleaning side effects.
// This is more efficient and safer than manual setInterval/addEventListener.
if (browser) {
	$effect(() => {
		// This effect will only run if auto-refresh is enabled.
		if (!state.autoRefreshEnabled) {
			return; // Do nothing
		}

		const interval = 30 * 60 * 1000; // 30 minutes
		const intervalId = setInterval(() => {
			console.log('Auto-refreshing theme...');
			initializeThemeStore().catch(console.error);
		}, interval);

		// The cleanup function is returned and runs automatically
		// when the effect is re-run or the component unmounts.
		return () => {
			clearInterval(intervalId);
		};
	});
}
