<!--
@file src/components/ThemeToggle.svelte
@description Shared theme toggle component with consistent logic across the app
-->

<script lang="ts">
	import { modeCurrent, popup, type PopupSettings, setModeCurrent, setModeUserPrefers } from '@skeletonlabs/skeleton';
	import { get } from 'svelte/store';

	// Props
	interface Props {
		showTooltip?: boolean;
		tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
		buttonClass?: string;
		iconSize?: number;
	}

	const { showTooltip = true, tooltipPlacement = 'bottom', buttonClass = 'variant-ghost btn-icon', iconSize = 22 } = $props<Props>();

	// Theme toggle tooltip settings
	const themeToggleTooltip: PopupSettings = {
		event: 'hover',
		target: 'ThemeToggleTooltip',
		placement: tooltipPlacement
	};

	// Shared theme toggle logic
	function toggleTheme() {
		const currentMode = get(modeCurrent);
		const newMode = !currentMode;
		setModeUserPrefers(newMode);
		setModeCurrent(newMode);

		// Set cookie for server-side persistence
		document.cookie = `theme=${newMode ? 'light' : 'dark'}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
		document.cookie = `darkMode=${newMode}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
	}
</script>

{#if showTooltip}
	<button use:popup={themeToggleTooltip} onclick={toggleTheme} aria-label="Toggle theme" class={buttonClass}>
		{#if !$modeCurrent}
			<iconify-icon icon="bi:sun" width={iconSize}></iconify-icon>
		{:else}
			<iconify-icon icon="bi:moon-fill" width={iconSize}></iconify-icon>
		{/if}
	</button>

	<div class="card variant-filled z-50 max-w-sm p-2" data-popup="ThemeToggleTooltip">
		<span class="text-sm">
			{#if !$modeCurrent}
				Switch to Dark Mode
			{:else}
				Switch to Light Mode
			{/if}
		</span>
		<div class="variant-filled arrow"></div>
	</div>
{:else}
	<button onclick={toggleTheme} aria-label="Toggle theme" class={buttonClass}>
		{#if !$modeCurrent}
			<iconify-icon icon="bi:sun" width={iconSize}></iconify-icon>
		{:else}
			<iconify-icon icon="bi:moon-fill" width={iconSize}></iconify-icon>
		{/if}
	</button>
{/if}
