<!--
@file src/components/site/seo-head.svelte
@component Renders the SEO widget's document-head metadata (description, canonical,
robots, hreflang alternates, Open Graph, Twitter Card, JSON-LD) for site-starter pages.

@props
- meta (SeoHeadResult | null): Server-built head metadata. The `<title>` is
  rendered by the page itself (it stays bound to live-preview state).
-->

<script lang="ts">
	import type { SeoHeadResult } from '@src/services/content/seo/seo-head';

	interface Props {
		meta?: SeoHeadResult | null;
	}

	let { meta }: Props = $props();
</script>

<svelte:head>
	{#if meta}
		{#if meta.description}
			<meta name="description" content={meta.description} />
		{/if}
		{#if meta.keywords}
			<meta name="keywords" content={meta.keywords} />
		{/if}
		{#if meta.robots}
			<meta name="robots" content={meta.robots} />
		{/if}
		{#if meta.canonicalUrl}
			<link rel="canonical" href={meta.canonicalUrl} />
		{/if}
		{#each meta.alternates as alternate (alternate.hreflang)}
			<link rel="alternate" hreflang={alternate.hreflang} href={alternate.href} />
		{/each}
		{#if meta.og}
			<meta property="og:type" content={meta.og.type} />
			<meta property="og:title" content={meta.og.title} />
			<meta property="og:url" content={meta.og.url} />
			{#if meta.og.description}
				<meta property="og:description" content={meta.og.description} />
			{/if}
			{#if meta.og.image}
				<meta property="og:image" content={meta.og.image} />
			{/if}
		{/if}
		{#if meta.twitter}
			<meta name="twitter:card" content={meta.twitter.card} />
			<meta name="twitter:title" content={meta.twitter.title} />
			{#if meta.twitter.description}
				<meta name="twitter:description" content={meta.twitter.description} />
			{/if}
			{#if meta.twitter.image}
				<meta name="twitter:image" content={meta.twitter.image} />
			{/if}
		{/if}
		{#if meta.jsonLdScript}
			<!-- Generated server-side from sanitized widget data; safe to render raw. -->
			{@html meta.jsonLdScript}
		{/if}
		{#each meta.autoJsonLd as autoScript (autoScript)}
			<!-- Site-level JSON-LD auto-generated from the CMS structure; safe to render raw. -->
			{@html autoScript}
		{/each}
	{/if}
</svelte:head>
