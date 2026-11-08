<!--
@file src/routes/(site)/[...slug]/+page.svelte
@component Catch-all public page renderer for the site starter.
-->

<script lang="ts">
	import PageRenderer from '@components/site/page-renderer.svelte';
	import SeoHead from '@components/site/seo-head.svelte';
	import SitePreviewBridge from '@components/site/site-preview-bridge.svelte';
	import { pickSeoPageTitle } from '@src/services/content/seo/seo-head';
	import type { SitePage } from '@src/services/site/types';

	let { data } = $props();
	/**
	 * Seed the render with the server-loaded page. A `$state` initialised empty
	 * and filled by `$effect` rendered an empty article during SSR (effects do
	 * not run on the server) and only showed content after hydration.
	 * Live-preview edits are layered through `previewEntry`.
	 */
	let previewEntry = $state<SitePage | null>(null);
	let page = $derived<SitePage>(previewEntry ?? data.localized);
	let editable = $derived(data.editable);

	// SEO meta title wins over the page title; both stay live-preview reactive.
	let title = $derived.by(() => {
		const seoTitle = pickSeoPageTitle(page?.seo, data.contentLanguage ?? 'en');
		const pageTitle = typeof page?.title === 'string' ? page.title : '';
		return seoTitle || pageTitle || data.seoHead?.title || data.slug;
	});
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<SeoHead meta={data.seoHead} />

<SitePreviewBridge
	entry={page}
	enabled={editable}
	onEntryChange={(next) => (previewEntry = next as SitePage | null)}
/>
<PageRenderer {page} {editable} />
