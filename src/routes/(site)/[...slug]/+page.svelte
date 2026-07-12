<!--
@file src/routes/(site)/[...slug]/+page.svelte
@component Catch-all page renderer for the site starter.
-->

<script lang="ts">
	import PageRenderer from '@components/site/page-renderer.svelte';
	import SitePreviewBridge from '@components/site/site-preview-bridge.svelte';
  import type { SitePage } from "@src/services/site/types";

  let { data } = $props();
  let page = $state<SitePage>({} as SitePage);
  let editable = $derived(data.editable);

  $effect(() => {
    page = data.localized;
  });
</script>

<svelte:head>
  <title>{page?.title || data.slug}</title>
</svelte:head>

<SitePreviewBridge bind:entry={page} enabled={editable} />
<PageRenderer {page} editable={editable} />