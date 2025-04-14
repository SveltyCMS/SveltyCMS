/**
 * @file src/stores/themeStore.svelte.ts
 * @description Theme management using Svelte 5 runes
 *
 * Features:
 * - Reactive theme state management with auto-refresh
 * - Asynchronous theme initialization from server
 * - Theme updating with server synchronization
 * - Error handling for API calls
 * - TypeScript support with custom Theme type
 */

import { store } from '@utils/reactivity.svelte';
import type { Theme } from '@src/databases/dbInterface';
import { dbAdapter } from '@src/databases/db';

// Types
interface ThemeState {
	currentTheme: Theme | null;
	isLoading: boolean;
	error: string | null;
	lastUpdateAttempt: Date | null;
}

// Create base stores
function createThemeStores() {
	let refreshInterval: NodeJS.Timeout | null = null;

	// Initial state
	const initialState: ThemeState = {
		currentTheme: null,
		isLoading: false,
		error: null,
		lastUpdateAttempt: null
	};

	// Base store
	const state = store<ThemeState>(initialState);

	// Individual reactive stores
	const theme = store(state().currentTheme);
	const hasTheme = store(!!state().currentTheme);
	const themeName = store(state().currentTheme?.name ?? 'default');
	const isDefault = store(state().currentTheme?.isDefault ?? false);
	const isLoading = store(state().isLoading);
	const error = store(state().error);

	// Update the stores whenever the state changes
	state.subscribe((s) => {
		theme.set(state().currentTheme);
		hasTheme.set(!!state().currentTheme);
		themeName.set(state().currentTheme?.name ?? 'default');
		isDefault.set(state().currentTheme?.isDefault ?? false);
		isLoading.set(state().isLoading);
		error.set(state().error);
	});

	// Initialize theme from database with system preference fallback
	async function initialize() {
		state.update((s) => ({ ...s, isLoading: true, error: null }));

		try {
			let themeData = await dbAdapter?.getDefaultTheme();
			if (!themeData && typeof window !== 'undefined') {
				const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
				const defaultThemeName = prefersDark ? 'dark' : 'light';
				await dbAdapter?.setDefaultTheme(defaultThemeName);
				themeData = await dbAdapter?.getDefaultTheme();
				if (themeData) {
					localStorage.setItem('theme', themeData.name);
					document.documentElement.classList.toggle('dark', themeData.name === 'dark');
				}
			}
			state.update((s) => ({
				...s,
				currentTheme: themeData,
				isLoading: false,
				lastUpdateAttempt: new Date()
			}));

			return themeData;
		} catch (err) {
			state.update((s) => ({
				...s,
				error: err instanceof Error ? err.message : 'Failed to initialize theme',
				isLoading: false
			}));

			throw err;
		}
	}

	// Update theme and sync with local storage
	async function updateTheme(newTheme: Theme | string) {
    state.update((s) => ({ ...s, isLoading: true, error: null }));

		try {
			const themeToUpdate =
				typeof newTheme === 'string'
					? { name: newTheme, _id: '', path: '', isDefault: false, createdAt: new Date(), updatedAt: new Date() }
					: newTheme;

			// Update the theme in the database
			await dbAdapter?.setDefaultTheme(themeToUpdate.name);
			// Update the local state
			state.update((s) => ({
				...s,
				currentTheme: themeToUpdate,
				isLoading: false,
				lastUpdateAttempt: new Date()
			}));

			// Update the document class for immediate visual feedback
			if (typeof window !== 'undefined') {
				document.documentElement.classList.toggle('dark', themeToUpdate.name === 'dark');
				localStorage.setItem('theme', themeToUpdate.name);
			}

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

	// Return all stores and methods
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
		stopAutoRefresh
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

// Export reactive values directly
export const theme = stores.theme;
export const themeName = stores.themeName; // Export the store directly
export const hasTheme = stores.hasTheme;
export const isDefault = stores.isDefault;
export const isLoading = stores.isLoading;
export const error = stores.error;

export const themeStore: EnhancedThemeStore = {
	subscribe: stores.state.subscribe,
	initialize: stores.initialize,
	updateTheme: stores.updateTheme,
	currentTheme: stores.state().currentTheme
};

// Export functions
export const initializeThemeStore = stores.initialize;
export const updateTheme = stores.updateTheme;
export const clearError = stores.clearError;

// Cleanup
if (typeof window !== 'undefined') {
	window.addEventListener('unload', stores.stopAutoRefresh);
}
