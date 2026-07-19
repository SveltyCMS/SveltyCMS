<!--
@file src/components/system/table/table-pagination.svelte
@component
**CMS table pagination — thin wrapper over unified `ui/table/pagination`.**

Kept for import stability (`@components/system/table/table-pagination.svelte`).
New code may import `@components/ui/table/pagination.svelte` with `variant="cms"`.

### Props
Same as ui/table/pagination (cms variant defaults).
-->

<script lang="ts">
	import Pagination from '@components/ui/table/pagination.svelte';

	let {
		currentPage = $bindable(),
		pagesCount = 1,
		rowsPerPage = $bindable(),
		rowsPerPageOptions = [5, 10, 25, 50, 100, 500],
		totalItems = 0,
		onUpdatePage,
		onUpdateRowsPerPage
	} = $props();
</script>

<Pagination
	bind:currentPage
	bind:rowsPerPage
	{pagesCount}
	{totalItems}
	{rowsPerPageOptions}
	variant="cms"
	{onUpdatePage}
	{onUpdateRowsPerPage}
/>
