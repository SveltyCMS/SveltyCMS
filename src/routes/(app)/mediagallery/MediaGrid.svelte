<!--
@file src/routes/(app)/mediagallery/MediaGrid.svelte
@component
**Grid view component for the media gallery. Displays media items in a responsive grid layout with file information and actions**

```tsx
<MediaGrid filteredFiles={filteredFiles} gridSize="small" />
```
#### Props
- `filteredFiles: MediaBase[]`: An array of media items to be displayed in the grid view.
- `gridSize: 'small' | 'medium' | 'large'`: The size of the grid layout to be used.	

Key features:
- Responsive grid layout for media items
- Display of file name, size, and type
- Thumbnail preview for images
- Actions for file info, edit, and delete
- Uses formatBytes for human-readable file sizes
- Implements constructMediaUrl for proper URL handling
-->

<script lang="ts">
	// Utils
	import { formatBytes } from '@utils/utils';
	import { logger } from '@utils/logger';
	import type { MediaImage, MediaBase } from '@utils/media/mediaModels';

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';

	// Svelte transitions
	import { scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	// Events
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	interface Props {
		filteredFiles?: (MediaBase | MediaImage)[];
		gridSize?: 'tiny' | 'small' | 'medium' | 'large';
		ondeleteImage?: (file: MediaBase | MediaImage) => void;
		onBulkDelete?: (files: (MediaBase | MediaImage)[]) => void;
	}

	const { filteredFiles = [], gridSize = 'medium', ondeleteImage = () => {}, onBulkDelete = () => {} }: Props = $props();

	// Initialize the showInfo array with false values
	let showInfo = $state<boolean[]>([]);
	let selectedFiles = $state<Set<string>>(new Set());
	let isSelectionMode = $state(false);

	function handleDelete(file: MediaBase | MediaImage) {
		ondeleteImage(file);
	}

	function toggleSelection(file: MediaBase | MediaImage) {
		const fileId = file._id?.toString() || file.filename;
		if (selectedFiles.has(fileId)) {
			selectedFiles.delete(fileId);
		} else {
			selectedFiles.add(fileId);
		}
		selectedFiles = selectedFiles; // Trigger reactivity
	}

	function selectAll() {
		selectedFiles = new Set(filteredFiles.map((f) => f._id?.toString() || f.filename));
	}

	function deselectAll() {
		selectedFiles = new Set();
	}

	function handleBulkDelete() {
		const filesToDelete = filteredFiles.filter((f) => selectedFiles.has(f._id?.toString() || f.filename));
		if (filesToDelete.length > 0) {
			onBulkDelete(filesToDelete);
			selectedFiles = new Set();
			isSelectionMode = false;
		}
	}

	// Update showInfo array when filteredFiles length changes
	$effect(() => {
		showInfo = Array.from({ length: filteredFiles.length }, () => false);
	});

	// Helper function to truncate filename intelligently
	function truncateFilename(filename: string, maxLength: number = 25): string {
		if (!filename || filename.length <= maxLength) return filename;

		const lastDotIndex = filename.lastIndexOf('.');
		if (lastDotIndex === -1) {
			// No extension, just truncate
			return filename.slice(0, maxLength - 3) + '...';
		}

		const extension = filename.slice(lastDotIndex);
		const nameWithoutExt = filename.slice(0, lastDotIndex);
		const availableLength = maxLength - extension.length - 3; // 3 for '...'

		if (availableLength < 5) {
			// If name would be too short, just show first part + extension
			return filename.slice(0, maxLength - extension.length - 3) + '...' + extension;
		}

		return nameWithoutExt.slice(0, availableLength) + '...' + extension;
	}

	function getThumbnails(file: MediaBase | MediaImage) {
		return 'thumbnails' in file ? file.thumbnails || {} : {};
	}

	function getThumbnail(file: MediaBase | MediaImage, size: string) {
		const thumbnails = getThumbnails(file);
		return thumbnails ? thumbnails[size as keyof typeof thumbnails] : undefined;
	}

	function getImageUrl(file: MediaBase | MediaImage, size: string) {
		const thumbnail = getThumbnail(file, size);
		return thumbnail?.url || (file as any).url;
	}
</script>

<div class="flex flex-wrap items-center gap-4 overflow-auto">
	{#if filteredFiles.length === 0}
		<div class="mx-auto text-center text-tertiary-500 dark:text-primary-500">
			<iconify-icon icon="bi:exclamation-circle-fill" height="44" class="mb-2"></iconify-icon>
			<p class="text-lg">No media found</p>
		</div>
	{:else}
		<!-- Batch Operations Toolbar -->
		<div class="mb-4 flex w-full items-center justify-between gap-2 rounded border border-surface-400 bg-surface-100 p-2 dark:bg-surface-700">
			<div class="flex items-center gap-2">
				<button
					onclick={() => {
						isSelectionMode = !isSelectionMode;
						selectedFiles = new Set();
					}}
					class="variant-ghost-surface btn btn-sm"
					aria-label="Toggle selection mode"
				>
					<iconify-icon icon={isSelectionMode ? 'mdi:close' : 'mdi:checkbox-multiple-marked'} width="20"></iconify-icon>
					{isSelectionMode ? 'Cancel' : 'Select'}
				</button>

				{#if isSelectionMode}
					<button onclick={selectAll} class="variant-ghost-surface btn btn-sm">
						<iconify-icon icon="mdi:select-all" width="20"></iconify-icon>
						Select All
					</button>
					<button onclick={deselectAll} class="variant-ghost-surface btn btn-sm">
						<iconify-icon icon="mdi:select-off" width="20"></iconify-icon>
						Deselect All
					</button>
				{/if}
			</div>

			{#if selectedFiles.size > 0}
				<div class="flex items-center gap-2">
					<span class="text-sm">{selectedFiles.size} selected</span>
					<button onclick={handleBulkDelete} class="variant-filled-error btn btn-sm">
						<iconify-icon icon="mdi:delete" width="20"></iconify-icon>
						Delete Selected
					</button>
				</div>
			{/if}
		</div>

		{#each filteredFiles as file, index (file._id?.toString() || file.filename)}
			{@const fileId = file._id?.toString() || file.filename}
			{@const isSelected = selectedFiles.has(fileId)}
			<div
				onmouseenter={() => (showInfo[index] = true)}
				onmouseleave={() => (showInfo[index] = false)}
				onclick={() => isSelectionMode && toggleSelection(file)}
				onkeydown={(e) => {
					if (isSelectionMode && (e.key === 'Enter' || e.key === ' ')) {
						e.preventDefault();
						toggleSelection(file);
					}
				}}
				role="button"
				tabindex="0"
				class="card relative border border-surface-300 dark:border-surface-500 {isSelected ? 'ring-2 ring-primary-500' : ''}"
				in:scale={{ duration: 300, start: 0.9, opacity: 0, easing: quintOut }}
				out:scale={{ duration: 250, start: 0.95, opacity: 0, easing: quintOut }}
			>
				{#if isSelectionMode}
					<div class="absolute left-2 top-2 z-10">
						<input type="checkbox" checked={isSelected} onchange={() => toggleSelection(file)} class="checkbox" aria-label="Select file" />
					</div>
				{/if}

				<header class="m-2 flex w-auto items-center justify-between">
					<button
						use:popup={{
							event: 'click',
							target: `FileInfo-${index}`,
							placement: 'right'
						}}
						aria-label="File Info"
						class="btn-icon"
					>
						<iconify-icon icon="raphael:info" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					</button>

					<div class="card variant-filled z-50 min-w-[250px] p-2" data-popup="FileInfo-{index}">
						<table class="table-hover w-full table-auto">
							<thead class="text-tertiary-500">
								<tr class="divide-x divide-surface-400 border-b-2 border-surface-400 text-center">
									<th class="text-left">Format</th>
									<th class="">Pixel</th>
									<th class="">Size</th>
								</tr>
							</thead>
							<tbody>
								{#if 'width' in file && file.width && 'height' in file && file.height}
									<tr><td class="font-semibold">Dimensions:</td><td>{file.width}x{file.height}</td></tr>
								{/if}
								{#each Object.keys(getThumbnails(file)) as size (size)}
									{@const thumbnail = getThumbnail(file, size)}
									{#if thumbnail}
										<tr
											class="divide-x divide-surface-400 border-b border-surface-400 last:border-b-0 {size === gridSize
												? 'bg-primary-50 dark:bg-primary-900/20'
												: ''}"
											onclick={(e) => {
												e.preventDefault();
												if (size === 'tiny' || size === 'small' || size === 'medium' || size === 'large') {
													dispatch('sizechange', {
														size: size === 'tiny' ? 'small' : size === 'small' ? 'medium' : size === 'medium' ? 'large' : 'tiny',
														type: 'grid'
													});
												}
											}}
										>
											<td class="font-bold text-tertiary-500"
												>{size}
												{#if size === gridSize}
													<span class="ml-1 text-xs text-primary-500">(active)</span>
												{/if}
											</td>
											<td class="pr-1 text-right">
												{#if thumbnail.width && thumbnail.height}
													{thumbnail.width}x{thumbnail.height}
												{:else}
													N/A
												{/if}
											</td>
											<td class="text-right">
												{#if thumbnail.size}
													{formatBytes(thumbnail.size)}
												{:else if size === 'original' && file.size}
													{formatBytes(file.size)}
												{:else}
													N/A
												{/if}
											</td>
										</tr>
									{/if}
								{/each}
							</tbody>
						</table>
						<div class="bg-surface-100-800-token arrow"></div>
					</div>

					<a href="/imageEditor?mediaId={file._id?.toString()}" aria-label="Edit" class="btn-icon" data-sveltekit-preload-data="hover">
						<iconify-icon icon="mdi:pen" width="24" class="data:text-primary-500 text-tertiary-500"></iconify-icon>
					</a>
					<button onclick={() => handleDelete(file)} aria-label="Delete" class="btn-icon">
						<iconify-icon icon="icomoon-free:bin" width="24" class="text-error-500"> </iconify-icon>
					</button>
				</header>

				<section class="flex items-center justify-center p-2">
					{#if file?.filename && file?.path && file?.hash}
						<img
							src={getImageUrl(file, gridSize) ?? '/static/Default_User.svg'}
							alt={`Thumbnail for ${file.filename}`}
							class={`rounded object-cover ${
								gridSize === 'tiny' ? 'h-16 w-16' : gridSize === 'small' ? 'h-24 w-24' : gridSize === 'medium' ? 'h-48 w-48' : 'h-80 w-80'
							}`}
							onerror={(e: Event) => {
								const target = e.target as HTMLImageElement;
								if (target) {
									logger.error('Failed to load media thumbnail for file:', file.filename);
									target.src = '/static/Default_User.svg';
									target.alt = 'Fallback thumbnail image';
								}
							}}
							loading="lazy"
							decoding="async"
						/>
					{:else}
						<div class="flex h-full w-full items-center justify-center bg-surface-200 dark:bg-surface-700" aria-label="Missing thumbnail" role="img">
							<iconify-icon icon="bi:exclamation-triangle-fill" height="24" class="text-warning-500" aria-hidden="true"></iconify-icon>
						</div>
					{/if}
				</section>

				<footer class="flex flex-col gap-2 p-2">
					<!-- Filename -->
					<p class="truncate text-center font-medium" title={file.filename}>{truncateFilename(file.filename)}</p>

					<!-- Type & Size badges -->
					<div class="flex items-center justify-between gap-1">
						<!-- File Type Badge -->
						<div class="variant-ghost-tertiary badge flex items-center gap-1">
							<iconify-icon
								icon={file.type === 'image'
									? 'fa-solid:image'
									: file.type === 'video'
										? 'fa-solid:video'
										: file.type === 'audio'
											? 'fa-solid:play-circle'
											: file.type === 'document'
												? 'fa-solid:file-lines'
												: 'vscode-icons:file'}
								width="16"
								height="16"
							></iconify-icon>
							<span class="text-tertiary-500 dark:text-primary-500">{file.mimeType?.split('/').pop()?.toUpperCase() || 'UNKNOWN'}</span>
						</div>

						<!-- File Size Badge -->
						<div class="variant-ghost-tertiary badge flex items-center gap-1">
							{#if file.size}
								<span class="text-tertiary-500 dark:text-primary-500">{formatBytes(file.size)}</span>
							{:else}
								<span class="text-tertiary-500 dark:text-primary-500">Unknown</span>
							{/if}
						</div>
					</div>
				</footer>
			</div>
		{/each}
	{/if}
</div>

<style>
	/* Smooth transitions for grid layout changes */
	.card {
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Smooth grid item repositioning */
	:global(.flex.flex-wrap) {
		transition: all 0.3s ease-out;
	}
</style>
