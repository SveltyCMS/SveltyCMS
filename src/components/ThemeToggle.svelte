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
	import { themeStore, setThemePreference, useSystemPreference } from '@stores/themeStore.svelte.ts';
	import { Portal, Tooltip } from '@skeletonlabs/skeleton-svelte';
	// Explicit imports
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import SunMoon from '@lucide/svelte/icons/sun-moon';

	interface Props {
		showTooltip?: boolean;
		tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
		buttonClass?: string;
		iconSize?: number;
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
		if (current === 'system') return 'System theme (click for Light)';
		if (current === 'light') return 'Light theme (click for Dark)';
		return 'Dark theme (click for System)';
	});
</script>

{#if showTooltip}
	<Tooltip positioning={{ placement: tooltipPlacement }}>
		<Tooltip.Trigger>
			<button onclick={cycleTheme} aria-label="Toggle theme" class={buttonClass}>
				{#if themeStore.themePreference === 'light'}
					<Sun size={iconSize} />
				{:else if themeStore.themePreference === 'dark'}
					<Moon size={iconSize} />
				{:else}
					<SunMoon size={iconSize} />
				{/if}
			</button>
		</Tooltip.Trigger>
		<Portal>
			<Tooltip.Positioner>
				<Tooltip.Content class="card preset-filled-surface-500-950-50 z-50 rounded-md p-2 text-sm shadow-xl">
					{getTooltipText()}
					<Tooltip.Arrow class="[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-950-50)]">
						<Tooltip.ArrowTip />
					</Tooltip.Arrow>
				</Tooltip.Content>
			</Tooltip.Positioner>
		</Portal>
	</Tooltip>
{:else}
	<button onclick={cycleTheme} aria-label="Toggle theme" class={buttonClass}>
		{#if themeStore.themePreference === 'light'}
			<Sun size={iconSize} />
		{:else if themeStore.themePreference === 'dark'}
			<Moon size={iconSize} />
		{:else}
			<SunMoon size={iconSize} />
		{/if}
	</button>
{/if}
