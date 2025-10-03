<!--
@file src/components/SiteName.svelte
@component
**SiteName component for displaying the site name**

###Example
<SiteName highlight="CMS" />
<SiteName siteName="CustomCMS" highlight="CMS" />
<SiteName char="CMS" /> (for single character display)

#### Props
- `char` {string} - Single character to display (for animated use cases)
- `siteName` {string} - Full site name to display
- `highlight` {string} - Part of the site name to highlight in a different color
-->

<script lang="ts">
	import { page } from '$app/state';

	interface Props {
		char?: string | null;
		siteName?: string;
		highlight?: string;
	}

	let { char = null, siteName: propSiteName, highlight }: Props = $props();

	// Get site name from prop or fallback to page data or default
	const siteName = $derived(propSiteName || page.data?.settings?.SITE_NAME || 'SveltyCMS');

	// Split site name into parts if highlight is provided
	const parts = $derived.by(() => {
		if (!highlight || !siteName) return null;
		const index = siteName.indexOf(highlight);
		if (index === -1) return null;
		return {
			before: siteName.substring(0, index),
			highlight: siteName.substring(index, index + highlight.length),
			after: siteName.substring(index + highlight.length)
		};
	});
</script>

{#if char !== null}
	<!-- Single character mode (for animations) -->
	<span class="text-left font-bold">
		{char}
	</span>
{:else if parts}
	<!-- Site name with highlighted portion -->
	<span class="text-left font-bold">
		{parts.before}<span class="text-primary-500">{parts.highlight}</span>{parts.after}
	</span>
{:else}
	<!-- Full site name without highlighting -->
	<span class="text-left font-bold">
		{siteName}
	</span>
{/if}
