<script lang="ts">
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
import { getModalStore } from '@skeletonlabs/skeleton-svelte';
	import type { FieldType } from './';
	import type { MediaFile } from './types';

	let { field, value, error }: { field: FieldType; value: string | string[] | null | undefined; error?: string | null } = $props();

	// A local, reactive array of the full, resolved media file objects for display.
	let selectedFiles = $state<MediaFile[]>([]);

	// Helper function to fetch full media data from an array of IDs.
	async function fetchMediaData(ids: string[]): Promise<MediaFile[]> {
		// In a real app, this would be an API call: GET /api/media?ids=id1,id2,...
		// For this example, we'll simulate it with a timeout.
		console.log('Fetching data for IDs:', ids);
		return new Promise((resolve) =>
			setTimeout(() => {
				const files: MediaFile[] = ids.map((id) => ({
					_id: id,
					name: `Image ${id.slice(0, 4)}.jpg`,
					type: 'image/jpeg',
					size: 12345,
					url: `https://picsum.photos/id/${parseInt(id.slice(0, 3), 10)}/1920/1080`,
					thumbnailUrl: `https://picsum.photos/id/${parseInt(id.slice(0, 3), 10)}/200/200`
				}));
				resolve(files);
			}, 300)
		);
	}

	// Effect 1: When the parent `value` (the IDs) changes, fetch the full data.
	$effect(() => {
		const ids = Array.isArray(value) ? value : value ? [value] : [];
		if (ids.length > 0) {
			fetchMediaData(ids).then((files) => {
				selectedFiles = files;
			});
		} else {
			selectedFiles = [];
		}
	});

	// Effect 2: When the local `selectedFiles` array changes (e.g., reordering), update the parent `value`.
	$effect(() => {
		const newIds = selectedFiles.map((file) => file._id);
		if (field.multiupload) {
			value = newIds;
		} else {
			value = newIds[0] || null;
		}
	});

	// Function to open the Media Library modal.
	function openMediaLibrary() {
		getModalStore().trigger({
			type: 'component',
			component: 'mediaLibraryModal', // This would be your full media library component
			// Pass a callback function to the modal so it can return the selected files.
			response: (files: MediaFile[] | undefined) => {
				if (files) {
					if (field.multiupload) {
						selectedFiles = [...selectedFiles, ...files];
					} else {
						selectedFiles = [files[0]];
					}
				}
			}
		});
	}

	// Function to remove a selected file.
	function removeFile(fileId: string) {
		selectedFiles = selectedFiles.filter((file) => file._id !== fileId);
	}
</script>

<div class="media-input-container" class:invalid={error}>
	{#if selectedFiles.length > 0}
		<div class="preview-grid" use:dndzone={{ items: selectedFiles }} onconsider={(e) => (selectedFiles = e.detail.items)}>
			{#each selectedFiles as file (file._id)}
				<div class="preview-item" animate:flip>
					<img src={file.thumbnailUrl} alt={file.name} class="thumbnail" />
					<span class="name">{file.name}</span>
					<button onclick={() => removeFile(file._id)} class="remove-btn" aria-label="Remove">&times;</button>
				</div>
			{/each}
		</div>
	{/if}

	{#if field.multiupload || selectedFiles.length === 0}
		<button type="button" onclick={openMediaLibrary} class="add-btn"> + Add Media </button>
	{/if}

	{#if error}
		<p class="error-message" role="alert">{error}</p>
	{/if}
</div>

<style lang="postcss">
	/* Add styles for preview grid, items, thumbnails, and buttons */
	.media-input-container {
		border: 2px dashed #ccc;
		border-radius: 8px;
		padding: 1rem;
		min-height: 120px;
	}
	.media-input-container.invalid {
		border-color: #ef4444;
	}
	.preview-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}
	.preview-item {
		position: relative;
		border: 1px solid #ddd;
		border-radius: 4px;
		overflow: hidden;
	}
	.thumbnail {
		width: 100%;
		height: 100px;
		object-fit: cover;
	}
	.name {
		font-size: 0.75rem;
		padding: 4px;
		display: block;
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.remove-btn {
		position: absolute;
		top: 4px;
		right: 4px;
		background: rgba(0, 0, 0, 0.5);
		color: white;
		border-radius: 50%;
		width: 20px;
		height: 20px;
		border: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.add-btn {
		width: 100%;
		padding: 0.75rem;
		background: #f0f0f0;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}
	.error-message {
		font-size: 0.75rem;
		color: #ef4444;
		margin-top: 0.5rem;
	}
</style>
