<!-- 
@file src/components/SiteName.svelte
@component
**SiteName component for displaying the site name**

@example
<SiteName char="CMS" />

#### Props
- `char` {string | null} [optional] - Character or substring to potentially highlight within the site name. Defaults to null.

### Features
- Conditionally highlights a character within the site name if provided
- Handles cases where the site name is not 'SveltyCMS'
-->

<script lang="ts">
	import { publicEnv } from '@root/config/public';

	interface Props {
		char?: string | null;
	}

	// Props
	let { char = null }: Props = $props();

	// Constants
	const siteName = publicEnv.SITE_NAME; // Site name from public environment
	const targetSiteName = 'SveltyCMS'; // Target site name
	const isTargetSiteName = siteName === targetSiteName; // Check if siteName is 'SveltyCMS'
	const mainPart = isTargetSiteName ? siteName.slice(0, -3) : siteName; // Get 'Svelty' or full name
	const lastPart = isTargetSiteName ? siteName.slice(-3) : ''; // Get 'CMS' or empty string
	const highlightChar = char !== null && isTargetSiteName && lastPart.includes(char); // Check if char is in 'CMS'
</script>

<span class="font-bold">
	{#if char !== null}
		<!-- All cases where char is provided -->
		{#if highlightChar}
			<!-- Highlight the character if it's in 'CMS' -->
			<span class="text-primary-500">{char}</span>
		{:else}
			<!-- Display the character normally if it's not in 'CMS' -->
			{char}
		{/if}
	{:else if isTargetSiteName}
		<!-- No char provided, but it's the target site name -->
		{mainPart}<span class="text-primary-500">{lastPart}</span>
	{:else}
		<!-- Display the full site name -->
		{siteName}
	{/if}
</span>
