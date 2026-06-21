<!--
@file src/components/media-library-modal.svelte
@component
**Media library modal for selecting and uploading media files**

### Props
- `allowedTypes`: Array of allowed media types
- `folder`: Folder to upload media to
- `parent`: Parent object for media

### Features
- Supports local and remote uploads
- Displays media library with grid view
- Allows selection of multiple files
- Confirms selection and closes modal
- Handles errors and loading states
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import LocalUpload from '@src/routes/(app)/mediagallery/upload-media/local-upload.svelte';
	import RemoteUpload from '@src/routes/(app)/mediagallery/upload-media/remote-upload.svelte';
	import { logger } from '@utils/logger';
	import type { MediaBase, MediaImage } from '@utils/media/media-models';
	import { mediaUrl } from '@utils/media/media-utils';
	import { modalState } from '@utils/modal.svelte';
	import { onMount } from 'svelte';
	import type { ISODateString } from '@src/content/types';

	import { SvelteSet } from 'svelte/reactivity';

	// Props interface

	interface Props {
		allowedTypes?: string[];
		folder?: string;
		parent?: unknown;
		standalone?: boolean;
		onConfirm?: (files: (MediaBase | MediaImage)[]) => void;
		onClose?: () => void;
	}

	let { allowedTypes = [], folder = 'global', standalone = false, onConfirm, onClose }: Props = $props();

	let activeTab = $state<'library' | 'local' | 'remote'>('library');
	let files = $state<(MediaBase | MediaImage)[]>([]);
	// eslint-disable-next-line svelte/no-unnecessary-state-wrap
	let selectedFiles = $state(new SvelteSet<string>());
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	function getFileId(file: MediaBase | MediaImage) {
		return file._id?.toString() || file.filename;
	}

	function getPreviewUrl(file: MediaBase | MediaImage): string {
		// Use mediaUrl utility to properly construct the URL with /files/ prefix
		if ('thumbnails' in file && file.thumbnails) {
			const thumbs = file.thumbnails as Record<string, { url?: string } | undefined>;
			if (thumbs.sm?.url) return mediaUrl({ ...file, url: thumbs.sm.url });
			if (thumbs.md?.url) return mediaUrl({ ...file, url: thumbs.md.url });
			if (thumbs.thumbnail?.url) return mediaUrl({ ...file, url: thumbs.thumbnail.url });
		}
		return mediaUrl(file);
	}

	function getFileType(file: MediaBase | MediaImage) {
		return file.type || 'file';
	}

	function normalizeMediaItem(rawItem: unknown): MediaBase | MediaImage | null {
		if (!rawItem || typeof rawItem !== 'object') {
			return null;
		}

		const item = rawItem as Record<string, unknown>;
		const filename = typeof item.filename === 'string' ? item.filename : typeof item.name === 'string' ? item.name : '';
		const url = typeof item.url === 'string' ? item.url : typeof item.path === 'string' ? item.path : '';
		const mimeType = typeof item.mimeType === 'string' ? item.mimeType : typeof item.type === 'string' && item.type.includes('/') ? item.type : '';
		const normalizedType = typeof item.type === 'string' && item.type !== 'file' ? item.type : mimeType ? mimeType.split('/')[0] : 'file';

		if (!filename || !url) {
			return null;
		}

		const createdAt = (typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString()) as ISODateString;
		const updatedAt = (typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString()) as ISODateString;

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
			// Construct query with allowedTypes if provided
			const typesQuery = allowedTypes.length > 0 ? `&types=${allowedTypes.join(',')}` : '';
			// Fetch more files for the library, e.g., 50, recursively from all folders
			const response = await fetch(`/api/media?limit=100&recursive=true${typesQuery}`);
			if (!response.ok) {
				throw new Error('Failed to fetch media');
			}
			const data = await response.json();
			logger.debug('Fetched media files:', data);
			const mediaItems: unknown[] =
				Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.data?.items) ? data.data.items : [];
			files = mediaItems.map((mediaItem: unknown) => normalizeMediaItem(mediaItem)).filter((item): item is MediaBase | MediaImage => item !== null);
		} catch (e) {
			logger.error('Error fetching media for modal:', e);
			error = 'Failed to load media library.';
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		fetchMedia();
	});

	function handleConfirm() {
		const selectedItems = files.filter((f) => selectedFiles.has(f._id?.toString() || f.filename));
		if (selectedItems.length > 0) {
			if (standalone) {
				onConfirm?.(selectedItems);
				return;
			}
			modalState.close(selectedItems);
		}
	}

	function handleClose() {
		if (standalone) {
			onClose?.();
			return;
		}
		modalState.close();
	}
</script>

{#if standalone || modalState.active}
	<div class="modal-media-library flex min-h-[78vh] w-full min-w-0 flex-1 self-stretch flex-col bg-white p-3 shadow-xl dark:bg-surface-800 sm:p-4 lg:min-h-[82vh]">
		<header class="flex-none border-b border-surface-200 pb-3 mb-4 dark:border-surface-600">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<h2 class="text-lg font-bold text-tertiary-500 dark:text-primary-500 sm:text-xl">Media Library</h2>
				<div class="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
				<Button variant="tertiary"
										onclick={() => (activeTab = 'local')}
									class="flex-1 whitespace-nowrap px-3 text-sm sm:flex-initial {activeTab === 'local' ? '' : 'preset-outline-surface-500'}">
					Local Upload
				</Button>
				<Button variant="tertiary"
										onclick={() => (activeTab = 'library')}
									class="flex-1 whitespace-nowrap px-3 text-sm sm:flex-initial {activeTab === 'library' ? '' : 'preset-outline-surface-500'}">
					Library
				</Button>
				<Button variant="tertiary"
										onclick={() => (activeTab = 'remote')}
									class="flex-1 whitespace-nowrap px-3 text-sm sm:flex-initial {activeTab === 'remote' ? '' : 'preset-outline-surface-500'}">
					Remote Upload
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
						fetchMedia();
						activeTab = 'library';
					}}
				/>
			{:else if activeTab === 'library'}
				{#if isLoading}
					<div class="flex h-full items-center justify-center">
						<iconify-icon icon="line-md:loading-twotone-loop" width="48" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					</div>
				{:else if error}
					<div class="flex h-full flex-col items-center justify-center text-error-500">
						<iconify-icon icon="mdi:alert-circle" width="48"></iconify-icon>
						<p>{error}</p>
						<Button variant="tertiary" onclick={fetchMedia} class="mt-4">Retry</Button>
					</div>
				{:else}
					{#if files.length === 0}
						<div class="flex h-full items-center justify-center text-center text-tertiary-500 dark:text-primary-500">
							<div>
								<iconify-icon icon="bi:exclamation-circle-fill" width={24} class="mb-2"></iconify-icon>
								<p class="text-lg">No media found</p>
							</div>
						</div>
					{:else}
						<div class="grid grid-cols-1 items-start gap-4 content-start auto-rows-max sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
							{#each files as file (getFileId(file))}
								{const fileId = getFileId(file)}
								{const isSelected = selectedFiles.has(fileId)}
								<button
									type="button"
									class="group relative flex min-h-75] flex-col overflow-hidden rounded-2xl border bg-white text-start shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:bg-surface-900 sm:min-h-85 {isSelected
										? 'border-tertiary-500 dark:border-primary-500 ring-2 ring-primary-500/20'
										: 'border-surface-200 dark:border-surface-800'}"
									onclick={() => {
										if (selectedFiles.has(fileId)) {
											selectedFiles.delete(fileId);
										} else {
											selectedFiles.add(fileId);
										}
									}}
									aria-pressed={isSelected}
									aria-label={`Select ${file.filename}`}
								>
									<div class="relative h-50 w-full overflow-hidden bg-surface-100 dark:bg-surface-800 sm:h-60">
										{#if getPreviewUrl(file)}
											<img
												src={getPreviewUrl(file)}
												alt={file.metadata?.altText || file.originalFilename || file.filename}
												class="absolute inset-0 h-full w-full object-cover transition-transform duration-500 will-change-transform group-hover:scale-110"
												loading="lazy"
												decoding="async"
												onload={(e) => {
													const img = e.currentTarget as HTMLImageElement;
													if (img) img.style.opacity = '1';
												}}
												onerror={(e) => {
													const target = e.currentTarget as HTMLImageElement;
													if (target) target.src = '/static/Default_User.svg';
												}}
												style="opacity: 0; transition: opacity 0.3s ease;"
											/>
										{:else}
											<div class="flex h-full w-full items-center justify-center text-surface-300 dark:text-surface-600">
												<iconify-icon icon="bi:exclamation-triangle-fill" width={48}></iconify-icon>
											</div>
										{/if}

										<div class="absolute inset-0 bg-linear-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
										{#if isSelected}
											<div class="absolute inset-e-2 top-2 rounded-full bg-tertiary-500 dark:bg-primary-500 px-2 py-1 text-[10px] font-bold text-white shadow-md">
												Selected
											</div>
										{/if}
									</div>

									<div class="relative flex flex-1 flex-col gap-1 border-t border-surface-100 bg-white p-3 dark:border-surface-800 dark:bg-surface-900">
										<div class="truncate text-xs font-semibold text-surface-900 dark:text-surface-100" title={file.filename}>{file.filename}</div>
										<div class="flex items-center gap-2 text-[10px] text-surface-500 dark:text-surface-400">
											<span class="font-mono">{file.size ? `${Math.round(file.size / 1024)} KB` : '0 KB'}</span>
											<span class="uppercase tracking-wide">{getFileType(file)}</span>
										</div>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				{/if}
			{:else if activeTab === 'remote'}
				<RemoteUpload
					{folder}
					onUploadComplete={() => {
						fetchMedia();
						activeTab = 'library';
					}}
				/>
			{/if}
		</main>

		<footer class="mt-4 flex flex-col gap-2 border-t border-surface-200 pt-4 dark:border-surface-600 sm:flex-row sm:justify-end">
			<Button variant="outline" type="button" onclick={handleClose} class="w-full sm:w-auto">Cancel</Button>
			{#if activeTab === 'library' && selectedFiles.size > 0}
				<Button variant="tertiary" type="button" onclick={handleConfirm} class="w-full sm:w-auto">
					Select {selectedFiles.size} Item{selectedFiles.size > 1 ? 's' : ''}
				</Button>
			{/if}
		</footer>
	</div>
{/if}
