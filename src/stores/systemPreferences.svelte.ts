/**
 * @file src/stores/systemPreferences.svelte.ts

 * @description Manages user widget preferences with server-side persistence via API. Supports server-generated UUIDs and dynamic width/height sizing for a responsive grid layout.
 *
 * Features:
 * - Reactive widget preferences with auto-refresh
 * - Server-side UUID generation for new widgets
 * - Loads and saves preferences via /api/systemPreferences
 * - Error handling for API calls
 * - TypeScript support with aligned WidgetPreference type
 */

import { writable } from 'svelte/store';
import type { DashboardWidgetConfig, SystemPreferences } from '@config/dashboard.types';

// Initial state
const initialState: SystemPreferences = {
	preferences: [],
	loading: true,
	error: null
};

// Create system preferences store
function createSystemPreferencesStore() {
	const { subscribe, set, update } = writable<SystemPreferences>(initialState);

	// Fetch preferences from server
	async function fetchPreferences(userId: string): Promise<DashboardWidgetConfig[]> {
		try {
			const response = await fetch(`/api/systemPreferences?userId=${userId}`);
			if (!response.ok) {
				throw new Error(`Failed to fetch preferences: ${response.statusText}`);
			}
			const data = await response.json();
			return data.preferences || [];
		} catch (error) {
			console.error('Error fetching preferences:', error);
			return [];
		}
	}

	// Save preferences to server
	async function savePreferences(userId: string, preferences: DashboardWidgetConfig[]): Promise<void> {
		try {
			const response = await fetch('/api/systemPreferences', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId, preferences })
			});
			if (!response.ok) {
				throw new Error(`Failed to save preferences: ${response.statusText}`);
			}
		} catch (error) {
			console.error('Error saving preferences:', error);
		}
	}

	return {
		subscribe,
		getState: () => {
			let state: SystemPreferences = initialState;
			subscribe((s) => (state = s))();
			return state;
		},
		// Load preferences for a user
		loadPreferences: async (userId: string) => {
			update((s) => ({ ...s, loading: true, error: null }));
			try {
				const preferences = await fetchPreferences(userId);
				set({ preferences, loading: false, error: null });
			} catch (error) {
				const message = error instanceof Error ? error.message : 'An unknown error occurred';
				set({ preferences: [], loading: false, error: message });
			}
		},
		// Set preferences (in-memory + persist to DB)
		setPreference: async (userId: string, preferences: DashboardWidgetConfig[]) => {
			update((s) => ({ ...s, preferences }));
			await savePreferences(userId, preferences);
		},
		// Update a widget in preferences (in-memory + persist to DB)
		updateWidget: async (userId: string, widget: DashboardWidgetConfig) => {
			let updatedPreferences: DashboardWidgetConfig[] = [];

			update((s) => {
				const existingIndex = s.preferences.findIndex((w) => w.id === widget.id);
				const preferences = [...s.preferences];
				if (existingIndex > -1) {
					preferences[existingIndex] = widget;
				} else {
					preferences.push(widget);
				}
				updatedPreferences = preferences;
				return { ...s, preferences };
			});

			// Await the save to ensure it completes with the correct data
			await savePreferences(userId, updatedPreferences);
		},

		// Batch update multiple widgets (more efficient for drag-and-drop)
		updateWidgets: async (userId: string, widgets: DashboardWidgetConfig[]) => {
			update((s) => {
				const preferences = [...s.preferences];

				widgets.forEach((widget) => {
					const existingIndex = preferences.findIndex((w) => w.id === widget.id);
					if (existingIndex > -1) {
						preferences[existingIndex] = widget;
					} else {
						preferences.push(widget);
					}
				});

				return { ...s, preferences };
			});

			// Save all at once
			const currentState = (() => {
				let state: SystemPreferences = initialState;
				subscribe((s) => (state = s))();
				return state;
			})();

			await savePreferences(userId, currentState.preferences);
		},
		// Remove a widget from preferences (in-memory + persist to DB)
		removeWidget: async (userId: string, widgetId: string) => {
			update((s) => {
				const preferences = s.preferences.filter((w) => w.id !== widgetId);
				savePreferences(userId, preferences);
				return { ...s, preferences };
			});
		}
	};
}

// Export system preferences store
export const systemPreferences = createSystemPreferencesStore();
