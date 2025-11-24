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
	import { themeStore, setThemePreference, useSystemPreference } from '@stores/themeStore.svelte';
	import { popup, type PopupSettings } from '@src/skeleton-compat';

	// Props
	interface Props {
		showTooltip?: boolean;
		tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
		buttonClass?: string;
		iconSize?: number;
	}

	const { showTooltip = true, tooltipPlacement = 'bottom', buttonClass = 'variant-ghost btn-icon', iconSize = 22 }: Props = $props();

	// Theme toggle tooltip settings
	const themeToggleTooltip: PopupSettings = {
		event: 'hover',
		target: 'ThemeToggleTooltip',
		placement: tooltipPlacement
	};

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
		if (current === 'system') return 'System theme (click for Light)';
		if (current === 'light') return 'Light theme (click for Dark)';
		return 'Dark theme (click for System)';
	});

	// Get icon based on current preference
	const getCurrentIcon = $derived(() => {
		const current = themeStore.themePreference;
		if (current === 'system') return 'bi:circle-half';
		if (current === 'light') return 'bi:sun';
		return 'bi:moon-fill';
	});
</script>

{#if showTooltip}
	<button use:popup={themeToggleTooltip} onclick={cycleTheme} aria-label="Toggle theme" class={buttonClass}>
		<iconify-icon icon={getCurrentIcon()} width={iconSize}></iconify-icon>
	</button>

	<div class="card variant-filled z-50 max-w-sm p-2" data-popup="ThemeToggleTooltip">
		<span class="text-sm">
			{getTooltipText()}
		</span>
		<div class="variant-filled arrow"></div>
	</div>
{:else}
	<button onclick={cycleTheme} aria-label="Toggle theme" class={buttonClass}>
		<iconify-icon icon={getCurrentIcon()} width={iconSize}></iconify-icon>
	</button>
{/if}
