<!-- 
@files src/routes/(app)/mediagallery/uploadMedia/LocalUpload.svelte
@component
**This page is used to local upload media to the media gallery**

## Props
- 

### Features:
- Drag and drop file upload
- File validation (size, type)
- Duplicate file detection
- Thumbnail generation
- File upload progress
- Cancel upload
	
-->
<script lang="ts">
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { toaster } from '@src/stores/store.svelte.ts';
	// Using iconify-icon web component
	import { logger } from '@utils/logger';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';

	interface Props {
		folder?: string;
		onUploadComplete?: () => void;
		redirectOnSuccess?: boolean;
	}

	const { onUploadComplete = () => {}, redirectOnSuccess = true, folder = 'global' }: Props = $props();

	let files: File[] = $state([]);
	let input: HTMLInputElement | null = $state(null);
	let dropZone: HTMLDivElement | null = $state(null);
	let uploadProgress = $state(0);
	let uploadSpeed = $state(0);
	let isUploading = $state(false);

	// Internal state moved from ModalUploadMedia
	// eslint-disable-next-line svelte/no-unnecessary-state-wrap
	let fileSet = $state(new SvelteSet<string>());

	// eslint-disable-next-line svelte/no-unnecessary-state-wrap
	let objectUrls = $state(new SvelteMap<string, string>());

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

	// Async Thumbnail Generation Effect
	$effect(() => {
		const currentFiles = files;
		let isActive = true;

		async function generateThumbnails() {
			for (const file of currentFiles) {
				if (!isActive) {
					return;
				}

				const fileKey = `${file.name}-${file.size}`;

				// Skip if we already have a URL for this file
				if (!objectUrls.has(fileKey) && (file.type?.startsWith('image/') || file.type?.startsWith('audio/'))) {
					const url = URL.createObjectURL(file);
					objectUrls.set(fileKey, url);

					// Yield to main thread to allow UI rendering
					await new Promise((resolve) => requestAnimationFrame(resolve));
				}
			}

			// Cleanup phase: Remove URLs for files that are no longer present
			if (isActive) {
				const currentFileKeys = new Set(currentFiles.map((f) => `${f.name}-${f.size}`));
				for (const [key, url] of objectUrls) {
					if (!currentFileKeys.has(key)) {
						URL.revokeObjectURL(url);
						objectUrls.delete(key);
					}
				}
			}
		}

		generateThumbnails();

		return () => {
			isActive = false;
		};
	});

	// Cleanup on destroy
	$effect(() => {
		return () => {
			objectUrls.forEach((url) => URL.revokeObjectURL(url));
		};
	});

	// Helper: Get icon string
	function getFileIcon(file: File): string {
		const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
		switch (true) {
			case file.type?.startsWith('image/'):
				return 'fa-solid:image';
			case file.type?.startsWith('video/'):
				return 'fa-solid:video';
			case file.type?.startsWith('audio/'):
				return 'fa-solid:play-circle';
			case fileExt === '.pdf':
				return 'vscode-icons:file-type-pdf2';
			case fileExt === '.doc' || fileExt === '.docx' || fileExt === '.docm':
				return 'vscode-icons:file-type-word';
			case fileExt === '.ppt' || fileExt === '.pptx':
				return 'vscode-icons:file-type-powerpoint';
			case fileExt === '.xls' || fileExt === '.xlsx':
				return 'vscode-icons:file-type-excel';
			case fileExt === '.txt':
				return 'fa-solid:file-lines';
			case fileExt === '.zip' || fileExt === '.rar':
				return 'fa-solid:file-zipper';
			default:
				return 'vscode-icons:file';
		}
	}

	// Format MIME type for display
	function formatMimeType(mime?: string): string {
		if (!mime) {
			return 'Unknown';
		}
		const parts = mime.split('/');
		return parts[1] ? parts[1].toUpperCase() : parts[0].toUpperCase();
	}

	function validateAndAddFiles(newFiles: File[]) {
		const validFiles: File[] = [];
		const errors: string[] = [];

		newFiles.forEach((file) => {
			if (file.size > MAX_FILE_SIZE) {
				errors.push(`${file.name} exceeds maximum file size of 50MB`);
			} else if (ALLOWED_TYPES.includes(file.type)) {
				// Check for duplicates
				const fileKey = `${file.name}-${file.size}`;
				if (fileSet.has(fileKey)) {
					// Silent skip or warn? using simple toast if needed, but usually redundant
				} else {
					validFiles.push(file);
					fileSet.add(fileKey);
				}
			} else {
				errors.push(`${file.name} is not an allowed file type`);
			}
		});

		if (errors.length > 0) {
			toaster.error({ description: errors.join('\n') });
		}

		if (validFiles.length > 0) {
			files = [...files, ...validFiles];
		}
	}

	function handleFileDrop(event: DragEvent) {
		event.preventDefault();
		if (!event.dataTransfer) {
			return;
		}
		validateAndAddFiles(Array.from(event.dataTransfer.files));
	}

	function onChange() {
		if (!input?.files) {
			return;
		}
		validateAndAddFiles(Array.from(input.files));
		if (input) {
			input.value = '';
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

	function handleDeleteFile(file: File) {
		const fileKey = `${file.name}-${file.size}`;
		files = files.filter((f) => f !== file);
		fileSet.delete(fileKey);
	}

	function handleCancel() {
		files = [];
		fileSet.clear();
		// Revoke immediately
		objectUrls.forEach((url) => URL.revokeObjectURL(url));
		objectUrls.clear();
	}

	// Format bytes for display
	function formatBytes(bytes: number): string {
		if (bytes === 0) {
			return '0 Bytes';
		}
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
	}

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
		formData.append('folder', folder);

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
							let data = response.data;

							// Check if data is a JSON string that needs parsing
							if (typeof data === 'string') {
								try {
									data = JSON.parse(data);
									logger.debug('Parsed stringified data:', data);
								} catch (_e) {
									logger.warn('Data is a string but not valid JSON:', data);
								}
							}
							if (response.type === 'success' && data) {
								resolve(data);
							} else if (response.success !== undefined) {
								resolve(response);
							} else {
								reject(new Error('Invalid response format'));
							}
						} catch (_e) {
							reject(new Error('Invalid response format'));
						}
					} else {
						reject(new Error(`Upload failed: ${xhr.status}`));
					}
				};
				xhr.onerror = () => reject(new Error('Network error'));
			});

			// Post to the base mediagallery route's upload form action
			xhr.open('POST', '/mediagallery?/upload');
			xhr.send(formData);

			const result: any = await uploadPromise;
			const success = Array.isArray(result) ? result[0]?.success : result?.success;

			if (success) {
				toaster.success({ description: 'Files uploaded successfully' });
				handleCancel();
				onUploadComplete();
				if (redirectOnSuccess) {
					goto('/mediagallery', { invalidateAll: true });
				}
			} else {
				throw new Error((Array.isArray(result) ? result[0]?.error : result?.error) || 'Upload failed');
			}
		} catch (error) {
			logger.error('Error uploading files:', error);
			toaster.error({
				description: `Error uploading files: ${error instanceof Error ? error.message : 'Unknown error'}`
			});
		} finally {
			isUploading = false;
		}
	}
</script>

{#if files.length === 0}
	<!-- Drop Zone State -->
	<div
		bind:this={dropZone}
		ondrop={handleFileDrop}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
		class="mt-2 flex h-[200px] w-full max-w-full select-none flex-col items-center justify-center gap-4 rounded border-2 border-dashed border-surface-600 bg-secondary-50 dark:border-surface-500 dark:bg-surface-700"
		role="region"
		aria-label="File drop zone"
	>
		<div class="grid grid-cols-6 items-center p-4">
			<iconify-icon icon="fa6-solid:file-arrow-up" width={24}></iconify-icon>

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
{:else}
	<div class="mb-5 text-center sm:text-left">
		<p class="text-center text-tertiary-500 dark:text-primary-500">
			This area facilitates the queuing and previewing of media files before they are officially uploaded to the gallery. Verify your selection below,
			then confirm to complete the transfer.
		</p>
	</div>
	<!-- Grid View State -->
	<div class="flex flex-col space-y-4">
		<!-- File Grid -->
		<div class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
			{#each files as file (file.name + file.size)}
				{@const fileKey = `${file.name}-${file.size}`}
				{@const previewUrl = objectUrls.get(fileKey)}
				{@const iconName = getFileIcon(file)}

				<div class="group relative overflow-hidden rounded border border-surface-200 shadow-sm transition-all hover:shadow-md dark:border-surface-50">
					<!-- Delete button -->
					<div class="absolute right-1 top-1 z-10 flex cursor-pointer shadow-sm">
						<SystemTooltip title="Remove file" positioning={{ placement: 'top' }}>
							<button type="button" onclick={() => handleDeleteFile(file)} class="btn-icon bg-error-500 rounded-full" aria-label="Remove file">
								<iconify-icon icon="material-symbols:delete" width={24} class="text-white"></iconify-icon>
							</button>
						</SystemTooltip>
					</div>

					<!-- Preview -->
					<div class="flex aspect-square items-center justify-center">
						{#if file.type?.startsWith('image/') && previewUrl}
							<img src={previewUrl} alt={file.name} class="h-full w-full object-contain" />
						{:else if file.type?.startsWith('audio/') && previewUrl}
							<audio controls class="max-w-full">
								<source src={previewUrl} type={file.type} />
							</audio>
						{:else}
							<iconify-icon icon={iconName} width="48" class="opacity-50"></iconify-icon>
						{/if}
					</div>

					<!-- Media Filename -->
					<div class="w-full px-2 py-1 text-center h-10 flex flex-col justify-center">
						<SystemTooltip title={file.name} positioning={{ placement: 'top' }}>
							<div class="text-xs font-bold leading-tight line-clamp-2 overflow-hidden overflow-wrap-anywhere">{file.name}</div>
						</SystemTooltip>
					</div>

					<!-- Media Type & Size (Footer) -->
					<div class="flex grow items-center justify-between p-1 text-white font-bold">
						<!-- Type -->
						<SystemTooltip title={file.type} positioning={{ placement: 'top' }}>
							<div class="bg-tertiary-500 dark:bg-primary-500/50 badge flex items-center gap-1 overflow-hidden">
								<iconify-icon icon={iconName} width="12"></iconify-icon>
								<span class="truncate text-[10px] uppercase">{formatMimeType(file.type)}</span>
							</div>
						</SystemTooltip>
						<!-- Size -->
						<SystemTooltip title="Size" positioning={{ placement: 'top' }}>
							<p class="bg-tertiary-500 dark:bg-primary-500/50 badge flex shrink-0 items-center gap-1 text-[10px]">
								<span class="">{(file.size / 1024).toFixed(2)}</span>
								KB
							</p>
						</SystemTooltip>
					</div>
				</div>
			{/each}

			<!-- Add File Card -->
			<button type="button" class="btn preset-tonal-surface-500 flex-col items-center gap-2" onclick={() => input?.click()}>
				<iconify-icon icon="mingcute:add-fill" width={24}></iconify-icon>
				<span class="font-bold">Add Files</span>
			</button>
		</div>

		<!-- Hidden Input for Add Card -->
		<input bind:this={input} type="file" class="hidden" multiple onchange={onChange} />

		<!-- Actions Footer -->
		<div class="flex items-center justify-between border-t border-surface-200 pt-4 dark:border-surface-700">
			<button type="button" class="btn preset-outlined-surface-500" onclick={handleCancel}>Cancel</button>
			<button type="button" class="btn dark:preset-filled-primary-500 preset-filled-tertiary-500" onclick={uploadLocalFiles} disabled={isUploading}>
				{#if isUploading}
					<iconify-icon icon="eos-icons:loading" width={24} class="animate-spin"></iconify-icon>
					<span>Uploading... {uploadProgress}%</span>
				{:else}
					<iconify-icon icon="mingcute:check-fill" width={24}></iconify-icon>
					<span>Upload {files.length} File{files.length !== 1 ? 's' : ''}</span>
				{/if}
			</button>
		</div>
	</div>
{/if}

<!-- Upload Progress Overlay (Optional, or keep inline in button) -->
{#if isUploading}
	<div class="mt-4 w-full rounded border border-surface-400 bg-surface-100 p-4 dark:bg-surface-700">
		<!-- Progress Bar -->
		<div
			class="mb-2 h-2 w-full overflow-hidden rounded-full bg-surface-300 dark:bg-surface-600"
			role="progressbar"
			aria-label="Upload progress"
			aria-valuenow={uploadProgress}
			aria-valuemin={0}
			aria-valuemax={100}
		>
			<div class="h-full bg-primary-500 transition-all duration-300" style="width: {uploadProgress}%"></div>
		</div>
		<div class="flex items-center justify-between text-xs text-surface-600 dark:text-surface-50">
			<span>Speed: {formatBytes(uploadSpeed)}/s</span>
		</div>
	</div>
{/if}
