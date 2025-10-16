<!--
@file src/components/ThemeToggle.svelte
@component
**Shared theme toggle component with consistent logic across the app**

###Features
-
-->

<script lang="ts">
import { modeCurrent, type PopupSettings, setModeCurrent, setModeUserPrefers } from '@skeletonlabs/skeleton-svelte';
import { popup } from '@utils/skeletonCompat';
	import { get } from 'svelte/store';

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

	// Shared theme toggle logic
	function toggleTheme() {
		// Skeleton's modeCurrent is `true` for dark mode, `false` for light mode.
		const isCurrentlyDark = get(modeCurrent);
		const newModeIsDark = !isCurrentlyDark;

		// Update Skeleton's stores
		setModeUserPrefers(newModeIsDark);
		setModeCurrent(newModeIsDark);

		// Immediately apply the theme to the DOM
		document.documentElement.classList.toggle('dark', newModeIsDark);

		// Set cookie for server-side persistence
		const themeValue = newModeIsDark ? 'dark' : 'light';
		const cookieOptions = `path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

		document.cookie = `theme=${themeValue}; ${cookieOptions}`;
		document.cookie = `darkMode=${newModeIsDark}; ${cookieOptions}`;
	}
</script>

{#if showTooltip}
	<button use:popup={themeToggleTooltip} onclick={toggleTheme} aria-label="Toggle theme" class={buttonClass}>
		{#if $modeCurrent}
			<iconify-icon icon="bi:sun" width={iconSize}></iconify-icon>
		{:else}
			<iconify-icon icon="bi:moon-fill" width={iconSize}></iconify-icon>
		{/if}
	</button>

	<div class="card variant-filled z-50 max-w-sm p-2" data-popup="ThemeToggleTooltip">
		<span class="text-sm">
			{#if $modeCurrent}
				Switch to Light Mode
			{:else}
				Switch to Dark Mode
			{/if}
		</span>
		<div class="variant-filled arrow"></div>
	</div>
{:else}
	<button onclick={toggleTheme} aria-label="Toggle theme" class={buttonClass}>
		{#if $modeCurrent}
			<iconify-icon icon="bi:sun" width={iconSize}></iconify-icon>
		{:else}
			<iconify-icon icon="bi:moon-fill" width={iconSize}></iconify-icon>
		{/if}
	</button>
{/if}
