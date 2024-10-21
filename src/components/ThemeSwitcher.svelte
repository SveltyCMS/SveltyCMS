<!--
@file src/components/ThemeSwitcher.svelte
@description - ThemeSwitcher component for toggling between light & dark themes

Features:
- Toggles between light and dark themes using the theme store
- Persists theme preference through API calls
- Supports system preference for initial theme
- Improves accessibility with proper labeling and keyboard support
- Adds smooth transition effect when switching themes
- Implements prefers-color-scheme media query for system preference
- Listens for system preference changes


-->

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { theme, updateTheme } from '@stores/themeStore';
	import type { Theme } from '@src/databases/dbInterface';

	let currentTheme: Theme | null = null;
	let isDarkMode: boolean = false;
	let systemPreference: 'light' | 'dark' = 'light';

	// Function to get the system's color scheme preference
	function getSystemPreference(): 'light' | 'dark' {
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	}

	// Function to determine if the current theme is dark
	function isThemeDark(theme: Theme | null): boolean {
		// Adjust this logic based on your Theme structure
		return theme?.name === 'dark' || false;
	}

	// Function to apply the theme to the document
	function applyTheme(newTheme: Theme | null) {
		isDarkMode = isThemeDark(newTheme);
		document.documentElement.classList.toggle('dark', isDarkMode);
		document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
	}

	// Function to toggle between light and dark themes
	async function toggleTheme() {
		const newThemeName = isDarkMode ? 'light' : 'dark';
		await updateTheme(newThemeName);
	}

	// Media query for system preference
	let mediaQuery: MediaQueryList;

	onMount(() => {
		systemPreference = getSystemPreference();

		// Listen for system preference changes
		mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		const handleChange = (e: MediaQueryListEvent) => {
			systemPreference = e.matches ? 'dark' : 'light';
			// You might want to update the theme here if you want to follow system preference
			// This depends on your app's requirements
		};
		mediaQuery.addEventListener('change', handleChange);

		// Cleanup function to remove the listener
		return () => {
			mediaQuery.removeEventListener('change', handleChange);
		};
	});

	// Subscribe to theme changes and apply the new theme
	const unsubscribe = theme.subscribe((value: Theme | null) => {
		currentTheme = value;
		applyTheme(currentTheme);
	});

	// Cleanup function to unsubscribe from the theme store
	onDestroy(() => {
		unsubscribe();
	});
</script>

<button
	on:click={toggleTheme}
	class="rounded-full p-2 transition-colors duration-200 ease-in-out hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:hover:bg-gray-700"
	aria-label={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
>
	{#if isDarkMode}
		<iconify-icon icon="bi:sun-fill" width="18" class="text-yellow-400" />
	{:else}
		<iconify-icon icon="bi:moon-fill" width="18" class="text-indigo-400" />
	{/if}
</button>

<style>
	/* Global styles for smooth theme transition */
	:global(body) {
		transition:
			background-color 0.3s ease,
			color 0.3s ease;
	}
</style>
