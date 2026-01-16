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
	import { logger } from '@utils/logger';
	import { toaster } from '@stores/store.svelte';

	import ModalUploadMedia from './ModalUploadMedia.svelte';
	import { goto } from '$app/navigation';
	import { modalState } from '@utils/modalState.svelte';

	let files: File[] = $state([]);
	let input: HTMLInputElement | null = $state(null);
	let dropZone: HTMLDivElement | null = $state(null);
	let uploadProgress = $state(0);
	let uploadSpeed = $state(0);
	let isUploading = $state(false);
	let isModalOpen = $state(false); // Track if modal is already open

	const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
	const ALLOWED_TYPES = [
		'image/jpeg',
		'image/png',
		'image/gif',
		'image/webp',
		'image/svg+xml',
		'video/mp4',
		'video/webm',
		'audio/mpeg',
		'audio/wav',
		'application/pdf',
		'application/msword',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
	];

	// Validate file before adding
	function modalAddMedia(): void {
		// Prevent opening modal multiple times
		if (isModalOpen) return;
		isModalOpen = true;

		// Create a snapshot of files to pass to modal (prevent reactivity issues)
		const filesSnapshot = [...files];

		modalState.trigger(ModalUploadMedia as any, {
			mediaType: 'image',
			sectionName: 'Gallery',
			files: filesSnapshot,
			onDelete: handleDeleteFile,
			uploadFiles: uploadLocalFiles,
			response: (r: any) => {
				// Reset modal state when closed
				isModalOpen = false;
				if (r) {
					logger.debug('response:', r);
					// Upload is handled exclusively by ModalUploadMedia component
					// which receives uploadFiles as a prop
				}
			}
		});
	}

	function handleFileDrop(event: DragEvent) {
		event.preventDefault();
		if (!event.dataTransfer) return;

		const droppedFiles = Array.from(event.dataTransfer.files);
		const validFiles: File[] = [];
		const errors: string[] = [];

		droppedFiles.forEach((file) => {
			if (file.size > MAX_FILE_SIZE) {
				errors.push(`${file.name} exceeds maximum file size of 50MB`);
			} else if (!ALLOWED_TYPES.includes(file.type)) {
				errors.push(`${file.name} is not an allowed file type`);
			} else {
				validFiles.push(file);
			}
		});

		if (errors.length > 0) {
			toaster.error({ description: errors.join('\n') });
		}

		if (validFiles.length > 0) {
			files = [...files, ...validFiles];
			// Only open modal if it's not already open
			if (!isModalOpen) {
				requestAnimationFrame(() => {
					modalAddMedia();
				});
			}
		}
	}
	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (dropZone) {
			dropZone.style.borderColor = '#5fd317';
		}
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dropZone?.style.removeProperty('border-color');
	}

	function onChange() {
		if (!input || !input.files) return;

		const selectedFiles = Array.from(input.files);
		const validFiles: File[] = [];
		const errors: string[] = [];

		selectedFiles.forEach((file) => {
			if (file.size > MAX_FILE_SIZE) {
				errors.push(`${file.name} exceeds maximum file size of 50MB`);
			} else {
				validFiles.push(file);
			}
		});

		if (errors.length > 0) {
			toaster.error({ description: errors.join('\n') });
		}

		if (validFiles.length > 0) {
			files = [...files, ...validFiles];

			// Only open modal if it's not already open
			// Use requestAnimationFrame to defer modal opening until after state updates
			if (!isModalOpen) {
				requestAnimationFrame(() => {
					modalAddMedia();
				});
			}
		}

		// Reset input value to allow selecting the same file again
		if (input) input.value = '';
	}
	function handleDeleteFile(file: File) {
		files = files.filter((f) => f !== file);
	}

	// This is the main upload logic triggered after modal confirmation
	async function uploadLocalFiles() {
		if (files.length === 0) {
			toaster.warning({ description: 'No files selected for upload' });
			return;
		}

		isUploading = true;
		uploadProgress = 0;
		const startTime = Date.now();
		let lastLoaded = 0;

		const formData = new FormData();
		files.forEach((file) => {
			formData.append('files', file);
		});

		try {
			const xhr = new XMLHttpRequest();

			// Track upload progress
			xhr.upload.addEventListener('progress', (e) => {
				if (e.lengthComputable) {
					uploadProgress = Math.round((e.loaded * 100) / e.total);

					// Calculate upload speed (bytes per second)
					const currentTime = Date.now();
					const timeDiff = (currentTime - startTime) / 1000; // in seconds
					const loadedDiff = e.loaded - lastLoaded;
					uploadSpeed = timeDiff > 0 ? loadedDiff / timeDiff : 0;
					lastLoaded = e.loaded;
				}
			});

			// Handle completion
			const uploadPromise = new Promise((resolve, reject) => {
				xhr.onload = () => {
					if (xhr.status >= 200 && xhr.status < 300) {
						try {
							const response = JSON.parse(xhr.responseText);
							logger.debug('Upload response received:', {
								status: xhr.status,
								response,
								responseType: response.type,
								hasData: !!response.data,
								hasSuccess: response.success !== undefined,
								dataSuccess: response.data?.success,
								dataType: typeof response.data
							});

							// SvelteKit wraps form action responses in { type, status, data }
							let data = response.data;

							// Check if data is a JSON string that needs parsing
							if (typeof data === 'string') {
								try {
									data = JSON.parse(data);
									logger.debug('Parsed stringified data:', data);
								} catch (e) {
									logger.warn('Data is a string but not valid JSON:', data);
								}
							}

							if (response.type === 'success' && data) {
								logger.debug('Using SvelteKit wrapped response');
								resolve(data);
							} else if (response.success !== undefined) {
								// Direct response format (for compatibility)
								logger.debug('Using direct response format');
								resolve(response);
							} else {
								logger.error('Unexpected response format:', response);
								reject(new Error('Invalid response format'));
							}
						} catch (e) {
							logger.error('Failed to parse upload response:', { responseText: xhr.responseText, error: e });
							reject(new Error('Invalid response format'));
						}
					} else {
						logger.error('Upload failed with status:', { status: xhr.status, statusText: xhr.statusText, responseText: xhr.responseText });
						reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
					}
				};
				xhr.onerror = () => reject(new Error('Network error during upload'));
				xhr.ontimeout = () => reject(new Error('Upload timeout'));
			});

			// Post to the parent route's upload form action
			xhr.open('POST', '/mediagallery?/upload');
			xhr.send(formData);

			const result = await uploadPromise;
			logger.debug('Upload promise resolved with result:', result);

			// Handle the result - it might be an array or an object
			let success = false;
			if (Array.isArray(result)) {
				// SvelteKit sometimes returns [data, boolean] format
				success = (result[0] as any)?.success === true || (result[0] as any)?.success === 1;
			} else {
				success = (result as any).success === true;
			}

			if (success) {
				toaster.success({ description: 'Files uploaded successfully' });
				files = []; // Clear the files array after successful upload
				// Navigate back to media gallery after successful upload
				goto('/mediagallery', { invalidateAll: true }); // Invalidate data on navigation
			} else {
				logger.error('Result does not have success=true:', result);
				throw new Error((Array.isArray(result) ? result[0]?.error : (result as any).error) || 'Upload failed');
			}
		} catch (error) {
			logger.error('Error uploading files:', error);
			toaster.error({ description: 'Error uploading files: ' + (error instanceof Error ? error.message : 'Unknown error') });
		} finally {
			isUploading = false;
			uploadProgress = 0;
			uploadSpeed = 0;
		}
	}

	// Format bytes for display
	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

			<button
				type="button"
				onclick={() => input?.click()}
				class="preset-filled-tertiary-500 btn mt-3 dark:preset-filled-primary-500"
				disabled={isUploading}
			>
				Browse Files
			</button>

			<!-- File Size Limit -->
			<p class="mt-2 text-sm text-tertiary-500 dark:text-primary-500">Max File Size: 50 MB</p>
		</div>
	</div>

	<!-- File Input -->
	<input bind:this={input} type="file" class="sr-only" hidden multiple onchange={onChange} aria-hidden="true" tabindex="-1" />
</div>

<!-- Upload Progress Indicator -->
{#if isUploading}
	<div class="mt-4 w-full rounded border border-surface-400 bg-surface-100 p-4 dark:bg-surface-700">
		<div class="mb-2 flex items-center justify-between text-sm">
			<span class="font-semibold">Uploading...</span>
			<span>{uploadProgress}%</span>
		</div>

		<!-- Progress Bar -->
		<div class="mb-2 h-2 w-full overflow-hidden rounded-full bg-surface-300 dark:bg-surface-600">
			<div class="h-full bg-primary-500 transition-all duration-300" style="width: {uploadProgress}%"></div>
		</div>

		<!-- Upload Stats -->
		<div class="flex items-center justify-between text-xs text-surface-600 dark:text-surface-400">
			<span>Speed: {formatBytes(uploadSpeed)}/s</span>
			<span>{files.length} file{files.length !== 1 ? 's' : ''}</span>
		</div>
	</div>
{/if}
