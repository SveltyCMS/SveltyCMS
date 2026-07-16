<!--
@file src/components/theme-toggle.svelte
@component
**Cycles through all theme states: System → Light → Dark → System.**
Relies on the centralized `themeStore` for state and logic.

### Features
- Three-way theme cycle with icon feedback
- Defaults to `preset-outline-surface-500 btn-icon rounded-full dark:text-white`
- Optional tooltip with placement control
- Svelte 5 runes — derived icon + tooltip text
-->
<script lang="ts">
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
		buttonClass = 'preset-outline-surface-500 btn-icon rounded-full dark:text-white',
		iconSize = 22,
	}: Props = $props();

	const icon = $derived(
		themeStore.themePreference === 'light'
			? 'mdi:white-balance-sunny'
			: themeStore.themePreference === 'dark'
				? 'mdi:moon-waning-crescent'
				: 'mdi:theme-light-dark',
	);

	const tooltipText = $derived(
		themeStore.themePreference === 'system'
			? 'System theme (click for Light)'
			: themeStore.themePreference === 'light'
				? 'Light theme (click for Dark)'
				: 'Dark theme (click for System)',
	);

	function cycleTheme() {
		const current = themeStore.themePreference;
		if (current === 'system') setThemePreference('light');
		else if (current === 'light') setThemePreference('dark');
		else useSystemPreference();
	}
</script>

{#snippet toggleButton()}
	<Button variant="outline" onclick={cycleTheme} aria-label="Toggle theme" class={`${buttonClass} p-0! min-w-0`}>
		<iconify-icon {icon} width={iconSize} aria-hidden="true"></iconify-icon>
	</Button>
{/snippet}

{#if showTooltip}
	<SystemTooltip title={tooltipText} positioning={{ placement: tooltipPlacement }}>
		{@render toggleButton()}
	</SystemTooltip>
{:else}
	{@render toggleButton()}
{/if}
