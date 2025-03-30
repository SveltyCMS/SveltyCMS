<!-- 
@files src/routes/(app)/mediagallery/uploadMedia/LocalUpload.svelte
@component
**This page is used to local upload media to the media gallery**

```tsx
<LocalUpload  files={files} uploadFiles={uploadFiles} onDelete={onDelete} onFormSubmit={onFormSubmit} onCancel={onCancel} onClose={onClose} />
```

### Props
- `files` {File[]} - Array of files to be uploaded
- `uploadFiles` {Function} - Function to upload files
- `onDelete` {Function} - Function to delete a file
- `onFormSubmit` {Function} - Function to handle form submission
- `onCancel` {Function} - Function to cancel the upload
- `onClose` {Function} - Function to close the modal

-->

<script lang="ts">
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton-svelte';
	import ModalUploadMedia from './ModalUploadMedia.svelte';
	import { goto } from '$app/navigation';

	let files: File[] = [];
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
					uploadFiles();
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

	async function uploadFiles() {
		if (files.length === 0) {
			toastStore.trigger({
				message: 'No files selected for upload',
				background: 'preset-filled-warning-500'
			});
			return;
		}

		const formData = new FormData();
		files.forEach((file) => {
			formData.append('files', file);
		});
		formData.append('processType', 'save');

		try {
			const response = await fetch('/api/media/process', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				throw Error('Upload failed');
			}

			const result = await response.json();

			if (result.success) {
				toastStore.trigger({
					message: 'Files uploaded successfully',
					background: 'preset-filled-success-500'
				});
				files = []; // Clear the files array after successful upload

				// Navigate back to media gallery after successful upload
				goto('/mediagallery');
			} else {
				throw Error(result.error || 'Upload failed');
			}
		} catch (error) {
			console.error('Error uploading files:', error);
			toastStore.trigger({
				message: 'Error uploading files: ' + (error instanceof Error ? error.message : 'Unknown error'),
				background: 'preset-filled-error-500'
			});
		}
	}
</script>

<div
	bind:this={dropZone}
	ondrop={handleFileDrop}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	class="border-surface-600 bg-surface-200 dark:border-surface-500 dark:bg-surface-700 mt-2 flex h-[200px] w-full max-w-full flex-col items-center justify-center gap-4 rounded-sm border-2 border-dashed select-none"
	role="cell"
	tabindex="0"
	aria-dropeffect="none"
>
	<div class="grid grid-cols-6 items-center p-4">
		<iconify-icon icon="fa6-solid:file-arrow-up" width="40"></iconify-icon>

		<div class="col-span-5 space-y-4 text-center">
			<p class="font-bold">
				<span class="text-tertiary-500 dark:text-primary-500">Media Upload</span>
				Drag files here to upload
			</p>

			<p class="text-sm opacity-75">Multiple files allowed</p>

			<button onclick={() => input?.click()} class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500 mt-3"> Browse Files </button>

			<!-- File Size Limit -->
			<p class="text-tertiary-500 dark:text-primary-500 mt-2 text-sm">Max File Size: XX MB</p>
		</div>
	</div>

	<!-- File Input -->
	<input bind:this={input} type="file" hidden multiple onchange={onChange} />
</div>
