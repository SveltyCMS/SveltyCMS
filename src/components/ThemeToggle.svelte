<!--
@file src/components/ThemeToggle.svelte
@component
**A component for cycling through all application theme states.**
It relies entirely on the centralized `themeStore` for its state and logic.
### Features
- Three-way theme cycle: System → Light → Dark → System
- Icons represent current theme preference (system/light/dark)
- Optional tooltip for user guidance
-->
<script lang="ts">
	import SystemTooltip from '@components/system/SystemTooltip.svelte';
	import { setThemePreference, themeStore, useSystemPreference } from '@stores/themeStore.svelte.ts';

	// Explicit imports

	interface Props {
		buttonClass?: string;
		iconSize?: number;
		showTooltip?: boolean;
		tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
	}

	const {
		showTooltip = true,
		tooltipPlacement = 'bottom',
		buttonClass = 'preset-outline-surface-500 btn-icon rounded-full',
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
		if (current === 'system') { return 'System theme (click for Light)'; }
		if (current === 'light') { return 'Light theme (click for Dark)'; }
		return 'Dark theme (click for System)';
	});
</script>

{#if showTooltip}
	<SystemTooltip title={getTooltipText()} positioning={{ placement: tooltipPlacement }}>
		<button onclick={cycleTheme} aria-label="Toggle theme" class={buttonClass}>
			{#if themeStore.themePreference === 'light'}
				<iconify-icon icon="mdi:white-balance-sunny" width={iconSize}></iconify-icon>
			{:else if themeStore.themePreference === 'dark'}
				<iconify-icon icon="mdi:moon-waning-crescent" width={iconSize}></iconify-icon>
			{:else}
				<iconify-icon icon="mdi:theme-light-dark" width={iconSize}></iconify-icon>
			{/if}
		</button>
	</SystemTooltip>
{:else}
	<button onclick={cycleTheme} aria-label="Toggle theme" class={buttonClass}>
		{#if themeStore.themePreference === 'light'}
			<iconify-icon icon="mdi:white-balance-sunny" width={iconSize}></iconify-icon>
		{:else if themeStore.themePreference === 'dark'}
			<iconify-icon icon="mdi:moon-waning-crescent" width={iconSize}></iconify-icon>
		{:else}
			<iconify-icon icon="mdi:theme-light-dark" width={iconSize}></iconify-icon>
		{/if}
	</button>
{/if}
