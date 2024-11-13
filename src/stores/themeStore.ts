/**
 * @file src/stores/themeStore.ts
 * @description Theme management using Svelte stores
 *
 * Features:
 * - Reactive theme state management with auto-refresh
 * - Asynchronous theme initialization from server
 * - Theme updating with server synchronization
 * - Error handling for API calls
 * - TypeScript support with custom Theme type
 */

// src/stores/themeStore.ts
import { writable, derived } from 'svelte/store';
import type { Theme } from '@src/databases/dbInterface';

// Types
interface ThemeState {
	currentTheme: Theme | null;
	isLoading: boolean;
	error: string | null;
	lastUpdateAttempt: Date | null;
}

// Create base stores with Svelte 5 runes
const createThemeStores = () => {
	let refreshInterval: NodeJS.Timeout | null = null;

	// Initial state
	const initialState: ThemeState = {
		currentTheme: null,
		isLoading: false,
		error: null,
		lastUpdateAttempt: null
	};

	// Base store using Svelte 5 syntax
	const state = writable<ThemeState>(initialState);

	// Derived values as readable stores
	const theme = derived(state, ($state) => $state.currentTheme);
	const hasTheme = derived(state, ($state) => !!$state.currentTheme);
	const themeName = derived(state, ($state) => $state.currentTheme?.name ?? 'default');
	const isDefault = derived(state, ($state) => $state.currentTheme?.isDefault ?? false);
	const isLoading = derived(state, ($state) => $state.isLoading);
	const error = derived(state, ($state) => $state.error);

	// Rest of your existing functions...

	return {
		// Export the theme store directly
		theme,
		hasTheme,
		themeName,
		isDefault,
		isLoading,
		error,
		state,
		initialize,
		updateTheme,
		clearError,
		stopAutoRefresh
	};
};

// Create stores
const stores = createThemeStores();

// Export the theme store and other values
export const theme = stores.theme;
export const themeStore = stores.state;
export const hasTheme = stores.hasTheme;
export const themeName = stores.themeName;
export const isDefault = stores.isDefault;
export const isLoading = stores.isLoading;
export const error = stores.error;

// Export functions
export const initializeThemeStore = stores.initialize;
export const updateTheme = stores.updateTheme;
export const clearError = stores.clearError;

// Cleanup
if (typeof window !== 'undefined') {
	window.addEventListener('unload', stores.stopAutoRefresh);
}
