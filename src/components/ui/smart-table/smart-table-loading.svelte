<!--
@file src/components/ui/smart-table/smart-table-loading.svelte
@component
**Skeleton loading state for Smart Table shell.**

### Props
- `rows` (number): Placeholder row count (default 5).
- `columns` (number): Placeholder column count (default 4).
-->

<script lang="ts">
	import { SMART_TABLE, SMART_TABLE_SCROLL, SMART_TABLE_TD, SMART_TABLE_TH, SMART_TABLE_THEAD } from './chrome';

	let {
		rows = 5,
		columns = 4
	}: {
		rows?: number;
		columns?: number;
	} = $props();

	const colKeys = $derived(Array.from({ length: Math.max(1, columns) }, (_, i) => i));
	const rowKeys = $derived(Array.from({ length: Math.max(1, rows) }, (_, i) => i));
</script>

<div class={SMART_TABLE_SCROLL} aria-busy="true" aria-live="polite" role="status">
	<span class="sr-only">Loading table data…</span>
	<table class={SMART_TABLE}>
		<thead class={SMART_TABLE_THEAD}>
			<tr>
				{#each colKeys as c (c)}
					<th class={SMART_TABLE_TH}>
						<div class="mx-auto h-3 w-16 animate-pulse rounded bg-surface-300/80 dark:bg-surface-700"></div>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each rowKeys as r (r)}
				<tr class="animate-pulse border-b border-surface-200/50 dark:border-surface-800">
					{#each colKeys as c (c)}
						<td class={SMART_TABLE_TD}>
							<div class="mx-auto h-4 w-full max-w-28 rounded bg-surface-200 dark:bg-surface-700"></div>
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
