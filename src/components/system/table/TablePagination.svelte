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
	import { onDestroy } from 'svelte';

	const props = $props<{
		currentPage?: number; // Default value for current page number
		pagesCount?: number; // Default value for total number of pages
		rowsPerPage?: number; // Default value to control rows per page (optional)
		rowsPerPageOptions?: number[]; // Options for rows per page (optional)
		totalItems?: number; // Total number of items in the table (optional)
	}>();

	// State declarations with memoization
	let currentPage = $state(props.currentPage ?? 1);
	let pagesCount = $state(props.pagesCount ?? 1);
	let rowsPerPage = $state(props.rowsPerPage ?? 10);
	let totalItems = $state(props.totalItems ?? 0);
	let rowsPerPageOptions = $state(props.rowsPerPageOptions ?? [5, 10, 25, 50, 100, 500]);

	// Go to page with debounce
	let pageUpdateTimeout: number | undefined;
	function goToPage(page: number) {
		if (page >= 1 && page <= pagesCount) {
			// Clear any existing timeout
			if (pageUpdateTimeout) {
				clearTimeout(pageUpdateTimeout);
			}

			// Set a new timeout
			pageUpdateTimeout = window.setTimeout(() => {
				const event = new CustomEvent('updatePage', { detail: page });
				dispatchEvent(event);
			}, 100); // 100ms debounce
		}
	}

	// Change rows per page with debounce
	let rowsUpdateTimeout: number | undefined;
	function changeRowsPerPage(event: Event) {
		const value = parseInt((event.target as HTMLSelectElement).value);
		if (!isNaN(value)) {
			// Clear any existing timeout
			if (rowsUpdateTimeout) {
				clearTimeout(rowsUpdateTimeout);
			}

			// Set a new timeout
			rowsUpdateTimeout = window.setTimeout(() => {
				const customEvent = new CustomEvent('updateRowsPerPage', { detail: value });
				dispatchEvent(customEvent);
			}, 100); // 100ms debounce
		}
	}

	// Update state when props change
	$effect(() => {
		if (props.currentPage !== undefined) currentPage = props.currentPage;
		if (props.pagesCount !== undefined) pagesCount = props.pagesCount;
		if (props.rowsPerPage !== undefined) rowsPerPage = props.rowsPerPage;
		if (props.totalItems !== undefined) totalItems = props.totalItems;
		if (props.rowsPerPageOptions !== undefined) rowsPerPageOptions = props.rowsPerPageOptions;
	});

	// Derived values with memoization
	let isFirstPage = $derived(currentPage <= 1);
	let isLastPage = $derived(currentPage >= pagesCount);
	let currentPageItems = $derived(currentPage === pagesCount ? Math.min(totalItems - rowsPerPage * (currentPage - 1), rowsPerPage) : rowsPerPage);

	// Cleanup on destroy
	onDestroy(() => {
		if (pageUpdateTimeout) clearTimeout(pageUpdateTimeout);
		if (rowsUpdateTimeout) clearTimeout(rowsUpdateTimeout);
	});
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
<nav class="variant-outline btn-group" aria-label="Table pagination">
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
