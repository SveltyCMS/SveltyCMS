<script lang="ts">
	import { formatBytes } from '@src/utils/utils';
	import { createEventDispatcher } from 'svelte';

	export let filteredFiles;
	export let tableSize;

	const dispatch = createEventDispatcher();

	function handleDelete(file) {
		dispatch('deleteImage', file);
	}
</script>

<div class="table-container max-h-[calc(100vh-55px)] overflow-auto">
	<table class="table table-interactive table-hover">
		<thead class="top-0 text-tertiary-500 dark:text-primary-500">
			<tr class="divide-x divide-surface-400 border-b border-black dark:border-white">
				<th>Image</th>
				<th>Name</th>
				<th>Size</th>
				<th>Hash</th>
				<th>Path</th>
			</tr>
		</thead>
		<tbody>
			{#each filteredFiles as file}
				<tr class="divide-x divide-surface-400">
					<td
						><img
							src={file.thumbnail.url}
							alt={file.thumbnail.name}
							class={`relative -top-4 left-0 ${tableSize === 'small' ? 'h-32 w-auto' : tableSize === 'medium' ? 'h-48 w-44' : 'h-80 w-80'}`}
						/></td
					>
					<td>{file.thumbnail.name}</td>
					<td>{formatBytes(file.size)}</td>
					<td>{file.hash}</td>
					<td>{file.path}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
