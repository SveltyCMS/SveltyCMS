<!--
@file src/components/ThemeToggle.svelte
@component
**A simple, display-only component for toggling the application theme.**
It relies entirely on the centralized `themeStore` for its state and logic.
### Features
- Theme toggle button with icons
- Optional tooltip for user guidance
-->
<script lang="ts">
	import { themeStore, toggleDarkMode } from '@stores/themeStore.svelte';
	import { popup, type PopupSettings } from '@skeletonlabs/skeleton';

	// Props
	interface Props {
		showTooltip?: boolean;
		tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
		buttonClass?: string;
		iconSize?: number;
	}

	let { showTooltip = true, tooltipPlacement = 'bottom', buttonClass = 'variant-ghost btn-icon', iconSize = 22 }: Props = $props();

	// Theme toggle tooltip settings
	const themeToggleTooltip: PopupSettings = {
		event: 'hover',
		target: 'ThemeToggleTooltip',
		placement: tooltipPlacement
	};
</script>

{#if showTooltip}
	<button use:popup={themeToggleTooltip} onclick={() => toggleDarkMode()} aria-label="Toggle theme" class={buttonClass}>
		{#if themeStore.isDarkMode}
			<iconify-icon icon="bi:sun" width={iconSize}></iconify-icon>
		{:else}
			<iconify-icon icon="bi:moon-fill" width={iconSize}></iconify-icon>
		{/if}
	</button>

	<div class="card variant-filled z-50 max-w-sm p-2" data-popup="ThemeToggleTooltip">
		<span class="text-sm">
			{#if themeStore.isDarkMode}
				Switch to Light Mode
			{:else}
				Switch to Dark Mode
			{/if}
		</span>
		<div class="variant-filled arrow"></div>
	</div>
{:else}
	<button onclick={() => toggleDarkMode()} aria-label="Toggle theme" class={buttonClass}>
		{#if themeStore.isDarkMode}
			<iconify-icon icon="bi:sun" width={iconSize}></iconify-icon>
		{:else}
			<iconify-icon icon="bi:moon-fill" width={iconSize}></iconify-icon>
		{/if}
	</button>
{/if}
