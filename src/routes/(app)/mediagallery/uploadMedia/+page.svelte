<!-- 
@files src/routes/(app)/mediagallery/uploadMedia/+page.svelte
@component
**This page is used to upload media to the media gallery**
-->

<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import LocalUpload from './LocalUpload.svelte';
	import RemoteUpload from './RemoteUpload.svelte';

	// Skeleton
	import { Tab, Tabs } from '@skeletonlabs/skeleton-svelte';

	let tabSet: number = $state(0);
</script>

<!-- PageTitle -->
<div class="mb-4 flex items-center justify-between">
	<PageTitle name={m.uploadMedia_title()} icon="bi:images" iconColor="text-tertiary-500 dark:text-primary-500" />

	<!-- Back -->
	<button onclick={() => history.back()} aria-label="Back" class="preset-outline-primary btn-icon">
		<iconify-icon icon="ri:arrow-left-line" width="20"></iconify-icon>
	</button>
</div>

<div class="wrapper">
	<Tabs>
		<Tab bind:group={tabSet} name="local" value={0}>
			{#snippet lead()}
				<div class="flex items-center justify-between gap-2">
					<iconify-icon icon="material-symbols:database" width="28"></iconify-icon>
					<p class="text-tertiary-500 dark:text-primary-500">Local Upload</p>
				</div>
			{/snippet}
		</Tab>

		<Tab bind:group={tabSet} name="remote" value={1}>
			{#snippet lead()}
				<div class="flex items-center justify-between gap-2">
					<iconify-icon icon="arcticons:tautulli-remote" width="28"></iconify-icon>
					<p class="text-tertiary-500 dark:text-primary-500">Remote Upload</p>
				</div>
			{/snippet}
		</Tab>

		<!-- Tab Panels --->
		{#snippet panel()}
			{#if tabSet === 0}
				<LocalUpload />
			{:else if tabSet === 1}
				<RemoteUpload />
			{/if}
		{/snippet}
	</Tabs>
</div>
