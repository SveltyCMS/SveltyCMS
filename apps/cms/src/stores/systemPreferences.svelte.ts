/**
 * @file src/stores/systemPreferences.svelte.ts
 * @description Manages user preferences with server-side persistence via a generic key-value API.
 *
 * Features:
 * - Reactive preferences with auto-refresh.
 * - Loads and saves preferences via the consolidated /api/systemPreferences endpoint.
 * - Uses a generic key-based approach for maximum flexibility (e.g., 'dashboard.layout.default').
 * - Supports efficient batch updates for operations like drag-and-drop.
 */

import type { DashboardWidgetConfig, Layout, SystemPreferences } from '@src/content/types';
import { writable } from 'svelte/store';
import { logger } from '@utils/logger';

// Initial state
const initialState: SystemPreferences = {
	preferences: [],
	loading: true,
	error: null
};

// The key used to store the user's main dashboard layout.
const DASHBOARD_LAYOUT_KEY = 'dashboard.layout.default';

function createSystemPreferencesStore() {
	const { subscribe, set, update } = writable<SystemPreferences>(initialState);

	// Fetch the entire dashboard layout object from the server.
	async function fetchLayout(): Promise<Layout | null> {
		try {
			const response = await fetch(`/api/systemPreferences?key=${DASHBOARD_LAYOUT_KEY}`);
			if (!response.ok) {
				if (response.status === 404) {
					logger.warn('No saved dashboard layout found for user. Using default.');
					return null; // No layout saved yet, this is not an error.
				}
				throw new Error(`Failed to fetch preferences: ${response.statusText}`);
			}
			const data = await response.json();
			return data as Layout;
		} catch (error) {
			console.error('Error fetching preferences:', error);
			throw error; // Re-throw to be caught by the caller.
		}
	}

	// Save the entire dashboard layout object to the server.
	async function saveLayout(layout: Layout): Promise<void> {
		try {
			const response = await fetch('/api/systemPreferences', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key: DASHBOARD_LAYOUT_KEY, value: layout })
			});
			if (!response.ok) {
				throw new Error(`Failed to save preferences: ${response.statusText}`);
			}
		} catch (error) {
			console.error('Error saving preferences:', error);
			// Optionally update store to show error state
			update((s) => ({ ...s, error: 'Failed to save preferences.' }));
		}
	}

	return {
		subscribe,
		// Load preferences for a user.
		loadPreferences: async () => {
			update((s) => ({ ...s, loading: true, error: null }));
			try {
				const layout = await fetchLayout();
				const preferences = (layout?.preferences || []).map((widget) => ({
					...widget,
					size: widget.size && typeof widget.size.w === 'number' && typeof widget.size.h === 'number' ? widget.size : { w: 1, h: 1 }
				}));
				set({ preferences, loading: false, error: null });
			} catch (error) {
				const message = error instanceof Error ? error.message : 'An unknown error occurred';
				set({ preferences: [], loading: false, error: message });
			}
		},

		// Overwrites the entire preference list and saves.
		setPreferences: async (preferences: DashboardWidgetConfig[]) => {
			const newLayout: Layout = { id: 'default', name: 'Default', preferences };
			update((s) => ({ ...s, preferences }));
			await saveLayout(newLayout);
		},

		// Adds or updates a single widget and saves the entire layout.
		updateWidget: async (widget: DashboardWidgetConfig) => {
			let newLayout: Layout | null = null;
			update((s) => {
				const preferences = [...s.preferences];
				const existingIndex = preferences.findIndex((w) => w.id === widget.id);
				if (existingIndex > -1) {
					preferences[existingIndex] = widget;
				} else {
					preferences.push(widget);
				}
				newLayout = { id: 'default', name: 'Default', preferences };
				return { ...s, preferences };
			});

			if (newLayout) {
				await saveLayout(newLayout);
			}
		},

		// Replaces the current widgets with a new set, ensuring order is updated.
		updateWidgets: async (widgets: DashboardWidgetConfig[]) => {
			const orderedWidgets = widgets.map((w, index) => ({ ...w, order: index }));
			const newLayout: Layout = { id: 'default', name: 'Default', preferences: orderedWidgets };
			update((s) => ({ ...s, preferences: orderedWidgets }));
			await saveLayout(newLayout);
		},

		// Removes a widget and saves the layout.
		removeWidget: async (widgetId: string) => {
			let newLayout: Layout | null = null;
			update((s) => {
				const preferences = s.preferences.filter((w) => w.id !== widgetId);
				newLayout = { id: 'default', name: 'Default', preferences };
				return { ...s, preferences };
			});

			if (newLayout) {
				await saveLayout(newLayout);
			}
		}
	};
}

// Export system preferences store
export const systemPreferences = createSystemPreferencesStore();
