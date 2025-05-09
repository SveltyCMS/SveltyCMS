<!-- 
@files src/routes/(app)/mediagallery/uploadMedia/+page.svelte
@component
**This page is used to upload media to the media gallery**

@example
<ModalUploadMedia parent={parent} sectionName={sectionName} files={files} onDelete={onDelete} uploadFiles={uploadFiles} />

### Props
- `parent` {any} - Parent component
- `sectionName` {string} - Name of the section
- `files` {File[]} - Array of files to be uploaded **Optional**
- `onDelete` {Function} - Function to delete a file
- `uploadFiles` {Function} - Function to upload files

### Features
- Displays a collection of media files based on the specified media type.
- Provides a user-friendly interface for searching, filtering, and navigating through media files.
- Emits the `mediaDeleted` event when a media file is deleted.
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
	<button onclick={() => history.back()} aria-label="Back" class="variant-outline-tertiary btn-icon dark:variant-outline-primary">
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
	</TabGroup>

	<!-- Tab Panels --->
	{#if tabSet === 0}
		<LocalUpload />
	{:else if tabSet === 1}
		<RemoteUpload />
	{/if}
</div>
