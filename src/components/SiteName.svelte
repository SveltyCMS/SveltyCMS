<script lang="ts">
	import { publicEnv } from '@root/config/public';

	const siteName = publicEnv.SITE_NAME;
	const targetSiteName = 'SveltyCMS';

	let mainPart = siteName;
	let lastPart = '';

	if (siteName === targetSiteName) {
		mainPart = siteName.slice(0, -3);
		lastPart = siteName.slice(-3);
	}
</script>

<span class="font-bold">
	{#if siteName === targetSiteName}
		{mainPart}<span class="text-primary-500">{lastPart}</span>
	{:else}
		{siteName}
	{/if}
</span>
