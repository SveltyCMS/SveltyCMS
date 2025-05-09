<!-- 
@file src/components/system/table/TablePagination.svelte
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
-->

<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { onDestroy } from 'svelte';

	// Props with default values
	let {
		currentPage = 1,
		pagesCount = 1,
		rowsPerPage = 10,
		rowsPerPageOptions = [5, 10, 25, 50, 100, 500],
		totalItems = 0,
		onUpdatePage,
		onUpdateRowsPerPage
	} = $props<{
		currentPage?: number; // Current page number
		pagesCount?: number; // Total number of pages
		rowsPerPage?: number; // Number of rows per page
		rowsPerPageOptions?: number[]; // Options for rows per page
		totalItems?: number; // Total number of items in the table
		onUpdatePage?: (page: number) => void; // Event handler for updating the current page
		onUpdateRowsPerPage?: (rows: number) => void; // Event handler for updating the number of rows per page
	}>();

	// Local state mirrors props but avoids direct updates
	let localCurrentPage = $state(currentPage);
	let localRowsPerPage = $state(rowsPerPage);

	// Sync local state with props when they change externally
	$effect(() => {
		localCurrentPage = currentPage;
		localRowsPerPage = rowsPerPage;
	});

	// Derived values
	const isFirstPage = $derived(localCurrentPage === 1);
	const isLastPage = $derived(localCurrentPage === pagesCount);

	// Go to page with debounce
	let pageUpdateTimeout: number | undefined;
	function goToPage(page: number) {
		if (page >= 1 && page <= pagesCount && page !== localCurrentPage) {
			// Clear any existing timeout
			if (pageUpdateTimeout) clearTimeout(pageUpdateTimeout);
			// Set a new timeout
			pageUpdateTimeout = window.setTimeout(() => {
				localCurrentPage = page;
				onUpdatePage?.(page);
			}, 200); // 200ms debounce
		}
	}

	// Update rows per page
	function updateRowsPerPage(rows: number) {
		if (rows !== localRowsPerPage) {
			localRowsPerPage = rows;
			onUpdateRowsPerPage?.(rows);
		}
	}

	// Cleanup on component destroy
	onDestroy(() => {
		if (pageUpdateTimeout) clearTimeout(pageUpdateTimeout);
	});
</script>

<!-- Pagination info -->
<div class="mb-1 flex items-center justify-between text-xs md:mb-0 md:text-sm" role="status" aria-live="polite">
	<div>
		<span>{m.entrylist_page()}</span>
		<span class="text-tertiary-500 dark:text-primary-500">{localCurrentPage}</span>
		<span>{m.entrylist_of()}</span>
		<span class="text-tertiary-500 dark:text-primary-500">{pagesCount}</span>
		<span class="ml-4" aria-label="Current items shown">
			Showing <span class="text-tertiary-500 dark:text-primary-500">{localRowsPerPage}</span> of
			<span class="text-tertiary-500 dark:text-primary-500">{totalItems}</span> items
		</span>
	</div>
</div>

<!-- Pagination controls -->
<nav class=" variant-outline btn-group" aria-label="Table pagination">
	<!-- First page button -->
	<button
		onclick={() => goToPage(1)}
		disabled={isFirstPage}
		type="button"
		aria-label="Go to first page"
		title="First Page"
		class="btn h-8 w-8 rounded-none border-r border-surface-400 px-1 disabled:text-surface-400 disabled:!opacity-50"
		aria-disabled={isFirstPage}
	>
		<iconify-icon icon="material-symbols:first-page" width="24" role="presentation" aria-hidden="true"></iconify-icon>
	</button>

	<!-- Previous page button -->
	<button
		onclick={() => goToPage(localCurrentPage - 1)}
		disabled={isFirstPage}
		type="button"
		aria-label="Go to previous page"
		title="Previous Page"
		class="btn h-8 w-8 rounded-none border-r border-surface-400 px-1 disabled:text-surface-400 disabled:!opacity-50"
		aria-disabled={isFirstPage}
	>
		<iconify-icon icon="material-symbols:chevron-left" width="24" role="presentation" aria-hidden="true"></iconify-icon>
	</button>

	<!-- Rows per page select dropdown -->
	<select
		value={localRowsPerPage}
		onchange={(event) => updateRowsPerPage(parseInt((event.target as HTMLSelectElement).value))}
		aria-label="Select number of rows per page"
		class="h-8 appearance-none bg-transparent px-6 text-center text-sm text-tertiary-500 dark:text-primary-500"
		title="Rows per page"
	>
		{#each rowsPerPageOptions as pageSize}
			<option class="bg-surface-500 text-white" value={pageSize}>
				{pageSize}
				{m.entrylist_rows()}
			</option>
		{/each}
	</select>

	<!-- Next page button -->
	<button
		onclick={() => goToPage(localCurrentPage + 1)}
		disabled={isLastPage}
		type="button"
		aria-label="Go to next page"
		title="Next Page"
		class="btn h-8 w-8 rounded-none border-l border-surface-400 px-1 disabled:text-surface-400 disabled:!opacity-50"
		aria-disabled={isLastPage}
	>
		<iconify-icon icon="material-symbols:chevron-right" width="24" role="presentation" aria-hidden="true"></iconify-icon>
	</button>

	<!-- Last page button -->
	<button
		onclick={() => goToPage(pagesCount)}
		disabled={isLastPage}
		type="button"
		aria-label="Go to last page"
		title="Last Page"
		class="btn h-8 w-8 rounded-none border-l border-surface-400 px-1 disabled:text-surface-400 disabled:!opacity-50"
		aria-disabled={isLastPage}
	>
		<iconify-icon icon="material-symbols:last-page" width="24" role="presentation" aria-hidden="true"></iconify-icon>
	</button>
</nav>
