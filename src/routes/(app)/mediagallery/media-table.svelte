<!--
@file src/routes/(app)/mediagallery/MediaTable.svelte
@component
**Table view component for the media gallery**
Features:
- Keyboard-accessible rows
- Sorting and filtering
- Multi-select integration
- Responsive column visibility + graceful image fallbacks
-->

<script lang="ts">
import TablePagination from "@src/components/system/table/table-pagination.svelte";
import type { MediaBase, MediaImage } from "@utils/media/media-models";
import { formatBytes } from "@utils/utils";
import { SvelteSet } from "svelte/reactivity";
	import Button from '@components/ui/button.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';

interface Props {
	filteredFiles?: (MediaBase | MediaImage)[];
	isSelectionMode?: boolean;
	selectedFiles: SvelteSet<string>;
	ondeleteImage?: (file: MediaBase | MediaImage) => void;
	onEditImage?: (file: MediaImage) => void;
	onOpenFileDetails?: (file: MediaBase | MediaImage) => void;
}

let {
	filteredFiles = [],
	isSelectionMode = false,
	selectedFiles = $bindable(),
	ondeleteImage = () => {},
	onEditImage = () => {},
	onOpenFileDetails = () => {},
}: Props = $props();

let failedImages = $state(new SvelteSet<string>());

function typeLabel(file: MediaBase | MediaImage): string {
	return (file.mimeType?.split("/")[1] || file.type || "file").toString();
}

let currentPage = $state(1);
let rowsPerPage = $state(10);
const pagesCount = $derived(Math.ceil(filteredFiles.length / rowsPerPage) || 1);
const paginatedFiles = $derived(
	filteredFiles.slice(
		(currentPage - 1) * rowsPerPage,
		currentPage * rowsPerPage,
	),
);

function toggleSelection(file: MediaBase | MediaImage) {
	const fileId = file._id?.toString() || file.filename;
	if (selectedFiles.has(fileId)) {
		selectedFiles.delete(fileId);
	} else {
		selectedFiles.add(fileId);
	}
}

function handleRowClick(file: MediaBase | MediaImage) {
	if (!isSelectionMode) {
		onOpenFileDetails(file);
	}
}

function handleKeyDown(e: KeyboardEvent, file: MediaBase | MediaImage) {
	if (e.key === "Enter" || e.key === " ") {
		e.preventDefault();
		if (!isSelectionMode) {
			onOpenFileDetails(file);
		}
	}
}
</script>

<div class="flex h-full min-h-0 w-full flex-col overflow-hidden p-2 sm:p-3">
	{#if filteredFiles.length === 0}
		<div class="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
			<iconify-icon icon="mdi:image-search-outline" width="40" class="text-surface-400 dark:text-surface-500"></iconify-icon>
			<div class="space-y-1">
				<h3 class="text-base font-semibold">No media found</h3>
				<p class="text-sm text-surface-500 dark:text-surface-400">Try adjusting your search or filter.</p>
			</div>
		</div>
	{:else}
		<div class="media-table-scroll min-h-0 flex-1 overflow-auto">
			<table class="w-full border-collapse text-sm">
				<thead class="sticky top-0 z-10 border-b border-surface-200 bg-surface-50/95 backdrop-blur-sm dark:border-surface-800 dark:bg-surface-950/95">
					<tr class="text-[10px] font-semibold uppercase tracking-wider text-surface-500">
						<th class="w-9 px-2 py-2 text-center sm:px-3 sm:py-2.5">
							<span class="sr-only">Select</span>
						</th>
						<th class="w-12 px-2 py-2 text-start sm:px-3 sm:py-2.5">Preview</th>
						<th class="px-2 py-2 text-start sm:px-3 sm:py-2.5">Name</th>
						<th class="hidden px-3 py-2.5 text-start md:table-cell">Type</th>
						<th class="hidden whitespace-nowrap px-3 py-2.5 text-end sm:table-cell">Size</th>
						<th class="w-16 px-2 py-2 text-end sm:w-20 sm:px-3 sm:py-2.5">Actions</th>
					</tr>
				</thead>

				<tbody>
					{#each paginatedFiles as file (file._id || file.filename)}
						{@const fileId = file._id?.toString() || file.filename}
						{@const isSelected = selectedFiles.has(fileId)}

						<tr
							class="group cursor-pointer border-b border-surface-200 align-middle transition-colors dark:border-surface-800/80
								{isSelected
								? 'bg-primary-500/5'
								: 'hover:bg-surface-50 dark:hover:bg-surface-900/40'}"
							onclick={() => handleRowClick(file)}
							onkeydown={(e) => handleKeyDown(e, file)}
							tabindex="0"
							aria-selected={isSelected}
						>
							<td
								class="border-s-2 border-transparent px-2 py-2 text-center sm:px-3 {isSelected ? 'border-s-primary-500' : ''}"
								onclick={(e) => e.stopPropagation()}
							>
								<Checkbox
									checked={isSelected}
									onchange={() => toggleSelection(file)}
									label="Select {file.filename}"
									hideLabel
									size="sm"
								/>
							</td>
							<td class="px-2 py-2 sm:px-3">
								<div class="media-thumb-checkerboard flex h-9 w-9 items-center justify-center overflow-hidden sm:h-10 sm:w-10">
									{#if file.type === 'image' && !failedImages.has(fileId)}
										<img src={file.url} alt="" class="h-full w-full object-cover" loading="lazy" onerror={() => failedImages.add(fileId)} />
									{:else if file.type === 'image'}
										<iconify-icon icon="mdi:image-off-outline" width="18" class="text-surface-400 dark:text-surface-500"></iconify-icon>
									{:else}
										<iconify-icon icon="mdi:file-document-outline" width="18" class="text-surface-400 dark:text-surface-500"></iconify-icon>
									{/if}
								</div>
							</td>
							<td class="w-full max-w-0 px-2 py-2 sm:px-3">
								<div class="truncate text-sm font-medium" title={file.filename}>{file.filename}</div>
								<div class="hidden truncate font-mono text-[10px] text-surface-500 sm:block dark:text-surface-400" title={file.path}>{file.path}</div>
							</td>
							<td class="hidden px-3 py-2 md:table-cell">
								<span class="font-mono text-[10px] uppercase text-surface-500 dark:text-surface-400">{typeLabel(file)}</span>
							</td>
							<td class="hidden whitespace-nowrap px-3 py-2 text-end font-mono text-xs tabular-nums text-surface-500 dark:text-surface-400 sm:table-cell">
								{formatBytes(file.size)}
							</td>
							<td class="px-2 py-2 sm:px-3">
								<div class="flex items-center justify-end gap-0.5">
									<Button
										variant="ghost"
										size="sm"
										onclick={(e: MouseEvent) => { e.stopPropagation(); onEditImage(file as MediaImage); }}
										aria-label="Edit {file.filename}"
										class="h-7 w-7 min-w-0 p-0! text-surface-500 hover:text-primary-500 dark:text-surface-400"
									>
										<iconify-icon icon="mdi:pencil" width="15"></iconify-icon>
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onclick={(e: MouseEvent) => { e.stopPropagation(); ondeleteImage(file); }}
										aria-label="Delete {file.filename}"
										class="h-7 w-7 min-w-0 p-0! text-surface-500 hover:text-error-500 dark:text-surface-400"
									>
										<iconify-icon icon="mdi:trash-can-outline" width="15"></iconify-icon>
									</Button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-surface-200 py-2.5 dark:border-surface-800">
		<TablePagination
			bind:currentPage
			bind:rowsPerPage
			{pagesCount}
			totalItems={filteredFiles.length}
			onUpdatePage={(p: number) => currentPage = p}
			onUpdateRowsPerPage={(r: number) => { rowsPerPage = r; currentPage = 1; }}
		/>
	</div>
</div>

<style>
  .media-thumb-checkerboard {
    background-color: var(--color-surface-100);
    background-image:
      linear-gradient(45deg, var(--color-surface-200) 25%, transparent 25%),
      linear-gradient(-45deg, var(--color-surface-200) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--color-surface-200) 75%),
      linear-gradient(-45deg, transparent 75%, var(--color-surface-200) 75%);
    background-size: 8px 8px;
    background-position: 0 0, 0 4px, 4px -4px, -4px 0;
  }

  :global(.dark) .media-thumb-checkerboard {
    background-color: var(--color-surface-900);
    background-image:
      linear-gradient(45deg, var(--color-surface-800) 25%, transparent 25%),
      linear-gradient(-45deg, var(--color-surface-800) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--color-surface-800) 75%),
      linear-gradient(-45deg, transparent 75%, var(--color-surface-800) 75%);
  }

  .media-table-scroll {
    scrollbar-width: thin;
    scrollbar-color: var(--color-surface-300) transparent;
  }

  .media-table-scroll::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  .media-table-scroll::-webkit-scrollbar-thumb {
    border-radius: 4px;
    background: var(--color-surface-300);
  }

  :global(.dark) .media-table-scroll::-webkit-scrollbar-thumb {
    background: var(--color-surface-700);
  }
</style>
