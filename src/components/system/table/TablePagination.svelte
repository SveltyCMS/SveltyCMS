<!-- 
@file src/components/system/table/TablePagination.svelte
@description Table pagination component
-->

<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Define event types
	type Events = {
		updatePage: number;
		updateRowsPerPage: number;
	};

	const props = $props<{
		currentPage?: number; // Default value for current page number
		pagesCount?: number; // Default value for total number of pages
		rowsPerPage?: number; // Default value to control rows per page (optional)
		rowsPerPageOptions?: number[]; // Options for rows per page (optional)
		totalItems?: number; // Total number of items in the table (optional)
	}>();

	// State declarations
	let currentPage = $state(props.currentPage ?? 1);
	let pagesCount = $state(props.pagesCount ?? 1);
	let rowsPerPage = $state(props.rowsPerPage ?? 10);
	let totalItems = $state(props.totalItems ?? 0);
	let rowsPerPageOptions = $state(props.rowsPerPageOptions ?? [5, 10, 25, 50, 100, 500]);

	// Go to page
	function goToPage(page: number) {
		if (page >= 1 && page <= pagesCount) {
			dispatchEvent(new CustomEvent('updatePage', { detail: page }));
		}
	}

	// Change rows per page
	function changeRowsPerPage(event: Event) {
		const value = parseInt((event.target as HTMLSelectElement).value);
		if (!isNaN(value)) {
			dispatchEvent(new CustomEvent('updateRowsPerPage', { detail: value }));
		}
	}

	// Reactive effects
	$effect(() => {
		pagesCount = Math.max(Math.ceil(totalItems / rowsPerPage), 1);
	});

	$effect(() => {
		currentPage = Math.min(Math.max(currentPage, 1), pagesCount);
	});

	// Derived values
	let isFirstPage = $derived(currentPage <= 1);
	let isLastPage = $derived(currentPage >= pagesCount);
	let currentPageItems = $derived(currentPage === pagesCount ? totalItems - rowsPerPage * (currentPage - 1) : rowsPerPage);
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
	<button onclick={() => goToPage(1)} disabled={isFirstPage} type="button" aria-label="Go to first page" title="First Page" class="btn">
		<iconify-icon icon="material-symbols:first-page" width="24"></iconify-icon>
	</button>

	<!-- Previous page button -->
	<button
		onclick={() => goToPage(currentPage - 1)}
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
		onchange={changeRowsPerPage}
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
	<button onclick={() => goToPage(currentPage + 1)} disabled={isLastPage} type="button" aria-label="Go to next page" class="btn">
		<iconify-icon icon="material-symbols:chevron-right" width="24"></iconify-icon>
	</button>

	<!-- Last page button -->
	<button onclick={() => goToPage(pagesCount)} disabled={isLastPage} type="button" aria-label="Go to last page" class="btn">
		<iconify-icon icon="material-symbols:last-page" width="24"></iconify-icon>
	</button>
</div>
