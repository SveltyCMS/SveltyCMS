<!--
@file src/components/ui/smart-table/smart-table-status-facets.svelte
@component
**Status facet chips for collection lists (P1).**

### Props
- `facets` (Partial<Record<string, number>>): Counts by status key (missing keys render as 0).
- `total` (number, optional): Authoritative row total for the current list predicate (`totalItems`). Falls back to the bucket sum when absent.
- `active` (string): Currently selected status filter (or empty).
- `onSelect` (fn): Called with status value or '' to clear.

### Visual contract
The ACTIVE chip carries the strongest fill (status variant, or the primary fill for
"All"); INACTIVE chips are neutral outlined pills with a `{hue}-500` status dot, so a
quiet row never reads as more important than the current selection.
-->

<script lang="ts">
	import Badge from '@components/ui/badge.svelte';
	import { StatusTypes } from '@src/content/status';

	let {
		facets = {},
		total,
		active = '',
		onSelect
	}: {
		facets?: Partial<Record<string, number>>;
		total?: number;
		active?: string;
		onSelect: (status: string) => void;
	} = $props();

	const CHIP_ORDER = [
		{
			key: StatusTypes.publish,
			label: 'Published',
			variant: 'primary' as const,
			dot: 'bg-primary-500'
		},
		{ key: StatusTypes.draft, label: 'Draft', variant: 'surface' as const, dot: 'bg-surface-500' },
		{
			key: StatusTypes.unpublish,
			label: 'Unpublished',
			variant: 'warning' as const,
			dot: 'bg-warning-500'
		},
		{
			key: StatusTypes.schedule,
			label: 'Scheduled',
			variant: 'secondary' as const,
			dot: 'bg-secondary-500'
		},
		{ key: StatusTypes.archive, label: 'Archived', variant: 'error' as const, dot: 'bg-error-500' }
	];

	const bucketSum = $derived(
		Object.values(facets).reduce((a: number, b) => a + (Number(b) || 0), 0)
	);
	// "All" is the LIST's own row count. The five buckets come from a separately
	// cached facet query that does not carry the active search/filters, so summing
	// them disagreed with the rows (and kept counting rows the list no longer shows).
	// `total` is the same predicate set the rows were counted with.
	const allCount = $derived(typeof total === 'number' ? total : bucketSum);
	// Empty collections often arrive as `{ publish: 0, draft: 0, … }` — keys with no
	// entries. Rendering the group then showed a lone "ALL" chip above an empty
	// table, which looked like an unexplained control. Hide it unless there is
	// something to filter (or an active status filter to clear).
	const hasAny = $derived(allCount > 0 || bucketSum > 0 || Boolean(active));
</script>

{#if hasAny}
	<div class="flex flex-wrap items-center gap-1.5 py-1" role="group" aria-label="Filter by status">
		<button
			type="button"
			class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors
				{!active
				? 'bg-primary-500 text-white'
				: 'border border-surface-500/30 bg-transparent text-surface-600 hover:bg-surface-500/10 dark:border-surface-500/40 dark:text-surface-300 dark:hover:bg-surface-800'}"
			aria-pressed={!active}
			aria-label="All statuses"
			title="Show entries with any status"
			onclick={() => onSelect('')}
		>
			All{#if allCount > 0}<span class="ms-1 opacity-80">({allCount})</span>{/if}
		</button>
		{#each CHIP_ORDER as chip (chip.key)}
			{@const count = Number(facets[chip.key] ?? 0)}
			{#if count > 0 || active === chip.key}
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded-full transition-transform hover:scale-[1.02]
						{active === chip.key ? 'opacity-100 ring-2 ring-tertiary-500 dark:ring-primary-500' : 'opacity-90'}"
					aria-pressed={active === chip.key}
					aria-label="Filter {chip.label}: {count}"
					onclick={() => onSelect(active === chip.key ? '' : chip.key)}
				>
					{#if active === chip.key}
						<Badge variant={chip.variant} size="sm" class="normal-case tracking-normal">
							{chip.label}
							<span class="ms-0.5 opacity-80">({count})</span>
						</Badge>
					{:else}
						<!-- Inactive chips are neutral: the status colour stays as a dot only,
						     so the active chip is unambiguously the strongest pill in the row. -->
						<Badge variant="outline" size="sm" class="normal-case tracking-normal">
							<span class="inline-flex items-center gap-1">
								<span class="h-1.5 w-1.5 rounded-full {chip.dot}" aria-hidden="true"></span>
								{chip.label}
								<span class="ms-0.5 opacity-80">({count})</span>
							</span>
						</Badge>
					{/if}
				</button>
			{/if}
		{/each}
	</div>
{/if}
