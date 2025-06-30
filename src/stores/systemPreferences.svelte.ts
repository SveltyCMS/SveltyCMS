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
import { store } from '@utils/reactivity.svelte';

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

	const state = store<PreferencesStoreState>(initialState);

	// Derived values
	const hasPreferences = $derived.by(() => {
		return Object.values(state().preferences).some((widgets) => widgets.length > 0);
	});

	const widgetCount = $derived.by(() => {
		return Object.values(state().preferences).reduce((sum, widgets) => sum + widgets.length, 0);
	});

	// Helper function to get widgets for a specific screen size
	function getScreenSizeWidgets(size: ScreenSize): WidgetPreference[] {
		const widgets = state().preferences[size] || [];
		return widgets.filter((w) => w && w.id && w.component && w.size && typeof w.gridPosition === 'number');
	}

	// Load preferences from server API and update store
	async function loadPreferences(userId: string) {
		state.update((s) => ({ ...s, isLoading: true, error: null, currentUserId: userId }));
		try {
			const res = await fetch(`/api/systemPreferences?userId=${encodeURIComponent(userId)}`, { method: 'GET' });
			if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

			const apiResponse = await res.json();
			const loadedPrefs = apiResponse.preferences as UserPreferences;

			state.update((s) => ({
				...s,
				preferences: loadedPrefs || initialState.preferences,
				isLoading: false,
				error: null,
				currentUserId: userId
			}));
		} catch (e) {
			state.update((s) => ({
				...s,
				isLoading: false,
				error: e instanceof Error ? e.message : 'Failed to load preferences'
			}));
			console.error('Failed to load preferences:', e);
		}
	}

	// Set preferences for a specific screen size (in-memory + persist to DB)
	async function setPreference(userId: string, screenSizeValue: ScreenSize, widgets: WidgetPreference[]) {
		state.update((s) => ({
			...s,
			preferences: { ...s.preferences, [screenSizeValue]: widgets },
			currentUserId: userId
		}));
		// Persist to DB
		try {
			await fetch('/api/systemPreferences', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId, preferences: state().preferences })
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
		state.update((s) => ({
			...s,
			preferences: emptyPreferences,
			currentUserId: userId
		}));
		// Persist to DB
		try {
			await fetch('/api/systemPreferences', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId, preferences: emptyPreferences })
			});
		} catch (e) {
			console.error('Failed to persist cleared preferences:', e);
		}
	}

	// Add a widget to preferences (in-memory only)
	function addWidget(userId: string, screenSizeValue: ScreenSize, widget: WidgetPreference) {
		state.update((s) => {
			const updatedWidgets = [...s.preferences[screenSizeValue], widget];
			return {
				...s,
				preferences: { ...s.preferences, [screenSizeValue]: updatedWidgets },
				currentUserId: userId
			};
		});
	}

	// Remove a widget from preferences (in-memory only)
	function removeWidget(userId: string, screenSizeValue: ScreenSize, widgetId: string) {
		state.update((s) => {
			const updatedWidgets = s.preferences[screenSizeValue].filter((w) => w.id !== widgetId);
			return {
				...s,
				preferences: { ...s.preferences, [screenSizeValue]: updatedWidgets },
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
