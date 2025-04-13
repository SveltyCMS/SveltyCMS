<!--
@file src/components/PageFooter.svelte
@component
**PageFooter component displaying collection name, creation and update dates**

@example
<PageFooter />

#### Props
- `collection` {object} - Collection object

### Features
- Displays collection name
- Displays creation and update dates
-->

<script lang="ts">
	import { collection, collectionValue } from '@src/stores/collectionStore.svelte';
	import { convertTimestampToDateString } from '@utils/utils';

	// Convert timestamp to Date string
	let dates = $derived({
		created: collectionValue.value?.createdAt ? convertTimestampToDateString(Number(collectionValue.value.createdAt)) : 'Not yet created',
		updated: collectionValue.value?.updatedAt ? convertTimestampToDateString(Number(collectionValue.value.updatedAt)) : 'Not yet updated'
	});
</script>

<h2 class="text-tertiary-500 dark:text-primary-500 text-center text-sm! font-bold uppercase">
	{collection.value?.name ?? 'No Collection'} Info:
</h2>

<div class="grid grid-cols-2 items-center gap-x-2 pb-1 text-[12px] leading-tight">
	<!-- Labels -->
	{#each Object.keys(dates) as key}
		<div class="capitalize">{key}:</div>
	{/each}

	<!-- Dates -->
	{#each Object.values(dates) as value}
		<div class="text-tertiary-500 dark:text-primary-500">{value}</div>
	{/each}
</div>
