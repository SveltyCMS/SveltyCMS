<!--
@file src/components/ui/smart-table/smart-table-shell.svelte
@component
**Reusable Smart Table shell — toolbar, states, scroll body, pagination.**

Wraps domain tables (media, users, tokens, entry-list adapters) so chrome,
empty/loading, and pagination stay consistent.

### Props
- `loading` / `empty` — show skeleton or empty state instead of body
- `emptyTitle` / `emptyDescription` / `emptyIcon`
- Pagination bindables + callbacks (optional; hide with `showPagination={false}`)
- Snippets: `toolbar`, `children` (table markup), `emptyAction`

### Features:
- shared SMART_TABLE_* chrome
- WCAG live regions for empty/loading
- cms pagination variant by default
-->

<script lang="ts">
	import type { Snippet } from 'svelte';
	import TablePagination from '@components/system/table/table-pagination.svelte';
	import { cn } from '@utils/cn';
	import {
		SMART_TABLE_PAGINATION_BAR,
		SMART_TABLE_SCROLL,
		SMART_TABLE_SHELL,
		SMART_TABLE_TOOLBAR
	} from './chrome';
	import SmartTableEmpty from './smart-table-empty.svelte';
	import SmartTableLoading from './smart-table-loading.svelte';

	let {
		loading = false,
		empty = false,
		emptyTitle = 'No results found',
		emptyDescription = 'Try adjusting your filters or search terms.',
		emptyIcon = 'mingcute:box-line',
		showPagination = true,
		/** When false, children manage their own scroll (e.g. entry-list virtualization). */
		manageScroll = true,
		currentPage = $bindable(1),
		rowsPerPage = $bindable(10),
		pagesCount = 1,
		totalItems = 0,
		rowsPerPageOptions = [10, 25, 50, 100, 500],
		onUpdatePage,
		onUpdateRowsPerPage,
		scrollClass = '',
		class: className = '',
		toolbar,
		children,
		emptyAction
	}: {
		loading?: boolean;
		empty?: boolean;
		emptyTitle?: string;
		emptyDescription?: string;
		emptyIcon?: string;
		showPagination?: boolean;
		manageScroll?: boolean;
		currentPage?: number;
		rowsPerPage?: number;
		pagesCount?: number;
		totalItems?: number;
		rowsPerPageOptions?: number[];
		onUpdatePage?: (page: number) => void;
		onUpdateRowsPerPage?: (rows: number) => void;
		scrollClass?: string;
		class?: string;
		toolbar?: Snippet;
		children?: Snippet;
		emptyAction?: Snippet;
	} = $props();

	const showFooter = $derived(showPagination && !loading && !empty && totalItems > 0);
</script>

<div class={cn(SMART_TABLE_SHELL, className)}>
	{#if toolbar}
		<div class={SMART_TABLE_TOOLBAR}>
			{@render toolbar()}
		</div>
	{/if}

	{#if loading}
		<SmartTableLoading />
	{:else if empty}
		<SmartTableEmpty title={emptyTitle} description={emptyDescription} icon={emptyIcon} action={emptyAction} />
	{:else if manageScroll}
		<div class={cn(SMART_TABLE_SCROLL, scrollClass)}>
			{@render children?.()}
		</div>
	{:else}
		{@render children?.()}
	{/if}

	{#if showFooter}
		<div class={SMART_TABLE_PAGINATION_BAR}>
			<TablePagination
				{currentPage}
				{rowsPerPage}
				{pagesCount}
				{totalItems}
				{rowsPerPageOptions}
				{onUpdatePage}
				{onUpdateRowsPerPage}
			/>
		</div>
	{/if}
</div>
