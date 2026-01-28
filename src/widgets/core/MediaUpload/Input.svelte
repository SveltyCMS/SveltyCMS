<!--
@file src/widgets/core/MediaUpload/Input.svelte
@component
**Media Upload Widget Component**

@example
<Input field={{ label: "Upload Image", db_fieldName: "image", translated: true, required: true }} />

### Props
- `field: FieldType` - Configuration object for the media upload field
- `value: string | string[] | null | undefined` - Current value(s) representing media IDs
- `error?: string | null` - Optional error message to display

### Features
- **Single and Multiple Uploads**: Supports both single and multi-file uploads based on the `multiupload` property in the `field` prop.
- **Drag-and-Drop Reordering**: Utilizes `svelte-dnd-action` for drag-and-drop reordering of selected media files.
- **Media Library Integration**: Opens a modal media library for selecting files, with a callback to handle selected files.
- **Dynamic Fetching**: Automatically fetches media data when IDs change.
-->

<script lang="ts">
	import { logger } from '@utils/logger';
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import type { FieldType } from './';
	import type { MediaFile } from './types';
	import type { MediaBase, MediaImage } from '@utils/media/mediaModels';
	import { modalState } from '@utils/modalState.svelte';
	import MediaLibraryModal from '@components/MediaLibraryModal.svelte';

	// SECURITY: File validation constants
	const ALLOWED_MIME_TYPES = [
		'image/jpeg',
		'image/png',
		'image/gif',
		'image/webp',
		'image/svg+xml',
		'video/mp4',
		'video/webm',
		'video/ogg',
		'application/pdf',
		'audio/mpeg',
		'audio/wav'
	];
	const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
	const VALID_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'webm', 'ogg', 'pdf', 'mp3', 'wav'];

	function validateFile(file: { name: string; type: string; size: number }): { valid: boolean; error?: string } {
		// Check MIME type
		if (!ALLOWED_MIME_TYPES.includes(file.type)) {
			return { valid: false, error: `Invalid file type: ${file.type}` };
		}
		// Check file size
		if (file.size > MAX_FILE_SIZE) {
			return { valid: false, error: `File too large (max 10MB): ${(file.size / 1024 / 1024).toFixed(2)}MB` };
		}
		// Check file extension
		const ext = file.name.split('.').pop()?.toLowerCase();
		if (!ext || !VALID_EXTENSIONS.includes(ext)) {
			return { valid: false, error: `Invalid file extension: ${ext}` };
		}
		return { valid: true };
	}

	let { field, value = $bindable(), error }: { field: FieldType; value: string | string[] | null | undefined; error?: string | null } = $props();

	// A local, reactive array of the full, resolved media file objects for display.
	let selectedFiles = $state<MediaFile[]>([]);

	// Helper function to fetch full media data from an array of IDs.
	async function fetchMediaData(ids: string[]): Promise<MediaFile[]> {
		logger.debug('Fetching data for IDs:', ids);
		try {
			const fetchedFiles: MediaFile[] = [];
			for (const id of ids) {
				const response = await fetch(`/api/media?limit=100`);
				if (response.ok) {
					const data = await response.json();
					const found = data.find((f: any) => f._id === id);
					if (found) {
						fetchedFiles.push({
							_id: found._id,
							name: found.filename,
							type: found.mimeType,
							size: found.size,
							url: found.url,
							thumbnailUrl: found.thumbnails?.md?.url || found.url
						});
					}
				}
			}
			return fetchedFiles;
		} catch (e) {
			logger.error('Error fetching media data:', e);
			return [];
		}
	}

	// Effect 1: When the parent `value` (the IDs) changes, fetch the full data.
	$effect(() => {
		const ids = Array.isArray(value) ? value : value ? [value] : [];
		if (ids.length > 0) {
			const missingIds = ids.filter((id) => !selectedFiles.some((f) => f._id === id));
			if (missingIds.length > 0) {
				fetchMediaData(ids).then((files) => {
					selectedFiles = files;
				});
			}
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

	function openMediaLibrary() {
		modalState.trigger(
			MediaLibraryModal as any,
			{
				selectionMode: field.multiupload ? 'multiple' : 'single',
				allowedTypes: field.allowedTypes || []
			},
			(files: (MediaBase | MediaImage)[]) => {
				if (files && Array.isArray(files)) {
					const mappedFiles: MediaFile[] = files.map((f) => ({
						_id: f._id as string,
						name: f.filename,
						type: f.mimeType,
						size: f.size,
						url: (f as any).url,
						thumbnailUrl: (f as any).thumbnails?.md?.url || (f as any).url
					}));

					const validFiles = mappedFiles.filter((file) => {
						const validation = validateFile(file);
						if (!validation.valid) {
							logger.warn(`Rejected file ${file.name}: ${validation.error}`);
							return false;
						}
						return true;
					});

					if (field.multiupload) {
						selectedFiles = [...selectedFiles, ...validFiles];
					} else if (validFiles.length > 0) {
						selectedFiles = [validFiles[0]];
					}
				}
			}
		);
	}

	function removeFile(fileId: string) {
		selectedFiles = selectedFiles.filter((file) => file._id !== fileId);
	}
</script>

<div class="min-h-[120px] rounded-lg border-2 border-dashed border-surface-300 p-4 dark:border-surface-600" class:!border-error-500={error}>
	{#if selectedFiles.length > 0}
		<div
			class="mb-4 grid gap-4 [grid-cols-[repeat(auto-fill,minmax(100px,1fr))]"
			use:dndzone={{ items: selectedFiles }}
			onconsider={(e) => (selectedFiles = e.detail.items)}
		>
			{#each selectedFiles as file (file._id)}
				<div class="relative overflow-hidden rounded border border-surface-200 dark:text-surface-50" animate:flip>
					<img src={file.thumbnailUrl} alt={file.name} class="h-[100px] w-full object-cover" />
					<span class="block truncate p-1 text-center text-xs">{file.name}</span>
					<button
						onclick={() => removeFile(file._id)}
						class="absolute right-1 top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-none bg-surface-900/50 text-white transition-colors hover:bg-surface-900/75"
						aria-label="Remove"
					>
						×
					</button>
				</div>
			{/each}
		</div>
	{/if}

	{#if field.multiupload || selectedFiles.length === 0}
		<button
			type="button"
			onclick={openMediaLibrary}
			class="w-full cursor-pointer rounded border-none bg-surface-100 p-3 transition-colors hover:bg-surface-200 dark:bg-surface-700 dark:hover:bg-surface-600"
		>
			+ Add Media
		</button>
	{/if}

	{#if error}
		<p class="absolute -bottom-4 left-0 w-full text-center text-xs text-error-500" role="alert">{error}</p>
	{/if}
</div>
