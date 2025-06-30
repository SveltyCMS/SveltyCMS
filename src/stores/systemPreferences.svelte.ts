/**
 * @file src/stores/systemPreferences.svelte.ts
 * @description User dashboard system preferences management (syncs with DB via API)
 *
 * Features:
 * - Reactive user preferences management with auto-refresh
 * - Loads and saves preferences from/to server API
 * - Error handling for API calls
 * - TypeScript support with custom WidgetPreference type
 */

import { ScreenSize } from '@stores/screenSizeStore.svelte';

// Widget preference interface
export interface WidgetPreference {
	id: string;
	component: string;
	label: string;
	icon: string;
	x: number;
	y: number;
	w: number;
	h: number;
	min?: { w: number; h: number };
	max?: { w: number; h: number };
	movable?: boolean;
	resizable?: boolean;
	defaultW?: number;
	defaultH?: number;
	validSizes?: { w: number; h: number }[];
}

// User preferences interface
export interface UserPreferences {
	[ScreenSize.SM]: WidgetPreference[];
	[ScreenSize.MD]: WidgetPreference[];
	[ScreenSize.LG]: WidgetPreference[];
	[ScreenSize.XL]: WidgetPreference[];
}

// State interface
export interface PreferencesStoreState {
	preferences: UserPreferences;
	isLoading: boolean;
	error: string | null;
	currentUserId: string | null;
}

// Create base stores
function createPreferencesStores() {
	// Initial state
	const initialState: PreferencesStoreState = {
		preferences: {
			[ScreenSize.SM]: [],
			[ScreenSize.MD]: [],
			[ScreenSize.LG]: [],
			[ScreenSize.XL]: []
		},
		isLoading: false,
		error: null,
		currentUserId: null
	};

	const state = $state<PreferencesStoreState>(initialState);

	// Derived values
	const hasPreferences = $derived.by(() => {
		return Object.values(state().preferences).some((widgets) => widgets.length > 0);
	});

	const widgetCount = $derived.by(() => {
		return Object.values(state().preferences).reduce((sum, widgets) => sum + widgets.length, 0);
	});

	// Helper function to get widgets for a specific screen size
	function getScreenSizeWidgets(size: ScreenSize): WidgetPreference[] {
		return state().preferences[size];
	}

	// Load preferences from server API and update store
	async function loadPreferences(userId: string) {
		state.isLoading = true;
		state.error = null;
		state.currentUserId = userId;
		try {
			const res = await fetch('/api/systemPreferences', { method: 'GET' }); // Ensure your API endpoint matches
			if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

			const apiResponse = await res.json();
			const loadedPrefs = apiResponse.preferences as UserPreferences;

			state.preferences = loadedPrefs || initialState.preferences;
			state.isLoading = false;
			state.error = null;
			state.currentUserId = userId;
		} catch (e) {
			state.isLoading = false;
			state.error = e instanceof Error ? e.message : 'Failed to load preferences';
			console.error('Failed to load preferences:', e);
		}
	}

	// Set preferences for a specific screen size (in-memory + persist to DB)
	async function setPreference(userId: string, screenSizeValue: ScreenSize, widgets: WidgetPreference[]) {
		state.preferences = { ...state.preferences, [screenSizeValue]: widgets };
		state.currentUserId = userId;
		// Persist to DB
		try {
			await fetch('/api/systemPreferences', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ preferences: state.preferences })
			});
		} catch (e) {
			console.error('Failed to persist preferences:', e);
		}
	}

	// Clear all preferences (in-memory + persist to DB)
	async function clearPreferences(userId: string) {
		const emptyPreferences: UserPreferences = {
			[ScreenSize.SM]: [],
			[ScreenSize.MD]: [],
			[ScreenSize.LG]: [],
			[ScreenSize.XL]: []
		};
		state.preferences = emptyPreferences;
		state.currentUserId = userId;
		// Persist to DB
		try {
			await fetch('/api/systemPreferences', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ preferences: emptyPreferences })
			});
		} catch (e) {
			console.error('Failed to persist cleared preferences:', e);
		}
	}

	// Add a widget to preferences (in-memory only)
	function addWidget(userId: string, screenSizeValue: ScreenSize, widget: WidgetPreference) {
		state.preferences = { ...state.preferences, [screenSizeValue]: [...state.preferences[screenSizeValue], widget] };
		state.currentUserId = userId;
	}

	// Remove a widget from preferences (in-memory only)
	function removeWidget(userId: string, screenSizeValue: ScreenSize, widgetId: string) {
		state.preferences = { ...state.preferences, [screenSizeValue]: state.preferences[screenSizeValue].filter((w) => w.id !== widgetId) };
		state.currentUserId = userId;
	}

	return {
		// Base store
		state,
		// Derived values
		hasPreferences: () => hasPreferences,
		widgetCount: () => widgetCount,
		// Methods
		getScreenSizeWidgets,
		setPreference,
		loadPreferences,
		clearPreferences,
		addWidget,
		removeWidget
	};
}

// Create and export stores
const stores = createPreferencesStores();

// Export main store with full interface
export const systemPreferences = {
	subscribe: stores.state.subscribe,
	setPreference: stores.setPreference,
	loadPreferences: stores.loadPreferences,
	clearPreferences: stores.clearPreferences,
	addWidget: stores.addWidget,
	removeWidget: stores.removeWidget
};

// Export derived values as functions that return the derived rune value
export const hasPreferences = stores.hasPreferences(); // Call to get the rune value
export const widgetCount = stores.widgetCount(); // Call to get the rune value
// Export helper function
export const getScreenSizeWidgets = stores.getScreenSizeWidgets;

export const themeStore = {
	get state() { return state; },
	get theme() { return theme; },
	// ...other getters and methods
};
