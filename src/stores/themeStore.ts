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

import { writable, derived } from 'svelte/store';
import type { Theme } from '@src/databases/dbInterface';

// Types
interface ThemeState {
	currentTheme: Theme | null;
	isLoading: boolean;
	error: string | null;
	lastUpdateAttempt: Date | null;
}

// Create base stores
const createThemeStores = () => {
	let refreshInterval: NodeJS.Timeout | null = null;

	// Initial state
	const initialState: ThemeState = {
		currentTheme: null,
		isLoading: false,
		error: null,
		lastUpdateAttempt: null
	};

	// Base store
	const state = writable<ThemeState>(initialState);

	// Derived values
	const hasTheme = derived(state, ($state) => !!$state.currentTheme);
	const themeName = derived(state, ($state) => $state.currentTheme?.name ?? 'default');
	const isDefault = derived(state, ($state) => $state.currentTheme?.isDefault ?? false);
	const canUpdate = derived(state, ($state) => !$state.isLoading);

	// Helper functions
	function isThemeStale(): boolean {
		let isStale = true;
		state.subscribe(($state) => {
			if (!$state.lastUpdateAttempt) return true;
			const twentyFourHours = 24 * 60 * 60 * 1000;
			isStale = Date.now() - $state.lastUpdateAttempt.getTime() > twentyFourHours;
		})();
		return isStale;
	}

	// Start auto-refresh for stale theme
	function startAutoRefresh() {
		if (typeof window === 'undefined') return;

		// Check every hour
		refreshInterval = setInterval(
			() => {
				if (isThemeStale()) {
					initialize().catch(console.error);
				}
			},
			60 * 60 * 1000
		);
	}

	// Stop auto-refresh
	function stopAutoRefresh() {
		if (refreshInterval) {
			clearInterval(refreshInterval);
			refreshInterval = null;
		}
	}

	// Initialize theme
	async function initialize() {
		let currentState: ThemeState;
		state.subscribe((s) => {
			currentState = s;
		})();

		if (currentState.isLoading) return;

		state.update((s) => ({ ...s, isLoading: true, error: null }));

		try {
			const response = await fetch('/api/get-current-theme');
			if (!response.ok) {
				throw new Error(`Failed to fetch theme: ${response.statusText}`);
			}

			const theme = await response.json();
			state.update((s) => ({
				...s,
				currentTheme: theme,
				lastUpdateAttempt: new Date(),
				isLoading: false
			}));
		} catch (error) {
			state.update((s) => ({
				...s,
				error: error instanceof Error ? error.message : 'Failed to initialize theme',
				currentTheme: null,
				isLoading: false
			}));
		}
	}

	// Update theme
	async function updateTheme(themeName: string): Promise<void> {
		let currentState: ThemeState;
		state.subscribe((s) => {
			currentState = s;
		})();

		if (currentState.isLoading) {
			throw new Error('Theme update already in progress');
		}

		state.update((s) => ({ ...s, isLoading: true, error: null }));

		try {
			// Send update request
			const updateResponse = await fetch('/api/change-theme', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ themeName })
			});

			const result = await updateResponse.json();

			if (!result.success) {
				throw new Error(result.error || 'Failed to update theme');
			}

			// Fetch updated theme
			const themeResponse = await fetch('/api/get-current-theme');
			if (!themeResponse.ok) {
				throw new Error(`Failed to fetch updated theme: ${themeResponse.statusText}`);
			}

			const theme = await themeResponse.json();
			state.update((s) => ({
				...s,
				currentTheme: theme,
				lastUpdateAttempt: new Date(),
				isLoading: false
			}));
		} catch (error) {
			state.update((s) => ({
				...s,
				error: error instanceof Error ? error.message : 'Failed to update theme',
				isLoading: false
			}));
			throw error;
		}
	}

	// Reset error state
	function clearError() {
		state.update((s) => ({ ...s, error: null }));
	}

	// Initialize auto-refresh
	if (typeof window !== 'undefined') {
		startAutoRefresh();
	}

	return {
		// Base store
		state,

		// Derived values
		hasTheme,
		themeName,
		isDefault,
		canUpdate,

		// Methods
		initialize,
		updateTheme,
		clearError,
		stopAutoRefresh
	};
};

// Create and export stores
const stores = createThemeStores();

// Export main store with full interface
export const themeStore = {
	subscribe: stores.state.subscribe,
	initialize: stores.initialize,
	updateTheme: stores.updateTheme,
	clearError: stores.clearError
};

// Export derived values
export const hasTheme = { subscribe: stores.hasTheme.subscribe };
export const themeName = { subscribe: stores.themeName.subscribe };
export const isDefault = { subscribe: stores.isDefault.subscribe };
export const canUpdate = { subscribe: stores.canUpdate.subscribe };

// Export initialization and update functions for direct use
export const initializeThemeStore = stores.initialize;
export const updateTheme = stores.updateTheme;

// Cleanup on module unload
if (typeof window !== 'undefined') {
	window.addEventListener('unload', stores.stopAutoRefresh);
}
