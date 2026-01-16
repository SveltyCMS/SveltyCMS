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
	import { Tabs } from '@skeletonlabs/skeleton-svelte';

	let tabSet = $state('0');
</script>

<!-- PageTitle -->
<div class="mb-4 flex items-center justify-between">
	<PageTitle name={m.uploadMedia_title()} icon="bi:images" iconColor="text-tertiary-500 dark:text-primary-500" />

	<!-- Back -->
	<button onclick={() => history.back()} aria-label="Back" class="preset-outlined-tertiary-500 btn-icon dark:preset-outlined-primary-500">
		<iconify-icon icon="ri:arrow-left-line" width="20"></iconify-icon>
	</button>
</div>

<div class="wrapper">
	<Tabs value={tabSet} onValueChange={(e) => (tabSet = e.value)}>
		<Tabs.List class="flex border-b border-surface-200-800">
			<Tabs.Trigger value="0" class="flex-1">
				<div class="flex items-center justify-center gap-2 py-4">
					<iconify-icon icon="material-symbols:database" width="28"></iconify-icon>
					<p class="text-tertiary-500 dark:text-primary-500">Local Upload</p>
				</div>
			</Tabs.Trigger>
			<Tabs.Trigger value="1" class="flex-1">
				<div class="flex items-center justify-center gap-2 py-4">
					<iconify-icon icon="arcticons:tautulli-remote" width="28"></iconify-icon>
					<p class="text-tertiary-500 dark:text-primary-500">Remote Upload</p>
				</div>
			</Tabs.Trigger>
		</Tabs.List>
		<Tabs.Content value="0">
			<div class="p-4">
				<LocalUpload />
			</div>
		</Tabs.Content>
		<Tabs.Content value="1">
			<div class="p-4">
				<RemoteUpload />
			</div>
		</Tabs.Content>
	</Tabs>
</div>
