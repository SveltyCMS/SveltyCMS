/**
 * @file src/stores/themeStore.ts
 * @description Theme management
 *
 * Features:
 * - Reactive theme state management with auto-refresh
 * - Asynchronous theme initialization from server
 * - Theme updating with server synchronization
 * - Error handling for API calls
 * - TypeScript support with custom Theme type
 *
 */

import type { Theme } from '@src/databases/dbInterface';

// Theme manager class
class ThemeManager {
	private refreshInterval: NodeJS.Timeout | null = null;

	// State declaration
	$state = {
		currentTheme: null as Theme | null,
		isLoading: false,
		error: null as string | null,
		lastUpdateAttempt: null as Date | null
	};

	// Computed values
	get $derived() {
		return {
			hasTheme: !!this.$state.currentTheme,
			themeName: this.$state.currentTheme?.name ?? 'default',
			isDefault: this.$state.currentTheme?.isDefault ?? false,
			canUpdate: !this.$state.isLoading
		};
	}

	constructor() {
		// Set up auto-refresh in browser environment
		if (typeof window !== 'undefined') {
			this.startAutoRefresh();
		}
	}

	// Start auto-refresh for stale theme
	private startAutoRefresh() {
		// Check every hour
		this.refreshInterval = setInterval(
			() => {
				if (this.isThemeStale()) {
					this.initialize().catch(console.error);
				}
			},
			60 * 60 * 1000
		); // Check every hour
	}

	// Stop auto-refresh
	private stopAutoRefresh() {
		if (this.refreshInterval) {
			clearInterval(this.refreshInterval);
			this.refreshInterval = null;
		}
	}

	// Initialize theme
	async initialize() {
		if (this.$state.isLoading) return;

		this.$state.isLoading = true;
		this.$state.error = null;

		try {
			const response = await fetch('/api/get-current-theme');
			if (!response.ok) {
				throw new Error(`Failed to fetch theme: ${response.statusText}`);
			}

			const theme = await response.json();
			this.$state.currentTheme = theme;
			this.$state.lastUpdateAttempt = new Date();
		} catch (error) {
			this.$state.error = error instanceof Error ? error.message : 'Failed to initialize theme';
			this.$state.currentTheme = null;
		} finally {
			this.$state.isLoading = false;
		}
	}

	// Update theme
	async updateTheme(themeName: string): Promise<void> {
		if (this.$state.isLoading) {
			throw new Error('Theme update already in progress');
		}

		this.$state.isLoading = true;
		this.$state.error = null;

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

			this.$state.currentTheme = await themeResponse.json();
			this.$state.lastUpdateAttempt = new Date();
		} catch (error) {
			this.$state.error = error instanceof Error ? error.message : 'Failed to update theme';
			throw error;
		} finally {
			this.$state.isLoading = false;
		}
	}

	// Reset error state
	clearError() {
		this.$state.error = null;
	}

	// Check if theme is stale (hasn't been updated in 24 hours)
	isThemeStale(): boolean {
		if (!this.$state.lastUpdateAttempt) return true;

		const twentyFourHours = 24 * 60 * 60 * 1000;
		return Date.now() - this.$state.lastUpdateAttempt.getTime() > twentyFourHours;
	}

	// Cleanup method
	destroy() {
		this.stopAutoRefresh();
	}
}

// Create and export singleton instance
export const themeManager = new ThemeManager();

// For backward compatibility with existing code
export const themeStore = {
	subscribe: (fn: (value: { currentTheme: Theme | null }) => void) => {
		fn({ currentTheme: themeManager.$state.currentTheme });
		return () => {
			themeManager.destroy();
		};
	}
};

// Export initialization and update functions
export const initializeThemeStore = () => themeManager.initialize();
export const updateTheme = (themeName: string) => themeManager.updateTheme(themeName);
