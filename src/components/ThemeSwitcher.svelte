<!-- 
@file src/components/ThemeSwitcher.svelte
@description  ThemeSwitcher component 
-->

<script lang="ts">
	import { onDestroy } from 'svelte';
	import { theme } from '@stores/themeStore';

	let currentTheme: string;

	// subscribe to changes in the theme store
	const unsubscribe = theme.subscribe((value) => {
		currentTheme = value;
		// update the class attribute of the html element
		if (currentTheme === 'dark') {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	});

	// unsubscribe when the component is destroyed
	onDestroy(() => {
		unsubscribe();
	});

	// toggle between light and dark themes
	function toggleTheme() {
		if (currentTheme === 'light') {
			theme.set('dark');
		} else {
			theme.set('light');
		}
	}
</script>

<button on:click={toggleTheme} class="hover:cursor-pointer">
	{#if currentTheme === 'dark'}
		<iconify-icon icon="bi:moon-fill" width="18" />
	{:else}
		<iconify-icon icon="bi:sun-fill" width="18" />
	{/if}
</button>
