<!--
@file src/components/collection-display/smart-filter-row.svelte
@component
**Type-aware filter row for collection entry tables (WCAG 2.2 AA).**

Renders one control per visible column using `SmartFilterDefinition` types
from `createSmartFilter`. Supports text, select, date, number-range, and boolean.

### Props
- `headers` (TableHeader[]): Visible column headers (order matches table).
- `definitions` (SmartFilterDefinition[]): Schema-derived control definitions.
- `filters` (Record<string, string>): Current filter values by field id.
- `activeFilters` (array): Active filter chips for badge bar.
- `onFilterChange` (fn): Called when a control value changes.
- `onClearAll` (fn): Clear every active filter.
- `onClearFilter` (fn): Clear a single filter by id.
- `showClearInFirstCell` (boolean): Show clear-all button in the checkbox column.

### Features:
- widget-aware inputs (select/date/number/boolean/text)
- active filter badges with dismiss buttons
- accessible labels and live region for active count
- number-range min/max with adapter-agnostic `min:max` encoding
-->

<script lang="ts">
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import FloatingInput from '@components/ui/floating-input.svelte';
	import Select from '@components/ui/select.svelte';
	import type { TableHeader } from '@src/content/types';
	import {
		encodeNumberRange,
		parseNumberRange,
		type FilterControlType,
		type SmartFilterDefinition
	} from '@utils/collection-filter-defs';

	interface ActiveFilterChip {
		id: string;
		label: string;
		value: string;
		type: FilterControlType;
		displayValue: string;
	}

	interface Props {
		headers: TableHeader[];
		definitions: SmartFilterDefinition[];
		filters: Record<string, string>;
		activeFilters?: ActiveFilterChip[];
		onFilterChange: (id: string, value: string) => void;
		onClearAll: () => void;
		onClearFilter?: (id: string) => void;
		showClearInFirstCell?: boolean;
	}

	let {
		headers,
		definitions,
		filters,
		activeFilters = [],
		onFilterChange,
		onClearAll,
		onClearFilter,
		showClearInFirstCell = true
	}: Props = $props();

	const definitionMap = $derived.by(() => {
		const map = new Map<string, SmartFilterDefinition>();
		for (const def of definitions) {
			map.set(def.id, def);
		}
		return map;
	});

	function defFor(header: TableHeader): SmartFilterDefinition | undefined {
		const name = header.name || '';
		return definitionMap.get(name);
	}

	function currentValue(header: TableHeader): string {
		const name = header.name || '';
		return filters[name] ?? '';
	}

	function handleNumberPart(header: TableHeader, part: 'min' | 'max', raw: string) {
		const name = header.name || '';
		const current = parseNumberRange(filters[name] ?? '');
		const next = part === 'min' ? encodeNumberRange(raw, current.max) : encodeNumberRange(current.min, raw);
		onFilterChange(name, next);
	}

	const hasActive = $derived(activeFilters.length > 0);
</script>

<!-- Active filter badges (above column inputs) -->
{#if hasActive}
	<tr class="border-b border-surface-200/80 dark:border-surface-700">
		<th colspan={headers.length + 1} class="!p-2">
			<div
				class="flex flex-wrap items-center gap-2"
				role="status"
				aria-live="polite"
				aria-label="{activeFilters.length} active filter{activeFilters.length === 1 ? '' : 's'}"
			>
				<span class="text-xs font-medium text-surface-600 dark:text-surface-300">
					{activeFilters.length} active filter{activeFilters.length === 1 ? '' : 's'}:
				</span>
				{#each activeFilters as chip (chip.id)}
					<Badge variant="tertiary" size="sm" class="gap-1 normal-case tracking-normal">
						<span class="font-semibold">{chip.label}:</span>
						<span>{chip.displayValue}</span>
						{#if onClearFilter}
							<button
								type="button"
								class="ms-0.5 inline-flex rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
								aria-label="Remove filter {chip.label}"
								onclick={() => onClearFilter(chip.id)}
							>
								<iconify-icon icon="material-symbols:close" width={14}></iconify-icon>
							</button>
						{/if}
					</Badge>
				{/each}
				<Button
					variant="ghost"
					size="sm"
					class="text-xs"
					onclick={onClearAll}
					aria-label="Clear all filters"
				>
					Clear all
				</Button>
			</div>
		</th>
	</tr>
{/if}

<tr class="dark:divide-surface-600">
	<th class="w-10">
		{#if showClearInFirstCell && hasActive}
			<Button
				variant="outline"
				onclick={onClearAll}
				aria-label="clear-all-filters"
				class="p-0! min-w-0"
				title="Clear all filters"
			>
				<iconify-icon icon="material-symbols:close" width={24}></iconify-icon>
			</Button>
		{/if}
	</th>

	{#each headers as header (header.id)}
		{@const def = defFor(header)}
		{@const type = def?.type ?? 'text'}
		{@const name = header.name || ''}
		{@const value = currentValue(header)}
		<th class="min-w-24 align-bottom">
			<div class="flex items-center justify-between gap-1">
				{#if type === 'select' || type === 'boolean'}
					<Select
						size="sm"
						variant="floating"
						label={`Filter ${def?.label ?? header.label}`}
						placeholder="All"
						allowEmptySelection={true}
						options={def?.options ?? []}
						value={value}
						onchange={(v) => onFilterChange(name, v)}
						class="w-full min-w-0"
					/>
				{:else if type === 'date'}
					<label class="flex w-full min-w-0 flex-col gap-0.5 text-start">
						<span class="sr-only">Filter {def?.label ?? header.label} by date</span>
						<input aria-label="Filter {def?.label ?? header.label}"
							type="date"
							class="h-8 w-full rounded border border-surface-200 bg-surface-50 px-2 text-xs dark:border-surface-700 dark:bg-surface-900 dark:text-primary-500"
							value={value}
							oninput={(e) => onFilterChange(name, (e.currentTarget as HTMLInputElement).value)}
						/>
					</label>
				{:else if type === 'numberRange'}
					{@const range = parseNumberRange(value)}
					<div class="flex w-full min-w-0 items-center gap-1" role="group" aria-label="Filter {def?.label ?? header.label} range">
						<input aria-label="{def?.label ?? header.label} minimum"
							type="number"
							inputmode="decimal"
							placeholder="Min"
							class="h-8 w-1/2 min-w-0 rounded border border-surface-200 bg-surface-50 px-1.5 text-xs dark:border-surface-700 dark:bg-surface-900 dark:text-primary-500"
							value={range.min}
							oninput={(e) => handleNumberPart(header, 'min', (e.currentTarget as HTMLInputElement).value)}
						/>
						<span class="text-surface-400" aria-hidden="true">–</span>
						<input aria-label="{def?.label ?? header.label} maximum"
							type="number"
							inputmode="decimal"
							placeholder="Max"
							class="h-8 w-1/2 min-w-0 rounded border border-surface-200 bg-surface-50 px-1.5 text-xs dark:border-surface-700 dark:bg-surface-900 dark:text-primary-500"
							value={range.max}
							oninput={(e) => handleNumberPart(header, 'max', (e.currentTarget as HTMLInputElement).value)}
						/>
					</div>
				{:else}
					<FloatingInput
						type="text"
						icon="material-symbols:search-rounded"
						label={`Filter ${def?.label ?? header.label}`}
						name={name}
						value={value}
						onInput={(v: string) => onFilterChange(name, v)}
						inputClass="text-xs dark:text-primary-500"
						textColor=""
						labelClass="dark:text-white"
					/>
				{/if}
			</div>
		</th>
	{/each}
</tr>
