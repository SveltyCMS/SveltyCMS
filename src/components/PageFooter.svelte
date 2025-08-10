<!-- 
@file src/components/PageFooter.svelte
@component
**PageFooter component displaying collection name, creation and update dates**

@example
<PageFooter />

#### Props
- `collection` {object} - Collection object
-->

<script lang="ts">
	import { collection, collectionValue } from '@src/stores/collectionStore.svelte';
	import { page } from '$app/state';

	const { user } = page.data;

	// Convert ISO date string to formatted date
	let dates = $derived({
		created: collectionValue.value?.createdAt
			? new Date(collectionValue.value.createdAt).toLocaleDateString('en-US', {
					year: 'numeric',
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit'
				})
			: '-',
		updated: collectionValue.value?.updatedAt
			? new Date(collectionValue.value.updatedAt).toLocaleDateString('en-US', {
					year: 'numeric',
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit'
				})
			: '-'
	});

	let labels = $derived({
		created: `Created by ${user?.username || 'Unknown'}:`,
		updated: `Updated by ${user?.username || 'Unknown'}:`
	});
</script>

<div class="grid grid-cols-2 items-center gap-x-2 border-t border-surface-400 py-2 text-[12px] leading-tight">
	<!-- Labels -->
	{#each Object.keys(dates) as key}
		<div class="font-bold">
			<span class="capitalize">{key}</span>: <span class="font-normal text-surface-600 dark:text-surface-400">by {user?.username || 'Unknown'}</span>
		</div>
	{/each}

	<!-- Data -->
	{#each Object.values(dates) as value}
		<div class="text-tertiary-500 dark:text-primary-500">{value}</div>
	{/each}
</div>
