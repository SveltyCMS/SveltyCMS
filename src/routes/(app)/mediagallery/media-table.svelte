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
import AdminCard from '@components/admin-card.svelte';
import TablePagination from "@src/components/system/table/table-pagination.svelte";
import type { MediaBase, MediaImage } from "@utils/media/media-models";
import { formatBytes } from "@utils/utils";
import { SvelteSet } from "svelte/reactivity";
	import Badge from '@components/ui/badge.svelte';
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

// Track images that fail to load so we can show a clean fallback
let failedImages = $state(new SvelteSet<string>());

// Safe type label (guards against a missing mimeType)
function typeLabel(file: MediaBase | MediaImage): string {
	return (file.mimeType?.split("/")[1] || file.type || "file").toString();
}

// Pagination
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
	if (isSelectionMode) {
		toggleSelection(file);
	} else {
		onOpenFileDetails(file);
	}
}

function handleKeyDown(e: KeyboardEvent, file: MediaBase | MediaImage) {
	if (e.key === "Enter" || e.key === " ") {
		e.preventDefault();
		if (isSelectionMode) {
			toggleSelection(file);
		} else {
			onOpenFileDetails(file);
		}
	}
}
</script>

<AdminCard
	class="flex h-full min-h-0 w-full flex-col overflow-hidden border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900"
>
	{#if filteredFiles.length === 0}
		<!-- Empty / no-results state -->
		<div class="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
			<iconify-icon icon="mdi:image-search-outline" width="56" class="text-surface-400 dark:text-surface-600"></iconify-icon>
			<div class="space-y-1">
				<h3 class="text-base font-semibold">No media found</h3>
				<p class="text-sm text-surface-500 dark:text-surface-400">Try adjusting your search or filter.</p>
			</div>
		</div>
	{:else}
		<div class="min-h-0 flex-1 overflow-auto">
			<table class="w-full border-collapse text-sm">
				<thead class="sticky top-0 z-10 bg-surface-100/95 backdrop-blur-sm dark:bg-surface-800/95">
					<tr class="border-b border-surface-200 text-[11px] font-bold uppercase tracking-wider text-surface-500 dark:border-surface-700">
						<th class="w-10 px-3 py-2.5 text-center">
							<span class="sr-only">Select</span>
							<iconify-icon icon="mdi:checkbox-marked-circle-outline" width="16" class="opacity-60"></iconify-icon>
						</th>
						<th class="w-16 px-3 py-2.5 text-start">Preview</th>
						<th class="px-3 py-2.5 text-start">Name</th>
						<th class="hidden px-3 py-2.5 text-start md:table-cell">Type</th>
						<th class="hidden whitespace-nowrap px-3 py-2.5 text-end sm:table-cell">Size</th>
						<th class="w-24 px-3 py-2.5 text-end">Actions</th>
					</tr>
				</thead>

				<tbody class="divide-y divide-surface-100 dark:divide-surface-800">
					{#each paginatedFiles as file (file._id || file.filename)}
						{@const fileId = file._id?.toString() || file.filename}
						{@const isSelected = selectedFiles.has(fileId)}

						<tr
							class="cursor-pointer align-middle transition-colors {isSelected ? 'bg-primary-500/10' : 'hover:bg-surface-50 dark:hover:bg-surface-800/50'}"
							onclick={() => handleRowClick(file)}
							onkeydown={(e) => handleKeyDown(e, file)}
							tabindex="0"
							aria-selected={isSelected}
						>
							<td class="px-3 py-2 text-center" onclick={(e) => e.stopPropagation()}>
								<Checkbox
									checked={isSelected}
									onchange={() => toggleSelection(file)}
									label="Select {file.filename}"
									hideLabel
									size="sm"
								/>
							</td>
							<td class="px-3 py-2">
								<div class="flex h-11 w-11 items-center justify-center overflow-hidden rounded bg-surface-100 dark:bg-surface-800">
									{#if file.type === 'image' && !failedImages.has(fileId)}
										<img src={file.url} alt="" class="h-full w-full object-cover" loading="lazy" onerror={() => failedImages.add(fileId)} />
									{:else if file.type === 'image'}
										<iconify-icon icon="mdi:image-off-outline" width="22" class="text-surface-400 dark:text-surface-600"></iconify-icon>
									{:else}
										<iconify-icon icon="mdi:file-document-outline" width="22" class="text-surface-400 dark:text-surface-600"></iconify-icon>
									{/if}
								</div>
							</td>
							<td class="w-full max-w-0 px-3 py-2">
								<div class="truncate font-medium" title={file.filename}>{file.filename}</div>
								<div class="truncate font-mono text-[10px] text-surface-500 dark:text-surface-400" title={file.path}>{file.path}</div>
							</td>
							<td class="hidden px-3 py-2 md:table-cell">
								<Badge preset="tonal" color="surface" class="uppercase">{typeLabel(file)}</Badge>
							</td>
							<td class="hidden whitespace-nowrap px-3 py-2 text-end font-mono text-xs text-surface-500 dark:text-surface-400 sm:table-cell">{formatBytes(file.size)}</td>
							<td class="px-3 py-2">
								<div class="flex items-center justify-end gap-1">
									<Button
										variant="ghost"
										size="sm"
										onclick={(e: MouseEvent) => { e.stopPropagation(); onEditImage(file as MediaImage); }}
										aria-label="Edit {file.filename}"
										class="h-8 w-8 p-0! min-w-0 text-surface-500 hover:text-primary-500 dark:text-surface-400"
									>
										<iconify-icon icon="mdi:pencil" width="16"></iconify-icon>
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onclick={(e: MouseEvent) => { e.stopPropagation(); ondeleteImage(file); }}
										aria-label="Delete {file.filename}"
										class="h-8 w-8 p-0! min-w-0 text-surface-500 hover:text-error-500 dark:text-surface-400"
									>
										<iconify-icon icon="mdi:trash-can-outline" width="16"></iconify-icon>
									</Button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<!-- Footer: info (left) + controls (right) on one compact row -->
	<div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-surface-200 bg-surface-50 p-3 dark:border-surface-700 dark:bg-surface-800">
		<TablePagination
			bind:currentPage
			bind:rowsPerPage
			{pagesCount}
			totalItems={filteredFiles.length}
			onUpdatePage={(p: number) => currentPage = p}
			onUpdateRowsPerPage={(r: number) => { rowsPerPage = r; currentPage = 1; }}
		/>
	</div>
</AdminCard>
