/**
 * @file src/stores/userPreferences.ts
 * @description This module defines a Svelte store for managing user preferences related to widgets on different screen sizes.
 *
 * The store integrates with a database through a `dbAdapter` to persist user preferences across sessions.
 * It supports the following operations:
 * - **setPreference**: Updates user preferences for a specific screen size and saves them to the database.
 * - **loadPreferences**: Retrieves user preferences from the database and initializes the store.
 * - **clearPreferences**: Clears user preferences from the store and database.
 * - **addWidget**: Adds a new widget to the user preferences for a specified screen size and updates the database.
 * - **removeWidget**: Removes a widget from the user preferences for a specified screen size and updates the database.
 *
 * The `UserPreferences` interface and the corresponding default values are aligned with different screen sizes defined in the `ScreenSize` enum.
 *
 * @requires svelte/store
 * @requires $app/environment (for browser environment check)
 * @requires @src/databases/db (for database adapter)
 */

import { writable } from 'svelte/store';
import { ScreenSize } from '@stores/screenSizeStore'; // Adjust path if necessary
import { browser } from '$app/environment';
import { dbAdapter, initializationPromise } from '@src/databases/db';

// WidgetPreference interface remains the same
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

export interface UserPreferences {
	[ScreenSize.SM]: WidgetPreference[];
	[ScreenSize.MD]: WidgetPreference[];
	[ScreenSize.LG]: WidgetPreference[];
	[ScreenSize.XL]: WidgetPreference[];
}

const defaultPreferences: UserPreferences = {
	[ScreenSize.SM]: [],
	[ScreenSize.MD]: [],
	[ScreenSize.LG]: [],
	[ScreenSize.XL]: []
};

// Function to ensure database initialization
async function ensureDbInitialized(): Promise<void> {
	if (browser) {
		await initializationPromise;
	}
}

// Create user preferences store
function createUserPreferencesStore() {
	const { subscribe, set, update } = writable<UserPreferences>(defaultPreferences);

	return {
		subscribe,
		setPreference: async (userId: string, screenSize: ScreenSize, widgets: WidgetPreference[]) => {
			try {
				await ensureDbInitialized();
				update((prefs) => ({
					...prefs,
					[screenSize]: widgets
				}));
				if (dbAdapter) {
					await dbAdapter.updateSystemPreferences(userId, screenSize, widgets);
				}
			} catch (error) {
				console.error(`Failed to set preference: ${(error as Error).message}`);
				throw error;
			}
		},
		loadPreferences: async (userId: string) => {
			try {
				await ensureDbInitialized();
				if (dbAdapter) {
					const userPrefs = await dbAdapter.getSystemPreferences(userId);
					if (userPrefs) {
						set(userPrefs);
					} else {
						set(defaultPreferences);
					}
				}
			} catch (error) {
				console.error(`Failed to load preferences: ${(error as Error).message}`);
				set(defaultPreferences); // Fallback to default preferences on error
			}
		},
		clearPreferences: async (userId: string) => {
			try {
				await ensureDbInitialized();
				set(defaultPreferences);
				if (dbAdapter) {
					await dbAdapter.clearSystemPreferences(userId); // Ensure this method is implemented in your adapter
				}
			} catch (error) {
				console.error(`Failed to clear preferences: ${(error as Error).message}`);
				throw error;
			}
		},
		addWidget: async (userId: string, screenSize: ScreenSize, widget: WidgetPreference) => {
			try {
				await ensureDbInitialized();
				update((prefs) => {
					const updatedPrefs = {
						...prefs,
						[screenSize]: [...prefs[screenSize], widget]
					};
					if (dbAdapter) {
						dbAdapter.updateSystemPreferences(userId, screenSize, updatedPrefs[screenSize]);
					}
					return updatedPrefs;
				});
			} catch (error) {
				console.error(`Failed to add widget: ${(error as Error).message}`);
				throw error;
			}
		},
		removeWidget: async (userId: string, screenSize: ScreenSize, widgetId: string) => {
			try {
				await ensureDbInitialized();
				update((prefs) => {
					const updatedPrefs = {
						...prefs,
						[screenSize]: prefs[screenSize].filter((w) => w.id !== widgetId)
					};
					if (dbAdapter) {
						dbAdapter.updateSystemPreferences(userId, screenSize, updatedPrefs[screenSize]);
					}
					return updatedPrefs;
				});
			} catch (error) {
				console.error(`Failed to remove widget: ${(error as Error).message}`);
				throw error;
			}
		}
	};
}

export const userPreferences = createUserPreferencesStore();
