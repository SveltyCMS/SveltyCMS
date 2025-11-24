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
	import { getModalStore } from '@skeletonlabs/skeleton-svelte';
	import { createValidationSchema, type FieldType } from './';
	import type { MediaFile } from './types';
	import { validationStore } from '@root/src/stores/store.svelte';
	import { getFieldName } from '@utils/utils';
	import { parse, flatten } from 'valibot';

	// ✅ Security: File validation constants to prevent malicious uploads
	const ALLOWED_MIME_TYPES = [
		// Images
		'image/jpeg',
		'image/jpg',
		'image/png',
		'image/gif',
		'image/webp',
		'image/svg+xml',
		'image/bmp',
		// Videos
		'video/mp4',
		'video/webm',
		'video/ogg',
		'video/quicktime',
		// Audio
		'audio/mpeg',
		'audio/mp3',
		'audio/wav',
		'audio/ogg',
		// Documents
		'application/pdf',
		'application/msword',
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'application/vnd.ms-excel',
		'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
	];

	const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes

	const VALID_EXTENSIONS = [
		'.jpg',
		'.jpeg',
		'.png',
		'.gif',
		'.webp',
		'.svg',
		'.bmp',
		'.mp4',
		'.webm',
		'.ogv',
		'.mov',
		'.mp3',
		'.wav',
		'.ogg',
		'.pdf',
		'.doc',
		'.docx',
		'.xls',
		'.xlsx'
	];

	let { field, value = $bindable(), error }: { field: FieldType; value: string | string[] | null | undefined; error?: string | null } = $props();

	// ✅ SSOT: Import validation schema from index.ts
	const validationSchema = createValidationSchema(field);
	const fieldName = getFieldName(field);

	// Validation state management
	let validateOnMount = field.required ?? false;
	let localError = $state<string | null>(null);

	// A local, reactive array of the full, resolved media file objects for display.
	let selectedFiles = $state<MediaFile[]>([]);

	// Helper function to fetch full media data from an array of IDs.
	async function fetchMediaData(ids: string[]): Promise<MediaFile[]> {
		// In a real app, this would be an API call: GET /api/media?ids=id1,id2,...
		// For this example, we'll simulate it with a timeout.
		logger.debug('Fetching data for IDs:', ids);
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

	// ✅ Effect 3: Validate on value changes
	$effect(() => {
		if (validateOnMount || value) {
			try {
				parse(validationSchema, value);
				localError = null;
				validationStore.setError(fieldName, null);
			} catch (err: unknown) {
				const flatErrors = flatten(err as any);
				const errorMessage = flatErrors?.root?.[0] || 'Invalid media selection';
				localError = errorMessage;
				validationStore.setError(fieldName, errorMessage);
				if (process.env.NODE_ENV !== 'production') {
					logger.debug('[MediaUpload] Validation error:', errorMessage);
				}
			}
		}
	});

	// Function to open the Media Library modal.
	function openMediaLibrary() {
		getModalStore().trigger({
			type: 'component',
			component: 'mediaLibraryModal', // This would be your full media library component
			// Pass a callback function to the modal so it can return the selected files.
			response: (files: MediaFile[] | undefined) => {
				if (files && files.length > 0) {
					addValidatedFiles(files);
				}
			}
		});
	}

	// Function to remove a selected file.
	function removeFile(fileId: string) {
		selectedFiles = selectedFiles.filter((file) => file._id !== fileId);
		validateOnMount = true; // Enable validation after user interaction
	}

	// ✅ Security: Comprehensive file validation to prevent malicious uploads
	function addValidatedFiles(files: MediaFile[]) {
		const validFiles = files.filter((file) => {
			// 1. Check MIME type against whitelist
			if (!ALLOWED_MIME_TYPES.includes(file.type)) {
				if (process.env.NODE_ENV !== 'production') {
					logger.warn(`[MediaUpload Security] File MIME type ${file.type} not in whitelist for ${file.name}`);
				}
				return false;
			}

			// 2. Check file size limit to prevent DoS
			if (file.size > MAX_FILE_SIZE) {
				if (process.env.NODE_ENV !== 'production') {
					logger.warn(`[MediaUpload Security] File size ${file.size} exceeds limit ${MAX_FILE_SIZE} for ${file.name}`);
				}
				return false;
			}

			// 3. Validate file extension matches MIME type
			const fileExtension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
			if (!fileExtension || !VALID_EXTENSIONS.includes(fileExtension)) {
				if (process.env.NODE_ENV !== 'production') {
					logger.warn(`[MediaUpload Security] File extension ${fileExtension} not in whitelist for ${file.name}`);
				}
				return false;
			}

			// 4. Check for path traversal attempts in filename
			if (file.name.includes('../') || file.name.includes('..\\')) {
				if (process.env.NODE_ENV !== 'production') {
					logger.warn(`[MediaUpload Security] Path traversal attempt detected in filename: ${file.name}`);
				}
				return false;
			}

			// 5. Sanitize filename - remove dangerous characters
			const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
			if (sanitizedName !== file.name) {
				if (process.env.NODE_ENV !== 'production') {
					logger.warn(`[MediaUpload Security] Filename sanitized from "${file.name}" to "${sanitizedName}"`);
				}
				// Update file name to sanitized version
				file.name = sanitizedName;
			}

			// 6. Additional check: field-level allowed types (more restrictive than global whitelist)
			const allowedTypes = field.allowedTypes as string[] | undefined;
			if (allowedTypes && Array.isArray(allowedTypes) && allowedTypes.length > 0) {
				if (!allowedTypes.includes(file.type)) {
					if (process.env.NODE_ENV !== 'production') {
						logger.warn(`[MediaUpload Security] File type ${file.type} not in field allowedTypes for ${file.name}`);
					}
					return false;
				}
			}

			return true;
		});

		if (field.multiupload) {
			selectedFiles = [...selectedFiles, ...validFiles];
		} else {
			selectedFiles = validFiles.length > 0 ? [validFiles[0]] : [];
		}
		validateOnMount = true; // Enable validation after user interaction
	}
</script>

<div class="min-h-[120px] rounded-lg border-2 border-dashed border-surface-300 p-4 dark:border-surface-600" class:!border-error-500={error}>
	{#if selectedFiles.length > 0}
		<div
			class="mb-4 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(100px,1fr))]"
			use:dndzone={{ items: selectedFiles }}
			onconsider={(e) => (selectedFiles = e.detail.items)}
		>
			{#each selectedFiles as file (file._id)}
				<div class="relative overflow-hidden rounded border border-surface-200 dark:border-surface-700" animate:flip>
					<img src={file.thumbnailUrl} alt={file.name} class="h-[100px] w-full object-cover" />
					<span class="block truncate p-1 text-center text-xs">{file.name}</span>
					<button
						onclick={() => removeFile(file._id)}
						class="absolute right-1 top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-none bg-surface-900/50 text-white transition-colors hover:bg-surface-900/75"
						aria-label="Remove"
					>
						&times;
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

	{#if error || localError}
		<p class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">{error || localError}</p>
	{/if}
</div>
