<!-- 
@file src/components/system/table/TablePagination.svelte
@description Table pagination component
-->

<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	export let currentPage: number = 1; // Default value for current page number
	export let pagesCount: number = 1; // Default value for total number of pages
	export let rowsPerPage: number = 10; // Default value to control rows per page (optional)
	export let rowsPerPageOptions = [5, 10, 25, 50, 100, 500]; // Options for rows per page (optional)
	export let totalItems: number = 0; // Total number of items in the table (optional)

	const dispatch = createEventDispatcher();

	// Go to page
	function goToPage(page: number) {
		if (page >= 1 && page <= pagesCount) {
			dispatch('updatePage', page);
		}
	}

	// Change rows per page
	function changeRowsPerPage(event: Event) {
		const value = parseInt((event.target as HTMLSelectElement).value);
		if (!isNaN(value)) {
			dispatch('updateRowsPerPage', value);
		}
	}

	// Reactive declarations with proper dependencies
	$: pagesCount = Math.max(Math.ceil(totalItems / rowsPerPage), 1);
	$: currentPage = Math.min(Math.max(currentPage, 1), pagesCount);
	$: isFirstPage = currentPage <= 1;
	$: isLastPage = currentPage >= pagesCount;

	// Calculate current page items
	$: currentPageItems = currentPage === pagesCount ? totalItems - rowsPerPage * (currentPage - 1) : rowsPerPage;
</script>

<!-- Pagination info -->
<div class="mb-1 flex items-center justify-between text-xs md:mb-0 md:text-sm" role="status" aria-live="polite">
	<div>
		<span>{m.entrylist_page()}</span>
		<span class="text-tertiary-500 dark:text-primary-500">{currentPage}</span>
		<span>{m.entrylist_of()}</span>
		<span class="text-tertiary-500 dark:text-primary-500">{pagesCount}</span>
		<span class="ml-4">
			Showing <span class="text-tertiary-500 dark:text-primary-500">{currentPageItems}</span> of
			<span class="text-tertiary-500 dark:text-primary-500">{totalItems}</span> items
		</span>
	</div>
</div>

<!-- Pagination controls -->
<div class="variant-outline btn-group" aria-label="Pagination">
	<!-- First page button -->
	<button on:click={() => goToPage(1)} disabled={isFirstPage} type="button" aria-label="Go to first page" title="First Page" class="btn">
		<iconify-icon icon="material-symbols:first-page" width="24"></iconify-icon>
	</button>

	<!-- Previous page button -->
	<button
		on:click={() => goToPage(currentPage - 1)}
		disabled={isFirstPage}
		type="button"
		aria-label="Go to previous page"
		title="Previous Page"
		class="btn"
	>
		<iconify-icon icon="material-symbols:chevron-left" width="24"></iconify-icon>
	</button>

	<!-- Rows per page select dropdown -->
	<select
		value={rowsPerPage}
		on:change={changeRowsPerPage}
		aria-label="Rows per page"
		class="mt-0.5 bg-transparent text-center text-tertiary-500 dark:text-primary-500"
	>
		{#each rowsPerPageOptions as pageSize}
			<option class="bg-surface-500 text-white" value={pageSize}>
				{pageSize}
				{m.entrylist_rows()}
			</option>
		{/each}
	</select>

	<!-- Next page button -->
	<button on:click={() => goToPage(currentPage + 1)} disabled={isLastPage} type="button" aria-label="Go to next page" class="btn">
		<iconify-icon icon="material-symbols:chevron-right" width="24"></iconify-icon>
	</button>

	<!-- Last page button -->
	<button on:click={() => goToPage(pagesCount)} disabled={isLastPage} type="button" aria-label="Go to last page" class="btn">
		<iconify-icon icon="material-symbols:last-page" width="24"></iconify-icon>
	</button>
</div>
