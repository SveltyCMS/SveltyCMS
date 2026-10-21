<!--
@file src/components/media-library-modal.svelte
@component
**Media library modal for selecting and uploading media files**

### Props
- `allowedTypes`: Array of allowed media types
- `folder`: Folder to upload media to
- `parent`: Parent object for media
- `standalone`: Render without `modalState` (used by the Media widget)
- `onConfirm`: Receives the selected media documents
- `onClose`: Standalone close callback

### Features
- Supports local and remote uploads
- Displays media library with a density toggle (compact / comfortable / large)
- Uses the same filename / MIME-subtype / size labels as the gallery
- Allows selection of multiple files and reflects the count in the footer
- Handles errors and loading states
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import LocalUpload from '@src/routes/(app)/mediagallery/upload-media/local-upload.svelte';
	import RemoteUpload from '@src/routes/(app)/mediagallery/upload-media/remote-upload.svelte';
	import { logger } from '@utils/logger';
	import type { MediaBase, MediaImage, MediaItem } from '@utils/media/media-models';
	import { mediaDisplayUrl, mediaUrl } from '@utils/media/media-utils';
	import { modalState } from '@utils/modal.svelte';
	import { formatBytes } from '@utils/file';
	import { onMount } from 'svelte';
	import type { ISODateString } from '@src/content/types';
	import {
		button_retry,
		mediagallery_density_comfortable,
		mediagallery_density_compact,
		mediagallery_density_group,
		mediagallery_density_large,
		mediagallery_filter_type,
		mediagallery_no_media,
		mediagallery_picker_asset_plural,
		mediagallery_picker_asset_single,
		mediagallery_picker_clear_selection,
		mediagallery_picker_empty_filtered,
		mediagallery_picker_filtered_count,
		mediagallery_picker_reset_filters,
		mediagallery_picker_search_aria,
		mediagallery_picker_search_placeholder,
		mediagallery_picker_select_all,
		mediagallery_picker_select_asset,
		mediagallery_picker_select_item,
		mediagallery_picker_select_items,
		mediagallery_selected_count,
		mediagallery_type_all,
		mediagallery_type_audio,
		mediagallery_type_documents,
		mediagallery_type_images,
		mediagallery_type_videos
	} from '@src/paraglide/messages';

	import { SvelteSet } from 'svelte/reactivity';

	interface Props {
		allowedTypes?: string[];
		folder?: string;
		parent?: unknown;
		standalone?: boolean;
		onConfirm?: (files: (MediaBase | MediaImage)[]) => void;
		onClose?: () => void;
	}

	let {
		allowedTypes = [],
		folder = 'global',
		standalone = false,
		onConfirm,
		onClose
	}: Props = $props();

	type Density = 'compact' | 'comfortable' | 'large';
	type TypeFilter = 'all' | 'image' | 'video' | 'audio' | 'document';

	const TYPE_OPTIONS: Array<{ value: TypeFilter; label: () => string }> = [
		{ value: 'all', label: mediagallery_type_all },
		{ value: 'image', label: mediagallery_type_images },
		{ value: 'video', label: mediagallery_type_videos },
		{ value: 'audio', label: mediagallery_type_audio },
		{ value: 'document', label: mediagallery_type_documents }
	];

	let activeTab = $state<'library' | 'local' | 'remote'>('library');
	let density = $state<Density>('comfortable');
	let searchQuery = $state('');
	let typeFilter = $state<TypeFilter>('all');
	let files = $state<(MediaBase | MediaImage)[]>([]);
	const selectedFiles = new SvelteSet<string>();
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	function getFileId(file: MediaBase | MediaImage) {
		return file._id?.toString() || file.filename;
	}

	function getPreviewUrl(file: MediaBase | MediaImage): string {
		return mediaDisplayUrl(file, previewSize) || mediaUrl(file as MediaItem);
	}

	function getFileType(file: MediaBase | MediaImage) {
		return file.type || 'file';
	}

	/** MIME subtype (`image/png` → `PNG`) — matches the upload queue labels. */
	function getFormatLabel(file: MediaBase | MediaImage): string {
		const mime =
			(typeof (file as { mimeType?: string }).mimeType === 'string' &&
				(file as { mimeType: string }).mimeType) ||
			(typeof (file as { type?: string }).type === 'string' &&
			(file as { type: string }).type.includes('/')
				? (file as { type: string }).type
				: '');
		if (!mime) return getFileType(file).toUpperCase();
		const subtype = mime.split('/')[1];
		return (subtype || mime.split('/')[0] || 'file').toUpperCase();
	}

	function getFileSize(file: MediaBase | MediaImage): number {
		return typeof (file as { size?: number }).size === 'number'
			? (file as { size: number }).size
			: 0;
	}

	const previewSize = $derived(
		density === 'large' ? 'md' : density === 'comfortable' ? 'sm' : 'thumbnail'
	);

	const gridClass = $derived(
		density === 'compact'
			? 'grid grid-cols-2 content-start gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
			: density === 'large'
				? 'grid grid-cols-1 content-start gap-4 sm:grid-cols-2 lg:grid-cols-3'
				: 'grid grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
	);

	const previewHeightClass = $derived(
		density === 'compact' ? 'h-24' : density === 'large' ? 'h-56' : 'h-40'
	);

	const filteredFiles = $derived.by(() => {
		const query = searchQuery.trim().toLowerCase();
		return files.filter((file) => {
			if (typeFilter !== 'all') {
				const type = getFileType(file);
				const matchesType =
					typeFilter === 'video' ? type === 'video' || type === 'remoteVideo' : type === typeFilter;
				if (!matchesType) return false;
			}
			if (!query) return true;
			const original = (file as { originalFilename?: string }).originalFilename ?? '';
			return `${file.filename} ${original}`.toLowerCase().includes(query);
		});
	});

	const allVisibleSelected = $derived(
		filteredFiles.length > 0 && filteredFiles.every((file) => selectedFiles.has(getFileId(file)))
	);

	function toggleSelectAll() {
		if (allVisibleSelected) {
			for (const file of filteredFiles) selectedFiles.delete(getFileId(file));
		} else {
			for (const file of filteredFiles) selectedFiles.add(getFileId(file));
		}
	}

	function resetFilters() {
		searchQuery = '';
		typeFilter = 'all';
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key !== 'Escape' || !(standalone || modalState.active)) return;
		if (event.defaultPrevented) return;
		event.preventDefault();
		handleClose();
	}

	function normalizeMediaItem(rawItem: unknown): MediaBase | MediaImage | null {
		if (!rawItem || typeof rawItem !== 'object') {
			return null;
		}

		const item = rawItem as Record<string, unknown>;
		const filename =
			typeof item.filename === 'string'
				? item.filename
				: typeof item.name === 'string'
					? item.name
					: '';
		const url =
			typeof item.url === 'string' ? item.url : typeof item.path === 'string' ? item.path : '';
		const mimeType =
			typeof item.mimeType === 'string'
				? item.mimeType
				: typeof item.type === 'string' && item.type.includes('/')
					? item.type
					: '';
		const normalizedType =
			typeof item.type === 'string' && item.type !== 'file'
				? item.type
				: mimeType
					? mimeType.split('/')[0]
					: 'file';

		if (!filename || !url) {
			return null;
		}

		const createdAt = (
			typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString()
		) as ISODateString;
		const updatedAt = (
			typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString()
		) as ISODateString;

		return {
			...(item as unknown as MediaBase),
			_id: item._id as MediaBase['_id'],
			filename,
			url,
			path: typeof item.path === 'string' ? item.path : url,
			mimeType,
			type: normalizedType as MediaBase['type'],
			size: typeof item.size === 'number' ? item.size : 0,
			createdAt,
			updatedAt
		} as MediaBase | MediaImage;
	}

	async function fetchMedia() {
		isLoading = true;
		error = null;
		try {
			const typesQuery = allowedTypes.length > 0 ? `&types=${allowedTypes.join(',')}` : '';
			const response = await fetch(`/api/media?limit=100&recursive=true${typesQuery}`);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const data = await response.json();
			logger.debug('Fetched media files:', data);
			const mediaItems: unknown[] = Array.isArray(data)
				? data
				: Array.isArray(data?.data)
					? data.data
					: Array.isArray(data?.data?.items)
						? data.data.items
						: [];
			files = mediaItems
				.map((mediaItem: unknown) => normalizeMediaItem(mediaItem))
				.filter((item): item is MediaBase | MediaImage => item !== null);

			// `/api/media` does not implement the `types` query, so enforce the
			// field restriction here — an image-only field must not offer PDFs.
			if (allowedTypes.length > 0) {
				files = files.filter((file) => {
					const mime = (file as { mimeType?: string }).mimeType ?? '';
					return allowedTypes.some((allowed) =>
						allowed.endsWith('/*') ? mime.startsWith(allowed.slice(0, -1)) : mime === allowed
					);
				});
			}
		} catch (e) {
			logger.error('Error fetching media for modal:', e);
			error = 'Failed to load media library.';
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		void fetchMedia();
	});

	function handleConfirm() {
		const selectedItems = files.filter((f) => selectedFiles.has(f._id?.toString() || f.filename));
		if (selectedItems.length === 0) return;

		if (standalone) {
			onConfirm?.(selectedItems);
			return;
		}
		modalState.close(selectedItems);
	}

	function handleClose() {
		if (standalone) {
			onClose?.();
			return;
		}
		modalState.close();
	}

	function toggleFile(file: MediaBase | MediaImage) {
		const id = getFileId(file);
		if (selectedFiles.has(id)) selectedFiles.delete(id);
		else selectedFiles.add(id);
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if standalone || modalState.active}
	<div
		class="modal-media-library flex min-h-[78vh] w-full min-w-0 flex-1 self-stretch flex-col bg-white p-3 shadow-xl dark:bg-surface-800 sm:p-4 lg:min-h-[82vh]"
		data-testid="media-library-modal"
	>
		<header class="flex-none border-b border-surface-500/30 pb-3 mb-4 dark:border-surface-600">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div class="min-w-0">
					<h2 class="text-lg font-bold text-tertiary-500 dark:text-primary-500 sm:text-xl">
						Media Library
					</h2>
					<p class="mt-0.5 text-xs text-(--admin-text-muted)" aria-live="polite">
						{#if filteredFiles.length === files.length}
							{files.length === 1
								? mediagallery_picker_asset_single({ count: files.length })
								: mediagallery_picker_asset_plural({ count: files.length })}
						{:else}
							{mediagallery_picker_filtered_count({
								count: filteredFiles.length,
								total: files.length
							})}
						{/if}
						{#if selectedFiles.size > 0}
							· {mediagallery_selected_count({ count: selectedFiles.size })}
						{/if}
					</p>
				</div>

				<div class="flex flex-wrap items-center gap-2">
					<!-- Density: keeps the picker usable on a laptop without forcing 300px tiles. -->
					<div
						class="flex items-center gap-1 rounded-lg border border-(--admin-border-default) p-0.5"
						role="group"
						aria-label={mediagallery_density_group()}
					>
						<Button
							variant="ghost"
							type="button"
							onclick={() => (density = 'compact')}
							aria-pressed={density === 'compact'}
							aria-label={mediagallery_density_compact()}
							title={mediagallery_density_compact()}
							class="h-7 w-7 min-w-0 rounded p-0! {density === 'compact'
								? 'bg-surface-500/20'
								: ''}"
						>
							<iconify-icon icon="mdi:view-grid-outline" width="15"></iconify-icon>
						</Button>
						<Button
							variant="ghost"
							type="button"
							onclick={() => (density = 'comfortable')}
							aria-pressed={density === 'comfortable'}
							aria-label={mediagallery_density_comfortable()}
							title={mediagallery_density_comfortable()}
							class="h-7 w-7 min-w-0 rounded p-0! {density === 'comfortable'
								? 'bg-surface-500/20'
								: ''}"
						>
							<iconify-icon icon="mdi:view-grid" width="15"></iconify-icon>
						</Button>
						<Button
							variant="ghost"
							type="button"
							onclick={() => (density = 'large')}
							aria-pressed={density === 'large'}
							aria-label={mediagallery_density_large()}
							title={mediagallery_density_large()}
							class="h-7 w-7 min-w-0 rounded p-0! {density === 'large' ? 'bg-surface-500/20' : ''}"
						>
							<iconify-icon icon="mdi:image-size-select-large" width="15"></iconify-icon>
						</Button>
					</div>

					<div class="flex flex-wrap gap-2">
						<Button
							variant="tertiary"
							onclick={() => (activeTab = 'local')}
							aria-pressed={activeTab === 'local'}
							class="flex-1 whitespace-nowrap px-3 text-sm sm:flex-initial {activeTab === 'local'
								? ''
								: 'preset-outlined-surface-500'}"
						>
							Local Upload
						</Button>
						<Button
							variant="tertiary"
							onclick={() => (activeTab = 'library')}
							aria-pressed={activeTab === 'library'}
							class="flex-1 whitespace-nowrap px-3 text-sm sm:flex-initial {activeTab === 'library'
								? ''
								: 'preset-outlined-surface-500'}"
						>
							Library
						</Button>
						<Button
							variant="tertiary"
							onclick={() => (activeTab = 'remote')}
							aria-pressed={activeTab === 'remote'}
							class="flex-1 whitespace-nowrap px-3 text-sm sm:flex-initial {activeTab === 'remote'
								? ''
								: 'preset-outlined-surface-500'}"
						>
							Remote Upload
						</Button>
					</div>
				</div>

				<!-- Search, type filter and bulk selection -->
				<div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
					<label class="relative block w-full min-w-0 sm:max-w-xs">
						<span class="sr-only">{mediagallery_picker_search_aria()}</span>
						<iconify-icon
							icon="ic:outline-search"
							width="18"
							class="pointer-events-none absolute inset-s-3 top-1/2 -translate-y-1/2 text-(--admin-text-muted)"
						></iconify-icon>
						<input
							type="search"
							bind:value={searchQuery}
							placeholder={mediagallery_picker_search_placeholder()}
							class="h-9 w-full rounded-lg border border-(--admin-border-default) bg-(--admin-bg-card) ps-9 pe-3 text-sm text-(--admin-text-body) placeholder:text-(--admin-text-muted) focus:border-tertiary-500 focus:outline-none focus:ring-2 focus:ring-tertiary-500/20 dark:focus:border-primary-500 dark:focus:ring-primary-500/20"
							data-testid="media-library-search"
						/>
					</label>

					<div
						class="flex flex-1 flex-wrap items-center gap-1.5"
						role="group"
						aria-label={mediagallery_filter_type()}
					>
						{#each TYPE_OPTIONS as option (option.value)}
							<Button
								size="sm"
								variant={typeFilter === option.value ? 'tertiary' : 'outline'}
								type="button"
								onclick={() => (typeFilter = option.value)}
								aria-pressed={typeFilter === option.value}
								class="whitespace-nowrap"
								data-testid={`media-library-type-${option.value}`}
							>
								{option.label()}
							</Button>
						{/each}
					</div>

					<Button
						variant="ghost"
						size="sm"
						type="button"
						onclick={toggleSelectAll}
						disabled={filteredFiles.length === 0}
						class="shrink-0 whitespace-nowrap"
						data-testid="media-library-select-all"
					>
						{allVisibleSelected
							? mediagallery_picker_clear_selection()
							: mediagallery_picker_select_all()}
					</Button>
				</div>
			</div>
		</header>

		<main class="min-h-0 flex-1 overflow-y-auto p-1 sm:p-2">
			{#if activeTab === 'local'}
				<LocalUpload
					{folder}
					redirectOnSuccess={false}
					onUploadComplete={() => {
						void fetchMedia();
						activeTab = 'library';
					}}
				/>
			{:else if activeTab === 'library'}
				{#if isLoading}
					<div class="flex h-full items-center justify-center">
						<iconify-icon
							icon="line-md:loading-twotone-loop"
							width="48"
							class="text-tertiary-500 dark:text-primary-500"
						></iconify-icon>
					</div>
				{:else if error}
					<div class="flex h-full flex-col items-center justify-center text-error-500">
						<iconify-icon icon="mdi:alert-circle" width="48"></iconify-icon>
						<p>{error}</p>
						<Button variant="tertiary" onclick={fetchMedia} class="mt-4">{button_retry()}</Button>
					</div>
				{:else if files.length === 0}
					<div
						class="flex h-full items-center justify-center text-center text-tertiary-500 dark:text-primary-500"
					>
						<div>
							<iconify-icon icon="bi:exclamation-circle-fill" width={24} class="mb-2"
							></iconify-icon>
							<p class="text-lg">{mediagallery_no_media()}</p>
						</div>
					</div>
				{:else if filteredFiles.length === 0}
					<div
						class="flex h-full flex-col items-center justify-center gap-3 text-center text-tertiary-500 dark:text-primary-500"
						data-testid="media-library-empty"
					>
						<iconify-icon icon="mdi:filter-remove-outline" width={32}></iconify-icon>
						<p class="text-base">{mediagallery_picker_empty_filtered()}</p>
						<Button variant="outline" size="sm" onclick={resetFilters}
							>{mediagallery_picker_reset_filters()}</Button
						>
					</div>
				{:else}
					<div class={gridClass} data-testid="media-library-grid">
						{#each filteredFiles as file (getFileId(file))}
							{const fileId = getFileId(file)}
							<button
								type="button"
								class="group relative flex w-full flex-col overflow-hidden rounded-xl border bg-white text-start shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tertiary-500 dark:bg-surface-900 dark:focus-visible:outline-primary-500 {selectedFiles.has(
									fileId
								)
									? 'border-tertiary-500 ring-2 ring-tertiary-500/30 dark:border-primary-500 dark:ring-primary-500/30'
									: 'border-(--admin-border-default)'}"
								onclick={() => toggleFile(file)}
								aria-pressed={selectedFiles.has(fileId)}
								aria-label={mediagallery_picker_select_asset({ name: file.filename })}
								data-testid="media-library-item"
								data-media-id={fileId}
							>
								<div
									class="{previewHeightClass} relative w-full overflow-hidden bg-(--admin-bg-card)"
								>
									{#if getPreviewUrl(file)}
										<img
											src={getPreviewUrl(file)}
											alt={file.metadata?.altText || file.originalFilename || file.filename}
											class="absolute inset-0 h-full w-full object-cover transition-transform duration-300 will-change-transform group-hover:scale-105"
											loading="lazy"
											decoding="async"
											onerror={(e) => {
												const target = e.currentTarget as HTMLImageElement;
												target.src = '/static/Default_User.svg';
											}}
										/>
									{:else}
										<div
											class="flex h-full w-full items-center justify-center text-(--admin-text-muted)"
										>
											<iconify-icon icon="bi:file-earmark-image" width={32}></iconify-icon>
										</div>
									{/if}

									{#if selectedFiles.has(fileId)}
										<span
											class="absolute inset-e-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-tertiary-500 text-white shadow-md dark:bg-primary-500"
											aria-hidden="true"
										>
											<iconify-icon icon="mdi:check" width="14"></iconify-icon>
										</span>
									{/if}
								</div>

								<div class="flex w-full flex-col gap-0.5 border-t border-surface-500/20 p-2">
									<span
										class="truncate text-xs font-semibold text-(--admin-text-body)"
										title={file.filename}
									>
										{file.originalFilename || file.filename}
									</span>
									<span
										class="flex items-center justify-between gap-2 text-[10px] text-(--admin-text-muted)"
									>
										<span class="truncate font-mono uppercase tracking-wide">
											{getFormatLabel(file)}
										</span>
										<span class="shrink-0 font-mono">{formatBytes(getFileSize(file))}</span>
									</span>
								</div>
							</button>
						{/each}
					</div>
				{/if}
			{:else if activeTab === 'remote'}
				<RemoteUpload
					{folder}
					onUploadComplete={() => {
						void fetchMedia();
						activeTab = 'library';
					}}
				/>
			{/if}
		</main>

		<footer
			class="mt-4 flex flex-col gap-2 border-t border-surface-500/30 pt-4 dark:border-surface-600 sm:flex-row sm:items-center sm:justify-end"
		>
			<Button variant="outline" type="button" onclick={handleClose} class="w-full sm:w-auto">
				Cancel
			</Button>
			{#if activeTab === 'library'}
				<Button
					variant="tertiary"
					type="button"
					onclick={handleConfirm}
					disabled={selectedFiles.size === 0}
					class="w-full sm:w-auto"
					data-testid="media-library-select"
				>
					{selectedFiles.size === 1
						? mediagallery_picker_select_item({ count: selectedFiles.size })
						: mediagallery_picker_select_items({ count: selectedFiles.size })}
				</Button>
			{/if}
		</footer>
	</div>
{/if}
