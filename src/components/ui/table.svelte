<!-- 
 @src/routes/api/cms.ts src/components/ui/table.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Table Primitive
-->

<script lang="ts">
import { cn } from '@utils/cn';
import type { Snippet } from 'svelte';
import Pagination from './table/pagination.svelte';

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
    // Pagination props
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
}

let { 
    data = [], 
    columns = [], 
    sortKey = $bindable(), 
    sortOrder = $bindable('asc'),
    selectable = false,
    selectedIds = $bindable(new Set()),
    loading = false,
    density = $bindable('normal'),
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
    onselect
}: Props = $props();

// --- METHODS ---
function handleSort(key: string) {
    if (sortKey === key) {
        sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        sortKey = key;
        sortOrder = 'asc';
    }
}

function toggleSelectAll() {
    if (selectedIds.size === data.length) {
        selectedIds.clear();
    } else {
        data.forEach(row => selectedIds.add(row._id || row.id));
    }
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
    switch(density) {
        case 'compact': return 'p-2 text-xs';
        case 'comfortable': return 'p-6 text-base';
        default: return 'p-4 text-sm';
    }
});
</script>

<div class={cn(
    'w-full flex flex-col rounded-2xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900 shadow-xl overflow-hidden transition-all duration-300',
    className
)}>
    <!-- Toolbar / Header Snippet -->
    {#if header}
        <div class="bg-surface-50 dark:bg-surface-950/20 border-b border-surface-200 dark:border-surface-800">
            {@render header()}
        </div>
    {/if}

    <div class="overflow-x-auto relative min-h-[300px]">
        <table class="w-full text-left border-collapse min-w-full table-fixed">
            <thead class="sticky top-0 z-10">
                <tr class="bg-surface-100/90 dark:bg-surface-800/90 backdrop-blur-md border-b border-surface-200 dark:border-surface-800">
                    {#if selectable}
                        <th class="w-12 p-4">
                            <input 
                                type="checkbox" 
                                class="size-4 rounded border-surface-300 dark:border-surface-600 accent-primary-500 cursor-pointer transition-all"
                                checked={allSelected}
                                indeterminate={someSelected}
                                onchange={toggleSelectAll}
                            />
                        </th>
                    {/if}
                    
                    {#each columns as col}
                        <th 
                            class={cn(
                                'font-bold uppercase tracking-widest text-[10px] text-surface-700 dark:text-surface-200 select-none transition-colors',
                                densityClass,
                                col.sortable && 'cursor-pointer hover:text-primary-500',
                                col.class
                            )}
                            style={col.width ? `width: ${col.width}` : ''}
                            onclick={() => col.sortable && handleSort(col.key)}
                        >
                            <div class="flex items-center gap-2">
                                <span>{col.label}</span>
                                {#if col.sortable && sortKey === col.key}
                                    <iconify-icon 
                                        icon={sortOrder === 'asc' ? 'mingcute:arrow-up-line' : 'mingcute:arrow-down-line'}
                                        class="text-primary-500 animate-in fade-in zoom-in duration-300"
                                    ></iconify-icon>
                                {/if}
                            </div>
                        </th>
                    {/each}
                </tr>
            </thead>
            
            <tbody class="divide-y divide-surface-100 dark:divide-surface-800">
                {#if loading}
                    {#each Array(5) as _}
                        <tr class="animate-pulse">
                            {#if selectable}<td class="p-4"><div class="size-4 bg-surface-200 dark:bg-surface-700 rounded-sm"></div></td>{/if}
                            {#each columns as _}
                                <td class={densityClass}><div class="h-4 w-full bg-surface-200 dark:bg-surface-700 rounded-lg"></div></td>
                            {/each}
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
                            <tr 
                                class={cn(
                                    'group transition-all duration-200 hover:bg-primary-500/3 dark:hover:bg-primary-500/5',
                                    selectedIds.has(row._id || row.id) && 'bg-primary-500/5 dark:bg-primary-500/8',
                                    onrowclick && 'cursor-pointer'
                                )}
                                onclick={() => onrowclick?.(row)}
                            >
                                {#if selectable}
                                    <td class="p-4" onclick={(e) => e.stopPropagation()}>
                                        <input 
                                            type="checkbox" 
                                            class="size-4 rounded border-surface-300 accent-primary-500 cursor-pointer transition-all hover:scale-110"
                                            checked={selectedIds.has(row._id || row.id)}
                                            onchange={() => toggleSelectRow(row._id || row.id)}
                                        />
                                    </td>
                                {/if}
                                
                                {#each columns as col}
                                    <td class={cn('text-surface-700 dark:text-surface-300 font-medium whitespace-nowrap overflow-hidden text-ellipsis', densityClass, col.class)}>
                                        {#if cell}
                                            {@render cell({ row, column: col })}
                                        {:else}
                                            {row[col.key] ?? '-'}
                                        {/if}
                                    </td>
                                {/each}
                            </tr>
                        {/if}
                        {#if expand}
                            <tr class="bg-surface-50/30 dark:bg-surface-800/20">
                                <td colspan={columns.length + (selectable ? 1 : 0)}>
                                    {@render expand({ row })}
                                </td>
                            </tr>
                        {/if}
                    {/each}
                {/if}
            </tbody>
        </table>
    </div>

    <!-- Pagination / Footer Snippet -->
    {#if footer}
        {@render footer()}
    {:else if totalItems > 0}
        <Pagination 
            bind:currentPage 
            bind:rowsPerPage 
            {totalItems} 
        />
    {/if}
</div>
