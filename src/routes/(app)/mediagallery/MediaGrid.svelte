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
	// Using iconify-icon web component
	// Utils
	import { formatBytes } from '@utils/utils';
	import { logger } from '@utils/logger';
	import type { MediaImage, MediaBase } from '@utils/media/mediaModels';

	// Skeleton
	import SystemTooltip from '@components/system/SystemTooltip.svelte';
	// Svelte transitions
	import { scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	import TagEditorModal from '@components/media/tagEditor/TagEditorModal.svelte';

	interface Props {
		filteredFiles?: (MediaBase | MediaImage)[];
		gridSize?: 'tiny' | 'small' | 'medium' | 'large';
		ondeleteImage?: (file: MediaBase | MediaImage) => void;
		onBulkDelete?: (files: (MediaBase | MediaImage)[]) => void;
		onEditImage?: (file: MediaImage) => void;
		onsizechange?: (detail: { size: string; type: string }) => void;
		onUpdateImage?: (file: MediaImage) => void;
		isSelectionMode?: boolean;
		selectedFiles?: Set<string>;
	}

	let {
		filteredFiles = $bindable([]),
		gridSize = 'medium',
		ondeleteImage = () => {},
		onBulkDelete = () => {},
		onEditImage = () => {},
		onsizechange = () => {},
		onUpdateImage = () => {},
		isSelectionMode = $bindable(false),
		selectedFiles = $bindable(new Set())
	}: Props = $props();

	let showInfo = $state<boolean[]>([]);

	// Tag Modal State
	let showTagModal = $state(false);
	let taggingFile = $state<MediaImage | null>(null);

	function openTagEditor(file: MediaImage) {
		taggingFile = file;
		showTagModal = true;
	}

	// Format MIME type for display
	function formatMimeType(mime?: string): string {
		if (!mime) return 'Unknown';
		const parts = mime.split('/');
		return parts[1] ? parts[1].toUpperCase() : parts[0].toUpperCase();
	}

	// Helper: Get icon string
	function getFileIcon(file: MediaBase): string {
		const fileName = file.filename || '';
		const fileExt = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();

		switch (true) {
			case file.type === 'image':
				return 'fa-solid:image';
			case file.type === 'video':
				return 'fa-solid:video';
			case file.type === 'audio':
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
		selectedFiles = new Set(selectedFiles); // Trigger reactivity
	}

	function selectAll() {
		selectedFiles = new Set(filteredFiles.map((f: MediaBase | MediaImage) => f._id?.toString() || f.filename));
	}

	function deselectAll() {
		selectedFiles = new Set();
	}

	function handleBulkDelete() {
		const filesToDelete = filteredFiles.filter((f: MediaBase | MediaImage) => selectedFiles.has(f._id?.toString() || f.filename));
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

	function getThumbnails(file: MediaBase | MediaImage) {
		return 'thumbnails' in file ? file.thumbnails || {} : {};
	}

	function getThumbnail(file: MediaBase | MediaImage, size: string) {
		const thumbnails = getThumbnails(file);
		const sizeMap: Record<string, string> = {
			tiny: 'thumbnail',
			small: 'sm',
			medium: 'md',
			large: 'lg'
		};
		const key = sizeMap[size] || size;
		return thumbnails ? thumbnails[key as keyof typeof thumbnails] : undefined;
	}

	function getImageUrl(file: MediaBase | MediaImage, size: string) {
		const thumbnail = getThumbnail(file, size);
		return thumbnail?.url || (file as MediaImage).url;
	}
</script>

<div class="flex flex-wrap items-start gap-4 overflow-auto content-start">
	{#if filteredFiles.length === 0}
		<div class="mx-auto text-center text-tertiary-500 dark:text-primary-500">
			<iconify-icon icon="bi:exclamation-circle-fill" width={24} class="mb-2"></iconify-icon>
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
					class="preset-outline-surface-500 btn-sm flex items-center gap-2"
					aria-label="Toggle selection mode"
				>
					<iconify-icon icon={isSelectionMode ? 'mdi:close' : 'mdi:checkbox-multiple-marked'} width={20}></iconify-icon>
					<span class="leading-none">{isSelectionMode ? 'Cancel' : 'Select'}</span>
				</button>

				{#if isSelectionMode}
					<button onclick={selectAll} class="preset-outline-surface-500 btn-sm flex items-center gap-2">
						<iconify-icon icon="mdi:select-all" width={24}></iconify-icon>
						Select All
					</button>
					<button onclick={deselectAll} class="preset-outline-surface-500 btn-sm flex items-center gap-2">
						<iconify-icon icon="mdi:select-off" width={24}></iconify-icon>
						Deselect All
					</button>
				{/if}
			</div>

			{#if selectedFiles.size > 0}
				<div class="flex items-center gap-2">
					<span class="text-sm">{selectedFiles.size} selected</span>
					<button onclick={handleBulkDelete} class="preset-filled-error-500 btn-sm flex items-center gap-2">
						<iconify-icon icon="mdi:delete" width={20}></iconify-icon>
						Delete Selected
					</button>
				</div>
			{/if}
		</div>
		{#each filteredFiles as file, index (file._id?.toString() || file.filename)}
			{@const fileId = file._id?.toString() || file.filename}
			{@const isSelected = selectedFiles.has(fileId)}
			<button
				class="card card-hover rounded-sm relative flex flex-col overflow-hidden text-left transition-all duration-300 hover:z-10 hover:shadow-xl hover:scale-[1.02] border border-surface-300/50 dark:border-surface-50 bg-surface-100 dark:bg-transparent
					{gridSize === 'tiny' ? 'w-32' : gridSize === 'small' ? 'w-48' : gridSize === 'medium' ? 'w-64' : 'w-96'}"
				onmouseenter={() => (showInfo[index] = true)}
				onmouseleave={() => (showInfo[index] = false)}
				onclick={() => isSelectionMode && toggleSelection(file)}
				onkeydown={(e) => {
					if (isSelectionMode && (e.key === 'Enter' || e.key === ' ')) {
						e.preventDefault();
						toggleSelection(file);
					}
				}}
				aria-label={`Media item: ${file.filename}`}
				aria-pressed={selectedFiles.has(file._id?.toString() || file.filename)}
				in:scale={{ duration: 200, easing: quintOut }}
				out:scale={{ duration: 250, start: 0.95, opacity: 0, easing: quintOut }}
			>
				{#if isSelectionMode}
					<div class="absolute left-2 top-2 z-10">
						<input type="checkbox" checked={isSelected} onchange={() => toggleSelection(file)} class="checkbox" aria-label="Select file" />
					</div>
				{/if}

				<header class="mx-1 mb-1 mt-2 flex items-center justify-between gap-0.5">
					<!-- Info Tooltip -->
					<SystemTooltip positioning={{ placement: 'right' }}>
						<button
							aria-label="File Info"
							class="btn-icon text-tertiary-500 dark:text-primary-500
								{gridSize === 'tiny' ? 'h-5 w-5 p-0!' : 'h-8 w-8'}"
						>
							<iconify-icon icon="raphael:info" width={gridSize === 'tiny' ? 16 : 22}></iconify-icon>
						</button>
						{#snippet content()}
							<div class="mb-1 border-b border-surface-400 pb-1 text-center font-bold">File Info</div>
							<table class="table-auto text-xs">
								<thead class="text-tertiary-500">
									<tr class="divide-x divide-surface-400 border-b-2 border-surface-400 text-center">
										<th class="px-2 text-left">Format</th>
										<th class="px-2">Pixel</th>
										<th class="px-2">Size</th>
									</tr>
								</thead>
								<tbody>
									<tr class="divide-x divide-surface-400 border-b border-surface-400">
										<td class="px-2 font-bold text-tertiary-500">original</td>
										<td class="px-2 text-right">
											{#if (file as any).width && (file as any).height}
												{(file as any).width}x{(file as any).height}
											{:else}
												N/A
											{/if}
										</td>
										<td class="px-2 text-right">{formatBytes(file.size)}</td>
									</tr>
									{#each ['thumbnail', 'sm', 'md', 'lg'].filter((s) => Object.keys(getThumbnails(file)).includes(s)) as size (size)}
										{@const thumbnail = getThumbnail(file, size)}
										{#if thumbnail}
											<tr
												class="divide-x divide-surface-400 border-b border-surface-400 last:border-b-0 {size === gridSize
													? 'bg-primary-50 dark:bg-primary-900/20'
													: ''}"
												onclick={(e) => {
													e.preventDefault();
													if (size === 'tiny' || size === 'small' || size === 'medium' || size === 'large') {
														onsizechange({
															size: size === 'tiny' ? 'small' : size === 'small' ? 'medium' : size === 'medium' ? 'large' : 'tiny',
															type: 'grid'
														});
													}
												}}
											>
												<td class="px-2 font-bold text-tertiary-500"
													>{size}
													{#if size === gridSize}
														<span class="ml-1 text-[10px] text-primary-500">(active)</span>
													{/if}
												</td>
												<td class="px-2 text-right">
													{#if thumbnail.width && thumbnail.height}
														{thumbnail.width}x{thumbnail.height}
													{:else}
														N/A
													{/if}
												</td>
												<td class="px-2 text-right">
													{#if thumbnail.size}
														{formatBytes(thumbnail.size)}
													{:else}
														N/A
													{/if}
												</td>
											</tr>
										{/if}
									{/each}
								</tbody>
							</table>
						{/snippet}
					</SystemTooltip>

					<div class="flex items-center gap-0.5">
						{#if file.type === 'image'}
							<!-- Toggle Tags Tooltip -->
							<SystemTooltip title="View/Edit Tags" positioning={{ placement: 'top' }}>
								<button
									onclick={() => {
										openTagEditor(file as MediaImage);
									}}
									aria-label="Toggle Tags"
									class="btn-icon text-surface-500 dark:text-surface-50
										{gridSize === 'tiny' ? 'h-5 w-5 p-0!' : 'h-8 w-8'}"
								>
									{#if file.metadata?.aiTags?.length || file.metadata?.tags?.length}
										<iconify-icon icon="mdi:tag-multiple" width={gridSize === 'tiny' ? 16 : 22}></iconify-icon>
									{:else}
										<iconify-icon icon="mdi:tag-outline" width={gridSize === 'tiny' ? 16 : 22}></iconify-icon>
									{/if}
								</button>
							</SystemTooltip>

							<!-- Edit Tooltip -->
							<SystemTooltip title="Edit Image" positioning={{ placement: 'top' }}>
								<button
									onclick={() => onEditImage(file as MediaImage)}
									aria-label="Edit"
									class="btn-icon {gridSize === 'tiny' ? 'h-5 w-5 p-0!' : 'h-8 w-8'}"
								>
									<iconify-icon icon="mdi:pen" width={gridSize === 'tiny' ? 16 : 22} class="text-primary-500 dark:text-primary-500"></iconify-icon>
								</button>
							</SystemTooltip>
						{/if}

						<!-- Delete Tooltip -->
						<SystemTooltip title="Delete Image" positioning={{ placement: 'top' }}>
							<button onclick={() => handleDelete(file)} aria-label="Delete" class="btn-icon {gridSize === 'tiny' ? 'h-5 w-5 p-0!' : 'h-8 w-8'}">
								<iconify-icon icon="icomoon-free:bin" width={gridSize === 'tiny' ? 16 : 20} class="text-error-500"></iconify-icon>
							</button>
						</SystemTooltip>
					</div>
				</header>

				<section class="relative flex items-center justify-center {gridSize === 'tiny' ? 'p-2' : 'p-0.5'}">
					{#if (file.type === 'image' || file.type === 'video') && file?.filename && file?.path && file?.hash}
						{@const thumbUrl = getImageUrl(file, gridSize)}
						{#if thumbUrl}
							<div
								class="group relative cursor-pointer"
								role="button"
								tabindex="0"
								onclick={() => {
									if (isSelectionMode) return;
									if (file.type === 'video') {
										const videoUrl = (file as any).url || thumbUrl.replace('/thumbnail/', '/original/').replace('.jpg', '.mp4');
										window.open(videoUrl, '_blank');
									}
								}}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										if (file.type === 'video') {
											const videoUrl = (file as any).url || thumbUrl.replace('/thumbnail/', '/original/').replace('.jpg', '.mp4');
											window.open(videoUrl, '_blank');
										}
									}
								}}
							>
								<!-- Aspect Ratio Container -->
								<div
									class="relative w-full overflow-hidden bg-surface-200 dark:bg-surface-700/50 aspect-square {gridSize === 'tiny'
										? 'rounded'
										: 'rounded'}"
								>
									<img
										src={thumbUrl}
										alt={`Thumbnail for ${file.filename}`}
										class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
										style:object-position={file.metadata?.focalPoint ? `${file.metadata.focalPoint.x}% ${file.metadata.focalPoint.y}%` : 'center'}
										onerror={(e: Event) => {
											const target = e.target as HTMLImageElement;
											if (target) {
												// Use warn instead of error to reduce noise for known broken items
												logger.warn('Failed to load media thumbnail:', file.filename);
												target.src = '/static/Default_User.svg';
												target.alt = 'Fallback thumbnail image';
											}
										}}
										loading="lazy"
										decoding="async"
									/>
								</div>

								{#if file.type === 'video'}
									<div class="absolute inset-0 flex items-center justify-center bg-black/10 opacity-70 transition-opacity group-hover:opacity-100">
										<iconify-icon
											icon="mdi:play-circle-outline"
											width={gridSize === 'tiny' ? 24 : gridSize === 'small' ? 32 : gridSize === 'medium' ? 64 : 128}
											class="text-white drop-shadow-md"
										></iconify-icon>
									</div>
								{/if}
							</div>
						{:else}
							<div
								class={`flex items-center justify-center rounded-sm bg-surface-200 dark:bg-surface-700/50 w-full aspect-square border border-surface-300/50`}
								aria-label={`Icon for ${file.type}`}
								role="img"
							>
								<iconify-icon
									icon={getFileIcon(file)}
									width={gridSize === 'tiny' ? 32 : gridSize === 'small' ? 48 : gridSize === 'medium' ? 96 : 160}
									class="opacity-50"
								></iconify-icon>
							</div>
						{/if}
					{:else}
						<div
							class={`flex items-center justify-center rounded-sm bg-surface-200 dark:bg-surface-700/50 w-full aspect-square border border-surface-300/50`}
							aria-label={`Icon for ${file.type}`}
							role="img"
						>
							<iconify-icon
								icon={getFileIcon(file)}
								width={gridSize === 'tiny' ? 32 : gridSize === 'small' ? 48 : gridSize === 'medium' ? 96 : 160}
								class="opacity-50"
							></iconify-icon>
						</div>
					{/if}
				</section>

				<div class="w-full px-2 py-1 text-center h-10 flex flex-col justify-center">
					<SystemTooltip title={file.filename} positioning={{ placement: 'top' }}>
						<div class="text-xs font-bold leading-tight line-clamp-2 overflow-hidden overflow-wrap-anywhere">
							{file.filename}
						</div>
					</SystemTooltip>
				</div>

				<footer class="mt-auto flex w-full flex-col gap-2 p-1">
					<!-- Tags Overlay Removed -->

					<!-- Media Type & Size (Footer - LocalUpload Style) -->
					<div class="flex items-center justify-between gap-1 p-1">
						<!-- Type -->
						<SystemTooltip title="Media Type: {file.type}" positioning={{ placement: 'top' }}>
							<div class="bg-tertiary-500 dark:bg-primary-500/50 badge flex items-center gap-1 overflow-hidden px-1 py-0.5 text-white">
								<iconify-icon icon={getFileIcon(file)} width="12"></iconify-icon>
								<span class="truncate text-[9px] uppercase font-bold">{formatMimeType(file.mimeType)}</span>
							</div>
						</SystemTooltip>

						<!-- Size -->
						<SystemTooltip title="File Size" positioning={{ placement: 'top' }}>
							<p class="bg-tertiary-500 dark:bg-primary-500/50 badge flex shrink-0 items-center gap-1 px-1 py-0.5 text-[9px] font-bold text-white">
								{formatBytes(file.size)}
							</p>
						</SystemTooltip>
					</div>
				</footer>
			</button>
		{/each}
	{/if}
</div>

<TagEditorModal bind:show={showTagModal} bind:file={taggingFile} onUpdate={onUpdateImage} />

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
