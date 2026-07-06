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
import TagEditorModal from "@src/components/media/tag-editor/tag-editor-modal.svelte";
import MediaTableRowMenu from "./media-table-row-menu.svelte";
import type { MediaBase, MediaImage } from "@utils/media/media-models";
import { formatBytes } from "@utils/utils";
import { SvelteSet } from "svelte/reactivity";
	import Checkbox from '@components/ui/checkbox.svelte';

interface Props {
	filteredFiles?: (MediaBase | MediaImage)[];
	isSelectionMode?: boolean;
	selectedFiles: SvelteSet<string>;
	publishedMediaIds?: SvelteSet<string>;
	ondeleteImage?: (file: MediaBase | MediaImage) => void;
	onEditImage?: (file: MediaImage) => void;
	onUpdateImage?: (file: MediaImage) => void;
	onOpenFileDetails?: (file: MediaBase | MediaImage) => void;
}

let {
	filteredFiles = [],
	isSelectionMode = false,
	selectedFiles = $bindable(),
	publishedMediaIds = $bindable(new SvelteSet<string>()),
	ondeleteImage = () => {},
	onEditImage = () => {},
	onUpdateImage = () => {},
	onOpenFileDetails = () => {},
}: Props = $props();

let failedImages = $state(new SvelteSet<string>());
let showTagModal = $state(false);
let taggingFile = $state<MediaImage | null>(null);

function openTagEditor(file: MediaImage) {
	taggingFile = file;
	showTagModal = true;
}

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

const pageFileIds = $derived(
	paginatedFiles.map((file) => file._id?.toString() || file.filename),
);

const allPageSelected = $derived(
	pageFileIds.length > 0 && pageFileIds.every((id) => selectedFiles.has(id)),
);

const somePageSelected = $derived(
	pageFileIds.some((id) => selectedFiles.has(id)) && !allPageSelected,
);

const headerCheckboxState = $derived(
	allPageSelected ? true : somePageSelected ? 'indeterminate' : false,
);

function toggleSelectAll() {
	if (allPageSelected) {
		for (const id of pageFileIds) selectedFiles.delete(id);
	} else {
		for (const id of pageFileIds) selectedFiles.add(id);
	}
}

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
			<!-- Mobile: compact list rows (no table — fits viewport without scroll) -->
			<div class="flex flex-col md:hidden" role="table" aria-label="Media files">
				<div
					class="sticky top-0 z-10 flex items-center gap-3 border-b border-surface-200 bg-surface-50/95 px-2 py-2.5 backdrop-blur-sm dark:border-surface-800 dark:bg-surface-950/95"
					role="row"
				>
					<div class="shrink-0" role="columnheader" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>
						<Checkbox
							class="w-auto"
							checked={headerCheckboxState}
							onchange={toggleSelectAll}
							label="Select all on this page"
							hideLabel
							size="sm"
						/>
					</div>
					<div class="w-10 shrink-0" role="columnheader" aria-hidden="true"></div>
					<div class="min-w-0 flex-1 text-[10px] font-semibold uppercase tracking-wider text-surface-500" role="columnheader">
						Name
					</div>
					<div class="w-16 shrink-0 text-end text-[10px] font-semibold uppercase tracking-wider text-surface-500" role="columnheader">
						<span class="sr-only">Actions</span>
					</div>
				</div>

				{#each paginatedFiles as file (file._id || file.filename)}
					{@const fileId = file._id?.toString() || file.filename}
					{@const isSelected = selectedFiles.has(fileId)}

					<div
						class="flex cursor-pointer items-center gap-3 border-b border-s-2 border-s-transparent border-surface-200 px-2 py-3 transition-colors dark:border-surface-800/80
							{isSelected ? 'border-s-primary-500 bg-primary-500/5' : 'hover:bg-surface-50 dark:hover:bg-surface-900/40'}"
						role="row"
						tabindex="0"
						aria-selected={isSelected}
						onclick={() => handleRowClick(file)}
						onkeydown={(e) => handleKeyDown(e, file)}
					>
						<div class="shrink-0" role="cell" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>
							<Checkbox
								class="w-auto"
								checked={isSelected}
								onchange={() => toggleSelection(file)}
								label="Select {file.filename}"
								hideLabel
								size="sm"
							/>
						</div>

						<div class="shrink-0" role="cell">
							<div class="media-thumb-checkerboard flex h-10 w-10 items-center justify-center overflow-hidden rounded">
								{#if file.type === 'image' && !failedImages.has(fileId)}
									<img src={file.url} alt="" class="h-full w-full object-cover" loading="lazy" onerror={() => failedImages.add(fileId)} />
								{:else if file.type === 'image'}
									<iconify-icon icon="mdi:image-off-outline" width="18" class="text-surface-400 dark:text-surface-500"></iconify-icon>
								{:else}
									<iconify-icon icon="mdi:file-document-outline" width="18" class="text-surface-400 dark:text-surface-500"></iconify-icon>
								{/if}
							</div>
						</div>

						<div class="min-w-0 flex-1 overflow-hidden pe-1" role="cell">
							<div class="truncate text-sm font-medium leading-snug" title={file.filename}>{file.filename}</div>
							<div class="mt-0.5 truncate font-mono text-[10px] text-surface-500 dark:text-surface-400" title={file.path}>
								{formatBytes(file.size)} · {typeLabel(file).toUpperCase()}
							</div>
						</div>

						<div
							class="flex shrink-0 items-center gap-1"
							role="cell"
							tabindex="-1"
							onclick={(e) => e.stopPropagation()}
							onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
						>
							<button
								type="button"
								class="flex h-7 w-7 items-center justify-center rounded text-surface-400 transition-colors hover:bg-surface-100 hover:text-primary-500 dark:hover:bg-surface-800 dark:hover:text-primary-400"
								onclick={() => onEditImage(file as MediaImage)}
								aria-label="Edit {file.filename}"
							>
								<iconify-icon icon="mdi:pencil" width="15"></iconify-icon>
							</button>
							<button
								type="button"
								class="flex h-7 w-7 items-center justify-center rounded text-surface-400 transition-colors hover:bg-error-50 hover:text-error-500 dark:hover:bg-error-950/30 dark:hover:text-error-400"
								onclick={() => ondeleteImage(file)}
								aria-label="Delete {file.filename}"
							>
								<iconify-icon icon="mdi:trash-can-outline" width="15"></iconify-icon>
							</button>
						</div>
					</div>
				{/each}
			</div>

			<!-- Desktop: full table -->
			<table class="media-table hidden w-full border-collapse text-sm md:table lg:table-fixed">
				<colgroup>
					<col class="media-table-col-select" />
					<col class="media-table-col-preview" />
					<col class="media-table-col-name" />
					<col class="media-table-col-size" />
					<col class="media-table-col-type" />
					<col class="media-table-col-actions" />
				</colgroup>
				<thead class="sticky top-0 z-10 border-b border-surface-200 bg-surface-50/95 backdrop-blur-sm dark:border-surface-800 dark:bg-surface-950/95">
					<tr class="text-[10px] font-semibold uppercase tracking-wider text-surface-500">
						<th class="media-table-select w-9 shrink-0 px-2 py-2 sm:px-3 sm:py-2.5" onclick={(e) => e.stopPropagation()}>
							<div class="flex justify-center">
								<Checkbox
									class="w-auto"
									checked={headerCheckboxState}
									onchange={toggleSelectAll}
									label="Select all on this page"
									hideLabel
									size="sm"
								/>
							</div>
						</th>
						<th class="media-table-preview w-16 shrink-0 px-2 py-2 text-start sm:px-3 sm:py-2.5">Preview</th>
						<th class="media-table-name min-w-0 px-2 py-2 text-start sm:px-3 sm:py-2.5">Name</th>
						<th class="media-table-size hidden shrink-0 whitespace-nowrap px-3 py-2.5 text-end sm:table-cell">Size</th>
						<th class="media-table-type hidden shrink-0 whitespace-nowrap px-3 py-2.5 text-end md:table-cell">Type</th>
						<th class="media-table-actions w-11 shrink-0 px-2 py-2 text-end sm:px-3 sm:py-2.5">Actions</th>
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
								class="media-table-select w-9 shrink-0 border-s-2 border-transparent px-2 py-2 sm:px-3 {isSelected ? 'border-s-primary-500' : ''}"
								onclick={(e) => e.stopPropagation()}
							>
								<div class="flex justify-center">
									<Checkbox
										class="w-auto"
										checked={isSelected}
										onchange={() => toggleSelection(file)}
										label="Select {file.filename}"
										hideLabel
										size="sm"
									/>
								</div>
							</td>
							<td class="media-table-preview w-16 shrink-0 px-2 py-2 sm:px-3">
								<div class="media-thumb-checkerboard flex h-10 w-11 items-center justify-center overflow-hidden rounded sm:h-11 sm:w-12">
									{#if file.type === 'image' && !failedImages.has(fileId)}
										<img src={file.url} alt="" class="h-full w-full object-cover" loading="lazy" onerror={() => failedImages.add(fileId)} />
									{:else if file.type === 'image'}
										<iconify-icon icon="mdi:image-off-outline" width="20" class="text-surface-400 dark:text-surface-500"></iconify-icon>
									{:else}
										<iconify-icon icon="mdi:file-document-outline" width="20" class="text-surface-400 dark:text-surface-500"></iconify-icon>
									{/if}
								</div>
							</td>
							<td class="media-table-name min-w-0 overflow-hidden px-2 py-2 sm:px-3">
								<div class="truncate text-sm font-medium" title={file.filename}>{file.filename}</div>
								<div class="media-table-path hidden font-mono text-[10px] text-surface-500 sm:block dark:text-surface-400" title={file.path}>{file.path}</div>
							</td>
							<td class="media-table-size hidden shrink-0 whitespace-nowrap px-3 py-2 text-end font-mono text-xs tabular-nums text-surface-500 dark:text-surface-400 sm:table-cell">
								{formatBytes(file.size)}
							</td>
							<td class="media-table-type hidden shrink-0 whitespace-nowrap px-3 py-2 text-end md:table-cell">
								<span class="font-mono text-[10px] uppercase text-surface-500 dark:text-surface-400">{typeLabel(file)}</span>
							</td>
							<td class="media-table-actions w-11 shrink-0 px-2 py-2 sm:px-3" onclick={(e) => e.stopPropagation()}>
								<MediaTableRowMenu
									{file}
									onDetails={() => onOpenFileDetails(file)}
									onEdit={() => onEditImage(file as MediaImage)}
									onTags={() => openTagEditor(file as MediaImage)}
									onDelete={() => ondeleteImage(file)}
								/>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<div class="flex shrink-0 items-center border-t border-surface-200 py-2.5 dark:border-surface-800 max-md:px-0 md:flex-wrap md:justify-between md:gap-3">
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

<TagEditorModal bind:show={showTagModal} bind:file={taggingFile} onUpdate={onUpdateImage} hideGenerate={true} />

<style>
  .media-table {
    --media-table-gap: 0.75rem;
    --media-table-gap-wide: 1rem;
  }

  /* Name column always absorbs leftover space; truncates instead of collapsing */
  .media-table-col-name {
    width: auto;
    min-width: 0;
  }

  .media-table-name {
    min-width: 0;
    overflow: hidden;
  }

  .media-table-select,
  .media-table-preview,
  .media-table-name,
  .media-table-type {
    padding-inline-end: var(--media-table-gap);
  }

  .media-table-size {
    padding-inline-end: var(--media-table-gap-wide);
  }

  .media-table-actions {
    padding-inline-start: 0.25rem;
    white-space: nowrap;
  }

  /* Hidden columns must not reserve width on small tablet */
  @media (max-width: 639px) {
    .media-table-col-size {
      width: 0;
    }
  }

  @media (max-width: 767px) {
    .media-table-col-type {
      width: 0;
    }
  }

  @media (min-width: 640px) {
    .media-table {
      --media-table-gap: 1.5rem;
      --media-table-gap-wide: 2rem;
    }
  }

  @media (min-width: 768px) {
    .media-table {
      --media-table-gap: 2rem;
      --media-table-gap-wide: 2.5rem;
    }
  }

  @media (min-width: 1024px) {
    .media-table {
      --media-table-gap: 3.5rem;
      --media-table-gap-wide: 4.5rem;
    }

    .media-table-col-select {
      width: 6.5rem;
    }

    .media-table-col-preview {
      width: 7.5rem;
    }

    .media-table-col-size {
      width: 8.5rem;
    }

    .media-table-col-type {
      width: 7.5rem;
    }

    .media-table-col-actions {
      width: 6.5rem;
    }

    .media-table-name {
      width: 100%;
      max-width: 0;
    }
  }

  @media (min-width: 1280px) {
    .media-table {
      --media-table-gap: 4rem;
      --media-table-gap-wide: 5rem;
    }
  }

  .media-table-path {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

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
