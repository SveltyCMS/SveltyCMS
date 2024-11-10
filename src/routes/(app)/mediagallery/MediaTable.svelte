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

Key features:
- Responsive table layout for media items
- Sortable columns for name, size, type, and date
- Thumbnail preview for images
- Uses formatBytes for human-readable file sizes
- Implements constructMediaUrl for proper URL handling
- Pagination support (if implemented in parent component)
-->

<script lang="ts">
	// Utils
	import { formatBytes } from '@utils/utils';
	import { getMediaUrl } from '@utils/media/mediaUtils';
	import type { MediaBase } from '@utils/media/mediaModels';

	interface Props {
		filteredFiles?: MediaBase[];
		tableSize?: 'small' | 'medium' | 'large';
		ondeleteImage?: (file: MediaBase) => void;
	}

	let { filteredFiles = $bindable([]), tableSize, ondeleteImage = () => {} }: Props = $props();

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

<div class="table-container max-h-[calc(100vh-55px)] overflow-auto">
	<table class="table table-interactive table-hover">
		<thead class="bg-surface-100-800-token sticky top-0 text-tertiary-500 dark:text-primary-500">
			<tr class="divide-x divide-surface-400 border-b border-black dark:border-white">
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
						<button onclick={() => handleDelete(file)} class="variant-filled-primary btn btn-sm" aria-label="Delete"> Delete </button>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
