<!--
@file src/routes/(app)/mediagallery/media-table.svelte
@component
**Table view for the media gallery — Smart Table platform**

### Features:
- Unified chrome tokens (matches entry-list / admin tables)
- `createSmartTable` client mode for local page + column sort
- Keyboard-accessible rows + multi-select (parent-owned set)
- Drag multi-select to sidebar folders or breadcrumbs (same payload as grid)
- Responsive mobile list + desktop table
- Graceful image fallbacks
-->

<script lang="ts">
import {
	createSmartTable,
	pinCellClass,
	SMART_TABLE,
	SMART_TABLE_ROW_HOVER,
	SMART_TABLE_ROW_SELECTED,
	SMART_TABLE_TD,
	SMART_TABLE_TH,
	SMART_TABLE_THEAD,
} from "@components/ui/smart-table";
import SmartTableShell from "@components/ui/smart-table/smart-table-shell.svelte";
import TagEditorModal from "@src/components/media/tag-editor/tag-editor-modal.svelte";
import MediaTableRowMenu from "./media-table-row-menu.svelte";
import type { MediaBase, MediaImage } from "@utils/media/media-models";
import {
	beginMediaDrag,
	endMediaDrag,
	resolveMediaDragIds,
} from "@utils/media/media-dnd";
import { formatBytes } from "@utils/utils";
import { SvelteSet } from "svelte/reactivity";
import Checkbox from "@components/ui/checkbox.svelte";

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

// Client-mode smart table: local page/sort for filtered gallery slice
const smartTable = createSmartTable({
	mode: "client",
	pageSize: 10,
	layoutKey: "media-gallery-table",
	getRowId: (row) =>
		String((row as MediaBase | MediaImage)._id?.toString() || (row as MediaBase | MediaImage).filename || ""),
});

$effect(() => {
	smartTable.setRows(filteredFiles as unknown as Record<string, unknown>[]);
	smartTable.setColumns([
		{ key: "_select", label: "", sortable: false, pin: "start", align: "center" },
		{ key: "preview", label: "Preview", sortable: false, align: "start" },
		{ key: "filename", label: "Name", sortable: true, align: "start" },
		{ key: "size", label: "Size", sortable: true, align: "end" },
		{ key: "type", label: "Type", sortable: true, align: "end" },
		{ key: "_actions", label: "Actions", sortable: false, pin: "end", align: "end" },
	]);
});

const paginatedFiles = $derived(smartTable.rows as unknown as (MediaBase | MediaImage)[]);
const currentPage = $derived(smartTable.pagination.currentPage);
const rowsPerPage = $derived(smartTable.pagination.pageSize);
const pagesCount = $derived(smartTable.pagination.pagesCount);
const totalItems = $derived(smartTable.pagination.totalItems);

function openTagEditor(file: MediaImage) {
	taggingFile = file;
	showTagModal = true;
}

function typeLabel(file: MediaBase | MediaImage): string {
	return (file.mimeType?.split("/")[1] || file.type || "file").toString();
}

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
	allPageSelected ? true : somePageSelected ? "indeterminate" : false,
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

function resolveFileId(file: MediaBase | MediaImage): string {
	return file._id?.toString() || file.filename;
}

function handleDragStart(e: DragEvent, file: MediaBase | MediaImage) {
	const target = e.target as HTMLElement | null;
	if (target?.closest("[data-no-drag]")) {
		e.preventDefault();
		return;
	}
	const ids = resolveMediaDragIds(resolveFileId(file), selectedFiles);
	const written = beginMediaDrag(e.dataTransfer, ids);
	if (!written.length) {
		e.preventDefault();
	}
}

function handleDragEnd() {
	endMediaDrag();
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

function onUpdatePage(page: number) {
	smartTable.setPage(page);
}

function onUpdateRowsPerPage(rows: number) {
	smartTable.setPageSize(rows);
}
</script>

<div class="h-full min-h-0 w-full p-2 sm:p-3" data-testid="media-table">
	<SmartTableShell
		empty={filteredFiles.length === 0}
		emptyTitle="No media found"
		emptyDescription="Try adjusting your search or filter."
		emptyIcon="mdi:image-search-outline"
		currentPage={currentPage}
		rowsPerPage={rowsPerPage}
		pagesCount={pagesCount}
		totalItems={totalItems}
		onUpdatePage={onUpdatePage}
		onUpdateRowsPerPage={onUpdateRowsPerPage}
		scrollClass="media-table-scroll"
	>
		<!-- Mobile: compact list rows (no table — fits viewport without scroll) -->
		<div class="flex flex-col md:hidden" role="table" aria-label="Media files">
				<div
					class="{SMART_TABLE_THEAD} flex items-center gap-3 px-2 py-2.5 backdrop-blur-sm"
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
						class="flex cursor-grab items-center gap-3 border-b border-s-2 border-s-transparent border-surface-200 px-2 py-3 active:cursor-grabbing dark:border-surface-800/80
							{isSelected ? `border-s-primary-500 ${SMART_TABLE_ROW_SELECTED}` : SMART_TABLE_ROW_HOVER}"
						role="row"
						tabindex="0"
						aria-selected={isSelected}
						draggable="true"
						title="Drag to a folder or breadcrumb to move"
						ondragstart={(e) => handleDragStart(e, file)}
						ondragend={handleDragEnd}
						onclick={() => handleRowClick(file)}
						onkeydown={(e) => handleKeyDown(e, file)}
					>
						<div class="shrink-0" data-no-drag role="cell" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>
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
									<img src={file.url} alt="" class="pointer-events-none h-full w-full object-cover" loading="lazy" draggable="false" crossorigin="anonymous" onerror={() => failedImages.add(fileId)} />
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

						<div class="shrink-0" data-no-drag role="cell" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}>
							<MediaTableRowMenu
								{file}
								onDetails={() => onOpenFileDetails(file)}
								onEdit={() => onEditImage(file as MediaImage)}
								onTags={() => openTagEditor(file as MediaImage)}
								onDelete={() => ondeleteImage(file)}
							/>
						</div>
					</div>
				{/each}
			</div>

			<!-- Desktop: full table (shared Smart Table chrome) -->
			<table class="media-table {SMART_TABLE} hidden md:table lg:table-fixed">
				<colgroup>
					<col class="media-table-col-select" />
					<col class="media-table-col-preview" />
					<col class="media-table-col-name" />
					<col class="media-table-col-size" />
					<col class="media-table-col-type" />
					<col class="media-table-col-actions" />
				</colgroup>
				<thead class="{SMART_TABLE_THEAD} backdrop-blur-sm">
					<tr class="text-[10px] font-semibold uppercase tracking-wider">
						<th class="media-table-select {SMART_TABLE_TH} {pinCellClass('start')} w-9 shrink-0" onclick={(e) => e.stopPropagation()}>
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
						<th class="media-table-preview {SMART_TABLE_TH} w-16 shrink-0 text-start!">Preview</th>
						<th class="media-table-name {SMART_TABLE_TH} min-w-0 text-start!">
							<button type="button" class="font-semibold uppercase" onclick={() => smartTable.setSort('filename')}>
								Name
								{#if smartTable.sort.sortedBy === 'filename' && smartTable.sort.isSorted !== 0}
									<iconify-icon icon={smartTable.sort.isSorted === 1 ? 'mdi:arrow-up' : 'mdi:arrow-down'} width="14" class="ms-0.5 inline"></iconify-icon>
								{/if}
							</button>
						</th>
						<th class="media-table-size {SMART_TABLE_TH} hidden shrink-0 whitespace-nowrap text-end! sm:table-cell">
							<button type="button" class="font-semibold uppercase" onclick={() => smartTable.setSort('size')}>
								Size
								{#if smartTable.sort.sortedBy === 'size' && smartTable.sort.isSorted !== 0}
									<iconify-icon icon={smartTable.sort.isSorted === 1 ? 'mdi:arrow-up' : 'mdi:arrow-down'} width="14" class="ms-0.5 inline"></iconify-icon>
								{/if}
							</button>
						</th>
						<th class="media-table-type {SMART_TABLE_TH} hidden shrink-0 whitespace-nowrap text-end! md:table-cell">
							<button type="button" class="font-semibold uppercase" onclick={() => smartTable.setSort('type')}>
								Type
								{#if smartTable.sort.sortedBy === 'type' && smartTable.sort.isSorted !== 0}
									<iconify-icon icon={smartTable.sort.isSorted === 1 ? 'mdi:arrow-up' : 'mdi:arrow-down'} width="14" class="ms-0.5 inline"></iconify-icon>
								{/if}
							</button>
						</th>
						<th class="media-table-actions {SMART_TABLE_TH} {pinCellClass('end')} w-11 shrink-0 text-end!">Actions</th>
					</tr>
				</thead>

				<tbody>
					{#each paginatedFiles as file (file._id || file.filename)}
						{@const fileId = file._id?.toString() || file.filename}
						{@const isSelected = selectedFiles.has(fileId)}

						<tr
							class="group cursor-grab border-b border-surface-200 align-middle active:cursor-grabbing dark:border-surface-800/80
								{isSelected ? SMART_TABLE_ROW_SELECTED : SMART_TABLE_ROW_HOVER}"
							onclick={() => handleRowClick(file)}
							onkeydown={(e) => handleKeyDown(e, file)}
							tabindex="0"
							aria-selected={isSelected}
							draggable="true"
							title="Drag to a folder or breadcrumb to move"
							ondragstart={(e) => handleDragStart(e, file)}
							ondragend={handleDragEnd}
						>
							<td
								class="media-table-select {SMART_TABLE_TD} {pinCellClass('start')} w-9 shrink-0 border-s-2! {isSelected ? 'border-s-primary-500!' : 'border-s-transparent!'}"
								data-no-drag
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
							<td class="media-table-preview {SMART_TABLE_TD} w-16 shrink-0">
								<div class="media-thumb-checkerboard flex h-10 w-11 items-center justify-center overflow-hidden rounded sm:h-11 sm:w-12">
									{#if file.type === 'image' && !failedImages.has(fileId)}
										<img src={file.url} alt="" class="pointer-events-none h-full w-full object-cover" loading="lazy" draggable="false" crossorigin="anonymous" onerror={() => failedImages.add(fileId)} />
									{:else if file.type === 'image'}
										<iconify-icon icon="mdi:image-off-outline" width="20" class="text-surface-400 dark:text-surface-500"></iconify-icon>
									{:else}
										<iconify-icon icon="mdi:file-document-outline" width="20" class="text-surface-400 dark:text-surface-500"></iconify-icon>
									{/if}
								</div>
							</td>
							<td class="media-table-name {SMART_TABLE_TD} min-w-0 overflow-hidden text-start!">
								<div class="truncate text-sm font-medium" title={file.filename}>{file.filename}</div>
								<div class="media-table-path hidden font-mono text-[10px] text-surface-500 sm:block dark:text-surface-400" title={file.path}>{file.path}</div>
							</td>
							<td class="media-table-size {SMART_TABLE_TD} hidden shrink-0 whitespace-nowrap text-end! font-mono text-xs tabular-nums text-surface-500 dark:text-surface-400 sm:table-cell">
								{formatBytes(file.size)}
							</td>
							<td class="media-table-type {SMART_TABLE_TD} hidden shrink-0 whitespace-nowrap text-end! md:table-cell">
								<span class="font-mono text-[10px] uppercase text-surface-500 dark:text-surface-400">{typeLabel(file)}</span>
							</td>
							<td class="media-table-actions {SMART_TABLE_TD} {pinCellClass('end')} w-11 shrink-0" data-no-drag onclick={(e) => e.stopPropagation()}>
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
	</SmartTableShell>
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
