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
- `urlPageParam` (opt-in) — when set (e.g. "page"), cms prev/next/first/last
  become real links to the same route with that search param updated so
  predictive preloading can warm the next list page.

### Features:
- auto page count from totalItems
- mobile + desktop layouts (cms variant)
- accessible nav + live region
- URL-driven paging (opt-in `urlPageParam`) with viewport preload warm-next-page
- full Svelte 5 runes
-->

<script lang="ts">
	import Button from '../button.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { page } from '$app/state';
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
		onUpdateRowsPerPage,
		/** URL-driven pagination: when set (e.g. "page"), cms prev/next/first/last
		 *  render as real links to this route with the search param updated, so
		 *  predictive preloading (data-preload="viewport") can warm the next
		 *  list page. Consumers whose paging is not URL-backed leave it unset. */
		urlPageParam = null
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
		urlPageParam?: string | null;
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

	function setPage(pageNumber: number) {
		if (pageNumber < 1 || pageNumber > computedPagesCount || pageNumber === currentPage) return;
		currentPage = pageNumber;
		onchange?.();
		onUpdatePage?.(pageNumber);
	}

	function updateRows(rows: number) {
		rowsPerPage = rows;
		currentPage = 1;
		onchange?.();
		onUpdateRowsPerPage?.(rows);
	}

	const navBtn =
		'h-8 w-9 rounded-none p-0! min-w-0 text-surface-600 hover:bg-surface-200 dark:text-surface-300 dark:hover:bg-surface-700';

	// ── URL-driven paging (warm-next-page) ───────────────────────────────────
	// With `urlPageParam` set, first/prev/next/last become real <a> links whose
	// href updates the page search param on the SAME route. data-preload is
	// picked up by @utils/predictive-preload: the viewport strategy fires
	// /api/system/prewarm-route + preloadData() once the footer scrolls near the
	// viewport, so the next list page is SSR-cached before the click. Plain
	// left-clicks keep the existing emit → URL/goto flow (so smart-table state
	// and the URL stay consistent); modifier/middle clicks fall through to the
	// plain href (new tab / new window).
	function pageHref(pageNumber: number): string | null {
		if (!urlPageParam) return null;
		const next = new URL(page.url.href);
		if (pageNumber <= 1) next.searchParams.delete(urlPageParam);
		else next.searchParams.set(urlPageParam, String(pageNumber));
		return `${next.pathname}${next.search}${next.hash}`;
	}

	function onAnchorPage(event: MouseEvent, pageNumber: number) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		setPage(pageNumber);
	}
</script>

{#if variant === 'cms'}
	{#snippet pagerLink(p: { pageNumber: number; label: string; icon: string; disabled: boolean; cls?: string; size?: 'sm' | 'md' | 'lg'; viewport?: boolean })}
		{#if urlPageParam}
			{#if p.disabled}
				<span
					aria-hidden="true"
					class="{p.cls ?? navBtn} inline-flex cursor-default items-center justify-center opacity-40"
				>
					<iconify-icon icon={p.icon} width="20" aria-hidden="true"></iconify-icon>
				</span>
			{:else}
				<a
					href={pageHref(p.pageNumber)}
					aria-label={p.label}
					data-preload={p.viewport ? 'viewport' : undefined}
					class="{p.cls ?? navBtn} inline-flex items-center justify-center no-underline! focus-visible:ring-2 focus-visible:ring-tertiary-500"
					onclick={(e) => onAnchorPage(e, p.pageNumber)}
				>
					<iconify-icon icon={p.icon} width="20" aria-hidden="true"></iconify-icon>
				</a>
			{/if}
		{:else}
			<Button
				variant="ghost"
				size={p.size}
				onclick={() => setPage(p.pageNumber)}
				disabled={p.disabled}
				type="button"
				aria-label={p.label}
				class={p.cls}
			>
				<iconify-icon icon={p.icon} width="20" aria-hidden="true"></iconify-icon>
			</Button>
		{/if}
	{/snippet}

	<!-- Mobile -->
	<div class="flex w-full items-center gap-2 md:hidden">
		<nav
			class="inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-lg border border-surface-500/30 bg-surface-500/10 dark:border-surface-500/40 dark:bg-surface-900"
			aria-label="Table pagination"
		>
			{@render pagerLink({
				pageNumber: currentPage - 1,
				label: 'Go to previous page',
				icon: 'mdi:chevron-left',
				disabled: isFirstPage,
				size: 'sm',
				cls: 'table-pagination-mobile-nav-btn',
				viewport: true
			})}
			<span
				class="flex min-w-12 items-center justify-center border-x border-surface-500/30 px-2 font-mono text-xs font-semibold tabular-nums text-surface-600 dark:border-surface-500/40 dark:text-surface-100"
				aria-hidden="true"
			>
				{currentPage}/{computedPagesCount}
			</span>
			{@render pagerLink({
				pageNumber: currentPage + 1,
				label: 'Go to next page',
				icon: 'mdi:chevron-right',
				disabled: isLastPage,
				size: 'sm',
				cls: 'table-pagination-mobile-nav-btn',
				viewport: true
			})}
		</nav>

		<p
			class="m-0 min-w-0 flex-1 text-center font-mono text-[10px] font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400"
			role="status"
			aria-live="polite"
		>
			{#if totalItems > 0}
				<span class="tabular-nums text-surface-600 dark:text-surface-400">{startItem}–{endItem}</span>
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
				class="h-full cursor-pointer appearance-none rounded-lg border border-surface-500/30 bg-surface-500/10 pe-7 ps-3 font-mono text-[11px] font-semibold uppercase tracking-wide text-surface-600 dark:border-surface-500/40 dark:bg-surface-900 dark:text-surface-400"
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
		<div class="inline-flex items-center overflow-hidden rounded-md border border-surface-500/30 dark:border-surface-600">
			<SystemTooltip title="First Page">
				{@render pagerLink({
					pageNumber: 1,
					label: 'Go to first page',
					icon: 'material-symbols:first-page',
					disabled: isFirstPage,
					cls: '{navBtn} border-e border-surface-500/30 dark:border-surface-600'
				})}
			</SystemTooltip>
			<SystemTooltip title="Previous Page">
				{@render pagerLink({
					pageNumber: currentPage - 1,
					label: 'Go to previous page',
					icon: 'material-symbols:chevron-left',
					disabled: isFirstPage,
					cls: '{navBtn} border-e border-surface-500/30 dark:border-surface-600',
					viewport: true
				})}
			</SystemTooltip>
			<SystemTooltip title="Rows per page">
				<select aria-label="Rows per page"
					bind:value={rowsPerPage}
					onchange={(e) => updateRows(parseInt((e.target as HTMLSelectElement).value, 10))}
					class="h-8 cursor-pointer appearance-none border-e border-surface-500/30 bg-transparent px-3 text-center text-xs font-semibold text-tertiary-500 hover:bg-surface-200 dark:border-surface-600 dark:text-primary-500 dark:hover:bg-surface-700 md:text-sm"
				>
					{#each rowsPerPageOptions as pageSize (pageSize)}
						<option class="bg-surface-500/10 text-black dark:bg-surface-700 dark:text-white" value={pageSize}>
							{pageSize}
							{entrylist_rows()}
						</option>
					{/each}
				</select>
			</SystemTooltip>
			<SystemTooltip title="Next Page">
				{@render pagerLink({
					pageNumber: currentPage + 1,
					label: 'Go to next page',
					icon: 'material-symbols:chevron-right',
					disabled: isLastPage,
					cls: '{navBtn} border-e border-surface-500/30 dark:border-surface-600',
					viewport: true
				})}
			</SystemTooltip>
			<SystemTooltip title="Last Page">
				{@render pagerLink({
					pageNumber: computedPagesCount,
					label: 'Go to last page',
					icon: 'material-symbols:last-page',
					disabled: isLastPage,
					cls: navBtn
				})}
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
		class="flex flex-col items-center justify-between gap-4 border-t border-surface-500/30 bg-surface-500/30 p-4 text-sm text-surface-600 sm:flex-row dark:border-surface-500/40 dark:bg-surface-900/20 dark:text-surface-400"
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
					class="rounded border-none bg-surface-500/10 px-2 py-1 text-xs font-bold focus:ring-1 focus:ring-primary-500 dark:bg-surface-800"
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
