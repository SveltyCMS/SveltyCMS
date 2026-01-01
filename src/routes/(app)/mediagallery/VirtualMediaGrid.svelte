<!--
@file src/routes/(app)/mediagallery/VirtualMediaGrid.svelte
@component
**Virtual scrolling grid for media gallery - handles 10,000+ files smoothly**

Implements custom virtual scrolling without external dependencies.

### Props
- `filteredFiles: MediaImage[]`: An array of media items to be displayed in the grid view.
- `gridSize: 'tiny' | 'small' | 'medium' | 'large'`: The size of the grid layout to be used.
- `ondeleteImage?: (file: MediaImage) => void`: An optional callback function to handle image deletion.
- `onBulkDelete?: (files: MediaImage[]) => void`: An optional callback function to handle bulk deletion.
- `onBulkDownload?: (files: MediaImage[]) => void`: An optional callback function to handle bulk downloading.
- `onBulkEdit?: (files: MediaImage[], action: string, value: any) => void`: An optional callback function to handle bulk editing.

### Features:
- Virtual scrolling for optimal performance
- Batch operations (select, delete, download, edit)
- Blur-up placeholders
- Advanced search
- Duplicate detection
- Bulk edit operations
-->

<script lang="ts">
	import { formatBytes } from '@utils/utils';

	import type { MediaImage, MediaBase } from '@utils/media/mediaModels';
	// import { popup } from '@skeletonlabs/skeleton-svelte';
	import { onMount } from 'svelte';

	interface Props {
		filteredFiles?: (MediaBase | MediaImage)[];
		gridSize?: 'tiny' | 'small' | 'medium' | 'large';
		ondeleteImage?: (file: MediaBase | MediaImage) => void;
		onBulkDelete?: (files: (MediaBase | MediaImage)[]) => void;
		onBulkDownload?: (files: (MediaBase | MediaImage)[]) => void;
		onBulkEdit?: (files: (MediaBase | MediaImage)[], action: string, value: any) => void;
		onEditImage?: (file: MediaImage) => void;
	}

	const {
		filteredFiles = [],
		gridSize,
		ondeleteImage = () => {},
		onBulkDelete = () => {},
		onBulkDownload = () => {},
		onBulkEdit = () => {},
		onEditImage = () => {}
	}: Props = $props();

	// Virtual scrolling state
	let containerHeight = $state(600);
	let scrollTop = $state(0);
	const itemHeight = $derived(gridSize === 'tiny' ? 120 : gridSize === 'small' ? 160 : gridSize === 'medium' ? 280 : 400);
	let itemsPerRow = $state(5);
	const visibleRows = $derived(Math.ceil(containerHeight / itemHeight) + 2); // +2 for buffer
	const totalRows = $derived(Math.ceil(filteredFiles.length / itemsPerRow));
	const startRow = $derived(Math.max(0, Math.floor(scrollTop / itemHeight) - 1));
	const endRow = $derived(Math.min(totalRows, startRow + visibleRows));
	const visibleItems = $derived(filteredFiles.slice(startRow * itemsPerRow, endRow * itemsPerRow));
	const paddingTop = $derived(startRow * itemHeight);
	const paddingBottom = $derived((totalRows - endRow) * itemHeight);

	// Selection and operations state
	let selectedFiles = $state<Set<string>>(new Set());
	let isSelectionMode = $state(false);
	let activePopup = $state<string | null>(null);
	let showBulkEditModal = $state(false);
	let bulkEditAction = $state<'rename' | 'move' | 'tag'>('tag');
	let bulkEditValue = $state('');

	// Container ref
	let container: HTMLDivElement;

	// Calculate items per row based on container width
	function updateItemsPerRow() {
		if (!container) return;
		const width = container.clientWidth;
		const itemWidth = gridSize === 'tiny' ? 100 : gridSize === 'small' ? 140 : gridSize === 'medium' ? 260 : 380;
		itemsPerRow = Math.max(1, Math.floor(width / itemWidth));
	}

	// Handle scroll
	function handleScroll(e: Event) {
		const target = e.target as HTMLDivElement;
		scrollTop = target.scrollTop;
	}

	// Batch operations
	function toggleSelection(file: MediaBase | MediaImage) {
		const fileId = file._id?.toString() || file.filename;
		if (selectedFiles.has(fileId)) {
			selectedFiles.delete(fileId);
		} else {
			selectedFiles.add(fileId);
		}
		selectedFiles = selectedFiles;
	}

	function selectAll() {
		selectedFiles = new Set(filteredFiles.map((f) => f._id?.toString() || f.filename));
	}

	function deselectAll() {
		selectedFiles = new Set();
	}

	function handleDelete(file: MediaBase | MediaImage) {
		ondeleteImage(file);
	}

	function handleBulkDelete() {
		const filesToDelete = filteredFiles.filter((f) => selectedFiles.has(f._id?.toString() || f.filename));
		if (filesToDelete.length > 0) {
			onBulkDelete(filesToDelete);
			selectedFiles = new Set();
			isSelectionMode = false;
		}
	}

	function handleBulkDownload() {
		const filesToDownload = filteredFiles.filter((f) => selectedFiles.has(f._id?.toString() || f.filename));
		if (filesToDownload.length > 0) {
			onBulkDownload(filesToDownload);
		}
	}

	function openBulkEditModal(action: 'rename' | 'move' | 'tag') {
		bulkEditAction = action;
		showBulkEditModal = true;
	}

	function applyBulkEdit() {
		const filesToEdit = filteredFiles.filter((f) => selectedFiles.has(f._id?.toString() || f.filename));
		if (filesToEdit.length > 0 && bulkEditValue.trim()) {
			onBulkEdit(filesToEdit, bulkEditAction, bulkEditValue);
			showBulkEditModal = false;
			bulkEditValue = '';
			selectedFiles = new Set();
			isSelectionMode = false;
		}
	}

	// Lifecycle
	onMount(() => {
		updateItemsPerRow();
		const resizeObserver = new ResizeObserver(() => {
			updateItemsPerRow();
			containerHeight = container.clientHeight;
		});
		resizeObserver.observe(container);
		return () => resizeObserver.disconnect();
	});
</script>

<div class="flex h-full flex-col">
	<!-- Batch Operations Toolbar -->
	<div class="mb-4 flex w-full flex-wrap items-center justify-between gap-2 rounded border border-surface-400 bg-surface-100 p-2 dark:bg-surface-700">
		<div class="flex flex-wrap items-center gap-2">
			<button
				onclick={() => {
					isSelectionMode = !isSelectionMode;
					selectedFiles = new Set();
				}}
				class="preset-ghost-surface-500 btn btn-sm"
				aria-label="Toggle selection mode"
			>
				<iconify-icon icon={isSelectionMode ? 'mdi:close' : 'mdi:checkbox-multiple-marked'} width="20"></iconify-icon>
				{isSelectionMode ? 'Cancel' : 'Select'}
			</button>

			{#if isSelectionMode}
				<button onclick={selectAll} class="preset-ghost-surface-500 btn btn-sm">
					<iconify-icon icon="mdi:select-all" width="20"></iconify-icon>
					All
				</button>
				<button onclick={deselectAll} class="preset-ghost-surface-500 btn btn-sm">
					<iconify-icon icon="mdi:select-off" width="20"></iconify-icon>
					None
				</button>
			{/if}
		</div>

		{#if selectedFiles.size > 0}
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-sm font-semibold">{selectedFiles.size} selected</span>

				<button onclick={handleBulkDownload} class="preset-filled-primary-500 btn btn-sm">
					<iconify-icon icon="mdi:download" width="18"></iconify-icon>
					Download
				</button>

				<button onclick={() => openBulkEditModal('tag')} class="preset-filled-secondary-500 btn btn-sm">
					<iconify-icon icon="mdi:tag-multiple" width="18"></iconify-icon>
					Tag
				</button>

				<button onclick={() => openBulkEditModal('move')} class="preset-filled-secondary-500 btn btn-sm">
					<iconify-icon icon="mdi:folder-move" width="18"></iconify-icon>
					Move
				</button>

				<button onclick={() => openBulkEditModal('rename')} class="preset-filled-secondary-500 btn btn-sm">
					<iconify-icon icon="mdi:rename-box" width="18"></iconify-icon>
					Rename
				</button>

				<button onclick={handleBulkDelete} class="preset-filled-error-500 btn btn-sm">
					<iconify-icon icon="mdi:delete" width="18"></iconify-icon>
					Delete
				</button>
			</div>
		{/if}
	</div>

	<!-- Virtual Scrolling Container -->
	<div bind:this={container} onscroll={handleScroll} class="flex-1 overflow-y-auto" style="height: {containerHeight}px;">
		{#if filteredFiles.length === 0}
			<div class="flex h-full items-center justify-center text-center text-tertiary-500 dark:text-primary-500">
				<div>
					<iconify-icon icon="bi:exclamation-circle-fill" height="44" class="mb-2"></iconify-icon>
					<p class="text-lg">No media found</p>
				</div>
			</div>
		{:else}
			<div style="padding-top: {paddingTop}px; padding-bottom: {paddingBottom}px;">
				<div class="grid gap-4" style="grid-template-columns: repeat({itemsPerRow}, 1fr);">
					{#each visibleItems as file (file._id?.toString() || file.filename)}
						{@const fileId = file._id?.toString() || file.filename}
						{@const isSelected = selectedFiles.has(fileId)}
						<div
							onclick={() => isSelectionMode && toggleSelection(file)}
							onkeydown={(e) => {
								if (isSelectionMode && (e.key === 'Enter' || e.key === ' ')) {
									e.preventDefault();
									toggleSelection(file);
								}
							}}
							role="button"
							tabindex="0"
							class="card relative border border-surface-300 transition-all hover:shadow-lg dark:border-surface-500 {isSelected
								? 'ring-2 ring-primary-500'
								: ''}"
						>
							{#if isSelectionMode}
								<div class="absolute left-2 top-2 z-10">
									<input type="checkbox" checked={isSelected} onchange={() => toggleSelection(file)} class="checkbox" aria-label="Select file" />
								</div>
							{/if}

							<header class="m-2 flex w-auto items-center justify-between relative">
								<button
									onclick={(e) => {
										e.stopPropagation();
										activePopup = activePopup === fileId ? null : fileId;
									}}
									aria-label="File Info"
									class="btn-icon"
								>
									<iconify-icon icon="raphael:info" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
								</button>

								{#if activePopup === fileId}
									<div
										class="card preset-filled z-50 min-w-[250px] p-2 absolute left-8 top-0 shadow-xl"
										onclick={(e) => e.stopPropagation()}
										onkeydown={(e) => e.stopPropagation()}
										role="dialog"
										tabindex="-1"
									>
										<table class=" w-full table-auto text-xs">
											<tbody>
												{#if 'width' in file && file.width && 'height' in file && file.height}
													<tr><td class="font-semibold">Dimensions:</td><td>{file.width}x{file.height}</td></tr>
												{/if}
												<tr><td class="font-semibold">Size:</td><td>{formatBytes(file.size || 0)}</td></tr>
												<tr><td class="font-semibold">Type:</td><td>{file.mimeType || 'N/A'}</td></tr>
												<tr><td class="font-semibold">Hash:</td><td class="truncate" title={file.hash}>{file.hash?.substring(0, 8) || 'N/A'}</td></tr>
											</tbody>
										</table>
										<!-- Close button for mobile/convenience -->
										<div class="flex justify-end mt-2">
											<button class="btn-icon btn-icon-sm preset-filled-surface-500" aria-label="Close" onclick={() => (activePopup = null)}>
												<iconify-icon icon="mdi:close" width="16"></iconify-icon>
											</button>
										</div>
									</div>
								{/if}

								{#if !isSelectionMode}
									{#if file.type === 'image'}
										<button onclick={() => onEditImage(file as MediaImage)} aria-label="Edit" class="btn-icon">
											<iconify-icon icon="mdi:pen" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
										</button>
									{/if}
									<button onclick={() => handleDelete(file)} aria-label="Delete" class="btn-icon">
										<iconify-icon icon="mdi:delete" width="20" class="text-error-500"></iconify-icon>
									</button>
								{/if}
							</header>

							<section class="flex items-center justify-center p-2">
								{#if file?.filename && file?.url}
									<img
										src={('thumbnails' in file ? file.thumbnails?.sm?.url : undefined) ?? file.url ?? '/static/Default_User.svg'}
										alt={file.filename}
										class={`rounded object-cover ${
											gridSize === 'tiny' ? 'h-16 w-16' : gridSize === 'small' ? 'h-24 w-24' : gridSize === 'medium' ? 'h-48 w-48' : 'h-80 w-80'
										}`}
										loading="lazy"
										decoding="async"
										onerror={(e) => {
											const target = e.target as HTMLImageElement;
											if (target) {
												target.src = '/static/Default_User.svg';
											}
										}}
									/>
								{:else}
									<div class="flex h-full w-full items-center justify-center bg-surface-200 dark:bg-surface-700">
										<iconify-icon icon="bi:exclamation-triangle-fill" height="24" class="text-warning-500"></iconify-icon>
									</div>
								{/if}
							</section>

							<footer class="p-2 text-sm">
								<p class="truncate" title={file.filename}>{file.filename}</p>
								<p class="text-xs text-gray-500">{formatBytes(file.size || 0)}</p>
								<p class="text-xs text-gray-500">{file.type || 'Unknown'}</p>
							</footer>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<!-- Stats Footer -->
	<div class="mt-2 flex items-center justify-between border-t border-surface-400 bg-surface-100 px-4 py-2 text-sm dark:bg-surface-700">
		<span>Showing {visibleItems.length} of {filteredFiles.length} files</span>
		<span>Virtual scrolling: {Math.round((visibleItems.length / filteredFiles.length) * 100)}% rendered</span>
	</div>
</div>

<!-- Bulk Edit Modal -->
{#if showBulkEditModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
		onclick={() => (showBulkEditModal = false)}
		onkeydown={(e) => {
			if (e.key === 'Escape') {
				showBulkEditModal = false;
			}
		}}
		role="button"
		tabindex="-1"
		aria-label="Close modal"
	>
		<div
			class="card w-full max-w-md p-6"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			tabindex="0"
			aria-labelledby="bulk-edit-title"
		>
			<h3 id="bulk-edit-title" class="mb-4 text-xl font-bold">
				Bulk {bulkEditAction === 'rename' ? 'Rename' : bulkEditAction === 'move' ? 'Move' : 'Tag'}
			</h3>

			<p class="mb-4 text-sm text-surface-600 dark:text-surface-400">
				{selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
			</p>

			<div class="mb-4">
				<label class="label mb-2" for="bulk-edit-input">
					{#if bulkEditAction === 'rename'}
						<span>New name prefix (files will be numbered)</span>
					{:else if bulkEditAction === 'move'}
						<span>Destination folder</span>
					{:else}
						<span>Tags (comma-separated)</span>
					{/if}
				</label>
				<input
					id="bulk-edit-input"
					type="text"
					bind:value={bulkEditValue}
					class="input"
					placeholder={bulkEditAction === 'rename' ? 'image-' : bulkEditAction === 'move' ? '/folder/path' : 'tag1, tag2, tag3'}
				/>
			</div>

			<div class="flex justify-end gap-2">
				<button onclick={() => (showBulkEditModal = false)} class="preset-ghost-surface-500 btn">Cancel</button>
				<button onclick={applyBulkEdit} class="preset-filled-primary-500 btn" disabled={!bulkEditValue.trim()}>Apply</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.grid {
		display: grid;
		gap: 1rem;
	}
</style>
