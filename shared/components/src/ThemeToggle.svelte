<!--
@file shared/components/src/ThemeToggle.svelte
@component
**A component for cycling through all application theme states.**
It relies entirely on the centralized `themeStore` for its state and logic.
### Features
- Three-way theme cycle: System → Light → Dark → System
- Icons represent current theme preference (system/light/dark)
- Optional tooltip for user guidance
-->
<script lang="ts">
	import { themeStore, setThemePreference, useSystemPreference } from '@shared/stores/themeStore.svelte';

	interface Props {
		showTooltip?: boolean;
		tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
		buttonClass?: string;
		iconSize?: number;
	}

	const { showTooltip = true, buttonClass = 'preset-outline-surface-500 btn-icon rounded-full', iconSize = 22 }: Props = $props();

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

<button onclick={cycleTheme} aria-label="Toggle theme" class={buttonClass} title={showTooltip ? getTooltipText() : undefined}>
	<iconify-icon icon={getCurrentIcon()} width={iconSize}></iconify-icon>
</button>
