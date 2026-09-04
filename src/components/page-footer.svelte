<!-- 
@file src/components/page-footer.svelte
@component
**PageFooter component displaying collection name, creation and update dates**

@example
<PageFooter />

#### Props
- `collection` {object} - Collection object
-->

<script lang="ts">
	import { collections } from '@src/stores/collection-store.svelte';
	import { page } from '$app/state';
	import { formatDateTime } from '@utils/format-date';

	const { user } = page.data;

	const activeEntry = $derived(
		collections.activeValue as {
			createdAt?: string | number | Date;
			updatedAt?: string | number | Date;
		}
	);

	// Convert ISO date string to formatted date
	const dates = $derived({
		created: activeEntry?.createdAt
			? formatDateTime(activeEntry.createdAt, {
					year: 'numeric',
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit'
				})
			: '-',
		updated: activeEntry?.updatedAt
			? formatDateTime(activeEntry.updatedAt, {
					year: 'numeric',
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit'
				})
			: '-'
	});
</script>

<div class="grid grid-cols-2 items-center gap-x-2 border-t border-surface-500 py-2 text-[12px] leading-tight">
	<!-- Labels -->
	{#each Object.keys(dates) as key (key)}
		<div class="font-bold">
			<span class="capitalize">{key}</span>: <span class="font-normal text-surface-600 dark:text-surface-50">by {user?.username || 'Unknown'}</span>
		</div>
	{/each}

	<!-- Data -->
	{#each Object.values(dates) as value, index (index)}
		<div class="text-tertiary-500 dark:text-primary-500">{value}</div>
	{/each}
</div>
