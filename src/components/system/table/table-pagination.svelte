<!--
@file src/components/system/table/table-pagination.svelte
@component
**Optimized table pagination component for displaying pagination controls in a CMS.**

@Example
<TablePagination currentPage={1} pagesCount={1} rowsPerPage={10} rowsPerPageOptions={[5, 10, 25, 50, 100, 500]} totalItems={0} />

#### Props
- `currentPage` {number}: The current page number (default: 1)
- `pagesCount` {number}: The total number of pages (default: 1)
- `rowsPerPage` {number}: The number of rows per page (default: 10)
- `rowsPerPageOptions` {number[]}: An array of options for rows per page (default: [5, 10, 25, 50, 100, 500])
- `totalItems` {number}: The total number of items in the table (default: 0)
- `onUpdatePage` {(page: number) => void}: Event handler for updating the current page
- `onUpdateRowsPerPage` {(rows: number) => void}: Event handler for updating the number of rows per page

### Features
- Provides pagination controls for navigating through table data
- Displays current page, total pages, and item range
- Allows selection of rows per page from predefined options
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { entrylist_items, entrylist_of, entrylist_page, entrylist_rows, entrylist_showing } from '@src/paraglide/messages';

	// Props with default values
	let {
		currentPage = $bindable(),
		pagesCount = 1,
		rowsPerPage = $bindable(),
		rowsPerPageOptions = [5, 10, 25, 50, 100, 500],
		totalItems = 0,
		onUpdatePage,
		onUpdateRowsPerPage
	} = $props();

	// Derived pagesCount if not provided
	const computedPagesCount = $derived.by(() => {
		if (pagesCount && pagesCount > 0) {
			return pagesCount;
		}
		if (rowsPerPage > 0) {
			return Math.ceil(totalItems / rowsPerPage);
		}
		return 1;
	});

	const isFirstPage = $derived(currentPage === 1);
	const isLastPage = $derived(currentPage === computedPagesCount);

	// Calculate start and end item numbers for the current page
	const startItem = $derived(totalItems === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1);
	const endItem = $derived(totalItems === 0 ? 0 : Math.min(currentPage * rowsPerPage, totalItems));

	// Go to page - IMMEDIATE
	function goToPage(page: number) {
		if (page >= 1 && page <= computedPagesCount && page !== currentPage) {
			currentPage = page;
			onUpdatePage?.(page);
		}
	}

	// Update rows per page with immediate reset to page 1
	function updateRowsPerPage(rows: number) {
		// Immediately update the bound value to ensure UI consistency
		rowsPerPage = rows;
		// Call the callback to handle the change
		onUpdateRowsPerPage?.(rows);
	}

	const navButtonClass =
		'h-8 w-9 rounded-none p-0! min-w-0 text-surface-600 hover:bg-surface-200 dark:text-surface-300 dark:hover:bg-surface-700';
</script>

<!-- Pagination info -->
<div
	class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-surface-500 dark:text-surface-400 md:text-sm"
	role="status"
	aria-live="polite"
>
	<span>
		{entrylist_page()}
		<span class="font-semibold text-tertiary-500 dark:text-primary-500">{currentPage}</span>
		{entrylist_of()}
		<span class="font-semibold text-tertiary-500 dark:text-primary-500">{computedPagesCount}</span>
	</span>

	<span class="hidden h-3 w-px bg-surface-300 dark:bg-surface-600 sm:inline-block" aria-hidden="true"></span>

	<span aria-label="Current items shown">
		{#if totalItems > 0}
			{entrylist_showing()}
			<span class="font-semibold text-tertiary-500 dark:text-primary-500">{startItem}</span>–<span
				class="font-semibold text-tertiary-500 dark:text-primary-500">{endItem}</span
			>
			{entrylist_of()}
			<span class="font-semibold text-tertiary-500 dark:text-primary-500">{totalItems}</span>
			{entrylist_items()}
		{:else}
			{entrylist_showing()} 0 {entrylist_of()} 0 {entrylist_items()}
		{/if}
	</span>
</div>

<!-- Pagination controls -->
<nav class="flex items-center" aria-label="Table pagination">
	<div class="inline-flex items-center overflow-hidden rounded-md border border-surface-300 dark:border-surface-600">
		<!-- First page button -->
		<SystemTooltip title="First Page">
			<Button
				variant="ghost"
				onclick={() => goToPage(1)}
				disabled={isFirstPage}
				type="button"
				aria-label="Go to first page"
				aria-disabled={isFirstPage}
				class="{navButtonClass} border-e border-surface-300 dark:border-surface-600"
			>
				<iconify-icon icon="material-symbols:first-page" width="20" aria-hidden="true"></iconify-icon>
			</Button>
		</SystemTooltip>

		<!-- Previous page button -->
		<SystemTooltip title="Previous Page">
			<Button
				variant="ghost"
				onclick={() => goToPage(currentPage - 1)}
				disabled={isFirstPage}
				type="button"
				aria-label="Go to previous page"
				aria-disabled={isFirstPage}
				class="{navButtonClass} border-e border-surface-300 dark:border-surface-600"
			>
				<iconify-icon icon="material-symbols:chevron-left" width="20" aria-hidden="true"></iconify-icon>
			</Button>
		</SystemTooltip>

		<!-- Rows per page select dropdown -->
		<SystemTooltip title="Rows per page">
			<select
				bind:value={rowsPerPage}
				onchange={(event) => updateRowsPerPage(parseInt((event.target as HTMLSelectElement).value))}
				aria-label="Select number of rows per page"
				class="h-8 cursor-pointer appearance-none border-e border-surface-300 bg-transparent px-3 text-center text-xs font-semibold text-tertiary-500 hover:bg-surface-200 dark:border-surface-600 dark:text-primary-500 dark:hover:bg-surface-700 md:text-sm"
			>
				{#each rowsPerPageOptions as pageSize (pageSize)}
					<option class="bg-surface-100 text-black dark:bg-surface-700 dark:text-white" value={pageSize}>
						{pageSize}
						{entrylist_rows()}
					</option>
				{/each}
			</select>
		</SystemTooltip>

		<!-- Next page button -->
		<SystemTooltip title="Next Page">
			<Button
				variant="ghost"
				onclick={() => goToPage(currentPage + 1)}
				disabled={isLastPage}
				type="button"
				aria-label="Go to next page"
				aria-disabled={isLastPage}
				class="{navButtonClass} border-e border-surface-300 dark:border-surface-600"
			>
				<iconify-icon icon="material-symbols:chevron-right" width="20" aria-hidden="true"></iconify-icon>
			</Button>
		</SystemTooltip>

		<!-- Last page button -->
		<SystemTooltip title="Last Page">
			<Button
				variant="ghost"
				onclick={() => goToPage(computedPagesCount)}
				disabled={isLastPage}
				type="button"
				aria-label="Go to last page"
				aria-disabled={isLastPage}
				class={navButtonClass}
			>
				<iconify-icon icon="material-symbols:last-page" width="20" aria-hidden="true"></iconify-icon>
			</Button>
		</SystemTooltip>
	</div>
</nav>
