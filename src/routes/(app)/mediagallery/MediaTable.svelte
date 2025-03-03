<!--
@file src/routes/(app)/mediagallery/MediaTable.svelte
@component
**Table view component for the media gallery. Displays media items in a responsive table layout with sortable columns**

```tsx
<MediaTable filteredFiles={filteredFiles} tableSize="small" />
```
#### Props
- `filteredFiles: MediaBase[]`: An array of media items to be displayed in the table view.
- `tableSize: 'small' | 'medium' | 'large'`: The size of the table layout to be used.
- `ondeleteImage?: (file: MediaBase) => void`: An optional callback function to handle image deletion.
- `onSelectionChange?: (selectedFiles: MediaBase[]) => void`: An optional callback function to handle selection changes.

Key features:
- Responsive table layout for media items
- Sortable columns for name, size, type, and date
- Thumbnail preview for images
- Uses formatBytes for human-readable file sizes
- Implements constructMediaUrl for proper URL handling
- Pagination support (if implemented in parent component)
- Selection support with callback function
-->

<script lang="ts">
	// Utils
	import { formatBytes } from '@utils/utils';
	import { getMediaUrl } from '@utils/media/mediaUtils';
	import type { MediaBase } from '@utils/media/mediaModels';

	// Components
	import TablePagination from '@components/system/table/TablePagination.svelte';
	import TableFilter from '@components/system/table/TableFilter.svelte';
	import TableIcons from '@components/system/table/TableIcons.svelte';

	interface Props {
		filteredFiles?: MediaBase[];
		tableSize?: 'small' | 'medium' | 'large';
		ondeleteImage?: (file: MediaBase) => void;
		onSelectionChange?: (selectedFiles: MediaBase[]) => void;
	}

	let { filteredFiles = $bindable([]), tableSize, ondeleteImage = () => {}, onSelectionChange = () => {} }: Props = $props();

	// Filter state
	let globalSearchValue = $state('');
	let filterShow = $state(false);
	let columnShow = $state(false);
	let density = $state('normal');

	// Selection state
	let selectedFiles = $state<Set<string>>(new Set());

	function handleSelection(file: MediaBase, checked: boolean) {
		if (checked) {
			selectedFiles.add(file.name);
		} else {
			selectedFiles.delete(file.name);
		}
		onSelectionChange(filteredFiles.filter((f) => selectedFiles.has(f.name)));
	}

	// Pagination state
	let currentPage = $state(1);
	let rowsPerPage = $state(10);
	let pagesCount = $derived(Math.ceil(filteredFiles.length / rowsPerPage));
	let paginatedFiles = $derived(filteredFiles.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage));

	function handleDelete(file: MediaBase) {
		ondeleteImage(file);
	}

	// Sorting functionality
	let sortColumn = $state('name');
	let sortOrder = $state(1); // 1 for ascending, -1 for descending

	function sort(column: keyof Pick<MediaBase, 'name' | 'size' | 'type'>) {
		if (sortColumn === column) {
			sortOrder *= -1;
		} else {
			sortColumn = column;
			sortOrder = 1;
		}

		filteredFiles = filteredFiles.sort((a, b) => {
			if (column === 'size') {
				return (a[column] - b[column]) * sortOrder;
			} else {
				return String(a[column]).localeCompare(String(b[column])) * sortOrder;
			}
		});
	}
</script>

<!-- Header with Filter -->
<div class="mb-4 flex items-center justify-between">
	<h2 class="text-lg font-bold">Media Files</h2>

	<!-- TODO: move to +page.svelte -->
	<div class="flex items-center gap-2">
		<TableFilter bind:globalSearchValue bind:filterShow bind:columnShow bind:density />
	</div>
</div>

<div class="table-container max-h-[calc(100vh-120px)] overflow-auto">
	<table class="table table-interactive ">
		<thead class="bg-surface-100-900 sticky top-0 text-tertiary-500 dark:text-primary-500">
			<tr class="divide-x divide-surface-400 border-b border-black dark:border-white">
				<th class="w-10">Select</th>
				<th>Thumbnail</th>
				<th onclick={() => sort('name')}>
					Name {sortColumn === 'name' ? (sortOrder === 1 ? '▲' : '▼') : ''}
				</th>
				<th onclick={() => sort('size')}>
					Size {sortColumn === 'size' ? (sortOrder === 1 ? '▲' : '▼') : ''}
				</th>
				<th onclick={() => sort('type')}>
					Type {sortColumn === 'type' ? (sortOrder === 1 ? '▲' : '▼') : ''}
				</th>
				<th>Path</th>
				<th>Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each paginatedFiles as file}
				<tr class="divide-x divide-surface-400 border-b border-black dark:border-white">
					<td class="w-10">
						<TableIcons checked={selectedFiles.has(file.name)} onCheck={(checked) => handleSelection(file, checked)} />
					</td>
					<td>
						<img
							src={getMediaUrl(file, 'thumbnail')}
							alt={file.name}
							class={`relative -top-4 left-0 ${tableSize === 'small' ? 'h-32 w-auto' : tableSize === 'medium' ? 'h-48 w-44' : 'h-80 w-80'}`}
						/>
					</td>
					<td>{file.name}</td>
					<td>{formatBytes(file.size)}</td>
					<td>{file.type || 'Unknown'}</td>
					<td>{file.path}</td>
					<td>
						<button onclick={() => handleDelete(file)} class="preset-filled-primary-500 btn btn-sm" aria-label="Delete"> Delete </button>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<!-- Pagination -->
<div
	class="bg-surface-100-900 sticky bottom-0 left-0 right-0 mt-2 flex flex-col items-center justify-center px-2 py-2 md:flex-row md:justify-between md:p-4"
>
	<TablePagination
		{currentPage}
		{pagesCount}
		{rowsPerPage}
		rowsPerPageOptions={[5, 10, 25, 50, 100]}
		totalItems={filteredFiles.length}
		onUpdatePage={(page) => {
			currentPage = page;
		}}
		onUpdateRowsPerPage={(rows) => {
			rowsPerPage = rows;
			currentPage = 1;
		}}
	/>
</div>
