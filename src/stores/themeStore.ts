/**
 * @file src/stores/themeStore.ts
 * @description Theme store using Svelte 5 Runes with reactive state management
 *
 * This module provides a centralized store for managing the application's theme.
 * It utilizes Svelte 5 Runes for reactive state management and handles theme
 * initialization and updates through API calls.
 *
 * Features:
 * - Reactive theme state management using Svelte 5 Runes
 * - Asynchronous theme initialization from server
 * - Theme updating with server synchronization
 * - Error handling for API calls
 * - TypeScript support with custom Theme type
 *
 * Usage:
 * 1. Import the store and functions:
 *    import { themeStore, initializeThemeStore, updateTheme } from './themeStore';
 *
 * 2. Initialize the theme store (typically in your app's entry point):
 *    await initializeThemeStore();
 *
 * 3. Access the current theme reactively:
 *    $: currentTheme = themeStore.currentTheme;
 *
 * 4. Update the theme:
 *    await updateTheme('dark');
 *
 * Note: Ensure that the API endpoints ('/api/get-current-theme' and '/api/change-theme')
 * are properly set up on your server to handle theme operations.
 */

import type { Theme } from '@src/databases/dbInterface';

// Create a state object that contains the current theme
export const themeStore = $state({
	currentTheme: null as Theme | null
});

// Initializes the theme store by fetching the current theme from the server.
export async function initializeThemeStore() {
	try {
		const response = await fetch('/api/get-current-theme');
		if (response.ok) {
			themeStore.currentTheme = await response.json();
		} else {
			console.error('Failed to fetch the current theme:', response.statusText);
			themeStore.currentTheme = null;
		}
	} catch (error) {
		console.error('Error initializing theme store:', error);
		themeStore.currentTheme = null;
	}
}

// Updates the theme by sending a request to the server's ThemeManager
export async function updateTheme(themeName: string): Promise<void> {
	try {
		const response = await fetch('/api/change-theme', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ themeName })
		});

		const result = await response.json();

		if (result.success) {
			const updatedThemeResponse = await fetch('/api/get-current-theme');
			if (updatedThemeResponse.ok) {
				themeStore.currentTheme = await updatedThemeResponse.json();
			} else {
				console.warn('Failed to fetch the updated theme:', updatedThemeResponse.statusText);
			}
		} else {
			console.error('Failed to change theme:', result.error);
			alert('Failed to change theme: ' + result.error);
		}
	} catch (error) {
		console.error('Error changing theme:', error);
		alert('An error occurred while changing the theme.');
	}
}
