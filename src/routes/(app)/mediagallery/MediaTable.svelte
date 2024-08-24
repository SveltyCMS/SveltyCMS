<!--
@file src/routes/(app)/mediagallery/MediaTable.svelte
@description Table view component for the media gallery. Displays media items in a responsive table layout with sortable columns.
Key features:
- Responsive table layout for media items
- Sortable columns for name, size, type, and date
- Thumbnail preview for images
- Uses formatBytes for human-readable file sizes
- Implements constructMediaUrl for proper URL handling
- Pagination support (if implemented in parent component)
-->

<script lang="ts">
	import { formatBytes } from '@src/utils/utils';
	import { getMediaUrl } from '@src/utils/media';
	import { createEventDispatcher } from 'svelte';

	export let filteredFiles;
	export let tableSize;

	const dispatch = createEventDispatcher();

	function handleDelete(file) {
		dispatch('deleteImage', file);
	}

	// Sorting functionality
	let sortColumn = 'name';
	let sortOrder = 1; // 1 for ascending, -1 for descending

	function sort(column) {
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
				return a[column].localeCompare(b[column]) * sortOrder;
			}
		});
	}
</script>

<div class="table-container max-h-[calc(100vh-55px)] overflow-auto">
	<table class="table table-interactive table-hover">
		<thead class="bg-surface-100-800-token sticky top-0 text-tertiary-500 dark:text-primary-500">
			<tr class="divide-x divide-surface-400 border-b border-black dark:border-white">
				<th>Thumbnail</th>
				<th on:click={() => sort('name')}>
					Name {sortColumn === 'name' ? (sortOrder === 1 ? '▲' : '▼') : ''}
				</th>
				<th on:click={() => sort('size')}>
					Size {sortColumn === 'size' ? (sortOrder === 1 ? '▲' : '▼') : ''}
				</th>
				<th on:click={() => sort('type')}>
					Type {sortColumn === 'type' ? (sortOrder === 1 ? '▲' : '▼') : ''}
				</th>
				<th>Path</th>
				<th>Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each filteredFiles as file}
				<tr class="divide-x divide-surface-400">
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
						<button class="variant-filled-primary btn btn-sm" on:click={() => handleDelete(file)}> Delete </button>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
