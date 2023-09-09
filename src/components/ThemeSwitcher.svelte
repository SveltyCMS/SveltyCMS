<script lang="ts">
	import { theme } from '../stores/themeStore';
	import { fade } from 'svelte/transition';

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

	// toggle between light and dark themes
	function toggleTheme() {
		if (currentTheme === 'light') {
			theme.set('dark');
		} else {
			theme.set('light');
		}
	}
</script>

<!-- TODO: Add transiton & Tooltip -->
<div on:click={toggleTheme} class="hover:cursor-pointer">
	{#if currentTheme === 'dark'}
		<iconify-icon icon="bi:moon-fill" width="18" />
	{:else}
		<iconify-icon icon="bi:sun-fill" width="18" />
	{/if}
</div>
