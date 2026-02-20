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
	// Using iconify-icon web component

	import type { MediaBase, MediaImage } from '@utils/media/media-models';
	import { formatBytes } from '@utils/utils';
	// import { popup } from '@skeletonlabs/skeleton-svelte';
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	interface Props {
		filteredFiles?: (MediaBase | MediaImage)[];
		gridSize?: 'tiny' | 'small' | 'medium' | 'large';
		onBulkDelete?: (files: (MediaBase | MediaImage)[]) => void;
		onBulkDownload?: (files: (MediaBase | MediaImage)[]) => void;
		onBulkEdit?: (files: (MediaBase | MediaImage)[], action: string, value: any) => void;
		ondeleteImage?: (file: MediaBase | MediaImage) => void;
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
	// eslint-disable-next-line svelte/no-unnecessary-state-wrap
	let selectedFiles = $state(new SvelteSet<string>());
	let isSelectionMode = $state(false);
	let activePopup = $state<string | null>(null);
	let showBulkEditModal = $state(false);
	let bulkEditAction = $state<'rename' | 'move' | 'tag'>('tag');
	let bulkEditValue = $state('');

	// Container ref
	let container: HTMLDivElement;

	// Keyboard navigation state
	// let focusedIndex = $state(-1);

	// Drag-to-select state (Unused/Incomplete)
	// let isDragging = $state(false);
	// let selectionStart = $state<{x: number, y: number} | null>(null);
	// let selectionRect = $state<{left: number, top: number, width: number, height: number} | null>(null);

	// Context menu state (Unused/Incomplete)
	// let contextMenu = $state<{x: number, y: number, file: MediaBase | MediaImage | null} | null>(null);

	// Computed item width for selection math
	// const itemWidth = $derived(gridSize === 'tiny' ? 100 : gridSize === 'small' ? 140 : gridSize === 'medium' ? 260 : 380);

	// Handle keyboard navigation (Unused - connect to window or container if needed)
	/*
    function handleKeyDown(e: KeyboardEvent) {
        if (!container) return;

        // Ignore if searching or editing
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;

        if (e.key === 'Delete' && selectedFiles.size > 0) {
            // Trigger bulk delete
             const filesToDelete = filteredFiles.filter(f => selectedFiles.has(f._id?.toString() || f.filename));
             if(filesToDelete.length > 0) onBulkDelete(filesToDelete);
        } else if (e.ctrlKey && e.key === 'a') {
             e.preventDefault();
             // Select All
             const newSet = new Set<string>();
             filteredFiles.forEach(f => newSet.add(f._id?.toString() || f.filename));
             selectedFiles = newSet;
        } else if (e.key === 'Escape') {
             // Clear selection or context menu
             if (contextMenu) contextMenu = null;
             else selectedFiles = new Set();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            focusedIndex = Math.min(filteredFiles.length - 1, focusedIndex + 1);
            scrollToIndex(focusedIndex);
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            focusedIndex = Math.max(0, focusedIndex - 1);
            scrollToIndex(focusedIndex);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            focusedIndex = Math.min(filteredFiles.length - 1, focusedIndex + itemsPerRow);
            scrollToIndex(focusedIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            focusedIndex = Math.max(0, focusedIndex - itemsPerRow);
            scrollToIndex(focusedIndex);
        } else if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            if (focusedIndex >= 0 && filteredFiles[focusedIndex]) {
                 toggleSelection(filteredFiles[focusedIndex]);
            }
        }
    }
    */

	/*
	function scrollToIndex(index: number) {
		if (index < 0) return;
		const row = Math.floor(index / itemsPerRow);
		const top = row * itemHeight;
		const bottom = top + itemHeight;

		if (top < scrollTop) {
			container.scrollTop = top;
		} else if (bottom > scrollTop + container.clientHeight) {
			container.scrollTop = bottom - container.clientHeight;
		}
	}

	// Drag Selection Logic (Unused)
	/*
    function handleMouseDown(e: MouseEvent) {
        // Ignore right click or if clicking on interactive elements
        if (e.button !== 0 || (e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.interactive')) return;

        // Clear context menu
        contextMenu = null;

        const rect = container.getBoundingClientRect();
        const startX = e.clientX - rect.left + container.scrollLeft;
        const startY = e.clientY - rect.top + container.scrollTop;

        isDragging = true;
        selectionStart = { x: startX, y: startY };
        selectionRect = { left: startX, top: startY, width: 0, height: 0 };

        // If not holding Ctrl/Shift, clear previous selection
        if (!e.ctrlKey && !e.shiftKey) {
            selectedFiles = new Set();
        }
    }

    function handleMouseMove(e: MouseEvent) {
        if (!isDragging || !selectionStart) return;

        const rect = container.getBoundingClientRect();
        const currentX = e.clientX - rect.left + container.scrollLeft;
        const currentY = e.clientY - rect.top + container.scrollTop;

        // Calculate selection box
        const left = Math.min(selectionStart.x, currentX);
        const top = Math.min(selectionStart.y, currentY);
        const width = Math.abs(currentX - selectionStart.x);
        const height = Math.abs(currentY - selectionStart.y);

        selectionRect = { left, top, width, height };

        // Select items intersecting with rect
        // Optimization: only check items in relevant rows
        const startRowIndex = Math.floor(top / itemHeight);
        const endRowIndex = Math.floor((top + height) / itemHeight);

        // Temporary set for visual feedback during drag could be implemented,
        // but for now we'll just update final selection on mouse up to avoid performance issues with 10k items
        // OR we can do real-time selection if optimized.
        // Let's do real-time selection update on a debounced set or just purely visual overlay for now?
        // Actually, let's implement real-time selection for "File Explorer" feel.
        selectItemsInRect(left, top, width, height, e.ctrlKey);
    }

    function handleMouseUp(e: MouseEvent) {
        if (isDragging) {
            isDragging = false;
            selectionStart = null;
            selectionRect = null;
        }
    }

    function selectItemsInRect(left: number, top: number, width: number, height: number, preserveExisting: boolean) {
         const newSet = preserveExisting ? new Set(selectedFiles) : new Set<string>();

         // Convert pixel rect to grid capacity
         const startRowIdx = Math.max(0, Math.floor(top / itemHeight));
         const endRowIdx = Math.min(totalRows - 1, Math.floor((top + height) / itemHeight));

         for (let r = startRowIdx; r <= endRowIdx; r++) {
             for (let c = 0; c < itemsPerRow; c++) {
                 const index = r * itemsPerRow + c;
                 if (index >= filteredFiles.length) break;

                 // Calculate item rect
                 // Note: Ideally use precise offsetLeft/Top if available, but math approximation works for uniform grid
                 const itemLeft = c * itemWidth; // Approximation requires ensuring justify-start or similar
                 const itemTop = r * itemHeight;

                 // Intersection check
                 if (
                     left < itemLeft + itemWidth &&
                     left + width > itemLeft &&
                     top < itemTop + itemHeight &&
                     top + height > itemTop
                 ) {
                     const file = filteredFiles[index];
                     newSet.add(file._id?.toString() || file.filename);
                 }
             }
         }
         selectedFiles = newSet;
    }

    // Context Menu
    function handleContextMenu(e: MouseEvent, file: MediaBase | MediaImage) {
        e.preventDefault();
        // If file not in selection, select it (exclusive)
        const fileId = file._id?.toString() || file.filename;
        if (!selectedFiles.has(fileId)) {
            selectedFiles = new Set([fileId]);
        }

        contextMenu = {
            x: e.clientX,
            y: e.clientY,
            file
        };
    }
    */

	// Calculate items per row based on container width
	function updateItemsPerRow() {
		if (!container) {
			return;
		}
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
	}

	function selectAll() {
		selectedFiles.clear();
		filteredFiles.forEach((f) => selectedFiles.add(f._id?.toString() || f.filename));
	}

	function deselectAll() {
		selectedFiles.clear();
	}

	function handleDelete(file: MediaBase | MediaImage) {
		ondeleteImage(file);
	}

	function handleBulkDelete() {
		const filesToDelete = filteredFiles.filter((f) => selectedFiles.has(f._id?.toString() || f.filename));
		if (filesToDelete.length > 0) {
			onBulkDelete(filesToDelete);
			selectedFiles.clear();
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
			selectedFiles.clear();
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
	<!-- Batch Operations Toolbar (Glass) -->
	<div
		class="mb-4 flex w-full flex-wrap items-center justify-between gap-4 rounded-2xl border border-surface-200/50 bg-white/80 p-3 shadow-sm backdrop-blur-xl dark:border-surface-700/50 dark:bg-surface-900/80"
	>
		<div class="flex flex-wrap items-center gap-2">
			<button
				onclick={() => {
					isSelectionMode = !isSelectionMode;
					selectedFiles.clear();
				}}
				class="btn-sm transition-all duration-200 {isSelectionMode ? 'preset-filled-primary-500' : 'preset-tonal-surface'}"
				aria-label="Toggle selection mode"
			>
				<iconify-icon icon={isSelectionMode ? 'mdi:check' : 'mdi:checkbox-multiple-marked-outline'} width="18"></iconify-icon>
				<span class="text-xs font-semibold">{isSelectionMode ? 'Done' : 'Select'}</span>
			</button>

			{#if isSelectionMode}
				<div class="flex items-center gap-2 border-l border-surface-300 pl-3 dark:border-surface-600">
					<button onclick={selectAll} class="btn-sm preset-tonal-surface hover:preset-filled-surface-500"><span class="text-xs">All</span></button>
					<button onclick={deselectAll} class="btn-sm preset-tonal-surface hover:preset-filled-surface-500"><span class="text-xs">None</span></button>
				</div>
			{/if}
		</div>

		{#if selectedFiles.size > 0}
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-xs font-medium text-surface-500 dark:text-surface-400 mr-2">{selectedFiles.size} selected</span>

				<button onclick={handleBulkDownload} class="btn-sm preset-filled-primary-500 gap-1 shadow-sm">
					<iconify-icon icon="mdi:download" width="16"></iconify-icon>
					Download
				</button>

				<button onclick={() => openBulkEditModal('tag')} class="btn-sm preset-filled-secondary-500 gap-1 shadow-sm">
					<iconify-icon icon="mdi:tag-multiple" width="16"></iconify-icon>
					Tag
				</button>

				<button onclick={() => openBulkEditModal('move')} class="btn-sm preset-filled-secondary-500 gap-1 shadow-sm">
					<iconify-icon icon="mdi:folder-move" width="16"></iconify-icon>
					Move
				</button>

				<button onclick={() => openBulkEditModal('rename')} class="btn-sm preset-filled-secondary-500 gap-1 shadow-sm">
					<iconify-icon icon="mdi:rename-box" width="16"></iconify-icon>
					Rename
				</button>

				<button onclick={handleBulkDelete} class="btn-sm preset-filled-error-500 gap-1 shadow-sm">
					<iconify-icon icon="mdi:delete" width="16"></iconify-icon>
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
					{#each visibleItems as file (file._id || file.filename)}
						{@const fileId = file._id?.toString() || file.filename}
						{@const isSelected = selectedFiles.has(fileId)}

						<div
							class="group relative flex flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition-all duration-300 hover:z-10 hover:-translate-y-1 hover:shadow-xl dark:bg-surface-900 {isSelected
								? 'border-primary-500 ring-2 ring-primary-500/20'
								: 'border-surface-200 dark:border-surface-800'}"
							role="button"
							tabindex="0"
							onclick={() => {
								if (isSelectionMode) toggleSelection(file);
							}}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									if (isSelectionMode) {
										e.preventDefault();
										toggleSelection(file);
									}
								}
							}}
						>
							<!-- Selection Checkbox Overlay -->
							{#if isSelectionMode || isSelected}
								<div class="absolute left-3 top-3 z-20">
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
								class="absolute right-2 top-2 z-20 flex flex-col gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 {isSelectionMode
									? 'pointer-events-none'
									: ''}"
							>
								<!-- Info Button (Replaces Popup) -->
								<button
									onclick={(e) => {
										e.stopPropagation();
										activePopup = activePopup === fileId ? null : fileId;
									}}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.stopPropagation();
											activePopup = activePopup === fileId ? null : fileId;
										}
									}}
									class="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-surface-600 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:text-primary-600 hover:shadow-md dark:bg-surface-800/90 dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:text-primary-400"
									aria-label="View file details"
									title="View file details"
								>
									<iconify-icon icon="raphael:info" width={18}></iconify-icon>
								</button>

								<!-- Info Popup (Absolute positioned relative to card or action) -->
								{#if activePopup === fileId}
									<div
										class="absolute right-10 top-0 z-50 w-48 rounded-xl border border-surface-200 bg-white/95 p-3 shadow-xl backdrop-blur-md dark:border-surface-700 dark:bg-surface-800/95"
										onclick={(e) => e.stopPropagation()}
										onkeydown={(e) => e.stopPropagation()}
										role="dialog"
										tabindex="-1"
										aria-label="File information"
									>
										<div class="mb-2 text-xs font-bold uppercase tracking-wider text-surface-500">Details</div>
										<table class="w-full text-xs">
											<tbody>
												<tr>
													<td class="text-surface-500 pr-2">Size:</td>
													<td class="text-right font-mono">{formatBytes(file.size || 0)}</td>
												</tr>
												{#if (file as any).width}
													<tr>
														<td class="text-surface-500 pr-2">Dims:</td>
														<td class="text-right font-mono">{(file as any).width}x{(file as any).height}</td>
													</tr>
												{/if}
												<tr>
													<td class="text-surface-500 pr-2">Type:</td>
													<td class="text-right truncate max-w-20">{file.mimeType?.split('/')[1] || 'N/A'}</td>
												</tr>
											</tbody>
										</table>
									</div>
								{/if}

								{#if !isSelectionMode}
									{#if file.type === 'image'}
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
									{/if}

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
								{/if}
							</div>

							<!-- Media Preview -->
							<div class="relative aspect-square w-full overflow-hidden bg-surface-100 dark:bg-surface-800">
								{#if file?.filename && file?.url}
									<img
										src={('thumbnails' in file ? file.thumbnails?.sm?.url : undefined) ?? file.url ?? '/static/Default_User.svg'}
										alt={file.filename}
										class="h-full w-full object-cover transition-transform duration-500 will-change-transform group-hover:scale-110"
										loading="lazy"
										decoding="async"
										onerror={(e) => {
											const target = e.target as HTMLImageElement;
											if (target) target.src = '/static/Default_User.svg';
										}}
									/>
								{:else}
									<div class="flex h-full w-full items-center justify-center text-surface-300 dark:text-surface-600">
										<iconify-icon icon="bi:exclamation-triangle-fill" width={48}></iconify-icon>
									</div>
								{/if}

								<!-- Gradient Overlay -->
								<div
									class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent p-2 text-white opacity-0 transition-opacity group-hover:opacity-100"
								></div>
							</div>

							<!-- Footer -->
							<div class="relative flex flex-col gap-1 border-t border-surface-100 bg-white p-3 dark:border-surface-800 dark:bg-surface-900">
								<div class="truncate text-xs font-semibold text-surface-900 dark:text-surface-100" title={file.filename}>{file.filename}</div>
								<div class="flex items-center gap-2 text-[10px] text-surface-500 dark:text-surface-400">
									<span class="font-mono">{formatBytes(file.size || 0)}</span>
									<span class="uppercase tracking-wide">{file.type || 'FILE'}</span>
								</div>
							</div>
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

			<p class="mb-4 text-sm text-surface-600 dark:text-surface-50">{selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected</p>

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
				<button onclick={() => (showBulkEditModal = false)} class="preset-outline-surface-500 btn">Cancel</button>
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
