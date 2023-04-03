<script lang="ts">
	import { writable } from 'svelte/store';
	import {
		createSvelteTable,
		flexRender,
		getCoreRowModel,
		getSortedRowModel,
		getPaginationRowModel
	} from '@tanstack/svelte-table';
	import type { ColumnDef, TableOptions, SortDirection, FilterFn } from '@tanstack/svelte-table';

	import { thumbnails } from './generate-thumbnails';

	let view = 'grid';
	let size: 'small' | 'medium' | 'large' = 'medium';

	const sizes = {
		small: 100,
		medium: 200,
		large: 400
	};

	const columns: ColumnDef<(typeof thumbnails)[0]>[] = [
		{
			Header: 'Thumbnail',
			accessor: 'path',
			Cell: ({ value }) => `<img src="${value}" alt="" width="100" height="100" />`
		},
		{
			Header: 'Name',
			accessor: 'name',
			sortType: 'alphanumeric'
		},
		{
			Header: 'Path',
			accessor: 'path',
			sortType: 'alphanumeric'
		}
	];

	const options = writable<TableOptions<(typeof thumbnails)[0]>>({
		data: thumbnails,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel()
	});

	function setCurrentPage(page: number) {
		options.update((old: any) => {
			return {
				...old,
				state: {
					...old.state,
					pagination: {
						...old.state?.pagination,
						pageIndex: page
					}
				}
			};
		});
	}

	function setPageSize(e: Event) {
		const target = e.target as HTMLInputElement;
		options.update((old: any) => {
			return {
				...old,
				state: {
					...old.state,
					pagination: {
						...old.state?.pagination,
						pageSize: parseInt(target.value)
					}
				}
			};
		});
	}

	const table = createSvelteTable(options);
</script>

<h4 class="mb-2 text-error-500">Media Library</h4>

<!-- add options for the user to switch between grid and table views -->
<label>
	<input type="radio" bind:group={view} value="grid" /> Grid view
</label>
<label>
	<input type="radio" bind:group={view} value="table" /> Table view
</label>

<!-- add options for the user to switch between small, medium, and large images -->
<label>
	<input type="radio" bind:group={size} value="small" /> Small
</label>
<label>
	<input type="radio" bind:group={size} value="medium" /> Medium
</label>
<label>
	<input type="radio" bind:group={size} value="large" /> Large
</label>

{#if view === 'grid'}
	<!-- display images in a grid view using cards -->
	<div class="grid grid-cols-3 gap-4">
		{#each thumbnails as thumbnail}
			<div class="max-w-sm rounded overflow-hidden shadow-lg">
				<img
					class="w-full"
					src={thumbnail.path}
					alt={thumbnail.name}
					width={sizes[size]}
					height={sizes[size]}
				/>
				<div class="px-6 py-4">
					<div class="font-bold text-xl mb-2">{thumbnail.name}</div>
				</div>
			</div>
		{/each}
	</div>
{:else}
	<!-- display images in a table view using TanStack Table -->
	<table.table {...table.getTableProps()}>
		<thead.thead {...table.getHeaderGroupProps()}>
			{#each table.headers as header}
				<th.th {...header.getHeaderProps(header.getSortByToggleProps())}>
					{header.render('Header')}
					{#if header.isSorted}
						{header.isSortedDesc ? ' 🔽' : ' 🔼'}
					{/if}
				</th.th>
			{/each}
		</thead.thead>
		<tbody.tbody {...table.getTableBodyProps()}>
			{#each table.page as row (row.id)}
				{row.prepareRow()}
				<tr.tr {...row.getRowProps()}>
					{#each row.cells as cell}
						<td.td {...cell.getCellProps()}>{cell.render('Cell')}</td.td>
					{/each}
				</tr.tr>
			{/each}
		</tbody.tbody>
	</table.table>

  <!-- Pagination -->
	<div class="flex justify-around items-center my-3">
		<!-- show & count rows -->
		<div class="hidden md:block text-surface-400 text-sm">
			{$LL.TANSTACK_Show()}
			<span class="text-surface-700 dark:text-white"
				>{$table.getState().pagination.pageIndex + 1}</span
			>
			{$LL.TANSTACK_of()}
			<!-- TODO: Get actual pages -->
			<!-- <span class="text-surface-700 dark:text-white">{$table.getState().pagination.pageCount}</span> -->
			<span class="text-surface-700 dark:text-white"
				>{Math.ceil(
					$table.getPrePaginationRowModel().rows.length / $table.getState().pagination.pageSize
				)}</span
			>
			- (<span class="text-surface-700 dark:text-white"
				>{$table.getPrePaginationRowModel().rows.length}</span
			>
			{$LL.TANSTACK_Total()}

			{#if $table.getPrePaginationRowModel().rows.length === 1}
				{$LL.TANSTACK_Row()})
			{:else}
				{$LL.TANSTACK_Rows()}){/if}
		</div>

		<!-- number of pages -->
		<select
			value={$table.getState().pagination.pageSize}
			on:change={setPageSize}
			class="hidden sm:block max-w-[100px] select variant-ghost text-sm"
		>
			{#each [10, 25, 50, 100, 500] as pageSize}
				<option value={pageSize}>
					{pageSize} Rows
				</option>
			{/each}
		</select>

		<!-- next/previous pages -->
		<div class="btn-group variant-ghost [&>*+*]:border-surface-500">
			<button
				class="w-3"
				on:click={() => setCurrentPage(0)}
				class:is-disabled={!$table.getCanPreviousPage()}
				disabled={!$table.getCanPreviousPage()}
			>
				{'<<'}
			</button>

			<button
				class="w-3"
				on:click={() => setCurrentPage($table.getState().pagination.pageIndex - 1)}
				class:is-disabled={!$table.getCanPreviousPage()}
				disabled={!$table.getCanPreviousPage()}
			>
				{'<'}
			</button>
			<div class="px-2 justify-center items-center text-sm">
				<span> {$LL.TANSTACK_Page()} </span>

				<input
					type="number"
					value={$table.getState().pagination.pageIndex + 1}
					min={0}
					max={$table.getPageCount() - 1}
					on:change={handleCurrPageInput}
					class="input w-16 !border-0 variant-ghost mt-[1px] rounded-none"
				/>
				<span>
					{' '}{$LL.TANSTACK_of()}{' '}
					{$table.getPageCount()}
				</span>
			</div>
			<button
				class="w-3"
				on:click={() => setCurrentPage($table.getState().pagination.pageIndex + 1)}
				class:is-disabled={!$table.getCanNextPage()}
				disabled={!$table.getCanNextPage()}
			>
				{'>'}
			</button>
			<button
				class="w-3"
				on:click={() => setCurrentPage($table.getPageCount() - 1)}
				class:is-disabled={!$table.getCanNextPage()}
				disabled={!$table.getCanNextPage()}
			>
				{'>>'}
			</button>
		</div>
	</div>
	<div class="md:hidden flex flex-col justify-center items-center gap-2">
		<!-- number of pages -->
		<select
			value={$table.getState().pagination.pageSize}
			on:change={setPageSize}
			class="sm:hidden max-w-[100px] select variant-ghost text-sm"
		>
			{#each [10, 25, 50, 100, 500] as pageSize}
				<option value={pageSize}>
					{pageSize}
					{$LL.TANSTACK_Rows()}
				</option>
			{/each}
		</select>

		<!-- Pagination -->
		<div class="text-surface-400 text-sm">
			{$LL.TANSTACK_Show()}
			<span class="text-surface-700 dark:text-white"
				>{$table.getState().pagination.pageIndex + 1}</span
			>
			{$LL.TANSTACK_of()}
			<!-- TODO: Get actual page -->
			<!-- <span class="text-surface-700 dark:text-white"
				>{$table.getState().pagination.pageIndex + 1}</span
			> -->
			<span class="text-surface-700 dark:text-white"
				>{Math.ceil(
					$table.getPrePaginationRowModel().rows.length / $table.getState().pagination.pageSize
				)}</span
			>
			- (<span class="text-surface-700 dark:text-white"
				>{$table.getPrePaginationRowModel().rows.length}</span
			>
			{$LL.TANSTACK_Total()}

			{#if $table.getPrePaginationRowModel().rows.length === 1}
				{$LL.TANSTACK_Row()})
			{:else}
				{$LL.TANSTACK_Rows()}){/if}
		</div>
	</div>
</div>
{/if}
