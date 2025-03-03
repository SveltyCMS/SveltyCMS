<!-- 
@file src/components/PageFooter.svelte
@component
**PageFooter component displaying collection name, creation and update dates**

```tsx
<PageFooter />
```
#### Props
- `collection` {object} - Collection object
-->

<script lang="ts">
	import { collection, collectionValue } from '@src/stores/collectionStore.svelte';
	import { convertTimestampToDateString } from '@utils/utils';

	// Convert timestamp to Date string
	let dates = $derived({
		created: convertTimestampToDateString(Number(collectionValue.value?.createdAt) || 0),
		updated: convertTimestampToDateString(Number(collectionValue.value?.updatedAt) || 0)
	});
</script>

<h2 class="text-center text-sm! font-bold uppercase text-tertiary-500 dark:text-primary-500">
	{collection.value?.name} Info:
</h2>

<div class="grid grid-cols-2 items-center gap-x-2 pb-1 text-[12px] leading-tight">
	<!-- Labels -->
	{#each Object.keys(dates) as key}
		<div class="capitalize">{key}:</div>
	{/each}

	<!-- Data -->
	{#each Object.values(dates) as value}
		<div class="text-tertiary-500 dark:text-primary-500">{value}</div>
	{/each}
</div>
