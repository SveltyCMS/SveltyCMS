<!--
@file src/routes/(site)/+page.svelte
@component Site starter homepage.
-->

<script lang="ts">
	import PageRenderer from '@components/site/page-renderer.svelte';
	import SeoHead from '@components/site/seo-head.svelte';
	import SiteFallbackHome from '@components/site/site-fallback-home.svelte';
	import SitePreviewBridge from '@components/site/site-preview-bridge.svelte';
	import { pickSeoPageTitle } from '@src/services/content/seo/seo-head-core';
	import type { SitePage } from '@src/services/site/types';

	let { data } = $props();
	/**
	 * Live-preview edits are held here; everything else comes from the server
	 * load. `page` is derived — not `$state` filled by `$effect` — because
	 * effects never run during SSR: the old version rendered the no-page
	 * fallback into the SSR HTML and only swapped in the seeded page after
	 * hydration (two different "Welcome" renders, and no content without JS).
	 */
	let previewEntry = $state<SitePage | null>(null);
	let page = $derived<SitePage | null>(previewEntry ?? data.localized);
	let editable = $derived(data.editable);

	// SEO meta title wins over the page title; both stay live-preview reactive.
	let title = $derived.by(() => {
		const seoTitle = pickSeoPageTitle(page?.seo, data.contentLanguage ?? 'en');
		const pageTitle = typeof page?.title === 'string' ? page.title : '';
		return seoTitle || pageTitle || data.seoHead?.title || data.siteName || 'Home';
	});
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<SeoHead meta={data.seoHead} />

{#if page}
	<SitePreviewBridge
		entry={page}
		enabled={editable}
		onEntryChange={(next) => (previewEntry = next as SitePage | null)}
	/>
	<PageRenderer {page} {editable} />
{:else}
	<SiteFallbackHome siteName={data.siteName || 'SveltyCMS'} />
{/if}
