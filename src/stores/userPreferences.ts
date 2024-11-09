/**
 * @file src/stores/userPreferences.ts
 * @description User preferences management
 *
 * Features:
 * - Widget preferences for different screen sizes
 * - Database persistence
 * - Screen size-specific layouts
 * - Widget addition and removal
 * - Error handling and recovery
 */

import { ScreenSize } from '@stores/screenSizeStore';
import { browser } from '$app/environment';
import { dbAdapter, initializationPromise } from '@src/databases/db';

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

class UserPreferencesManager {
	private syncInterval: NodeJS.Timeout | null = null;

	// State declaration
	$state = {
		preferences: {
			[ScreenSize.SM]: [],
			[ScreenSize.MD]: [],
			[ScreenSize.LG]: [],
			[ScreenSize.XL]: []
		} as UserPreferences,
		isLoading: false,
		error: null as string | null,
		lastSyncTime: null as Date | null,
		currentUserId: null as string | null
	};

	constructor() {
		// Set up auto-sync in browser environment
		if (browser) {
			this.startAutoSync();
		}
	}

	// Start auto-sync
	private startAutoSync() {
		// Check every 5 minutes
		this.syncInterval = setInterval(
			() => {
				if (this.$state.currentUserId && (!this.$state.lastSyncTime || Date.now() - this.$state.lastSyncTime.getTime() > 30 * 60 * 1000)) {
					this.loadPreferences(this.$state.currentUserId).catch(console.error);
				}
			},
			5 * 60 * 1000
		);
	}

	// Stop auto-sync
	private stopAutoSync() {
		if (this.syncInterval) {
			clearInterval(this.syncInterval);
			this.syncInterval = null;
		}
	}

	// Computed values
	get $derived() {
		return {
			hasPreferences: Object.values(this.$state.preferences).some((widgets) => widgets.length > 0),
			widgetCount: Object.values(this.$state.preferences).reduce((sum, widgets) => sum + widgets.length, 0),
			screenSizeWidgets: (size: ScreenSize) => this.$state.preferences[size],
			canSync: !this.$state.isLoading && !!this.$state.currentUserId
		};
	}

	// Ensure database is initialized
	private async ensureDbInitialized(): Promise<void> {
		if (browser) {
			await initializationPromise;
		}
	}

	// Set preferences for a specific screen size
	async setPreference(userId: string, screenSize: ScreenSize, widgets: WidgetPreference[]) {
		if (this.$state.isLoading) return;

		this.$state.isLoading = true;
		this.$state.error = null;

		try {
			await this.ensureDbInitialized();

			this.$state.preferences = {
				...this.$state.preferences,
				[screenSize]: widgets
			};

			if (dbAdapter) {
				await dbAdapter.updateSystemPreferences(userId, screenSize, widgets);
			}

			this.$state.lastSyncTime = new Date();
			this.$state.currentUserId = userId;
		} catch (error) {
			this.$state.error = error instanceof Error ? error.message : 'Failed to set preferences';
			throw error;
		} finally {
			this.$state.isLoading = false;
		}
	}

	// Load preferences from database
	async loadPreferences(userId: string) {
		if (this.$state.isLoading) return;

		this.$state.isLoading = true;
		this.$state.error = null;

		try {
			await this.ensureDbInitialized();

			if (dbAdapter) {
				const userPrefs = await dbAdapter.getSystemPreferences(userId);
				if (userPrefs) {
					this.$state.preferences = userPrefs;
				}
			}

			this.$state.lastSyncTime = new Date();
			this.$state.currentUserId = userId;
		} catch (error) {
			this.$state.error = error instanceof Error ? error.message : 'Failed to load preferences';
			// Keep existing preferences on error
		} finally {
			this.$state.isLoading = false;
		}
	}

	// Clear all preferences
	async clearPreferences(userId: string) {
		if (this.$state.isLoading) return;

		this.$state.isLoading = true;
		this.$state.error = null;

		try {
			await this.ensureDbInitialized();

			this.$state.preferences = {
				[ScreenSize.SM]: [],
				[ScreenSize.MD]: [],
				[ScreenSize.LG]: [],
				[ScreenSize.XL]: []
			};

			if (dbAdapter) {
				await dbAdapter.clearSystemPreferences(userId);
			}

			this.$state.lastSyncTime = new Date();
		} catch (error) {
			this.$state.error = error instanceof Error ? error.message : 'Failed to clear preferences';
			throw error;
		} finally {
			this.$state.isLoading = false;
		}
	}

	// Add a widget to preferences
	async addWidget(userId: string, screenSize: ScreenSize, widget: WidgetPreference) {
		if (this.$state.isLoading) return;

		this.$state.isLoading = true;
		this.$state.error = null;

		try {
			await this.ensureDbInitialized();

			const updatedWidgets = [...this.$state.preferences[screenSize], widget];
			this.$state.preferences = {
				...this.$state.preferences,
				[screenSize]: updatedWidgets
			};

			if (dbAdapter) {
				await dbAdapter.updateSystemPreferences(userId, screenSize, updatedWidgets);
			}

			this.$state.lastSyncTime = new Date();
		} catch (error) {
			this.$state.error = error instanceof Error ? error.message : 'Failed to add widget';
			throw error;
		} finally {
			this.$state.isLoading = false;
		}
	}

	// Remove a widget from preferences
	async removeWidget(userId: string, screenSize: ScreenSize, widgetId: string) {
		if (this.$state.isLoading) return;

		this.$state.isLoading = true;
		this.$state.error = null;

		try {
			await this.ensureDbInitialized();

			const updatedWidgets = this.$state.preferences[screenSize].filter((w) => w.id !== widgetId);
			this.$state.preferences = {
				...this.$state.preferences,
				[screenSize]: updatedWidgets
			};

			if (dbAdapter) {
				await dbAdapter.updateSystemPreferences(userId, screenSize, updatedWidgets);
			}

			this.$state.lastSyncTime = new Date();
		} catch (error) {
			this.$state.error = error instanceof Error ? error.message : 'Failed to remove widget';
			throw error;
		} finally {
			this.$state.isLoading = false;
		}
	}

	// Cleanup method
	destroy() {
		this.stopAutoSync();
	}
}

// Create and export singleton instance
export const preferencesManager = new UserPreferencesManager();

// For backward compatibility with existing code
export const userPreferences = {
	subscribe: (fn: (value: UserPreferences) => void) => {
		fn(preferencesManager.$state.preferences);
		return () => {
			preferencesManager.destroy();
		};
	},
	setPreference: (userId: string, screenSize: ScreenSize, widgets: WidgetPreference[]) =>
		preferencesManager.setPreference(userId, screenSize, widgets),
	loadPreferences: (userId: string) => preferencesManager.loadPreferences(userId),
	clearPreferences: (userId: string) => preferencesManager.clearPreferences(userId),
	addWidget: (userId: string, screenSize: ScreenSize, widget: WidgetPreference) => preferencesManager.addWidget(userId, screenSize, widget),
	removeWidget: (userId: string, screenSize: ScreenSize, widgetId: string) => preferencesManager.removeWidget(userId, screenSize, widgetId)
};
