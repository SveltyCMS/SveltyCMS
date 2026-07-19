<!--
@file src/components/ui/table/pagination.svelte
@component
**Unified Smart Table Pagination — WCAG 3.0 Ready**

Single pagination primitive for design-system tables and CMS tables
(entry-list, media, users). Supports optional Paraglide i18n labels
and first/last navigation used by the admin CMS.

### Props
- `currentPage` / `rowsPerPage` (bindable)
- `totalItems` / `pagesCount`
- `rowsPerPageOptions`
- `variant` ('simple' | 'cms') — simple = design system; cms = first/last + i18n
- `onUpdatePage` / `onUpdateRowsPerPage`

### Features:
- auto page count from totalItems
- mobile + desktop layouts (cms variant)
- accessible nav + live region
- full Svelte 5 runes
-->

<script lang="ts">
	import Button from '../button.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import {
		entrylist_items,
		entrylist_of,
		entrylist_page,
		entrylist_rows,
		entrylist_showing
	} from '@src/paraglide/messages';

	let {
		currentPage = $bindable(1),
		rowsPerPage = $bindable(10),
		totalItems = 0,
		pagesCount,
		rowsPerPageOptions = [5, 10, 25, 50, 100, 500],
		variant = 'simple',
		onchange,
		onUpdatePage,
		onUpdateRowsPerPage
	}: {
		currentPage?: number;
		rowsPerPage?: number;
		totalItems?: number;
		pagesCount?: number;
		rowsPerPageOptions?: number[];
		variant?: 'simple' | 'cms';
		onchange?: () => void;
		onUpdatePage?: (page: number) => void;
		onUpdateRowsPerPage?: (rows: number) => void;
	} = $props();

	const computedPagesCount = $derived(
		pagesCount && pagesCount > 0
			? pagesCount
			: Math.max(1, Math.ceil((totalItems || 0) / Math.max(1, rowsPerPage)))
	);
	const startItem = $derived(totalItems === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1);
	const endItem = $derived(Math.min(currentPage * rowsPerPage, totalItems));
	const isFirstPage = $derived(currentPage <= 1);
	const isLastPage = $derived(currentPage >= computedPagesCount);

	function setPage(page: number) {
		if (page < 1 || page > computedPagesCount || page === currentPage) return;
		currentPage = page;
		onchange?.();
		onUpdatePage?.(page);
	}

	function updateRows(rows: number) {
		rowsPerPage = rows;
		currentPage = 1;
		onchange?.();
		onUpdateRowsPerPage?.(rows);
	}

	const navBtn =
		'h-8 w-9 rounded-none p-0! min-w-0 text-surface-600 hover:bg-surface-200 dark:text-surface-300 dark:hover:bg-surface-700';
</script>

{#if variant === 'cms'}
	<!-- Mobile -->
	<div class="flex w-full items-center gap-2 md:hidden">
		<nav
			class="inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-lg border border-surface-200 bg-surface-50 dark:border-surface-800 dark:bg-surface-900"
			aria-label="Table pagination"
		>
			<Button
				variant="ghost"
				size="sm"
				onclick={() => setPage(currentPage - 1)}
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
				onclick={() => setPage(currentPage + 1)}
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
				onchange={(e) => updateRows(parseInt((e.target as HTMLSelectElement).value, 10))}
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

	<!-- Desktop -->
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
					onclick={() => setPage(1)}
					disabled={isFirstPage}
					type="button"
					aria-label="Go to first page"
					class="{navBtn} border-e border-surface-300 dark:border-surface-600"
				>
					<iconify-icon icon="material-symbols:first-page" width="20" aria-hidden="true"></iconify-icon>
				</Button>
			</SystemTooltip>
			<SystemTooltip title="Previous Page">
				<Button
					variant="ghost"
					onclick={() => setPage(currentPage - 1)}
					disabled={isFirstPage}
					type="button"
					aria-label="Go to previous page"
					class="{navBtn} border-e border-surface-300 dark:border-surface-600"
				>
					<iconify-icon icon="material-symbols:chevron-left" width="20" aria-hidden="true"></iconify-icon>
				</Button>
			</SystemTooltip>
			<SystemTooltip title="Rows per page">
				<select aria-label="Rows per page"
					bind:value={rowsPerPage}
					onchange={(e) => updateRows(parseInt((e.target as HTMLSelectElement).value, 10))}
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
					onclick={() => setPage(currentPage + 1)}
					disabled={isLastPage}
					type="button"
					aria-label="Go to next page"
					class="{navBtn} border-e border-surface-300 dark:border-surface-600"
				>
					<iconify-icon icon="material-symbols:chevron-right" width="20" aria-hidden="true"></iconify-icon>
				</Button>
			</SystemTooltip>
			<SystemTooltip title="Last Page">
				<Button
					variant="ghost"
					onclick={() => setPage(computedPagesCount)}
					disabled={isLastPage}
					type="button"
					aria-label="Go to last page"
					class={navBtn}
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
{:else}
	<!-- Simple design-system footer -->
	<div
		class="flex flex-col items-center justify-between gap-4 border-t border-surface-200 bg-surface-50/30 p-4 text-sm text-surface-600 sm:flex-row dark:border-surface-800 dark:bg-surface-950/20 dark:text-surface-400"
	>
		<div class="flex items-center gap-4">
			<span class="whitespace-nowrap">
				Showing
				<span class="font-bold text-surface-900 dark:text-surface-100">{startItem}</span>
				to
				<span class="font-bold text-surface-900 dark:text-surface-100">{endItem}</span>
				of
				<span class="font-bold text-surface-900 dark:text-surface-100">{totalItems}</span>
			</span>
			<div class="flex items-center gap-2">
				<span class="hidden sm:inline">Rows:</span>
				<select aria-label="Rows per page"
					bind:value={rowsPerPage}
					onchange={() => updateRows(rowsPerPage)}
					class="rounded border-none bg-surface-100 px-2 py-1 text-xs font-bold focus:ring-1 focus:ring-primary-500 dark:bg-surface-800"
				>
					{#each rowsPerPageOptions as option (option)}
						<option value={option}>{option}</option>
					{/each}
				</select>
			</div>
		</div>
		<div class="flex items-center gap-1">
			<Button
				variant="ghost"
				size="sm"
				leadingIcon="mingcute:arrow-left-line"
				disabled={isFirstPage}
				onclick={() => setPage(currentPage - 1)}
				aria-label="Previous page"
			/>
			<div class="flex items-center gap-1 px-2">
				<span class="font-bold text-tertiary-500 dark:text-primary-500">{currentPage}</span>
				<span class="opacity-50">/</span>
				<span>{computedPagesCount}</span>
			</div>
			<Button
				variant="ghost"
				size="sm"
				leadingIcon="mingcute:arrow-right-line"
				disabled={isLastPage}
				onclick={() => setPage(currentPage + 1)}
				aria-label="Next page"
			/>
		</div>
	</div>
{/if}
