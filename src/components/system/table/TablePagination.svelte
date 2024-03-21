<script lang="ts">
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	export let currentPage: number; // Prop for current page number
	export let pagesCount: number; // Prop for total number of pages
	export let rowsPerPage: number; // Prop to control rows per page (optional)
	export let rowsPerPageOptions = [10, 25, 50, 100, 500]; // Options for rows per page (optional)
	export let refreshTableData: any; // Function to refresh data on page change

	// Compute properties
	const isFirstPage = currentPage === 1;
	const isLastPage = currentPage === pagesCount;

	// Define the rowsPerPageHandler function
	function rowsPerPageHandler(event: Event) {
		// Get the selected value from the event
		const selectedValue = (event.target as HTMLSelectElement).value;
		// Update the rows per page value
		rowsPerPage = parseInt(selectedValue); // Assuming rowsPerPage is a number
		// Optionally, you can call the refreshTableData function here if needed
		refreshTableData();
	}

	// Function to handle keyboard navigation
	function handleKeyDown(event: any) {
		if (event.key === 'ArrowLeft' && !isFirstPage) {
			currentPage = Math.max(1, currentPage - 1);
			refreshTableData();
		} else if (event.key === 'ArrowRight' && !isLastPage) {
			currentPage = Math.min(currentPage + 1, pagesCount || 0);
			refreshTableData();
		}
	}
</script>

<button
	on:keydown={handleKeyDown}
	class="sticky bottom-0 left-0 right-0 z-10 flex flex-col items-center justify-center px-2 md:flex-row md:justify-between md:p-4"
>
	<!-- Pagination info -->
	<div class="mb-1 text-xs md:mb-0 md:text-sm">
		<span>{m.entrylist_page()}</span> <span class="text-tertiary-500 dark:text-primary-500">{currentPage}</span>
		<span>{m.entrylist_of()}</span> <span class="text-tertiary-500 dark:text-primary-500">{pagesCount || 0}</span>
	</div>

	<!-- Pagination controls -->
	<div class="variant-outline btn-group">
		<!-- First page button -->
		<button
			type="button"
			class="btn"
			disabled={isFirstPage}
			aria-label="Go to first page"
			on:click={() => {
				currentPage = 1;
				refreshTableData();
			}}
		>
			<iconify-icon icon="material-symbols:first-page" width="24" />
		</button>

		<!-- Previous page button -->
		<button
			type="button"
			class="btn"
			disabled={isFirstPage}
			aria-label="Go to Previous page"
			on:click={() => {
				currentPage = Math.max(1, currentPage - 1);
				refreshTableData();
			}}
		>
			<iconify-icon icon="material-symbols:chevron-left" width="24" />
		</button>

		<!-- Rows per page select dropdown -->
		{#if rowsPerPage !== undefined}
			<select value={rowsPerPage} on:change={rowsPerPageHandler} class="mt-0.5 bg-transparent text-center text-tertiary-500 dark:text-primary-500">
				{#each rowsPerPageOptions as pageSize}
					<option class="bg-surface-500 text-white" value={pageSize}> {pageSize} {m.entrylist_rows()} </option>
				{/each}
			</select>
		{/if}

		<!-- Next page button -->
		<button
			type="button"
			class="btn"
			disabled={isLastPage}
			aria-label="Go to Next page"
			on:click={() => {
				currentPage = Math.min(currentPage + 1, pagesCount || 0);
				refreshTableData();
			}}
		>
			<iconify-icon icon="material-symbols:chevron-right" width="24" />
		</button>

		<!-- Last page button -->
		<button
			type="button"
			class="btn"
			disabled={isLastPage}
			aria-label="Go to Last page"
			on:click={() => {
				currentPage = pagesCount || 0;
				refreshTableData();
			}}
		>
			<iconify-icon icon="material-symbols:last-page" width="24" />
		</button>
	</div>
</button>
