<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	export let currentPage: number; // Prop for current page number
	export let pagesCount: number; // Prop for total number of pages
	export let rowsPerPage: number; // Prop to control rows per page (optional)
	export let rowsPerPageOptions = [5, 10, 25, 50, 100, 500]; // Options for rows per page (optional)

	const dispatch = createEventDispatcher();

	function goToPage(page: number) {
		if (page >= 1 && page <= pagesCount) {
			dispatch('updatePage', page);
		}
	}

	function changeRowsPerPage(event: Event) {
		const value = (event.target as HTMLSelectElement).value;
		dispatch('updateRowsPerPage', parseInt(value));
	}

	$: isFirstPage = currentPage === 1;
	$: isLastPage = currentPage === pagesCount;
</script>

<!-- Pagination info -->
<div class="mb-1 text-xs md:mb-0 md:text-sm">
	<span>{m.entrylist_page()}</span> <span class="text-tertiary-500 dark:text-primary-500">{currentPage}</span>
	<span>{m.entrylist_of()}</span> <span class="text-tertiary-500 dark:text-primary-500">{pagesCount || 0}</span>
</div>

<!-- Pagination controls -->
<div class="variant-outline btn-group">
	<!-- First page button -->
	<button type="button" class="btn" disabled={isFirstPage} aria-label="Go to first page" on:click={() => goToPage(1)}>
		<iconify-icon icon="material-symbols:first-page" width="24" />
	</button>

	<!-- Previous page button -->
	<button type="button" class="btn" disabled={isFirstPage} aria-label="Go to Previous page" on:click={() => goToPage(currentPage - 1)}>
		<iconify-icon icon="material-symbols:chevron-left" width="24" />
	</button>

	<!-- Rows per page select dropdown -->
	<select value={rowsPerPage} on:change={changeRowsPerPage} class="mt-0.5 bg-transparent text-center text-tertiary-500 dark:text-primary-500">
		{#each rowsPerPageOptions as pageSize}
			<option class="bg-surface-500 text-white" value={pageSize}> {pageSize} {m.entrylist_rows()} </option>
		{/each}
	</select>

	<!-- Next page button -->
	<button type="button" class="btn" disabled={isLastPage} aria-label="Go to Next page" on:click={() => goToPage(currentPage + 1)}>
		<iconify-icon icon="material-symbols:chevron-right" width="24" />
	</button>

	<!-- Last page button -->
	<button type="button" class="btn" disabled={isLastPage} aria-label="Go to Last page" on:click={() => goToPage(pagesCount)}>
		<iconify-icon icon="material-symbols:last-page" width="24" />
	</button>
</div>
