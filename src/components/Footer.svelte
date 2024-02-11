<script lang="ts">
	import { collection, entryData, mode } from '@src/stores/store';
	import { convertTimestampToDateString } from '@src/utils/utils';

	// Convert timestamp to Date string
	const dates = {
		created: convertTimestampToDateString($entryData.createdAt),
		updated: convertTimestampToDateString($entryData.updatedAt)
	};
</script>

{#if $mode !== 'view'}
	<h2 class="text-center !text-sm font-bold uppercase text-primary-500">
		{$collection?.name} Info:
	</h2>

	<div class="mb-1 grid grid-cols-2 items-center gap-x-2 text-[12px] leading-tight">
		<!-- Labels -->
		{#each Object.keys(dates) as key}
			<div class="capitalize">{key}:</div>
		{/each}
		<!-- Data -->
		{#each Object.values(dates) as value}
			<div class="text-primary-500">{value}</div>
		{/each}
	</div>
{/if}
