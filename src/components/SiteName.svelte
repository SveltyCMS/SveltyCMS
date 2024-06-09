<script lang="ts">
	import { publicEnv } from '@root/config/public';

	export let char: string | null = null;

	const siteName = publicEnv.SITE_NAME;
	const targetSiteName = 'SveltyCMS';

	let mainPart = siteName;
	let lastPart = '';

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
