<!-- 
@file src/components/SiteName.svelte
@component
**SiteName component for displaying the site name**

```tsx
<SiteName  char="CMS" />
```
#### Props
- `char` {string} - Character to be used to highlight the site name
-->

<script lang="ts">
	import { publicEnv } from '@root/config/public';

	interface Props {
		char?: string | null;
	}

	let { char = null }: Props = $props();

	const siteName = publicEnv.SITE_NAME;
	const targetSiteName = 'SveltyCMS';

	let mainPart = $state(siteName);
	let lastPart = $state('');

	if (siteName === targetSiteName) {
		mainPart = siteName.slice(0, -3); // Get everything except the last character
		lastPart = siteName.slice(-3); // Get only the last CMS characters
	}
</script>

{#if char !== null}
	<span class="font-bold">
		{#if siteName === targetSiteName && mainPart.includes(char)}
			{char}
		{:else if siteName === targetSiteName && lastPart.includes(char)}
			<span class="text-primary-500">{char}</span>
		{:else}
			{char}
		{/if}
	</span>
{:else}
	<span class="font-bold">
		{#if siteName === targetSiteName}
			{mainPart}<span class="text-primary-500">{lastPart}</span>
		{:else}
			{siteName}
		{/if}
	</span>
{/if}
