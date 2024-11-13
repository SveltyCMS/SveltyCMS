<!-- 
@file src/components/system/table/TablePagination.svelte
@component
**Table pagination component for displaying pagination controls.**

```tsx
<TablePagination currentPage={1} pagesCount={1} rowsPerPage={10} rowsPerPageOptions={[5, 10, 25, 50, 100, 500]} totalItems={0} />
```

@props
- `currentPage` {number}: The current page number (default: 1)
- `pagesCount` {number}: The total number of pages (default: 1)
- `rowsPerPage` {number}: The number of rows per page (default: 10)
- `rowsPerPageOptions` {number[]}: An array of options for rows per page (default: [5, 10, 25, 50, 100, 500])
- `totalItems` {number}: The total number of items in the table (default: 0)
	
-->

<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

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
			const event = new CustomEvent('updatePage', { detail: page });
			dispatchEvent(event);
		}
	}

	// Change rows per page
	function changeRowsPerPage(event: Event) {
		const value = parseInt((event.target as HTMLSelectElement).value);
		if (!isNaN(value)) {
			const customEvent = new CustomEvent('updateRowsPerPage', { detail: value });
			dispatchEvent(customEvent);
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
		<span class="ml-4" aria-label="Current items shown">
			Showing <span class="text-tertiary-500 dark:text-primary-500">{currentPageItems}</span> of
			<span class="text-tertiary-500 dark:text-primary-500">{totalItems}</span> items
		</span>
	</div>
</div>

<!-- Pagination controls -->
<nav class="variant-outline btn-group" aria-label="Table pagination" role="navigation">
	<!-- First page button -->
	<button
		onclick={() => goToPage(1)}
		disabled={isFirstPage}
		type="button"
		aria-label="Go to first page"
		title="First Page"
		class="btn"
		aria-disabled={isFirstPage}
	>
		<iconify-icon icon="material-symbols:first-page" width="24" role="presentation" aria-hidden="true"></iconify-icon>
	</button>

	<!-- Previous page button -->
	<button
		onclick={() => goToPage(currentPage - 1)}
		disabled={isFirstPage}
		type="button"
		aria-label="Go to previous page"
		title="Previous Page"
		class="btn"
		aria-disabled={isFirstPage}
	>
		<iconify-icon icon="material-symbols:chevron-left" width="24" role="presentation" aria-hidden="true"></iconify-icon>
	</button>

	<!-- Rows per page select dropdown -->
	<select
		value={rowsPerPage}
		onchange={changeRowsPerPage}
		aria-label="Select number of rows per page"
		class="mt-0.5 bg-transparent text-center text-tertiary-500 dark:text-primary-500"
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
		onclick={() => goToPage(currentPage + 1)}
		disabled={isLastPage}
		type="button"
		aria-label="Go to next page"
		title="Next Page"
		class="btn"
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
		class="btn"
		aria-disabled={isLastPage}
	>
		<iconify-icon icon="material-symbols:last-page" width="24" role="presentation" aria-hidden="true"></iconify-icon>
	</button>
</nav>
