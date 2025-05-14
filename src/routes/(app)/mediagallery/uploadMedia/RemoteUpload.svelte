<!-- 
@files src/routes/(app)/mediagallery/uploadMedia/RemoteUpload.svelte
@component
**This page is used to Remote Urls to the media gallery**

@example
<RemoteUpload remoteUrls={remoteUrls} toastStore={toastStore} />

### Props
- `remoteUrls` {string[]} - Array of remote URLs
- `toastStore` {any} - Toast store

### Features
- Displays a collection of media files based on the specified media type.
- Provides a user-friendly interface for searching, filtering, and navigating through media files.
- Emits the `mediaDeleted` event when a media file is deleted.
-->

<script lang="ts">
	import { getToastStore } from '@skeletonlabs/skeleton';

	let remoteUrls: string[] = $state([]);
	const toastStore = getToastStore();

	function handleRemoteUrlInput(event: Event) {
		const target = event.target as HTMLTextAreaElement | null;
		if (target) {
			remoteUrls = target.value.split('\n').filter((url) => url.trim() !== '');
		}
	}

	async function uploadRemoteUrls() {
		if (remoteUrls.length === 0) {
			toastStore.trigger({
				message: 'No URLs entered for upload',
				background: 'variant-filled-warning'
			});
			return;
		}

		const formData = new FormData();
		formData.append('remoteUrls', JSON.stringify(remoteUrls));

		try {
			const response = await fetch('/api/media/saveMedia', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				throw Error('Upload failed');
			}

			const result = await response.json();

			if (result.success) {
				toastStore.trigger({
					message: 'URLs uploaded successfully',
					background: 'variant-filled-success'
				});
				remoteUrls = []; // Clear the remote URLs array after successful upload
			} else {
				throw Error(result.error || 'Upload failed');
			}
		} catch (error) {
			console.error('Error uploading URLs:', error);
			toastStore.trigger({
				message: 'Error uploading URLs: ' + (error instanceof Error ? error.message : 'Unknown error'),
				background: 'variant-filled-error'
			});
		}
	}
</script>

<div class="space-y-4">
	<textarea
		bind:value={remoteUrls}
		placeholder="Paste Remote URLs here, one per line..."
		rows="6"
		class="textarea w-full"
		oninput={handleRemoteUrlInput}
	></textarea>
	<!-- Upload Button -->
	<button class="variant-filled-tertiary btn mt-2 dark:variant-filled-primary" onclick={uploadRemoteUrls}> Upload URLs </button>
</div>
