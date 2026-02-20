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
	import { entrylist_page, entrylist_of, entrylist_showing, entrylist_items, entrylist_rows } from '@src/paraglide/messages';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';

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
</script>

<!-- Pagination info -->
<div class="mb-1 flex items-center justify-between text-xs md:mb-0 md:text-sm" role="status" aria-live="polite">
	<div>
		<span>{entrylist_page()}</span>
		<span class="text-tertiary-500 dark:text-primary-500">{currentPage}</span>
		<span>{entrylist_of()}</span>
		<span class="text-tertiary-500 dark:text-primary-500">{computedPagesCount}</span>
		<span class="ml-4" aria-label="Current items shown">
			{#if totalItems > 0}
				{entrylist_showing()} <span class="text-tertiary-500 dark:text-primary-500">{startItem}</span>–<span
					class="text-tertiary-500 dark:text-primary-500">{endItem}</span
				>
				{entrylist_of()}
				<span class="text-tertiary-500 dark:text-primary-500">{totalItems}</span>
				{entrylist_items()}
			{:else}
				{entrylist_showing()}
				0 {entrylist_of()} 0 {entrylist_items()}
			{/if}
		</span>
	</div>
</div>

<!-- Pagination controls -->
<nav class="btn-group" aria-label="Table pagination">
	<!-- First page button -->
	<SystemTooltip title="First Page">
		<button
			onclick={() => goToPage(1)}
			disabled={isFirstPage}
			type="button"
			aria-label="Go to first page"
			class="btn h-8 w-8 rounded-none border-r border-surface-300 px-1 hover:bg-surface-200 disabled:text-surface-400 disabled:opacity-50! dark:border-surface-50 dark:text-surface-50 dark:hover:bg-surface-800 dark:disabled:text-surface-300"
			aria-disabled={isFirstPage}
		>
			<iconify-icon icon="material-symbols:first-page" width="24" role="presentation" aria-hidden="true"></iconify-icon>
		</button>
	</SystemTooltip>

	<!-- Previous page button -->
	<SystemTooltip title="Previous Page">
		<button
			onclick={() => goToPage(currentPage - 1)}
			disabled={isFirstPage}
			type="button"
			aria-label="Go to previous page"
			class="btn h-8 w-8 rounded-none border-r border-surface-300 px-1 hover:bg-surface-200 disabled:text-surface-400 disabled:opacity-50! dark:border-surface-50 dark:text-surface-50 dark:hover:bg-surface-800 dark:disabled:text-surface-300"
			aria-disabled={isFirstPage}
		>
			<iconify-icon icon="material-symbols:chevron-left" width="24" role="presentation" aria-hidden="true"></iconify-icon>
		</button>
	</SystemTooltip>

	<!-- Rows per page select dropdown -->
	<SystemTooltip title="Rows per page">
		<select
			bind:value={rowsPerPage}
			onchange={(event) => updateRowsPerPage(parseInt((event.target as HTMLSelectElement).value))}
			aria-label="Select number of rows per page"
			class="appearance-none bg-transparent p-0 px-2 text-center text-sm text-tertiary-500 hover:bg-surface-200 dark:border-surface-50 dark:text-primary-500 dark:hover:bg-surface-800 sm:px-4"
		>
			{#each rowsPerPageOptions as pageSize (pageSize)}
				<option class="bg-surface-300 text-black dark:bg-surface-700 dark:text-white" value={pageSize}>
					{pageSize}
					{entrylist_rows()}
				</option>
			{/each}
		</select>
	</SystemTooltip>

	<!-- Next page button -->
	<SystemTooltip title="Next Page">
		<button
			onclick={() => goToPage(currentPage + 1)}
			disabled={isLastPage}
			type="button"
			aria-label="Go to next page"
			class="btn h-8 w-8 rounded-none border-l border-surface-300 px-1 hover:bg-surface-200 disabled:text-surface-400 disabled:opacity-50! dark:border-surface-50 dark:text-surface-50 dark:hover:bg-surface-800 dark:disabled:text-surface-300"
			aria-disabled={isLastPage}
		>
			<iconify-icon icon="material-symbols:chevron-right" width="24" role="presentation" aria-hidden="true"></iconify-icon>
		</button>
	</SystemTooltip>

	<!-- Last page button -->
	<SystemTooltip title="Last Page">
		<button
			onclick={() => goToPage(computedPagesCount)}
			disabled={isLastPage}
			type="button"
			aria-label="Go to last page"
			class="btn h-8 w-8 rounded-none border-l border-surface-300 px-1 hover:bg-surface-200 disabled:text-surface-400 disabled:opacity-50! dark:border-surface-50 dark:text-surface-50 dark:hover:bg-surface-800 dark:disabled:text-surface-300"
			aria-disabled={isLastPage}
		>
			<iconify-icon icon="material-symbols:last-page" width="24" role="presentation" aria-hidden="true"></iconify-icon>
		</button>
	</SystemTooltip>
</nav>
