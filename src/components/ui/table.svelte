<!--
@file src/components/ui/table.svelte
@component
**SveltyCMS Table — WCAG 3.0 Ready**

Full-featured data table with sorting, selection (checkboxes), row expansion,
pagination, density control, virtual scrolling for large datasets, loading
placeholders, and empty state.

### Props
- `data` (any[]): Row data array.
- `columns` (Column[]): Array of { key, label, sortable?, class?, width? }.
- `sortKey` / `sortOrder` (string, 'asc'|'desc'): Bindable sort state.
- `selectable` (boolean): Enable row checkboxes with select all.
- `selectedIds` (Set<any>): Bindable selected row IDs.
- `loading` (boolean): Show placeholder loading rows.
- `density` ('compact' | 'normal' | 'comfortable'): Row density.
- `totalItems` / `currentPage` / `rowsPerPage`: Pagination state.
- `virtualScroll` (boolean): Enable virtual scrolling for 100+ row performance.
- `virtualHeight` (number): Scroll container height in px (default: 500).
- `header` / `footer` / `cell` / `row` / `expand` (Snippet): Custom render slots.
- `onrowclick` / `onselect` (function): Event callbacks.

### Accessibility (WCAG 3.0)
- Semantic `<table>` preserved in both normal and virtual modes
- `role="grid"` with `aria-rowcount` for screen readers
- Spacer rows use `aria-hidden="true"`
- Sortable columns announce via `aria-sort`
- Select all checkbox with indeterminate state

### Features:
- virtual scrolling (scroll-driven, 10-row overscan) for 500+ row perf
- sortable columns with direction indicator
- multi-select with select-all indeterminate state
- row expansion with expand snippet
- pagination integration via Pagination subcomponent
- loading placeholder rows (5 shimmer placeholders)
- full Svelte 5 runes: $props, $bindable, $derived, $state
-->

<script lang="ts">
import { cn } from '@utils/cn';
import type { Snippet } from 'svelte';
import Pagination from './table/pagination.svelte';
import { getThemeContext } from './theme-context.svelte';

interface Column {
    key: string;
    label: string;
    sortable?: boolean;
    class?: string;
    width?: string;
}

interface Props {
    data: any[];
    columns: Column[];
    sortKey?: string;
    sortOrder?: 'asc' | 'desc';
    selectable?: boolean;
    selectedIds?: Set<any>;
    loading?: boolean;
    density?: 'compact' | 'normal' | 'comfortable';
    class?: string;
    totalItems?: number;
    currentPage?: number;
    rowsPerPage?: number;
    // Snippets
    header?: Snippet;
    footer?: Snippet;
    cell?: Snippet<[{ row: any, column: Column }]>;
    row?: Snippet<[{ row: any, index: number }]>;
    expand?: Snippet<[{ row: any }]>;
    // Events
    onrowclick?: (row: any) => void;
    onselect?: (selectedIds: Set<any>) => void;
    // Virtual scrolling
    virtualScroll?: boolean;
    virtualHeight?: number;
}

let {
    data = [],
    columns = [],
    sortKey = $bindable(),
    sortOrder = $bindable('asc'),
    selectable = false,
    selectedIds = $bindable(new Set()),
    loading = false,
    density = $bindable(undefined as 'compact' | 'normal' | 'comfortable' | undefined),
    class: className,
    totalItems = 0,
    currentPage = $bindable(1),
    rowsPerPage = $bindable(10),
    header,
    footer,
    cell,
    row: rowSnippet,
    expand,
    onrowclick,
    onselect,
    virtualScroll = false,
    virtualHeight = 500
}: Props = $props();

const theme = getThemeContext();

// Effective density: explicit prop wins, falls back to theme context, then 'normal'
const effectiveDensity = $derived(
    density ?? (
        theme
            ? (theme.density === 'compact' ? 'compact' as const
                : theme.density === 'spacious' ? 'comfortable' as const
                : 'normal' as const)
            : 'normal' as const
    )
);

function handleSort(key: string) {
    if (sortKey === key) sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    else { sortKey = key; sortOrder = 'asc'; }
}

function toggleSelectAll() {
    if (selectedIds.size === data.length) selectedIds.clear();
    else data.forEach(row => selectedIds.add(row._id || row.id));
    onselect?.(selectedIds);
}

function toggleSelectRow(id: any) {
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    onselect?.(selectedIds);
}

const allSelected = $derived(data.length > 0 && selectedIds.size === data.length);
const someSelected = $derived(selectedIds.size > 0 && selectedIds.size < data.length);

const densityClass = $derived.by(() => {
    switch(effectiveDensity) {
        case 'compact': return 'p-2 text-xs';
        case 'comfortable': return 'p-6 text-base';
        default: return 'p-4 text-sm';
    }
});

// ── Virtual scrolling ──
const ROW_HEIGHTS: Record<string, number> = { compact: 36, normal: 48, comfortable: 64 };
const VIRTUAL_OVERSCAN = 10;

let virtualScrollTop = $state(0);
let scrollContainer = $state<HTMLDivElement | null>(null);

const rowHeight = $derived(ROW_HEIGHTS[effectiveDensity] ?? 48);
const virtualVisibleStart = $derived(Math.max(0, Math.floor(virtualScrollTop / rowHeight) - VIRTUAL_OVERSCAN));
const virtualVisibleEnd = $derived(Math.min(data.length, Math.ceil((virtualScrollTop + virtualHeight) / rowHeight) + VIRTUAL_OVERSCAN));
const virtualData = $derived(data.slice(virtualVisibleStart, virtualVisibleEnd));
const virtualTopSpacer = $derived(virtualVisibleStart * rowHeight);
const virtualBottomSpacer = $derived((data.length - virtualVisibleEnd) * rowHeight);

function onVirtualScroll() {
    if (scrollContainer) virtualScrollTop = scrollContainer.scrollTop;
}
</script>

<div class={cn(
    'w-full flex flex-col rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-xl overflow-hidden transition-all duration-300',
    className
)}>
    {#if header}
        <div class="bg-surface-50 dark:bg-surface-950/20 border-b border-surface-200 dark:border-surface-800">
            {@render header()}
        </div>
    {/if}

    <div class="overflow-x-auto relative {virtualScroll ? '' : 'min-h-75'}">
        {#if virtualScroll && !loading && data.length > 0}
            <!-- Virtual scrolling mode -->
            <div
                bind:this={scrollContainer}
                class="overflow-y-auto"
                style="height: {virtualHeight}px"
                onscroll={onVirtualScroll}
                role="grid"
                aria-rowcount={data.length}
                aria-colcount={columns.length + (selectable ? 1 : 0)}
            >
                <table class="w-full text-start border-collapse min-w-full table-fixed">
                    <thead class="sticky top-0 z-10">
                        <tr class="bg-surface-100/90 dark:bg-surface-800/90 backdrop-blur-md border-b border-surface-200 dark:border-surface-800">
                            {#if selectable}
                                <th class="w-12 p-4">
                                    <input type="checkbox" class="size-4 rounded border-surface-300 dark:border-surface-600 accent-primary-500 cursor-pointer transition-all"
                                        checked={allSelected} indeterminate={someSelected} onchange={toggleSelectAll} aria-label="select-all-rows" />
                                </th>
                            {/if}
                            {#each columns as col (col.key)}
                                <th class={cn('font-bold uppercase tracking-widest text-[10px] text-surface-700 dark:text-surface-200 select-none transition-colors', densityClass, col.sortable && 'cursor-pointer hover:text-tertiary-500 dark:text-primary-500', col.class)}
                                    style={col.width ? `width: ${col.width}` : ''}
                                    aria-sort={sortKey === col.key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
                                    onclick={() => col.sortable && handleSort(col.key)}>
                                    <div class="flex items-center gap-2">
                                        <span>{col.label}</span>
                                        {#if col.sortable && sortKey === col.key}
                                            <iconify-icon icon={sortOrder === 'asc' ? 'mingcute:arrow-up-line' : 'mingcute:arrow-down-line'}
                                                class="text-tertiary-500 dark:text-primary-500 animate-in fade-in zoom-in duration-300"></iconify-icon>
                                        {/if}
                                    </div>
                                </th>
                            {/each}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
                        <!-- Top spacer for virtual scroll -->
                        <tr aria-hidden="true" style="height: {virtualTopSpacer}px"></tr>

                        {#each virtualData as row, vi (row._id || row.id || vi)}
                            {const index = virtualVisibleStart + vi}
                            {#if rowSnippet}
                                {@render rowSnippet({ row, index })}
                            {:else}
                                <tr class={cn('group transition-all duration-200 hover:bg-tertiary-500  dark:hover:bg-tertiary-500 dark:bg-primary-500',
                                    selectedIds.has(row._id || row.id) && 'bg-tertiary-500 dark:bg-primary-500', onrowclick && 'cursor-pointer')}
                                    onclick={() => onrowclick?.(row)}
                                    onkeydown={(e) => {
                                        if (e.key === 'Enter') onrowclick?.(row);
                                        if (e.key === ' ') { e.preventDefault(); toggleSelectRow(row._id || row.id); }
                                    }}>
                                    {#if selectable}
                                        <td class="p-4" onclick={(e) => e.stopPropagation()}>
                                            <input type="checkbox" class="size-4 rounded border-surface-300 accent-primary-500 cursor-pointer transition-all hover:scale-110"
                                                checked={selectedIds.has(row._id || row.id)}
                                                onchange={() => toggleSelectRow(row._id || row.id)}
                                                aria-label={`select-row-${index + 1}`} />
                                        </td>
                                    {/if}
                                    {#each columns as col (col.key)}
                                        <td class={cn('text-surface-700 dark:text-surface-300 font-medium whitespace-nowrap overflow-hidden text-ellipsis', densityClass, col.class)}>
                                            {#if cell}{@render cell({ row, column: col })}{:else}{row[col.key] ?? '-'}{/if}
                                        </td>
                                    {/each}
                                </tr>
                            {/if}
                            {#if expand}
                                <tr class="bg-surface-50/30 dark:bg-surface-800/20">
                                    <td colspan={columns.length + (selectable ? 1 : 0)}>{@render expand({ row })}</td>
                                </tr>
                            {/if}
                        {/each}

                        <!-- Bottom spacer for virtual scroll -->
                        <tr aria-hidden="true" style="height: {virtualBottomSpacer}px"></tr>
                    </tbody>
                </table>
            </div>
        {:else}
            <!-- Normal (non-virtualized) table -->
            <table class="w-full text-start border-collapse min-w-full table-fixed">
                <thead class="sticky top-0 z-10">
                    <tr class="bg-surface-100/90 dark:bg-surface-800/90 backdrop-blur-md border-b border-surface-200 dark:border-surface-800">
                        {#if selectable}
                            <th class="w-12 p-4">
                                <input type="checkbox" class="size-4 rounded border-surface-300 dark:border-surface-600 accent-primary-500 cursor-pointer transition-all"
                                    checked={allSelected} indeterminate={someSelected} onchange={toggleSelectAll} aria-label="select-all-rows" />
                            </th>
                        {/if}
                        {#each columns as col (col.key)}
                            <th class={cn('font-bold uppercase tracking-widest text-[10px] text-surface-700 dark:text-surface-200 select-none transition-colors', densityClass, col.sortable && 'cursor-pointer hover:text-tertiary-500 dark:text-primary-500', col.class)}
                                style={col.width ? `width: ${col.width}` : ''}
                                aria-sort={sortKey === col.key ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
                                onclick={() => col.sortable && handleSort(col.key)}>
                                <div class="flex items-center gap-2">
                                    <span>{col.label}</span>
                                    {#if col.sortable && sortKey === col.key}
                                        <iconify-icon icon={sortOrder === 'asc' ? 'mingcute:arrow-up-line' : 'mingcute:arrow-down-line'}
                                            class="text-tertiary-500 dark:text-primary-500 animate-in fade-in zoom-in duration-300"></iconify-icon>
                                    {/if}
                                </div>
                            </th>
                        {/each}
                    </tr>
                </thead>
                <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
                    {#if loading}
                        {#each Array(5) as _, i (i)}
                            <tr class="animate-pulse">
                                {#if selectable}<td class="p-4"><div class="size-4 bg-surface-200 dark:bg-surface-700 rounded-sm"></div></td>{/if}
                                {#each columns as _, ci (ci)}<td class={densityClass}><div class="h-4 w-full bg-surface-200 dark:bg-surface-700 rounded"></div></td>{/each}
                            </tr>
                        {/each}
                    {:else if data.length === 0}
                        <tr>
                            <td colspan={columns.length + (selectable ? 1 : 0)} class="p-20 text-center text-surface-400">
                                <div class="flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <iconify-icon icon="mingcute:box-line" class="text-6xl opacity-20"></iconify-icon>
                                    <p class="text-lg font-medium">No results found.</p>
                                    <p class="text-sm opacity-60">Try adjusting your filters or search terms.</p>
                                </div>
                            </td>
                        </tr>
                    {:else}
                        {#each data as row, index (row._id || row.id || Math.random())}
                            {#if rowSnippet}
                                {@render rowSnippet({ row, index })}
                            {:else}
                                <tr class={cn('group transition-all duration-200 hover:bg-tertiary-500 dark:bg-primary-500 dark:hover:bg-tertiary-500 ',
                                    selectedIds.has(row._id || row.id) && 'bg-tertiary-500 dark:bg-primary-500', onrowclick && 'cursor-pointer')}
                                    onclick={() => onrowclick?.(row)}
                                    onkeydown={(e) => {
                                        if (e.key === 'Enter') onrowclick?.(row);
                                        if (e.key === ' ') { e.preventDefault(); toggleSelectRow(row._id || row.id); }
                                    }}>
                                    {#if selectable}
                                        <td class="p-4" onclick={(e) => e.stopPropagation()}>
                                            <input type="checkbox" class="size-4 rounded border-surface-300 accent-primary-500 cursor-pointer transition-all hover:scale-110"
                                                checked={selectedIds.has(row._id || row.id)}
                                                onchange={() => toggleSelectRow(row._id || row.id)}
                                                aria-label={`select-row-${index + 1}`} />
                                        </td>
                                    {/if}
                                    {#each columns as col (col.key)}
                                        <td class={cn('text-surface-700 dark:text-surface-300 font-medium whitespace-nowrap overflow-hidden text-ellipsis', densityClass, col.class)}>
                                            {#if cell}{@render cell({ row, column: col })}{:else}{row[col.key] ?? '-'}{/if}
                                        </td>
                                    {/each}
                                </tr>
                            {/if}
                            {#if expand}
                                <tr class="bg-surface-50/30 dark:bg-surface-800/20">
                                    <td colspan={columns.length + (selectable ? 1 : 0)}>{@render expand({ row })}</td>
                                </tr>
                            {/if}
                        {/each}
                    {/if}
                </tbody>
            </table>
        {/if}
    </div>

    {#if footer}
        {@render footer()}
    {:else if totalItems > 0}
        <Pagination bind:currentPage bind:rowsPerPage {totalItems} />
    {/if}
</div>
