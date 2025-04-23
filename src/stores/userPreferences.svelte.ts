/**
 * @file src/stores/userPreferences.svelte.ts
 * @description User preferences management 
 *
 * Features:
 * - Widget preferences for different screen sizes
 * - Database persistence
 * - Screen size - specific layouts
 * - Widget addition and removal
 * - Error handling and recovery
 */

import { store } from '@utils/reactivity.svelte';
import { ScreenSize } from '@stores/screenSizeStore.svelte';
import { browser } from '$app/environment';

// Widget preference interface
export interface WidgetPreference {
	id: string;
	component: string;
	label: string;
	x: number;
	y: number;
	w: number;
	h: number;
	min?: { w: number; h: number };
	max?: { w: number; h: number };
	movable?: boolean;
	resizable?: boolean;
}

// User preferences interface
export interface UserPreferences {
	[ScreenSize.SM]: WidgetPreference[];
	[ScreenSize.MD]: WidgetPreference[];
	[ScreenSize.LG]: WidgetPreference[];
	[ScreenSize.XL]: WidgetPreference[];
}

// State interface
interface PreferencesState {
	preferences: UserPreferences;
	isLoading: boolean;
	error: string | null;
	lastSyncTime: Date | null;
	currentUserId: string | null;
}

// Create base stores
function createPreferencesStores() {
	let syncInterval: NodeJS.Timeout | null = null;

	// Initial state
	const initialState: PreferencesState = {
		preferences: {
			[ScreenSize.SM]: [],
			[ScreenSize.MD]: [],
			[ScreenSize.LG]: [],
			[ScreenSize.XL]: []
		},
		isLoading: false,
		error: null,
		lastSyncTime: null,
		currentUserId: null
	};

	// Base store
	const state = store<PreferencesState>(initialState);

	// Derived values
	const hasPreferences = $derived.by(() => {
		return Object.values(state().preferences).some((widgets) => widgets.length > 0);
	});

	const widgetCount = $derived.by(() => {
		return Object.values(state().preferences).reduce((sum, widgets) => sum + widgets.length, 0);
	});

	const canSync = $derived.by(() => {
		return !state().isLoading && !!state().currentUserId;
	});

	// Helper function to get widgets for a specific screen size
	function getScreenSizeWidgets(size: ScreenSize): WidgetPreference[] {
		return state().preferences[size];
	}

	// Ensure database is initialized
	async function ensureDbInitialized(): Promise<void> {
		if (browser && dbAdapter) {
			await dbAdapter.init?.();
		}
	}

	// Start auto-sync
	function startAutoSync() {
		if (!browser) return;

		// Check every 5 minutes
		syncInterval = setInterval(
			async () => {
				const currentState = state();
				if (currentState.currentUserId && (!currentState.lastSyncTime || Date.now() - currentState.lastSyncTime.getTime() > 30 * 60 * 1000)) {
					await loadPreferences(currentState.currentUserId).catch(console.error);
				}
			},
			5 * 60 * 1000
		);
	}

	// Stop auto-sync
	function stopAutoSync() {
		if (syncInterval) {
			clearInterval(syncInterval);
			syncInterval = null;
		}
	}

	// Set preferences for a specific screen size
	async function setPreference(userId: string, screenSize: ScreenSize, widgets: WidgetPreference[]) {
		const currentState = state();
		if (currentState.isLoading) return;

		state.update((s) => ({ ...s, isLoading: true, error: null }));

		try {
			await ensureDbInitialized();
			const newPreferences = { ...currentState.preferences, [screenSize]: widgets };

			if (dbAdapter) {
				await dbAdapter.updateSystemPreferences(userId, screenSize, widgets);
			}

			state.update((s) => ({
				...s,
				preferences: newPreferences,
				lastSyncTime: new Date(),
				currentUserId: userId,
				isLoading: false
			}));
		} catch (error) {
			state.update((s) => ({
				...s,
				error: error instanceof Error ? error.message : 'Failed to set preferences',
				isLoading: false
			}));
			throw error;
		}
	}

	// Load preferences from database
	async function loadPreferences(userId: string) {
		const currentState = state();
		if (currentState.isLoading) return;

		state.update((s) => ({ ...s, isLoading: true, error: null }));

		try {
			await ensureDbInitialized();

			if (dbAdapter) {
				const userPrefs = await dbAdapter.getSystemPreferences(userId);
				if (userPrefs) {
					state.update((s) => ({
						...s,
						preferences: userPrefs,
						lastSyncTime: new Date(),
						currentUserId: userId,
						isLoading: false
					}));
				} else {
					throw new Error('No preferences found');
				}
			}
		} catch (error) {
			state.update((s) => ({
				...s,
				error: error instanceof Error ? error.message : 'Failed to load preferences',
				isLoading: false
			}));
			throw error;
		}
	}

	// Clear all preferences
	async function clearPreferences(userId: string) {
		const currentState = state();
		if (currentState.isLoading) return;

		state.update((s) => ({ ...s, isLoading: true, error: null }));

		try {
			await ensureDbInitialized();
			const emptyPreferences = {
				[ScreenSize.SM]: [],
				[ScreenSize.MD]: [],
				[ScreenSize.LG]: [],
				[ScreenSize.XL]: []
			};

			if (dbAdapter) {
				await dbAdapter.clearSystemPreferences(userId);
			}

			state.update((s) => ({
				...s,
				preferences: emptyPreferences,
				lastSyncTime: new Date(),
				isLoading: false
			}));
		} catch (error) {
			state.update((s) => ({
				...s,
				error: error instanceof Error ? error.message : 'Failed to clear preferences',
				isLoading: false
			}));
			throw error;
		}
	}

	// Add a widget to preferences
	async function addWidget(userId: string, screenSize: ScreenSize, widget: WidgetPreference) {
		const currentState = state();
		if (currentState.isLoading) return;

		state.update((s) => ({ ...s, isLoading: true, error: null }));

		try {
			await ensureDbInitialized();
			const updatedWidgets = [...currentState.preferences[screenSize], widget];
			const newPreferences = { ...currentState.preferences, [screenSize]: updatedWidgets };

			if (dbAdapter) {
				await dbAdapter.updateSystemPreferences(userId, screenSize, updatedWidgets);
			}

			state.update((s) => ({
				...s,
				preferences: newPreferences,
				lastSyncTime: new Date(),
				isLoading: false
			}));
		} catch (error) {
			state.update((s) => ({
				...s,
				error: error instanceof Error ? error.message : 'Failed to add widget',
				isLoading: false
			}));
			throw error;
		}
	}

	// Remove a widget from preferences
	async function removeWidget(userId: string, screenSize: ScreenSize, widgetId: string) {
		const currentState = state();
		if (currentState.isLoading) return;

		state.update((s) => ({ ...s, isLoading: true, error: null }));

		try {
			await ensureDbInitialized();
			const updatedWidgets = currentState.preferences[screenSize].filter((w) => w.id !== widgetId);
			const newPreferences = { ...currentState.preferences, [screenSize]: updatedWidgets };

			if (dbAdapter) {
				await dbAdapter.updateSystemPreferences(userId, screenSize, updatedWidgets);
			}

			state.update((s) => ({
				...s,
				preferences: newPreferences,
				lastSyncTime: new Date(),
				isLoading: false
			}));
		} catch (error) {
			state.update((s) => ({
				...s,
				error: error instanceof Error ? error.message : 'Failed to remove widget',
				isLoading: false
			}));
			throw error;
		}
	}

	// Initialize auto-sync
	if (browser) {
		startAutoSync();
	}

	return {
		// Base store
		state,

		// Derived values
		hasPreferences,
		widgetCount,
		canSync,

		// Methods
		getScreenSizeWidgets,
		setPreference,
		loadPreferences,
		clearPreferences,
		addWidget,
		removeWidget,
		stopAutoSync
	};
}

// Create and export stores
const stores = createPreferencesStores();

// Export main store with full interface
export const userPreferences = {
	subscribe: stores.state.subscribe,
	setPreference: stores.setPreference,
	loadPreferences: stores.loadPreferences,
	clearPreferences: stores.clearPreferences,
	addWidget: stores.addWidget,
	removeWidget: stores.removeWidget
};

// Export derived values as functions
export const hasPreferences = stores.hasPreferences;
export const widgetCount = stores.widgetCount;
export const canSync = stores.canSync;

// Export helper function
export const getScreenSizeWidgets = stores.getScreenSizeWidgets;

// Cleanup on module unload
if (browser) {
	window.addEventListener('unload', stores.stopAutoSync);
}
