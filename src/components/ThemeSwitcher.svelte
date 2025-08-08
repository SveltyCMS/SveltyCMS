<!--
@file src/components/ThemeSwitcher.svelte
@component
**ThemeSwitcher component for toggling between light & dark themes**

`@example
<ThemeSwitcher />	

#### Props:
- `theme` {object} - The current theme object from the theme store
- `updateTheme` {function} - A function to update the theme in the theme store	

Features:
- Persists theme preference through API calls
- Supports system preference for initial theme
- Adds smooth transition effect when switching themes
- Implements prefers-color-scheme media query for system preference
- Listens for system preference changes
-->

<script lang="ts">
	import { theme, updateTheme } from '@root/src/stores/themeStore.svelte';
	import type { Theme } from '@src/databases/dbInterface';

	let currentTheme: Theme | null = null;
	let isDarkMode: boolean = $state(false);
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

	// Function to toggle between light and dark themes
	async function toggleTheme() {
		const newThemeName = isDarkMode ? 'light' : 'dark';
		await updateTheme(newThemeName);
	}

	// Media query for system preference
	let mediaQuery: MediaQueryList | null = $state(null);

	// Handle system preference changes
	function handleChange(e: MediaQueryListEvent) {
		systemPreference = e.matches ? 'dark' : 'light';
		// You might want to update the theme here if you want to follow system preference
		// This depends on your app's requirements
	}

	// Initialize system preference and media query listener
	$effect(() => {
		if (typeof window !== 'undefined') {
			systemPreference = getSystemPreference();
			mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
			mediaQuery?.addEventListener('change', handleChange);
		}
	});

	// Watch theme changes and apply them
	$effect(() => {
		currentTheme = $theme;
		isDarkMode = isThemeDark(currentTheme);
		document.documentElement.classList.toggle('dark', isDarkMode);
		document.documentElement.style.colorScheme = isDarkMode ? 'dark' : 'light';
	});

	// Cleanup media query listener
	$effect.root(() => {
		return () => {
			if (mediaQuery) {
				mediaQuery.removeEventListener('change', handleChange);
			}
		};
	});
</script>

<button
	onclick={toggleTheme}
	class="rounded-full p-2 transition-colors duration-200 ease-in-out hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:hover:bg-gray-700"
	aria-label={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
>
	{#if isDarkMode}
		<iconify-icon icon="bi:sun-fill" width="18" class="text-yellow-400"></iconify-icon>
	{:else}
		<iconify-icon icon="bi:moon-fill" width="18" class="text-indigo-400"></iconify-icon>
	{/if}
</button>

<style lang="postcss">
	/* Global styles for smooth theme transition */
	:global(body) {
		transition:
			background-color 0.3s ease,
			color 0.3s ease;
	}
</style>
