<!-- 
 @src/routes/api/cms.ts src/components/ui/table/pagination.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Pagination Primitive
-->

<script lang="ts">
import Button from '../button.svelte';

let {
    currentPage = $bindable(1),
    rowsPerPage = $bindable(10),
    totalItems = 0,
    pagesCount,
    rowsPerPageOptions = [5, 10, 25, 50, 100],
    onchange,
    onUpdatePage,
    onUpdateRowsPerPage
}: {
    currentPage?: number;
    rowsPerPage?: number;
    totalItems?: number;
    pagesCount?: number;
    rowsPerPageOptions?: number[];
    onchange?: () => void;
    onUpdatePage?: (page: number) => void;
    onUpdateRowsPerPage?: (rows: number) => void;
} = $props();

const computedPagesCount = $derived(pagesCount ?? Math.max(1, Math.ceil(totalItems / rowsPerPage)));
const startItem = $derived(totalItems === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1);
const endItem = $derived(Math.min(currentPage * rowsPerPage, totalItems));

function setPage(page: number) {
    if (page < 1 || page > computedPagesCount || page === currentPage) return;
    currentPage = page;
    onchange?.();
    onUpdatePage?.(page);
}
</script>

<div class="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 text-sm text-surface-600 dark:text-surface-400 border-t border-surface-200 dark:border-surface-800 bg-surface-50/30 dark:bg-surface-950/20">
    <div class="flex items-center gap-4">
        <span class="whitespace-nowrap">
            Showing <span class="font-bold text-surface-900 dark:text-surface-100">{startItem}</span> to <span class="font-bold text-surface-900 dark:text-surface-100">{endItem}</span> of <span class="font-bold text-surface-900 dark:text-surface-100">{totalItems}</span>
        </span>
        
        <div class="flex items-center gap-2">
            <span class="hidden sm:inline">Rows:</span>
            <select 
                bind:value={rowsPerPage}
                onchange={() => { 
                    currentPage = 1; 
                    onchange?.(); 
                    onUpdateRowsPerPage?.(rowsPerPage);
                }}
                class="bg-surface-100 dark:bg-surface-800 border-none rounded-lg py-1 px-2 text-xs font-bold focus:ring-1 focus:ring-primary-500 cursor-pointer"
            >
                {#each rowsPerPageOptions as option}
                    <option value={option}>{option}</option>
                {/each}
            </select>
        </div>
    </div>

    <div class="flex items-center gap-1">
        <Button 
            variant="ghost" 
            size="sm" 
            leadingIcon="mingcute:arrow-left-line" 
            disabled={currentPage === 1}
            onclick={() => setPage(currentPage - 1)}
            aria-label="Previous page"
        />
        
        <div class="flex items-center gap-1 px-2">
            <span class="font-bold text-primary-500">{currentPage}</span>
            <span class="opacity-50">/</span>
            <span>{computedPagesCount}</span>
        </div>

        <Button 
            variant="ghost" 
            size="sm" 
            leadingIcon="mingcute:arrow-right-line" 
            disabled={currentPage === computedPagesCount}
            onclick={() => setPage(currentPage + 1)}
            aria-label="Next page"
        />
    </div>
</div>
