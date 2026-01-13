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
	import { toaster } from '@stores/store.svelte';
	import { Tooltip, Portal } from '@skeletonlabs/skeleton-svelte';

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
	}

	const {
		filteredFiles = $bindable([]),
		gridSize = 'medium',
		ondeleteImage = () => {},
		onBulkDelete = () => {},
		onEditImage = () => {},
		onsizechange = () => {},
		onUpdateImage = () => {}
	}: Props = $props();

	let showInfo = $state<boolean[]>([]);
	let selectedFiles = $state<Set<string>>(new Set());
	let isSelectionMode = $state(false);

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
		// Fallback if path is missing or not a string
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
			default:
				return 'vscode-icons:file';
		}
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

	function getThumbnails(file: MediaBase | MediaImage) {
		return 'thumbnails' in file ? file.thumbnails || {} : {};
	}

	function getThumbnail(file: MediaBase | MediaImage, size: string) {
		const thumbnails = getThumbnails(file);
		// Map UI grid sizes to DB keys
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
					class="preset-outline-surface-500 btn-sm"
					aria-label="Toggle selection mode"
				>
					<iconify-icon icon={isSelectionMode ? 'mdi:close' : 'mdi:checkbox-multiple-marked'} width="20"></iconify-icon>
					{isSelectionMode ? 'Cancel' : 'Select'}
				</button>

				{#if isSelectionMode}
					<button onclick={selectAll} class="preset-outline-surface-500 btn-sm">
						<iconify-icon icon="mdi:select-all" width="20"></iconify-icon>
						Select All
					</button>
					<button onclick={deselectAll} class="preset-outline-surface-500 btn-sm">
						<iconify-icon icon="mdi:select-off" width="20"></iconify-icon>
						Deselect All
					</button>
				{/if}
			</div>

			{#if selectedFiles.size > 0}
				<div class="flex items-center gap-2">
					<span class="text-sm">{selectedFiles.size} selected</span>
					<button onclick={handleBulkDelete} class="preset-filled-error-500 btn-sm">
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
					<!-- Info Tooltip -->
					<Tooltip positioning={{ placement: 'right' }}>
						<Tooltip.Trigger>
							<button aria-label="File Info" class="btn-icon" title="File Info">
								<iconify-icon icon="raphael:info" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
							</button>
						</Tooltip.Trigger>
						<Portal>
							<Tooltip.Positioner>
								<Tooltip.Content class="rounded-container-token z-50 border border-surface-500 bg-surface-50 p-2 shadow-xl dark:bg-surface-900">
									<table class="table-auto text-xs">
										<thead class="text-tertiary-500">
											<tr class="divide-x divide-surface-400 border-b-2 border-surface-400 text-center">
												<th class="px-2 text-left">Format</th>
												<th class="px-2">Pixel</th>
												<th class="px-2">Size</th>
											</tr>
										</thead>
										<tbody>
											{#if 'width' in file && file.width && 'height' in file && file.height}
												<tr
													><td class="px-2 font-semibold">Original:</td><td class="px-2">{file.width}x{file.height}</td><td class="px-2"
														>{formatBytes(file.size)}</td
													></tr
												>
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
									<Tooltip.Arrow class="fill-surface-50 dark:fill-surface-900" />
								</Tooltip.Content>
							</Tooltip.Positioner>
						</Portal>
					</Tooltip>

					<div class="flex items-center gap-1">
						{#if file.type === 'image'}
							<!-- Toggle Tags Tooltip -->
							<Tooltip positioning={{ placement: 'top' }}>
								<Tooltip.Trigger>
									<button onclick={() => openTagEditor(file as MediaImage)} aria-label="Toggle Tags" class="btn-icon">
										{#if file.metadata?.aiTags?.length || file.metadata?.tags?.length}
											<iconify-icon icon="mdi:tag-multiple" width="22" class="text-primary-500"></iconify-icon>
										{:else}
											<iconify-icon icon="mdi:tag-outline" width="22" class="text-surface-500"></iconify-icon>
										{/if}
									</button>
								</Tooltip.Trigger>
								<Portal>
									<Tooltip.Positioner>
										<Tooltip.Content class="rounded bg-surface-900 px-2 py-1 text-xs text-white shadow-xl dark:bg-surface-100 dark:text-black">
											View/Edit Tags
											<Tooltip.Arrow class="fill-surface-900 dark:fill-surface-100" />
										</Tooltip.Content>
									</Tooltip.Positioner>
								</Portal>
							</Tooltip>

							<!-- Edit Tooltip -->
							<Tooltip positioning={{ placement: 'top' }}>
								<Tooltip.Trigger>
									<button onclick={() => onEditImage(file as MediaImage)} aria-label="Edit" class="btn-icon">
										<iconify-icon icon="mdi:pen" width="24" class="text-primary-500"></iconify-icon>
									</button>
								</Tooltip.Trigger>
								<Portal>
									<Tooltip.Positioner>
										<Tooltip.Content class="rounded bg-surface-900 px-2 py-1 text-xs text-white shadow-xl dark:bg-surface-100 dark:text-black">
											Edit Image
											<Tooltip.Arrow class="fill-surface-900 dark:fill-surface-100" />
										</Tooltip.Content>
									</Tooltip.Positioner>
								</Portal>
							</Tooltip>
						{/if}

						<!-- Delete Tooltip -->
						<Tooltip positioning={{ placement: 'top' }}>
							<Tooltip.Trigger>
								<button onclick={() => handleDelete(file)} aria-label="Delete" class="btn-icon">
									<iconify-icon icon="icomoon-free:bin" width="24" class="text-error-500"> </iconify-icon>
								</button>
							</Tooltip.Trigger>
							<Portal>
								<Tooltip.Positioner>
									<Tooltip.Content class="rounded bg-surface-900 px-2 py-1 text-xs text-white shadow-xl dark:bg-surface-100 dark:text-black">
										Delete Image
										<Tooltip.Arrow class="fill-surface-900 dark:fill-surface-100" />
									</Tooltip.Content>
								</Tooltip.Positioner>
							</Portal>
						</Tooltip>
					</div>
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

				<!-- Media Filename (LocalUpload Style) -->
				<div class="label overflow-hidden text-ellipsis whitespace-nowrap p-1 text-center font-bold text-xs" title={file.filename}>
					{file.filename}
				</div>

				<footer class="flex flex-col gap-2 p-1">
					<!-- Tags Overlay Removed -->

					<!-- Media Type & Size (Footer - LocalUpload Style) -->
					<div class="flex grow items-center justify-between p-1 text-white">
						<!-- Type -->
						<div class="bg-tertiary-500 dark:bg-primary-500/50 badge flex items-center gap-1 overflow-hidden" title={file.type}>
							<iconify-icon icon={getFileIcon(file)} width="12" height="12"></iconify-icon>
							<span class="truncate text-[10px] uppercase">{formatMimeType(file.mimeType)}</span>
						</div>
						<!-- Size -->
						<p class="bg-tertiary-500 dark:bg-primary-500/50 badge flex shrink-0 items-center gap-1 text-[10px]">
							<span class="">{(file.size / 1024).toFixed(2)}</span>
							KB
						</p>
					</div>
				</footer>
			</div>
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
