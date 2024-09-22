/**
 * @file src/stores/themeStore.ts
 * @description Simplified theme store that interfaces with ThemeManager via API calls.
 *
 * This module provides:
 * - A writable store for the current theme
 * - Initialization of the theme from the server
 * - Updating the theme through API interactions
 *
 * @requires svelte/store - For creating and managing Svelte stores
 *
 * @exports theme - A writable store holding the current theme object
 * @exports initializeThemeStore - Function to initialize the theme store with server data
 * @exports updateTheme - Function to update the theme via API call
 */

import { writable } from 'svelte/store';
import type { Theme } from '@src/databases/dbInterface'; // Ensure the correct import path

// Create a writable store to hold the current theme
export const theme = writable<Theme | null>(null);

/**
 * Initializes the theme store by fetching the current theme from the server.
 * Should be called during the application's bootstrap process.
 */
export async function initializeThemeStore() {
	try {
		const response = await fetch('/api/get-current-theme');
		if (response.ok) {
			const currentTheme: Theme = await response.json();
			theme.set(currentTheme);
		} else {
			console.error('Failed to fetch the current theme:', response.statusText);
			// Optionally, set a fallback theme
			theme.set(null);
		}
	} catch (error) {
		console.error('Error initializing theme store:', error);
		// Optionally, set a fallback theme
		theme.set(null);
	}
}

/**
 * Updates the theme by sending a request to the server's ThemeManager.
 * @param themeName - The name of the theme to switch to
 */
export async function updateTheme(themeName: string): Promise<void> {
	try {
		// Send a request to change the theme
		const response = await fetch('/api/change-theme', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ themeName })
		});

		const result = await response.json();

		if (result.success) {
			// Fetch the updated theme from the server to ensure synchronization
			const updatedThemeResponse = await fetch('/api/get-current-theme');
			if (updatedThemeResponse.ok) {
				const updatedTheme: Theme = await updatedThemeResponse.json();
				theme.set(updatedTheme);
			} else {
				console.warn('Failed to fetch the updated theme:', updatedThemeResponse.statusText);
				// Optionally, set a fallback theme or handle accordingly
			}
		} else {
			console.error('Failed to change theme:', result.error);
			alert('Failed to change theme: ' + result.error);
			// Optionally, handle the error (e.g., revert UI changes)
		}
	} catch (error) {
		console.error('Error changing theme:', error);
		alert('An error occurred while changing the theme.');
		// Optionally, handle the error (e.g., revert UI changes)
	}
}
