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

	let {
		currentPage = $bindable(),
		pagesCount = 1,
		rowsPerPage = $bindable(),
		rowsPerPageOptions = [5, 10, 25, 50, 100, 500],
		totalItems = 0,
		onUpdatePage,
		onUpdateRowsPerPage
	} = $props();

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

	const startItem = $derived(totalItems === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1);
	const endItem = $derived(totalItems === 0 ? 0 : Math.min(currentPage * rowsPerPage, totalItems));

	function goToPage(page: number) {
		if (page >= 1 && page <= computedPagesCount && page !== currentPage) {
			currentPage = page;
			onUpdatePage?.(page);
		}
	}

	function updateRowsPerPage(rows: number) {
		rowsPerPage = rows;
		onUpdateRowsPerPage?.(rows);
	}

	const navButtonClass =
		'h-8 w-9 rounded-none p-0! min-w-0 text-surface-600 hover:bg-surface-200 dark:text-surface-300 dark:hover:bg-surface-700';
</script>

<!-- Mobile-only layout -->
<div class="flex w-full items-center gap-2 md:hidden">
	<nav
		class="inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-lg border border-surface-200 bg-surface-50 dark:border-surface-800 dark:bg-surface-900"
		aria-label="Table pagination"
	>
		<Button
			variant="ghost"
			size="sm"
			onclick={() => goToPage(currentPage - 1)}
			disabled={isFirstPage}
			type="button"
			aria-label="Go to previous page"
			class="table-pagination-mobile-nav-btn"
		>
			<iconify-icon icon="mdi:chevron-left" width="20" aria-hidden="true"></iconify-icon>
		</Button>

		<span
			class="flex min-w-12 items-center justify-center border-x border-surface-200 px-2 font-mono text-xs font-semibold tabular-nums text-surface-800 dark:border-surface-800 dark:text-surface-100"
			aria-hidden="true"
		>
			{currentPage}/{computedPagesCount}
		</span>

		<Button
			variant="ghost"
			size="sm"
			onclick={() => goToPage(currentPage + 1)}
			disabled={isLastPage}
			type="button"
			aria-label="Go to next page"
			class="table-pagination-mobile-nav-btn"
		>
			<iconify-icon icon="mdi:chevron-right" width="20" aria-hidden="true"></iconify-icon>
		</Button>
	</nav>

	<p
		class="m-0 min-w-0 flex-1 text-center font-mono text-[10px] font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400"
		role="status"
		aria-live="polite"
	>
		{#if totalItems > 0}
			<span class="tabular-nums text-surface-700 dark:text-surface-200">{startItem}–{endItem}</span>
			<span class="text-surface-400 dark:text-surface-500"> / {totalItems}</span>
		{:else}
			0 / 0
		{/if}
	</p>

	<label class="relative inline-flex h-9 shrink-0 items-center">
		<span class="sr-only">{entrylist_rows()}</span>
		<select aria-label="Items per page"
			bind:value={rowsPerPage}
			onchange={(event) => updateRowsPerPage(parseInt((event.target as HTMLSelectElement).value))}
			class="h-full cursor-pointer appearance-none rounded-lg border border-surface-200 bg-surface-50 pe-7 ps-3 font-mono text-[11px] font-semibold uppercase tracking-wide text-surface-700 dark:border-surface-800 dark:bg-surface-900 dark:text-surface-200"
		>
			{#each rowsPerPageOptions as pageSize (pageSize)}
				<option value={pageSize}>{pageSize} {entrylist_rows()}</option>
			{/each}
		</select>
		<iconify-icon
			icon="mdi:chevron-down"
			width="14"
			class="pointer-events-none absolute inset-e-2 text-surface-400"
			aria-hidden="true"
		></iconify-icon>
	</label>
</div>

<!-- Desktop layout (unchanged) -->
<div
	class="hidden flex-wrap items-center gap-x-3 gap-y-1 text-xs text-surface-500 md:flex dark:text-surface-400 md:text-sm"
	role="status"
	aria-live="polite"
>
	<span>
		{entrylist_page()}
		<span class="font-semibold text-tertiary-500 dark:text-primary-500">{currentPage}</span>
		{entrylist_of()}
		<span class="font-semibold text-tertiary-500 dark:text-primary-500">{computedPagesCount}</span>
	</span>

	<span class="hidden h-3 w-px bg-surface-300 sm:inline-block dark:bg-surface-600" aria-hidden="true"></span>

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

<nav class="hidden items-center md:flex" aria-label="Table pagination">
	<div class="inline-flex items-center overflow-hidden rounded-md border border-surface-300 dark:border-surface-600">
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

		<SystemTooltip title="Rows per page">
			<select aria-label="Go to page"
				bind:value={rowsPerPage}
				onchange={(event) => updateRowsPerPage(parseInt((event.target as HTMLSelectElement).value))}
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

<style>
	:global(.table-pagination-mobile-nav-btn) {
		display: inline-flex !important;
		width: 2.25rem !important;
		min-width: 2.25rem !important;
		height: 100% !important;
		align-items: center;
		justify-content: center;
		padding: 0 !important;
		border-radius: 0 !important;
	}
</style>
