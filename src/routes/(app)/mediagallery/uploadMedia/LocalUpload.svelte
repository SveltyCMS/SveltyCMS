<!-- 
@files src/routes/(app)/mediagallery/uploadMedia/LocalUpload.svelte
@component
**This page is used to local upload media to the media gallery**

@example
<LocalUpload  files={files} uploadFiles={uploadFiles} onDelete={onDelete} onFormSubmit={onFormSubmit} onCancel={onCancel} onClose={onClose} />

### Props
- `files` {File[]} - Array of files to be uploaded
- `uploadFiles` {Function} - Function to upload files
- `onDelete` {Function} - Function to delete a file
- `onFormSubmit` {Function} - Function to handle form submission
- `onCancel` {Function} - Function to cancel the upload
- `onClose` {Function} - Function to close the modal

### Features
- Displays a collection of media files based on the specified media type.
- Provides a user-friendly interface for searching, filtering, and navigating through media files.
- Emits the `mediaDeleted` event when a media file is deleted.
-->

<script lang="ts">
	import { getModalStore, getToastStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
	import ModalUploadMedia from './ModalUploadMedia.svelte';
	import { goto } from '$app/navigation';

	let files = $state<File[]>([]);
	let input: HTMLInputElement | null = $state(null);
	let dropZone: HTMLDivElement | null = $state(null);

	const modalStore = getModalStore();
	const toastStore = getToastStore();

	function modalAddMedia(): void {
		const modalComponent: ModalComponent = {
			ref: ModalUploadMedia,
			slot: '<p>Add Media</p>',
			props: { mediaType: 'image', sectionName: 'Gallery', files, onDelete, uploadFiles }
		};
		const d: ModalSettings = {
			type: 'component',
			title: 'Uploaded Media',
			body: 'Check your uploaded Media and press Save.',
			component: modalComponent,
			response: (r: any) => {
				if (r) {
					console.log('response:', r);
					// Upload is handled exclusively by ModalUploadMedia component
					// which receives uploadFiles as a prop
				}
			}
		};
		modalStore.trigger(d);
	}

	function handleFileDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		console.log('Files dropped');

		const droppedFiles = e.dataTransfer?.files;
		if (droppedFiles) {
			for (const file of droppedFiles) {
				files = [...files, file];
				console.log('Added file:', file.name);
			}
		}

		dropZone?.style.removeProperty('border-color');
		modalAddMedia(); // Trigger the modal after files are dropped
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		console.log('Dragging over dropzone');
		if (dropZone) {
			dropZone.style.borderColor = '#5fd317';
		}
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		console.log('Dragging left dropzone');
		dropZone?.style.removeProperty('border-color');
	}

	function onChange() {
		if (input?.files) {
			console.log('Files selected from input');
			for (let i = 0; i < input.files.length; i++) {
				const file = input.files[i];
				files = [...files, file];
				console.log('Added file:', file.name);
			}
			modalAddMedia(); // Trigger the modal after files are selected
		}
	}

	function onDelete(file: File) {
		files = files.filter((f) => f !== file);
	}

	// Function passed to the modal (though not used there anymore)
	// This is the main upload logic triggered after modal confirmation
	async function uploadFiles() {
		if (files.length === 0) {
			toastStore.trigger({
				message: 'No files selected for upload',
				background: 'variant-filled-warning'
			});
			return;
		}

		const formData = new FormData();
		files.forEach((file) => {
			formData.append('files', file);
		});
		// Add the required processType for the backend endpoint
		formData.append('processType', 'save');

		// Assuming '/api/media/process' handles the actual saving based on FormData
		// You might need to add folder context here if uploads should go into specific virtual folders
		// formData.append('folderId', currentFolder?._id || ''); // Example if needed

		try {
			const response = await fetch('/api/media/process', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Upload failed: ${response.status} ${errorText}`);
			}

			const result = await response.json();

			if (result.success) {
				toastStore.trigger({
					message: 'Files uploaded successfully',
					background: 'variant-filled-success'
				});
				files = []; // Clear the files array after successful upload
				// Navigate back to media gallery after successful upload
				goto('/mediagallery', { invalidateAll: true }); // Invalidate data on navigation
			} else {
				throw new Error(result.error || 'Upload failed');
			}
		} catch (error) {
			console.error('Error uploading files:', error);
			toastStore.trigger({
				message: 'Error uploading files: ' + (error instanceof Error ? error.message : 'Unknown error'),
				background: 'variant-filled-error'
			});
		}
	}
</script>

<div
	bind:this={dropZone}
	ondrop={handleFileDrop}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	class="mt-2 flex h-[200px] w-full max-w-full select-none flex-col items-center justify-center gap-4 rounded border-2 border-dashed border-surface-600 bg-surface-200 dark:border-surface-500 dark:bg-surface-700"
	role="region"
	aria-label="File drop zone"
>
	<div class="grid grid-cols-6 items-center p-4">
		<iconify-icon icon="fa6-solid:file-arrow-up" width="40" aria-hidden="true"></iconify-icon>

		<div class="col-span-5 space-y-4 text-center">
			<p class="font-bold">
				<span class="text-tertiary-500 dark:text-primary-500">Media Upload</span>
				Drag files here to upload
			</p>

			<p class="text-sm opacity-75">Multiple files allowed</p>

			<button type="button" onclick={() => input?.click()} class="variant-filled-tertiary btn mt-3 dark:variant-filled-primary">
				Browse Files
			</button>

			<!-- File Size Limit -->
			<p class="mt-2 text-sm text-tertiary-500 dark:text-primary-500">Max File Size: XX MB</p>
		</div>
	</div>

	<!-- File Input -->
	<input bind:this={input} type="file" class="sr-only" hidden multiple onchange={onChange} aria-hidden="true" tabindex="-1" />
</div>
