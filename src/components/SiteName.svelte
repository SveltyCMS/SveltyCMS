<!--
@file src/components/SiteName.svelte
@component
**SiteName component for displaying the site name**

###Example
<SiteName  char="CMS" />

#### Props
- `char` {string} - Character to be used to highlight the site name
-->

<script lang="ts">
	import { page } from '$app/stores';

	interface Props {
		char?: string | null;
	}

	let { char = null }: Props = $props();

	// Get site name from page data (loaded by layout.server.ts)
	const siteName = $derived($page.data.settings?.SITE_NAME || 'SveltyCMS');
	const targetSiteName = 'SveltyCMS';

	const mainPart = $derived(siteName === targetSiteName ? siteName.slice(0, -3) : siteName);
	const lastPart = $derived(siteName === targetSiteName ? siteName.slice(-3) : '');
</script>

{#if char !== null}
	<span class="text-left font-bold">
		{#if siteName === targetSiteName && mainPart.includes(char)}
			{char}
		{:else if siteName === targetSiteName && lastPart.includes(char)}
			<span class="text-primary-500">{char}</span>
		{:else}
			{char}
		{/if}
	</span>
{:else}
	<span class="text-left font-bold">
		{#if siteName === targetSiteName}
			{mainPart}<span class="text-primary-500">{lastPart}</span>
		{:else}
			{siteName}
		{/if}
	</span>
{/if}
