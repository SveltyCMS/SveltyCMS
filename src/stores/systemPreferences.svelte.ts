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

// State interface
export interface PreferencesStoreState {
	preferences: WidgetPreference[];
	isLoading: boolean;
	error: string | null;
	currentUserId: string | null;
}

// Create base stores
function createPreferencesStores() {
	// Initial state
	const initialState: PreferencesStoreState = {
		preferences: [],
		isLoading: false,
		error: null,
		currentUserId: null
	};

	const state = $state<PreferencesStoreState>(initialState);

	// Derived values
	const hasPreferences = $derived.by(() => {
		return state().preferences.length > 0;
	});

	const widgetCount = $derived.by(() => {
		return state().preferences.length;
	});

	// Load preferences from server API and update store
	async function loadPreferences(userId: string) {
		state.update((s) => ({ ...s, isLoading: true, error: null, currentUserId: userId }));
		try {
			const res = await fetch(`/api/systemPreferences?userId=${encodeURIComponent(userId)}`, { method: 'GET' });
			if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

			const apiResponse = await res.json();
			const loadedPrefs = apiResponse.preferences as WidgetPreference[];

			state.update((s) => ({
				...s,
				preferences: loadedPrefs || [],
				isLoading: false,
				error: null,
				currentUserId: userId
			}));
		} catch (e) {
			console.error('Failed to load preferences:', e);
			state.update((s) => ({
				...s,
				isLoading: false,
				error: e instanceof Error ? e.message : 'Failed to load preferences'
			}));
		}
	}

	// Set preferences (in-memory + persist to DB)
	async function setPreference(userId: string, widgets: WidgetPreference[]) {
		state.update((s) => ({
			...s,
			preferences: widgets,
			currentUserId: userId
		}));
		// Persist to DB
		try {
			const response = await fetch('/api/systemPreferences', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId, preferences: widgets })
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
		} catch (e) {
			console.error('Failed to persist preferences:', e);
		}
	}

	// Clear all preferences (in-memory + persist to DB)
	async function clearPreferences(userId: string) {
		state.update((s) => ({
			...s,
			preferences: [],
			currentUserId: userId
		}));
		// Persist to DB
		try {
			await fetch('/api/systemPreferences', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId, preferences: [] })
			});
		} catch (e) {
			console.error('Failed to persist cleared preferences:', e);
		}
	}

	// Add a widget to preferences (in-memory only)
	function addWidget(userId: string, widget: WidgetPreference) {
		state.update((s) => {
			const updatedWidgets = [...s.preferences, widget];
			return {
				...s,
				preferences: updatedWidgets,
				currentUserId: userId
			};
		});
	}

	// Remove a widget from preferences (in-memory only)
	function removeWidget(userId: string, widgetId: string) {
		state.update((s) => {
			const updatedWidgets = s.preferences.filter((w) => w.id !== widgetId);
			return {
				...s,
				preferences: updatedWidgets,
				currentUserId: userId
			};
		});
	}

	return {
		// Base store
		state,
		// Derived values
		hasPreferences: () => hasPreferences,
		widgetCount: () => widgetCount,
		// Methods
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
export const hasPreferences = stores.hasPreferences();
export const widgetCount = stores.widgetCount();
