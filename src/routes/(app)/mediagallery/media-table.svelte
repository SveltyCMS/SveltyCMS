<!--
@file src/routes/(app)/mediagallery/MediaTable.svelte
@component
**Table view component for the media gallery**
Features:
- Keyboard-accessible rows
- Sorting and filtering
- Multi-select integration
-->

<script lang="ts">
import AdminCard from '@components/admin-card.svelte';
import TablePagination from "@src/components/system/table/table-pagination.svelte";
import type { MediaBase, MediaImage } from "@utils/media/media-models";
import { formatBytes } from "@utils/utils";
import type { SvelteSet } from "svelte/reactivity";
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
	class="w-full overflow-hidden border border-surface-200 bg-white shadow-sm dark:border-surface-800 dark:bg-surface-900"
>
	<div class="max-h-[600px] overflow-x-auto w-full">
		<table class="w-full border-collapse text-sm">
			<thead class="sticky top-0 z-10 bg-surface-50 dark:bg-surface-800">
				<tr class="border-b border-surface-200 text-xs font-bold uppercase tracking-wider text-surface-500 dark:border-surface-800">
					<th class="w-12 text-center p-4">
						<iconify-icon icon="mdi:checkbox-marked-circle-outline" width="20"></iconify-icon>
					</th>
					<th class="w-20 p-4">Preview</th>
					<th class="p-4 text-start">Name</th>
					<th class="p-4 text-start">Type</th>
					<th class="p-4 text-start">Size</th>
					<th class="p-4 text-end">Actions</th>
				</tr>
			</thead>

			<tbody class="divide-y divide-surface-100 dark:divide-surface-800">
				{#each paginatedFiles as file (file._id || file.filename)}
					{const fileId = file._id?.toString() || file.filename}
					{const isSelected = selectedFiles.has(fileId)}

					<tr
						class="transition-colors cursor-pointer {isSelected ? 'bg-tertiary-500 dark:bg-primary-500/10 dark:bg-primary-500/5' : 'hover:bg-surface-50 dark:hover:bg-surface-800/50'}"
						onclick={() => handleRowClick(file)}
						onkeydown={(e) => handleKeyDown(e, file)}
						tabindex="0"
						aria-selected={isSelected}
					>
						<td class="p-4 text-center" onclick={(e) => e.stopPropagation()}>
							<Checkbox
								checked={isSelected}
								onchange={() => toggleSelection(file)}
								label="Select {file.filename}"
								size="sm"
							/>
						</td>
						<td class="p-2">
							<div class="w-12 h-12 rounded overflow-hidden bg-surface-100 dark:bg-surface-800 flex items-center justify-center">
								{#if file.type === 'image'}
									<img src={file.url} alt="" class="w-full h-full object-cover" />
								{:else}
									<iconify-icon icon="mdi:file-document-outline" width="24" class="opacity-40"></iconify-icon>
								{/if}
							</div>
						</td>
						<td class="p-4">
							<div class="flex flex-col">
								<span class="font-medium text-sm truncate max-w-[200px]" title={file.filename}>{file.filename}</span>
								<span class="text-[10px] opacity-50 font-mono truncate">{file.path}</span>
							</div>
						</td>
						<td class="p-4 text-xs opacity-70">
							<Badge preset="tonal" color="surface" class="uppercase">{file.mimeType.split('/')[1] || file.type}</Badge>
						</td>
						<td class="p-4 text-xs font-mono opacity-70">{formatBytes(file.size)}</td>
						<td class="p-4 text-end">
							<div class="flex justify-end gap-1">
								<Button variant="tertiary"
									onclick={(e: MouseEvent) => { e.stopPropagation(); onEditImage(file as MediaImage); }}
									aria-label="Edit"
								 class="p-0! min-w-0 hover: dark:">
									<iconify-icon icon="mdi:pencil" width="16"></iconify-icon>
								</Button>
								<Button variant="error"
									onclick={(e: MouseEvent) => { e.stopPropagation(); ondeleteImage(file); }}
									aria-label="Delete"
								 class="p-0! min-w-0 hover:">
									<iconify-icon icon="mdi:trash-can-outline" width="16"></iconify-icon>
								</Button>
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Footer -->
	<div class="p-4 bg-surface-50 dark:bg-surface-800 border-t border-surface-200 dark:border-surface-700">
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
