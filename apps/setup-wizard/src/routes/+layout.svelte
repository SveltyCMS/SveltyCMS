<!--
 @file apps/setup-wizard/src/routes/+layout.svelte
 @component
 **This Svelte component serves as the layout for the entire application**
 -->

<script lang="ts">
	// Import setup-wizard app styles (Tailwind v3 + Skeleton v2)
	import '../app.css';

	// Register Iconify custom element globally
	import 'iconify-icon';

	import { page } from '$app/state';
	import { onMount } from 'svelte';

	// Initializing Skeleton stores (SAME AS next BRANCH)
	import { initializeStores, storePopup } from '@skeletonlabs/skeleton';
	// Import from Floating UI
	import { arrow, autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';

	// Paraglide locale bridge
	import { locales as availableLocales, getLocale, setLocale } from '../paraglide/runtime';
	import { systemLanguage } from '@stores/store.svelte';
	import { initializeDarkMode } from '@stores/themeStore.svelte';

	// Initialize Skeleton stores (must be at module level)
	initializeStores();
	storePopup.set({ computePosition, autoUpdate, offset, shift, flip, arrow });

	// Initialize theme on mount
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
