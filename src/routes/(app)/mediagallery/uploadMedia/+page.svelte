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
	import { TabGroup, Tab } from '@skeletonlabs/skeleton';

	let tabSet: number = $state(0);
</script>

<!-- PageTitle -->
<div class="mb-4 flex items-center justify-between">
	<PageTitle name={m.uploadMedia_title()} icon="bi:images" iconColor="text-tertiary-500 dark:text-primary-500" />

	<!-- Back -->
	<button onclick={() => history.back()} aria-label="Back" class="variant-outline-primary btn-icon">
		<iconify-icon icon="ri:arrow-left-line" width="20"></iconify-icon>
	</button>
</div>

<div class="wrapper">
	<TabGroup>
		<Tab bind:group={tabSet} name="local" value={0}>
			<div class="flex items-center justify-between gap-2">
				<iconify-icon icon="material-symbols:database" width="28"></iconify-icon>
				<p class="text-tertiary-500 dark:text-primary-500">Local Upload</p>
			</div>
		</Tab>

		<Tab bind:group={tabSet} name="remote" value={1}>
			<div class="flex items-center justify-between gap-2">
				<iconify-icon icon="arcticons:tautulli-remote" width="28"></iconify-icon>
				<p class="text-tertiary-500 dark:text-primary-500">Remote Upload</p>
			</div>
		</Tab>

		<!-- Tab Panels --->
		{#if tabSet === 0}
			<LocalUpload />
		{:else if tabSet === 1}
			<RemoteUpload />
		{/if}
	</TabGroup>
</div>
