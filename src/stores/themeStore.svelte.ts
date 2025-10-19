/**
 * @file src/stores/themeStore.svelte.ts
 * @description Centralized, rune-based theme management store
 */
import { browser } from '$app/environment';
import type { Theme } from '@src/databases/dbInterface';
import { nowISODateString } from '@src/utils/dateUtils';
import type { ISODateString } from '@src/content/types';
import { setModeCurrent, setModeUserPrefers } from '@skeletonlabs/skeleton';

// --- 1. State Shape ---
interface ThemeState {
	currentTheme: Theme | null;
	isLoading: boolean;
	error: string | null;
	lastUpdateAttempt: ISODateString | null;
	darkMode: boolean;
	autoRefreshEnabled: boolean;
}

// --- 2. Core State ---
const state = $state<ThemeState>({
	currentTheme: null,
	isLoading: false,
	error: null,
	lastUpdateAttempt: null,
	darkMode: false, // Initialize with safe default; will be updated on client
	autoRefreshEnabled: false
});

// --- 3. Derived State ---
const currentTheme = $derived(state.currentTheme);
const hasTheme = $derived(!!state.currentTheme);
const themeName = $derived(state.currentTheme?.name ?? 'default');
const isLoading = $derived(state.isLoading);
const error = $derived(state.error);
const isDarkMode = $derived(state.darkMode);
const autoRefreshEnabled = $derived(state.autoRefreshEnabled);

// --- 4. Exported Store Object ---
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

// --- 5. Actions ---

/**
 * Initializes the dark mode state from cookie or OS preference.
 * MUST be called from a component's onMount lifecycle hook or a browser-only context.
 *
 * Best Practice:
 * - Respects system preference by default (no cookie set)
 * - Only sets cookie when user manually toggles (explicit preference)
 * - Syncs with Skeleton's mode system
 */
export function initializeDarkMode() {
	if (!browser) return;

	// Check current DOM state
	const domHasDarkClass = document.documentElement.classList.contains('dark');

	const cookieValue = document.cookie
		.split('; ')
		.find((row) => row.startsWith('darkMode='))
		?.split('=')[1];

	// Check system preference
	const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

	let isDark: boolean;

	if (cookieValue !== undefined) {
		// User has explicitly set a preference - respect it
		isDark = cookieValue === 'true';
		console.log('[initializeDarkMode] Using cookie preference:', isDark);
	} else {
		// No cookie - use system preference
		isDark = systemPrefersDark;
		console.log('[initializeDarkMode] Using system preference:', isDark);
	}

	// Update internal state
	state.darkMode = isDark;

	// Apply to DOM
	if (isDark) {
		document.documentElement.classList.add('dark');
		console.log('[initializeDarkMode] ✅ Added dark class to <html>');
	} else {
		document.documentElement.classList.remove('dark');
		console.log('[initializeDarkMode] ℹ️  Removed dark class from <html>');
	}

	// Sync with Skeleton Labs
	setModeCurrent(isDark);
	setModeUserPrefers(isDark);

	// Detailed debug output
	console.log('[initializeDarkMode] Complete state:', {
		isDark,
		systemPrefersDark,
		cookieValue,
		domHasDarkClass,
		'HTML classes': document.documentElement.className,
		'Body background': getComputedStyle(document.body).backgroundColor
	});

	// Test if Tailwind dark mode utilities are working
	setTimeout(() => {
		const testDiv = document.createElement('div');
		testDiv.className = 'bg-white dark:bg-black';
		testDiv.style.position = 'absolute';
		testDiv.style.top = '-9999px';
		document.body.appendChild(testDiv);
		const bgColor = getComputedStyle(testDiv).backgroundColor;
		document.body.removeChild(testDiv);

		console.log('[initializeDarkMode] Tailwind dark mode test:', {
			'Test element bg': bgColor,
			'Expected if dark': 'rgb(0, 0, 0)',
			'Expected if light': 'rgb(255, 255, 255)',
			'Dark mode working': isDark
				? bgColor === 'rgb(0, 0, 0)' || bgColor === 'rgba(0, 0, 0, 1)'
				: bgColor === 'rgb(255, 255, 255)' || bgColor === 'rgba(255, 255, 255, 1)'
		});
	}, 100);
}

/**
 * Toggles dark mode or sets it to a specific state.
 *
 * Best Practice:
 * - Only sets cookie when user explicitly toggles (not on initial load)
 * - This preserves user intent and overrides system preference
 */
export function toggleDarkMode(force?: boolean) {
	if (!browser) return;

	console.log('[toggleDarkMode] Called with force:', force);
	console.log('[toggleDarkMode] Current state.darkMode:', state.darkMode);

	const nextIsDark = force !== undefined ? force : !state.darkMode;

	console.log('[toggleDarkMode] nextIsDark will be:', nextIsDark);

	// Update internal state
	state.darkMode = nextIsDark;

	// Update DOM - add or remove dark class
	if (nextIsDark) {
		document.documentElement.classList.add('dark');
	} else {
		document.documentElement.classList.remove('dark');
	}

	// Sync with Skeleton Labs
	setModeUserPrefers(nextIsDark);
	setModeCurrent(nextIsDark);

	// Save user's explicit preference
	// Note: Secure flag only works on HTTPS, omit for localhost
	const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
	const cookieOptions = isLocalhost ? `path=/; max-age=31536000; SameSite=Lax` : `path=/; max-age=31536000; SameSite=Lax; Secure`;

	const cookieString = `darkMode=${nextIsDark}; ${cookieOptions}`;
	console.log('[toggleDarkMode] Setting cookie:', cookieString);

	document.cookie = cookieString;

	// Verify cookie was set
	setTimeout(() => {
		const verify = document.cookie.split('; ').find((row) => row.startsWith('darkMode='));
		console.log('[toggleDarkMode] Cookie verification:', verify);
	}, 100);
}

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
