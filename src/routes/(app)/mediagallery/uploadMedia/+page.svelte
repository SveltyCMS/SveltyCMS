<!-- 
@files src/routes/(app)/mediagallery/uploadMedia/+page.svelte
@description This page is used to upload media to the media gallery.
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

	let tabSet: number = 0;
</script>

<!-- PageTitle -->
<div class="mb-4 flex items-center justify-between">
	<PageTitle name={m.uploadMedia_title()} icon="bi:images" iconColor="text-tertiary-500 dark:text-primary-500" />

	<!-- Back -->
	<button on:click={() => history.back()} class="variant-outline-primary btn-icon">
		<iconify-icon icon="ri:arrow-left-line" width="20" />
	</button>
</div>

<div class="wrapper">
	<TabGroup>
		<Tab bind:group={tabSet} name="local" value={0}>
			<svelte:fragment slot="lead">
				<div class="flex items-center justify-between gap-2">
					<iconify-icon icon="material-symbols:database" width="28"></iconify-icon>
					<p class="text-tertiary-500 dark:text-primary-500">Local Upload</p>
				</div>
			</svelte:fragment>
		</Tab>

		<Tab bind:group={tabSet} name="remote" value={1}>
			<svelte:fragment slot="lead">
				<div class="flex items-center justify-between gap-2">
					<iconify-icon icon="arcticons:tautulli-remote" width="28"></iconify-icon>
					<p class="text-tertiary-500 dark:text-primary-500">Remote Upload</p>
				</div>
			</svelte:fragment>
		</Tab>

		<!-- Tab Panels --->
		<svelte:fragment slot="panel">
			{#if tabSet === 0}
				<LocalUpload />
			{:else if tabSet === 1}
				<RemoteUpload />
			{/if}
		</svelte:fragment>
	</TabGroup>
</div>
