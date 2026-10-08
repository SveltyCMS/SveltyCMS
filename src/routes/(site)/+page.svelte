<!--
@file src/routes/(site)/+page.svelte
@component Site starter homepage.
-->

<script lang="ts">
	import PageRenderer from '@components/site/page-renderer.svelte';
	import SeoHead from '@components/site/seo-head.svelte';
	import SiteFallbackHome from '@components/site/site-fallback-home.svelte';
	import SitePreviewBridge from '@components/site/site-preview-bridge.svelte';
	import { pickSeoPageTitle } from '@src/services/content/seo/seo-head';
	import type { SitePage } from '@src/services/site/types';

	let { data } = $props();
	let page = $state<SitePage | null>(null);
	let editable = $derived(data.editable);

	$effect(() => {
		page = data.localized;
	});

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
	<SitePreviewBridge bind:entry={page} enabled={editable} />
	<PageRenderer {page} {editable} />
{:else}
	<SiteFallbackHome siteName={data.siteName || 'SveltyCMS'} />
{/if}
