<!--
@file src/widgets/custom/MediaUpload/Input.svelte
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
	import MediaLibraryModal from '@components/media-library-modal.svelte';
	import { collectionValue, setCollectionValue } from '@src/stores/collection-store.svelte';
	import { logger } from '@utils/logger';
	import { getFieldName } from '@utils/utils';
	import type { MediaBase, MediaImage } from '@utils/media/media-models';
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';
	import { page } from '$app/state';
	import type { FieldType } from './';
	import type { MediaFile } from './types';
	import 'iconify-icon';

	const tenantId = $derived(page.data?.tenantId);

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

	const MAX_FILE_SIZE = 10 * 1024 * 1024;
	const VALID_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'webm', 'ogg', 'pdf', 'mp3', 'wav'];

	function validateFile(file: { name: string; type: string; size: number }): {
		valid: boolean;
		error?: string;
	} {
		if (!ALLOWED_MIME_TYPES.includes(file.type)) {
			return { valid: false, error: `Invalid file type: ${file.type}` };
		}

		if (file.size > MAX_FILE_SIZE) {
			return {
				valid: false,
				error: `File too large (max 10MB): ${(file.size / 1024 / 1024).toFixed(2)}MB`
			};
		}

		const ext = file.name.split('.').pop()?.toLowerCase();
		if (!(ext && VALID_EXTENSIONS.includes(ext))) {
			return { valid: false, error: `Invalid file extension: ${ext}` };
		}

		return { valid: true };
	}

	let {
		field,
		value = $bindable(),
		error,
		collectionName
	}: {
		field: FieldType;
		value: string | string[] | null | undefined;
		error?: string | null;
		collectionName?: string;
	} = $props();

	let selectedFiles = $state<MediaFile[]>([]);
	let showMediaLibrary = $state(false);

	const dndItems = $derived(
		selectedFiles.map((file) => ({
			...file,
			id: file._id
		}))
	);

	const fieldKey = $derived(getFieldName(field, false));

	function syncCollectionValue(nextValue: string | string[] | null) {
		value = nextValue;

		if (!fieldKey) {
			return;
		}

		const current = (collectionValue.value as Record<string, unknown> | undefined) ?? {};
		if (current[fieldKey] !== nextValue) {
			setCollectionValue({
				...current,
				[fieldKey]: nextValue
			});
		}
	}

	async function fetchMediaData(ids: string[]): Promise<MediaFile[]> {
		logger.debug('Fetching data for IDs:', ids);
		try {
			const fetchedFiles: MediaFile[] = [];

			const normalizePath = (p: string | undefined | null): string => {
				if (!p) return '';
				if (p.startsWith('/files/')) return p;
				if (p.startsWith('http://') || p.startsWith('https://')) return p;

				let path = p.replace(/^mediaFolder\//, '').replace(/^files\//, '');
				path = path.replace(/^\/+/, '');
				return `/files/${path}`;
			};

			for (const id of ids) {
				const response = await fetch(`/api/media/${id}`);
				if (response.ok) {
					const found = await response.json();
					if (found) {
						fetchedFiles.push({
							_id: found._id,
							name: found.filename,
							type: found.mimeType,
							size: found.size,
							url: normalizePath(found.path),
							thumbnailUrl: normalizePath(found.thumbnails?.md?.url) || normalizePath(found.thumbnails?.sm?.url) || normalizePath(found.path),
							aiTags: found.metadata?.aiTags || []
						} as any);
					}
				}
			}
			return fetchedFiles;
		} catch (e) {
			logger.error('Error fetching media data:', e);
			return [];
		}
	}

	function getFileIcon(file: MediaFile): string {
		const fileName = file.name || '';
		const fileExt = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

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
		}
		return 'vscode-icons:file';
	}

	$effect(() => {
		const ids = Array.isArray(value) ? value : value ? [value] : [];
		if (ids.length > 0) {
			const missingIds = ids.filter((id) => !selectedFiles.some((f) => f._id === id));
			if (missingIds.length > 0 || selectedFiles.length === 0) {
				fetchMediaData(ids).then((files) => {
					const existingIds = new Set(selectedFiles.map((f) => f._id));
					const newFiles = files.filter((f) => !existingIds.has(f._id));
					selectedFiles = [...selectedFiles, ...newFiles];
				});
			}
		} else {
			selectedFiles = [];
		}
	});

	$effect(() => {
		const newIds = selectedFiles.map((file) => file._id);
		if (field.multiupload) {
			syncCollectionValue(newIds);
		} else {
			syncCollectionValue(newIds[0] || null);
		}
	});

	function openMediaLibrary() {
		showMediaLibrary = true;
	}

	function closeMediaLibrary() {
		showMediaLibrary = false;
	}

	function handleMediaSelection(files: (MediaBase | MediaImage)[]) {
		if (!(files && Array.isArray(files))) {
			return;
		}

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

		showMediaLibrary = false;
	}

	function removeFile(fileId: string) {
		selectedFiles = selectedFiles.filter((file) => file._id !== fileId);
	}

	function syncDndItems(items: Array<MediaFile & { id: string }>) {
		selectedFiles = items.map(({ id, ...rest }) => ({
			...rest,
			_id: id
		}));
	}
</script>

<div class="min-h-[120px] rounded-lg border-2 border-dashed border-surface-300 p-4 dark:border-surface-600" class:!border-error-500={error}>
	{#if selectedFiles.length > 0}
		<div class="mb-4 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4" use:dndzone={{ items: dndItems }} onconsider={(e) => syncDndItems(e.detail.items)}>
			{#each selectedFiles as file (file._id)}
				<div class="relative overflow-hidden rounded border border-surface-200 dark:text-surface-50" animate:flip>
					<button
						type="button"
						class="block w-full cursor-pointer text-left"
						onclick={openMediaLibrary}
						aria-label={`Change media for ${file.name}`}
					>
						{#if file.type?.startsWith('image/') || (file.thumbnailUrl && !file.thumbnailUrl.endsWith('.pdf'))}
							<img src={file.thumbnailUrl} alt={file.name} class="h-[120px] w-full object-cover" />
						{:else}
							<div class="flex h-[120px] w-full items-center justify-center bg-surface-100 dark:bg-surface-800">
								<iconify-icon icon={getFileIcon(file)} width="48"></iconify-icon>
							</div>
						{/if}
					</button>

					<div class="p-1">
						<span class="block truncate text-center text-xs font-bold">{file.name}</span>
						{#if (file as any).aiTags?.length}
							<div class="mt-1 flex flex-wrap justify-center gap-0.5">
								{#each (file as any).aiTags.slice(0, 3) as tag, i (tag + i)}
									<span class="badge variant-soft-secondary py-0 px-1 text-[8px]">{tag}</span>
								{/each}
								{#if (file as any).aiTags.length > 3}
									<span class="text-[8px] opacity-50">...</span>
								{/if}
							</div>
						{/if}
					</div>

					<button
						type="button"
						onclick={() => removeFile(file._id)}
						class="absolute right-1 top-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border-none bg-surface-900/50 text-white transition-colors hover:bg-surface-900/75"
						aria-label="Remove"
						title="Remove"
					>
						×
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<button
		type="button"
		onclick={openMediaLibrary}
		class="w-full cursor-pointer rounded border-none bg-surface-100 p-3 text-left transition-colors hover:bg-surface-200 dark:bg-surface-700 dark:hover:bg-surface-600"
	>
		<span class="block text-center font-medium">
			{selectedFiles.length > 0 ? field.placeholder || 'Change Media' : field.placeholder || '+ Add Media'}
		</span>
	</button>

	{#if error}
		<p class="absolute -bottom-4 left-0 w-full text-center text-xs text-error-500" role="alert">{error}</p>
	{/if}
</div>

{#if showMediaLibrary}
	<div class="fixed inset-0 z-[99999] bg-black/70 p-4 backdrop-blur-sm">
		<div class="flex h-full w-full overflow-hidden rounded-2xl border border-surface-500 bg-surface-100 shadow-2xl dark:bg-surface-900">
			<MediaLibraryModal
				standalone={true}
				allowedTypes={(field.allowedTypes as string[] | undefined) ?? []}
				folder={((field as { folder?: string }).folder ?? (collectionName ? `collections/${collectionName.toLowerCase()}` : tenantId || 'global')) as string}
				onConfirm={handleMediaSelection}
				onClose={closeMediaLibrary}
			/>
		</div>
	</div>
{/if}