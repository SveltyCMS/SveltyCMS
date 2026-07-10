<!--
@file src/routes/(site)/+page.svelte
@component Site starter homepage.
-->

<script lang="ts">
	import PageRenderer from '@components/site/page-renderer.svelte';
	import SiteFallbackHome from '@components/site/site-fallback-home.svelte';
	import SitePreviewBridge from '@components/site/site-preview-bridge.svelte';
  import type { SitePage } from "@src/services/site/types";

  let { data } = $props();
  let page = $state<SitePage | null>(null);
  let editable = $derived(data.editable);

  $effect(() => {
    page = data.localized;
  });
</script>

<svelte:head>
  <title>{page?.title || data.siteName || "Home"}</title>
</svelte:head>

{#if page}
  <SitePreviewBridge bind:entry={page} enabled={editable} />
  <PageRenderer {page} editable={editable} />
{:else}
  <SiteFallbackHome siteName={data.siteName || "SveltyCMS"} />
{/if}