/**
 * @file src/stores/themeStore.svelte.ts
 * @description Theme management
 *
 * Features:
 * - Reactive theme state management with auto-refresh
 * - Asynchronous theme initialization from server
 * - Theme updating with server synchronization
 * - Error handling for API calls
 * - TypeScript support with custom Theme type
 */

import type { Theme } from '@src/databases/dbInterface';
import { store } from '@utils/reactivity.svelte';

// Types
interface ThemeState {
	currentTheme: Theme | null;
	isLoading: boolean;
	error: string | null;
	lastUpdateAttempt: Date | null;
	// explicit dark mode flag (decoupled from currentTheme name so themes can be light/dark variants)
	darkMode: boolean;
}

// Create base stores
function createThemeStores() {
	let refreshInterval: NodeJS.Timeout | null = null;

	// Helper function to get cookie value
	const getCookie = (name: string): string | null => {
		if (typeof window === 'undefined') return null;
		const value = `; ${document.cookie}`;
		const parts = value.split(`; ${name}=`);
		if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
		return null;
	};

	// Initial state
	const initialState: ThemeState = {
		currentTheme: null,
		isLoading: false,
		error: null,
		lastUpdateAttempt: null,
		darkMode:
			typeof window !== 'undefined'
				? getCookie('darkMode') === 'true' || (getCookie('darkMode') === null && window.matchMedia('(prefers-color-scheme: dark)').matches)
				: false
	};

	// Base store
	const state = store<ThemeState>(initialState);

	// Subscribe to theme changess
	const theme = store(state().currentTheme);
	const hasTheme = store(!!state().currentTheme);
	const themeName = store(state().currentTheme?.name ?? 'default');
	const isDefault = store(state().currentTheme?.isDefault ?? false);
	const isLoading = store(state().isLoading);
	const darkMode = store(state().darkMode);
	const error = store(state().error);

	// Initialize theme from API
	async function initialize() {
		state.update((s) => ({ ...s, isLoading: true, error: null }));

		try {
			const response = await fetch('/api/theme/default');
			if (!response.ok) {
				throw new Error(`Failed to fetch theme: ${response.statusText}`);
			}
			const theme = await response.json();
			state.update((s) => ({
				...s,
				currentTheme: theme ?? null,
				isLoading: false,
				lastUpdateAttempt: new Date()
			}));

			return theme;
		} catch (err) {
			state.update((s) => ({
				...s,
				error: err instanceof Error ? err.message : 'Failed to initialize theme',
				isLoading: false
			}));
			throw err;
		}
	}

	// Update theme
	async function updateTheme(newTheme: Theme | string) {
		state.update((s) => ({ ...s, isLoading: true, error: null }));

		try {
			// If a string is passed, create a basic theme object
			const themeToUpdate =
				typeof newTheme === 'string'
					? {
							name: newTheme,
							_id: '',
							path: '',
							isDefault: false,
							createdAt: new Date(),
							updatedAt: new Date(),
							isActive: true,
							config: {
								tailwindConfigPath: '',
								assetsPath: ''
							}
						}
					: newTheme;

			// Update the theme via API
			const response = await fetch('/api/theme/update-theme', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ themeName: themeToUpdate.name })
			});

			if (!response.ok) {
				throw new Error(`Failed to update theme: ${response.statusText}`);
			}

			// Update the local state
			state.update((s) => ({
				...s,
				currentTheme: themeToUpdate,
				isLoading: false,
				lastUpdateAttempt: new Date()
			}));

			// Do not automatically flip dark class here; rely on explicit toggleDarkMode()

			return themeToUpdate;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Failed to update theme';
			state.update((s) => ({
				...s,
				error: errorMessage,
				isLoading: false
			}));
			throw new Error(`Failed to update theme: ${errorMessage}`);
		}
	}

	function toggleDarkMode(force?: boolean) {
		state.update((s) => {
			const next = force !== undefined ? force : !s.darkMode;
			if (typeof window !== 'undefined') {
				document.documentElement.classList.toggle('dark', next);
				// Set cookie for server-side persistence
				document.cookie = `darkMode=${next}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
			}
			return { ...s, darkMode: next };
		});
		darkMode.set(state().darkMode);
	}

	// Clear error state
	function clearError() {
		state.update((s) => ({ ...s, error: null }));
	}

	// Auto-refresh theme periodically
	function startAutoRefresh(interval = 30 * 60 * 1000) {
		if (refreshInterval) stopAutoRefresh();

		refreshInterval = setInterval(() => {
			const currentState = state();
			if (currentState.lastUpdateAttempt && Date.now() - currentState.lastUpdateAttempt.getTime() > interval) {
				initialize().catch(console.error);
			}
		}, interval);
	}

	// Stop auto-refresh
	function stopAutoRefresh() {
		if (refreshInterval) {
			clearInterval(refreshInterval);
			refreshInterval = null;
		}
	}

	return {
		state,
		theme,
		hasTheme,
		themeName,
		isDefault,
		isLoading,
		error,
		initialize,
		updateTheme,
		clearError,
		startAutoRefresh,
		stopAutoRefresh,
		toggleDarkMode,
		darkMode
	};
}

// Create stores
const stores = createThemeStores();

// Enhanced themeStore type to include currentTheme
interface EnhancedThemeStore {
	subscribe: (f: (value: ThemeState) => void) => () => void;
	initialize: () => Promise<Theme | null | undefined>;
	updateTheme: (newTheme: Theme | string) => Promise<Theme>;
	currentTheme: Theme | null;
}

// Export the theme store and other values
export const theme = {
	subscribe: () => stores.theme
};

export const themeStore: EnhancedThemeStore = {
	subscribe: stores.state.subscribe,
	initialize: stores.initialize,
	updateTheme: stores.updateTheme,
	currentTheme: stores.state().currentTheme
};

export const hasTheme = {
	subscribe: () => stores.hasTheme
};

export const themeName = {
	subscribe: () => stores.themeName
};

export const isDefault = {
	subscribe: () => stores.isDefault
};

export const isLoading = { subscribe: () => stores.isLoading };
export const darkMode = { subscribe: () => stores.darkMode };

export const error = {
	subscribe: () => stores.error
};

// Export functions
export const initializeThemeStore = stores.initialize;
export const updateTheme = stores.updateTheme;
export const clearError = stores.clearError;
export const toggleDarkMode = stores.toggleDarkMode;

// Cleanup
if (typeof window !== 'undefined') {
	window.addEventListener('unload', stores.stopAutoRefresh);
}
