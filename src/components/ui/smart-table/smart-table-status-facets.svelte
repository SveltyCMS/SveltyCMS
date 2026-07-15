<!--
@file src/components/ui/smart-table/smart-table-status-facets.svelte
@component
**Status facet chips for collection lists (P1).**

### Props
- `facets` (Record<string, number>): Counts by status key.
- `active` (string): Currently selected status filter (or empty).
- `onSelect` (fn): Called with status value or '' to clear.
-->

<script lang="ts">
	import Badge from '@components/ui/badge.svelte';
	import { StatusTypes } from '@src/content/types';

	let {
		facets = {},
		active = '',
		onSelect
	}: {
		facets?: Record<string, number>;
		active?: string;
		onSelect: (status: string) => void;
	} = $props();

	const CHIP_ORDER = [
		{ key: StatusTypes.publish, label: 'Published', variant: 'success' as const },
		{ key: StatusTypes.draft, label: 'Draft', variant: 'surface' as const },
		{ key: StatusTypes.unpublish, label: 'Unpublished', variant: 'warning' as const },
		{ key: StatusTypes.schedule, label: 'Scheduled', variant: 'secondary' as const },
		{ key: StatusTypes.archive, label: 'Archived', variant: 'error' as const }
	];

	const total = $derived(Object.values(facets).reduce((a, b) => a + (Number(b) || 0), 0));
	const hasAny = $derived(total > 0 || Object.keys(facets).length > 0);
</script>

{#if hasAny}
	<div
		class="flex flex-wrap items-center gap-1.5 px-1 py-1"
		role="group"
		aria-label="Filter by status"
	>
		<button
			type="button"
			class="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors
				{!active
				? 'bg-tertiary-500 text-white dark:bg-primary-500'
				: 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-300'}"
			aria-pressed={!active}
			onclick={() => onSelect('')}
		>
			All{#if total > 0}<span class="ms-1 opacity-80">({total})</span>{/if}
		</button>
		{#each CHIP_ORDER as chip (chip.key)}
			{@const count = Number(facets[chip.key] ?? 0)}
			{#if count > 0 || active === chip.key}
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded-full transition-transform hover:scale-[1.02]
						{active === chip.key ? 'ring-2 ring-tertiary-500 dark:ring-primary-500' : ''}"
					aria-pressed={active === chip.key}
					aria-label="Filter {chip.label}: {count}"
					onclick={() => onSelect(active === chip.key ? '' : chip.key)}
				>
					<Badge variant={chip.variant} size="sm" class="normal-case tracking-normal">
						{chip.label}
						<span class="ms-0.5 opacity-80">({count})</span>
					</Badge>
				</button>
			{/if}
		{/each}
	</div>
{/if}
