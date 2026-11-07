<!--
@file src/components/collection-display/entry-list-card-grid.svelte
@description
Card-based responsive grid view for collection entries, supporting selection, keyboard parity, and quick edit.

@component
**EntryListCardGrid**

Features:
- Responsive grid layout (1 to 4 columns based on viewport)
- Keyboard parity (WCAG 2.1.1): Enter opens entry, Space toggles selection
- In-card status badge and top metadata projection with date formatting
- Inline SmartFilterRow when filter visibility is toggled on

@props
- `tableData` (CollectionEntry[]): Full current dataset for finding original entries.
- `visibleRows` (CollectionEntry[]): Virtualized / page-visible rows for display.
- `visibleTableHeaders` (TableHeader[]): Active visible table headers.
- `filterShow` (boolean): Whether the filter row is visible.
- `smartFilter` (any): Filter controller state and operations.
- `focusedRowIndex` (number): Currently keyboard-focused row index.
- `scrollContainerEl` (HTMLDivElement | null): Bound scroll container element.
- `isSelected` ((id: string) => boolean): Selection query predicate.
- `toggleSelect` ((id: string) => void): Selection toggle callback.
- `openEntryForEdit` ((entry: CollectionEntry) => void): Handler to open an entry in edit mode.
- `onFilterChange` ((name: string, val: string) => void): Filter change handler.
- `onClearAllFilters` (() => void): Clear all filters handler.
- `onClearFilter` ((id: string) => void): Clear single filter handler.
- `onOpenAdvanced` (() => void): Advanced filter modal opener.
- `advancedCount` (number): Active advanced filter clause count.
- `handleTableKeydown` ((e: KeyboardEvent) => void): Table keyboard navigation handler.
- `onVirtualScroll` (() => void): Virtual scroll handler.
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import { SMART_TABLE_SCROLL } from '@components/ui/smart-table/chrome';
	import Status from '@components/system/table/status.svelte';
	import type { CollectionEntry, TableHeader } from '@src/content/types';
	import { formatDisplayDate } from '@utils/date';
	import SmartFilterRow from './smart-filter-row.svelte';
	import type { SmartFilterApi } from './create-smart-filter.svelte';

	interface Props {
		tableData: CollectionEntry[];
		visibleRows: CollectionEntry[];
		visibleTableHeaders: TableHeader[];
		filterShow: boolean;
		smartFilter: SmartFilterApi;
		focusedRowIndex: number;
		scrollContainerEl?: HTMLDivElement | null;
		isSelected: (id: string) => boolean;
		toggleSelect: (id: string) => void;
		openEntryForEdit: (entry: CollectionEntry) => void;
		onFilterChange: (filterName: string, value: string) => void;
		onClearAllFilters: () => void;
		onClearFilter: (filterId: string) => void;
		onOpenAdvanced: () => void;
		advancedCount: number;
		handleTableKeydown: (e: KeyboardEvent) => void;
		onVirtualScroll: () => void;
	}

	let {
		tableData,
		visibleRows,
		visibleTableHeaders,
		filterShow,
		smartFilter,
		focusedRowIndex,
		scrollContainerEl = $bindable(null),
		isSelected,
		toggleSelect,
		openEntryForEdit,
		onFilterChange,
		onClearAllFilters,
		onClearFilter,
		onOpenAdvanced,
		advancedCount,
		handleTableKeydown,
		onVirtualScroll
	}: Props = $props();
</script>

<div
	bind:this={scrollContainerEl}
	onscroll={onVirtualScroll}
	class="{SMART_TABLE_SCROLL} max-h-none overflow-y-auto py-3"
	tabindex="0"
	role="grid"
	aria-label="Collection entries card grid"
	onkeydown={handleTableKeydown}
>
	{#if filterShow && visibleTableHeaders.length > 0}
		<div
			class="mb-3 p-2 rounded-xl border border-surface-500/30 bg-surface-500/10 dark:bg-surface-900"
		>
			<SmartFilterRow
				headers={visibleTableHeaders}
				definitions={smartFilter.definitions}
				filters={smartFilter.filters}
				activeFilters={smartFilter.activeFilters}
				{onFilterChange}
				onClearAll={onClearAllFilters}
				{onClearFilter}
				{onOpenAdvanced}
				{advancedCount}
			/>
		</div>
	{/if}

	{#if tableData.length > 0}
		<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
			{#each visibleRows as entry, index (entry._id)}
				{@const rowId = String(entry._id ?? '')}
				{@const rowSelected = isSelected(rowId)}
				{@const isFocused = focusedRowIndex === index}
				<div
					class="group relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 {rowSelected
						? 'border-primary-500 bg-primary-500/10 dark:bg-primary-500/20 shadow-xs'
						: 'border-(--admin-border-default) bg-(--admin-bg-card) hover:border-primary-500/50 hover:shadow-md'}"
					role="row"
					tabindex={isFocused ? 0 : -1}
					onclick={(e) => {
						const target = e.target as HTMLElement | null;
						if (target?.closest('button, input, a, [data-prevent-row-click]')) return;
						const originalEntry = tableData.find((item: CollectionEntry) => item._id === entry._id);
						if (originalEntry) void openEntryForEdit(originalEntry);
					}}
					onkeydown={(e) => {
						const target = e.target as HTMLElement | null;
						if (target?.closest('button, input, a, [data-prevent-row-click]')) return;
						if (e.key === 'Enter') {
							e.preventDefault();
							const originalEntry = tableData.find(
								(item: CollectionEntry) => item._id === entry._id
							);
							if (originalEntry) void openEntryForEdit(originalEntry);
						} else if (e.key === ' ') {
							e.preventDefault();
							toggleSelect(rowId);
						}
					}}
				>
					<!-- Top: Checkbox, Title/ID, Status -->
					<div class="flex items-start justify-between gap-2 border-b border-surface-500/20 pb-2.5">
						<div class="flex items-center gap-2 min-w-0" data-prevent-row-click>
							<Checkbox
								checked={rowSelected}
								onchange={() => toggleSelect(rowId)}
								label="Select entry {rowId}"
								hideLabel
							/>
							<span class="text-xs font-bold text-(--admin-text-body) truncate" dir="auto">
								{String(
									(entry as Record<string, unknown>)[visibleTableHeaders[0]?.name || ''] ||
										entry._id ||
										'Entry'
								)}
							</span>
						</div>
						<div data-prevent-row-click>
							<Status
								value={entry.status ||
									(entry as unknown as { raw_status?: string }).raw_status ||
									'draft'}
							/>
						</div>
					</div>

					<!-- Body: Key Fields -->
					<div class="my-3 space-y-1.5 text-xs text-(--admin-text-muted)">
						{#each visibleTableHeaders.slice(1, 5) as header (header.id)}
							{@const fieldName = (header as TableHeader).name || ''}
							{@const isDateField = fieldName === 'createdAt' || fieldName === 'updatedAt'}
							{@const rawValue = (entry as Record<string, unknown>)[fieldName]}
							{@const displayValue = isDateField
								? formatDisplayDate(rawValue as string) || '-'
								: String(rawValue ?? '-')}
							<div class="flex items-center justify-between gap-2">
								<span class="font-medium text-surface-500 capitalize truncate">{header.label}:</span
								>
								<span
									dir="auto"
									class="font-semibold text-(--admin-text-muted) truncate max-w-[60%]"
								>
									{displayValue}
								</span>
							</div>
						{/each}
					</div>

					<!-- Footer: Quick Actions -->
					<div
						class="flex items-center justify-between pt-2 border-t border-surface-500/20 text-xs text-surface-400"
					>
						<span class="text-[11px]">
							{formatDisplayDate((entry.updatedAt as string) || (entry.createdAt as string) || '')}
						</span>
						<Button
							variant="ghost"
							size="sm"
							class="text-xs gap-1 text-primary-600 dark:text-primary-400 p-1"
							onclick={() => {
								void openEntryForEdit(entry);
							}}
						>
							<iconify-icon icon="ic:round-edit" width="14"></iconify-icon>
							Edit
						</Button>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="p-8 text-center text-(--admin-text-muted)">No results found.</div>
	{/if}
</div>
