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
		siteName?: string;
	}

	let { char = null, siteName: propSiteName }: Props = $props();

	// Get site name from prop or fallback to page data or default
	const siteName = $derived(propSiteName || page.data?.settings?.SITE_NAME || 'SveltyCMS');
</script>

{#if char !== null}
	<span class="text-left font-bold">
		{char}
	</span>
{:else}
	<span class="text-left font-bold">
		{siteName}
	</span>
{/if}
