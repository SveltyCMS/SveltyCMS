<!--
 @file src/routes/+layout.svelte
 @component
 **This Svelte component serves as the layout for the entire application**
 -->

<script lang="ts">
	import '../app.postcss';
	import { initializeStores } from '@skeletonlabs/skeleton';
	import { page } from '$app/stores';


	// Initializing Skeleton stores
	import { initializeStores, Toast, storePopup } from '@skeletonlabs/skeleton';
	// Import from Floating UI
	import { computePosition, autoUpdate, offset, shift, flip, arrow } from '@floating-ui/dom';

	initializeStores();
	storePopup.set({ computePosition, autoUpdate, offset, shift, flip, arrow });

	// Props
	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();
	
	// Get the site name from data loaded in layout.server.ts
	const siteName = $derived($page.data.settings?.SITE_NAME || 'SveltyCMS');
</script>

<svelte:head>
	<title>{siteName}</title>
</svelte:head>

<div>
	{@render children?.()}
</div>
