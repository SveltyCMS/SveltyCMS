<!--
@file src/components/SiteName.svelte
@component
**SiteName component for displaying the site name**

###Example
<SiteName highlight="CMS" />
<SiteName siteName="CustomCMS" highlight="CMS" />
<SiteName char="CMS" /> (for single character display)
<SiteName textClass="text-white" /> (override text color)

#### Props
- `char` {string} - Single character to display (for animated use cases)
- `siteName` {string} - Full site name to display
- `highlight` {string} - Part of the site name to highlight in a different color
- `textClass` {string} - Override text color class (default: 'text-black dark:text-white')
-->

<script lang="ts">
	import { publicEnv } from '@stores/globalSettings.svelte';

	interface Props {
		char?: string | null;
		highlight?: string;
		siteName?: string;
		textClass?: string;
	}

	const { char = null, siteName: propSiteName, highlight, textClass = 'text-black dark:text-white' }: Props = $props();

	// Get site name dynamically from global settings store (updates live!)
	// Fallback chain: prop → live store → default (removed page.data access which causes SSR issues)
	const siteName = $derived(propSiteName || publicEnv?.SITE_NAME || 'SveltyCMS');

	// Split site name into parts if highlight is provided
	const parts = $derived.by(() => {
		if (!(highlight && siteName)) return null;
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
	<span class="text-left font-bold {textClass}"> {char} </span>
{:else if parts}
	<!-- Site name with highlighted portion -->
	<span class="text-left font-bold {textClass}"> {parts.before}<span class="text-primary-500">{parts.highlight}</span>{parts.after} </span>
{:else}
	<!-- Full site name without highlighting -->
	<span class="text-left font-bold {textClass}"> {siteName} </span>
{/if}
