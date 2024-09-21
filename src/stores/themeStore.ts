/**
 * @file src/stores/themeStore.ts
 * @description Manages the theme state for the application using Svelte stores.
 *
 * This module provides functionality to:
 * - Create and manage a writable store for the current theme
 * - Create a writable store for theme preview
 * - Initialize the theme based on server-provided data
 * - Persist theme changes via API calls
 *
 * The module handles dynamic themes fetched from the server, ensuring synchronization
 * between server and client.
 *
 * @requires svelte/store - For creating and managing Svelte stores
 * @requires @src/databases/dbInterface - For type definitions related to Theme
 *
 * @exports theme - A writable store holding the current theme object
 * @exports previewTheme - A writable store for theme preview functionality
 * @exports initializeThemeStore - Function to initialize the theme store with server data
 * @exports updateTheme - Function to update the theme via API call
 */

import { writable } from 'svelte/store';
import type { Theme } from '@src/databases/dbInterface'; // Ensure the correct import path

// Create a writable store to hold the current theme
export const theme = writable<Theme | null>(null);

// Create a writable store for theme preview functionality
export const previewTheme = writable<Theme | null>(null);

// Initialize the theme store with data fetched from the server
export function initializeThemeStore(initialTheme: Theme) {
	theme.set(initialTheme);
}

// Function to update the theme by communicating with the server/
export async function updateTheme(themeName: string): Promise<void> {
	try {
		const response = await fetch('/api/change-theme', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ themeName })
		});

		const result = await response.json();
		if (result.success) {
			// Optionally, you can fetch the updated theme from the server
			const updatedThemeResponse = await fetch('/api/get-current-theme');
			if (updatedThemeResponse.ok) {
				const updatedTheme: Theme = await updatedThemeResponse.json();
				theme.set(updatedTheme);
			} else {
				console.warn('Failed to fetch the updated theme.');
			}
		} else {
			alert('Failed to change theme: ' + result.error);
		}
	} catch (error) {
		console.error('Error changing theme:', error);
		alert('An error occurred while changing the theme.');
	}
}
