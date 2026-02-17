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
	

	import TagEditorModal from '@components/media/tagEditor/TagEditorModal.svelte';
	// Skeleton
	import SystemTooltip from '@components/system/SystemTooltip.svelte';
	import type { MediaBase, MediaImage, MediaVideo } from '@utils/media/mediaModels';
import { formatBytes } from '@utils/utils';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	// Svelte transitions
	import { scale } from 'svelte/transition';

	interface Props {
		filteredFiles?: (MediaBase | MediaImage)[];
		gridSize?: 'tiny' | 'small' | 'medium' | 'large';
		isSelectionMode?: boolean;
		onBulkDelete?: (files: (MediaBase | MediaImage)[]) => void;
		ondeleteImage?: (file: MediaBase | MediaImage) => void;
		onEditImage?: (file: MediaImage) => void;
		onUpdateImage?: (file: MediaImage) => void;
		selectedFiles?: Set<string> | SvelteSet<string>;
	}

	let {
		filteredFiles = $bindable([]),
		gridSize = 'medium',
		ondeleteImage = () => {},
		onBulkDelete = () => {},
		onEditImage = () => {},
		onUpdateImage = () => {},
		isSelectionMode: isSelectionModeProp = $bindable(false),
		selectedFiles = $bindable(new SvelteSet<string>())
	}: Props = $props();

	let localSelectionMode = $state<boolean | undefined>(undefined);
	let isSelectionMode = {
		get value() {
			return localSelectionMode ?? isSelectionModeProp;
		},
		set value(v: boolean) {
			localSelectionMode = v;
		}
	};

	let showInfo = new SvelteMap<number, boolean>();

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
	}

	function selectAll() {
		selectedFiles.clear();
		for (const f of filteredFiles) {
			selectedFiles.add(f._id?.toString() || f.filename);
		}
	}

	function deselectAll() {
		selectedFiles.clear();
	}

	function handleBulkDelete() {
		const filesToDelete = filteredFiles.filter((f: MediaBase | MediaImage) => selectedFiles.has(f._id?.toString() || f.filename));
		if (filesToDelete.length > 0) {
			onBulkDelete(filesToDelete);
			selectedFiles.clear();
			isSelectionMode.value = false;
		}
	}

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
		<!-- Batch Operations Toolbar (Glass) -->
		<div
			class="sticky top-0 z-30 mb-6 flex w-full items-center justify-between gap-4 rounded-2xl border border-surface-200/50 bg-white/80 p-3 shadow-sm backdrop-blur-xl dark:border-surface-700/50 dark:bg-surface-900/80"
		>
			<div class="flex items-center gap-3">
				<button
					onclick={() => {
						isSelectionMode.value = !isSelectionMode.value;
						if (!isSelectionMode.value) selectedFiles.clear();
					}}
					class="btn-sm transition-all duration-200 {isSelectionMode.value ? 'preset-filled-primary-500' : 'preset-tonal-surface'}"
					aria-label="Toggle selection mode"
				>
					<iconify-icon icon={isSelectionMode.value ? 'mdi:check' : 'mdi:checkbox-multiple-marked-outline'} width={18}></iconify-icon>
					<span class="text-xs font-semibold">{isSelectionMode.value ? 'Done' : 'Select'}</span>
				</button>

				{#if isSelectionMode.value}
					<div class="flex items-center gap-2 border-l border-surface-300 pl-3 dark:border-surface-600">
						<button onclick={selectAll} class="btn-sm preset-tonal-surface hover:preset-filled-surface-500">
							<span class="text-xs">All</span>
						</button>
						<button onclick={deselectAll} class="btn-sm preset-tonal-surface hover:preset-filled-surface-500">
							<span class="text-xs">None</span>
						</button>
					</div>
				{/if}
			</div>

			{#if selectedFiles.size > 0}
				<div class="flex items-center gap-3" in:scale={{ duration: 200, start: 0.9 }}>
					<span class="text-xs font-medium text-surface-500 dark:text-surface-400">
						{selectedFiles.size} selected
					</span>
					<button onclick={handleBulkDelete} class="btn-sm preset-filled-error-500 gap-2 shadow-sm hover:shadow-md">
						<iconify-icon icon="mdi:delete-outline" width={18}></iconify-icon>
						<span class="text-xs font-semibold">Delete</span>
					</button>
				</div>
			{/if}
		</div>

		<!-- Grid Layout -->
		{#each filteredFiles as file, index (file._id?.toString() || file.filename)}
			{@const fileId = file._id?.toString() || file.filename}
			{@const isSelected = selectedFiles.has(fileId)}

			<div
				class="group relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition-all duration-300 hover:z-10 hover:-translate-y-1 hover:shadow-xl dark:bg-surface-900
				{isSelected ? 'border-primary-500 ring-2 ring-primary-500/20' : 'border-surface-200 dark:border-surface-800'}
				{gridSize === 'tiny' ? 'w-32' : gridSize === 'small' ? 'w-48' : gridSize === 'medium' ? 'w-64' : 'w-80'}"
				role="button"
				tabindex="0"
				onmouseenter={() => showInfo.set(index, true)}
				onmouseleave={() => showInfo.set(index, false)}
				onclick={() => {
					if (isSelectionMode.value) toggleSelection(file);
				}}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						if (isSelectionMode.value) toggleSelection(file);
					}
				}}
			>
				<!-- Selection Checkbox Overlay -->
				{#if isSelectionMode.value || isSelected}
					<div class="absolute left-3 top-3 z-20" in:scale={{ duration: 200 }}>
						<div class="relative flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md dark:bg-surface-800">
							<input
								type="checkbox"
								checked={isSelected}
								onchange={() => toggleSelection(file)}
								class="checkbox h-4 w-4 rounded-sm border-2 border-surface-400 checked:border-primary-500 checked:bg-primary-500 focus:ring-0"
							/>
						</div>
					</div>
				{/if}

				<!-- Floating Actions (Reveal on Hover) -->
				<div
					class="absolute right-2 top-2 z-20 flex flex-col gap-1 opacity-0 transition-all duration-200 group-hover:opacity-100 {isSelectionMode.value
						? 'pointer-events-none'
						: ''}"
				>
					<!-- Info -->
					<SystemTooltip title="Info" positioning={{ placement: 'left' }}>
						<button
							class="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-surface-600 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:text-primary-600 hover:shadow-md dark:bg-surface-800/90 dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:text-primary-400"
							onclick={(e) => {
								e.stopPropagation(); /* Logic for Info Modal if needed */
							}}
							aria-label="View info"
							title="View info"
						>
							<iconify-icon icon="mdi:information-variant" width={18}></iconify-icon>
						</button>
						{#snippet content()}
							<div class="w-48 p-2">
								<div class="mb-2 text-xs font-bold uppercase tracking-wider text-surface-500">Details</div>
								<div class="grid grid-cols-2 gap-y-1 text-xs">
									<span class="text-surface-500">Size:</span>
									<span class="text-right font-mono">{formatBytes(file.size)}</span>
									{#if file.type === 'image' && (file as MediaImage).width}
										<span class="text-surface-500">Dimensions:</span>
										<span class="text-right font-mono">{(file as MediaImage).width}x{(file as MediaImage).height}</span>
									{/if}
									<span class="text-surface-500">Type:</span>
									<span class="text-right">{formatMimeType(file.mimeType)}</span>
								</div>
							</div>
						{/snippet}
					</SystemTooltip>

					{#if file.type === 'image' && !isSelectionMode.value}
						<!-- Edit -->
						<SystemTooltip title="Edit" positioning={{ placement: 'left' }}>
							<button
								onclick={(e) => {
									e.stopPropagation();
									onEditImage(file as MediaImage);
								}}
								class="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-surface-600 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:text-primary-600 hover:shadow-md dark:bg-surface-800/90 dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:text-primary-400"
								aria-label="Edit image"
								title="Edit image"
							>
								<iconify-icon icon="mdi:pencil" width={16}></iconify-icon>
							</button>
						</SystemTooltip>

						<!-- Tags -->
						<SystemTooltip title="Tags" positioning={{ placement: 'left' }}>
							<button
								onclick={(e) => {
									e.stopPropagation();
									openTagEditor(file as MediaImage);
								}}
								class="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-surface-600 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:text-primary-600 hover:shadow-md dark:bg-surface-800/90 dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:text-primary-400"
								aria-label="Edit tags"
								title="Edit tags"
							>
								<iconify-icon icon="mdi:tag-outline" width={16}></iconify-icon>
							</button>
						</SystemTooltip>
					{/if}

					<!-- Delete -->
					{#if !isSelectionMode.value}
						<SystemTooltip title="Delete" positioning={{ placement: 'left' }}>
							<button
								onclick={(e) => {
									e.stopPropagation();
									handleDelete(file);
								}}
								class="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-error-500 shadow-sm backdrop-blur-sm transition-all hover:bg-error-50 hover:text-error-600 hover:shadow-md dark:bg-surface-800/90 dark:hover:bg-error-900/30"
								aria-label="Delete file"
								title="Delete file"
							>
								<iconify-icon icon="mdi:trash-can-outline" width={16}></iconify-icon>
							</button>
						</SystemTooltip>
					{/if}
				</div>

				<!-- Media Preview Area -->
				<div
					class="relative aspect-square w-full overflow-hidden bg-surface-100 dark:bg-surface-800"
					onclick={(e) => {
						if (!isSelectionMode.value && file.type === 'video') {
							e.stopPropagation();
							const video = file as MediaVideo;
							window.open(video.url, '_blank');
						}
					}}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							if (!isSelectionMode.value && file.type === 'video') {
								e.preventDefault();
								e.stopPropagation();
								const video = file as MediaVideo;
								window.open(video.url, '_blank');
							}
						}
					}}
					role="button"
					tabindex="0"
					aria-label={file.type === 'video' ? 'Play video' : 'Media preview'}
				>
					{#if ((file.type === 'image' || file.type === 'video') && file?.filename) || (file?.thumbnails && Object.keys(file.thumbnails).length > 0)}
						{@const thumbUrl = getImageUrl(file, gridSize)}
						<img
							src={thumbUrl}
							alt={file.filename}
							class="h-full w-full object-cover transition-transform duration-500 will-change-transform group-hover:scale-110"
							style:object-position={file.metadata?.focalPoint ? `${file.metadata.focalPoint.x}% ${file.metadata.focalPoint.y}%` : 'center'}
							loading="lazy"
							onerror={(e) => {
								const target = e.currentTarget as HTMLImageElement;
								if (target) target.src = '/static/Default_User.svg';
							}}
						/>

						<!-- Video Overlay -->
						{#if file.type === 'video'}
							<div class="absolute inset-0 flex items-center justify-center bg-black/20 transition-all group-hover:bg-black/10">
								<div
									class="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110"
								>
									<iconify-icon icon="mdi:play" width={32} class="text-white drop-shadow-lg"></iconify-icon>
								</div>
							</div>
						{/if}
					{:else}
						<!-- Generic File Icon -->
						<div class="flex h-full w-full items-center justify-center text-surface-300 dark:text-surface-600">
							<iconify-icon icon={getFileIcon(file)} width={64}></iconify-icon>
						</div>
					{/if}

					<!-- Gradient Overlay for Text Readability -->
					<div
						class="absolute bottom-0 left-0 right-0 h-1/3 bg-linear-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
					></div>
				</div>

				<!-- Card Footer -->
				<div class="relative flex flex-col gap-1 border-t border-surface-100 bg-white p-3 dark:border-surface-800 dark:bg-surface-900">
					<!-- Filename -->
					<div class="truncate text-xs font-semibold text-surface-900 dark:text-surface-100" title={file.filename}>
						{file.filename}
					</div>

					<!-- Metadata Badges -->
					<div class="flex items-center gap-2 text-[10px] text-surface-500 dark:text-surface-400">
						<SystemTooltip title="Type" positioning={{ placement: 'top' }}>
							<span class="flex items-center gap-1 rounded bg-surface-100 px-1.5 py-0.5 font-medium uppercase tracking-wide dark:bg-surface-800">
								{formatMimeType(file.mimeType)}
							</span>
						</SystemTooltip>
						<SystemTooltip title="Size" positioning={{ placement: 'top' }}>
							<span class="font-mono">{formatBytes(file.size)}</span>
						</SystemTooltip>
					</div>
				</div>
			</div>
		{/each}
	{/if}
</div>

<TagEditorModal bind:show={showTagModal} bind:file={taggingFile} onUpdate={onUpdateImage} />

<style>
	/* Smooth grid item repositioning */
	:global(.flex.flex-wrap) {
		transition: all 0.3s ease-out;
	}
</style>
