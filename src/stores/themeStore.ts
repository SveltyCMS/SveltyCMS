/**
 * @file themeStore.ts
 * @description Manages the theme state for the application using Svelte stores.
 *
 * This module provides functionality to:
 * - Create and manage a writable store for the current theme
 * - Create a writable store for theme preview
 * - Initialize the theme based on localStorage or system preferences
 * - Listen for changes in system color scheme preference
 * - Persist theme changes to localStorage
 *
 * The module handles both 'light' and 'dark' themes, with the ability to switch between them
 * and preview themes before applying.
 *
 * @requires svelte/store - For creating and managing Svelte stores
 *
 * @exports theme - A writable store holding the current theme ('light' or 'dark')
 * @exports previewTheme - A writable store for theme preview functionality
 */

import { writable } from 'svelte/store';

// create a writable store to hold the current theme
export const theme = writable(localStorage.getItem('theme') || 'light');
export const previewTheme = writable<string | null>(null);

// check if the user has a preferred theme stored in localStorage
if (localStorage.theme) {
	theme.set(localStorage.theme);
} else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
	// if not, check if the user's operating system prefers a dark color scheme
	theme.set('dark');
}

// listen for changes to the user's preferred color scheme
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
	if (event.matches) {
		theme.set('dark');
	} else {
		theme.set('light');
	}
});

// subscribe to changes in the theme store and update localStorage accordingly
theme.subscribe((value) => {
	localStorage.theme = value;
});
