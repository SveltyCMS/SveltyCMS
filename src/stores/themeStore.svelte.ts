/**
 * @file src/stores/themeStore.svelte.ts
 * @description Modern, rune-based theme management store for Svelte 5.
 *
 * ### Features
 * - A single, clean, and fully reactive store object.
 * - Uses $state for core data, $derived for computed values.
 * - Manages dark mode state and persists it to cookies.
 * - Handles fetching and updating the active theme via API.
 * - Includes an optional auto-refresh mechanism using $effect.
 */
import { browser } from '$app/environment';
import type { Theme } from '@src/databases/dbInterface';
import { nowISODateString, isoDateStringToDate } from '@src/utils/dateUtils';
import type { ISODateString } from '@src/content/types';

// --- 1. Define the state shape ---
interface ThemeState {
	currentTheme: Theme | null;
	isLoading: boolean;
	error: string | null;
	lastUpdateAttempt: ISODateString | null;
	darkMode: boolean;
}

// --- 2. Create the core reactive state using $state ---
const state = $state<ThemeState>({
	currentTheme: null,
	isLoading: false,
	error: null,
	lastUpdateAttempt: null,
	darkMode: browser
		? document.cookie.includes('darkMode=true') ||
			(!document.cookie.includes('darkMode=') && window.matchMedia('(prefers-color-scheme: dark)').matches)
		: false
});

// --- 3. The exported store object ---
export const themeStore = {
	get currentTheme() {
		return $derived(state.currentTheme);
	},
	get hasTheme() {
		return $derived(!!state.currentTheme);
	},
	get themeName() {
		return $derived(state.currentTheme?.name ?? 'default');
	},
	get isLoading() {
		return $derived(state.isLoading);
	},
	get error() {
		return $derived(state.error);
	},
	get isDarkMode() {
		return $derived(state.darkMode);
	}
};

// --- Standalone Svelte 5-compatible methods ---
export async function initializeThemeStore() {
	state.isLoading = true;
	state.error = null;
	try {
		const response = await fetch('/api/theme/default');
		if (!response.ok) {
			throw new Error(`Failed to fetch theme: ${response.statusText}`);
		}
		const themeData = await response.json();
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

		const updatedTheme = await response.json();
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

// Clear error state
export function clearError() {
	state.error = null;
}

let refreshInterval: NodeJS.Timeout | null = null;
// Auto-refresh theme periodically
export function startAutoRefresh(interval = 30 * 60 * 1000) {
	if (refreshInterval) clearInterval(refreshInterval);
	refreshInterval = setInterval(() => {
		if (state.lastUpdateAttempt && Date.now() - isoDateStringToDate(state.lastUpdateAttempt).getTime() > interval) {
			initializeThemeStore().catch(console.error);
		}
	}, interval);
}

// Stop auto-refresh
export function stopAutoRefresh() {
	if (refreshInterval) {
		clearInterval(refreshInterval);
		refreshInterval = null;
	}
}

// Auto-cleanup on page unload
if (browser) {
	window.addEventListener('unload', stopAutoRefresh);
}
