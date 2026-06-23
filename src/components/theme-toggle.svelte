<!--
@file src/components/theme-toggle.svelte
@component
**A component for cycling through all application theme states.**
It relies entirely on the centralized `themeStore` for its state and logic.
### Features
- Three-way theme cycle: System → Light → Dark → System
- Icons represent current theme preference (system/light/dark)
- Optional tooltip for user guidance
-->
<script lang="ts">
	//Stores

	// Componets
	import Button from '@components/ui/button.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { setThemePreference, themeStore, useSystemPreference } from '@src/stores/theme-store.svelte.ts';

	interface Props {
		buttonClass?: string;
		iconSize?: number;
		showTooltip?: boolean;
		tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
	}

	const {
		showTooltip = true,
		tooltipPlacement = 'bottom',
		buttonClass = 'preset-outlined-surface-500 btn-icon rounded-full dark:text-white',
		iconSize = 22
	}: Props = $props();

	// Cycle through system -> light -> dark -> system
	function cycleTheme() {
		const current = themeStore.themePreference;
		if (current === 'system') {
			setThemePreference('light');
		} else if (current === 'light') {
			setThemePreference('dark');
		} else {
			useSystemPreference();
		}
	}

	// Get tooltip text based on current preference
	const getTooltipText = $derived(() => {
		const current = themeStore.themePreference;
		if (current === 'system') {
			return 'System theme (click for Light)';
		}
		if (current === 'light') {
			return 'Light theme (click for Dark)';
		}
		return 'Dark theme (click for System)';
	});
</script>

	{#if showTooltip}
		<SystemTooltip title={getTooltipText()} positioning={{ placement: tooltipPlacement }}>
			<Button variant="outline" onclick={cycleTheme} aria-label="Toggle theme" class="{buttonClass} p-0! min-w-0 rounded-full">
				{#if themeStore.themePreference === 'light'}
					<iconify-icon icon="mdi:white-balance-sunny" width={iconSize}></iconify-icon>
				{:else if themeStore.themePreference === 'dark'}
					<iconify-icon icon="mdi:moon-waning-crescent" width={iconSize}></iconify-icon>
				{:else}
					<iconify-icon icon="mdi:theme-light-dark" width={iconSize}></iconify-icon>
				{/if}
			</Button>
		</SystemTooltip>
	{:else}
		<Button variant="outline" onclick={cycleTheme} aria-label="Toggle theme" class="{buttonClass} p-0! min-w-0 rounded-full">
			{#if themeStore.themePreference === 'light'}
				<iconify-icon icon="mdi:white-balance-sunny" width={iconSize}></iconify-icon>
			{:else if themeStore.themePreference === 'dark'}
				<iconify-icon icon="mdi:moon-waning-crescent" width={iconSize}></iconify-icon>
			{:else}
				<iconify-icon icon="mdi:theme-light-dark" width={iconSize}></iconify-icon>
			{/if}
		</Button>
	{/if}
