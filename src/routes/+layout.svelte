<!--
 @file src/routes/+layout.svelte
 @component
 **This Svelte component serves as the layout for the entire application**
 -->

<script lang="ts">
	import '../app.postcss';
	// Register Iconify custom element globally
	import 'iconify-icon';

	import { page } from '$app/state';
	import { onMount } from 'svelte';

	// Initializing Skeleton stores
	import { initializeStores, storePopup } from '@skeletonlabs/skeleton';
	// Import from Floating UI
	import { arrow, autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';

	// Paraglide locale bridge
	import { locales as availableLocales, getLocale, setLocale } from '@src/paraglide/runtime';
	import { systemLanguage } from '@stores/store.svelte';

	// Centralized theme management
	import { themeStore, initializeThemeStore, initializeDarkMode } from '@stores/themeStore.svelte';

	// Initialize theme and other client-side logic on mount
	onMount(() => {
		initializeDarkMode();
	});

	let currentLocale = $state(getLocale());
	$effect(() => {
		const desired = systemLanguage.value;
		if (desired && availableLocales.includes(desired as any) && currentLocale !== desired) {
			setLocale(desired as any, { reload: false });
			currentLocale = desired;
		}
	});

	// Auto-refresh logic for theme
	$effect(() => {
		if (!themeStore.autoRefreshEnabled) return;

		const interval = 30 * 60 * 1000; // 30 minutes
		const intervalId = setInterval(() => {
			initializeThemeStore().catch(console.error);
		}, interval);

		return () => {
			clearInterval(intervalId);
		};
	});

	initializeStores();
	storePopup.set({ computePosition, autoUpdate, offset, shift, flip, arrow });

	// Props
	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	// Get the site name from data loaded in layout.server.ts
	const siteName = $derived(page.data.settings?.SITE_NAME || 'SveltyCMS');
</script>

<svelte:head>
	<title>{siteName}</title>
</svelte:head>

<div>
	{#key currentLocale}
		{@render children?.()}
	{/key}
</div>
