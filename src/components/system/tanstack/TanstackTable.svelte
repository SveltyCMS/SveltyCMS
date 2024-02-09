<script lang="ts">
	// Stores
	import { mode, entryData } from '@stores/store';
	import { handleSidebarToggle } from '@stores/sidebarStore';
	import { writable } from 'svelte/store';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import FloatingInput from '../inputs/floatingInput.svelte';

	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import TanstackIcons from './TanstackIcons.svelte';
	import { asAny } from '@utils/utils';

	//svelte-dnd-action
	import { dndzone } from 'svelte-dnd-action';
	import {
		createSvelteTable,
		flexRender as flexRenderBugged,
		getCoreRowModel,
		getSortedRowModel,
		getFilteredRowModel,
		getPaginationRowModel // TODO: Update to better getPaginationRowModel
	} from '@tanstack/svelte-table';
	import type { ColumnDef, TableOptions, SortDirection, FilterFn } from '@tanstack/table-core/src/types';

	export let density = 'normal';
	export const data: any[] = [];
	export let columnFields: any[];
	export let dataSourceName: string;

	// TanstackFilter export
	export let globalSearchValue = '';
	export let filterShow = false;
	export let columnShow = false;

	let columnSearchValue: Array<{ id: string; value: string }> = [];
	let sorting: any = [];
	let columnOrder: any[] = [];
	let columnVisibility = {};

	export let tableData: any[];
	let filteredData = tableData;

	const setSorting = (updater: (arg0: any) => any) => {
		if (updater instanceof Function) {
			sorting = updater(sorting);
		} else {
			sorting = updater;
		}
		options.update((old) => ({
			...old,
			state: {
				...old.state,
				sorting
			}
		}));
	};

	const setColumnOrder = (updater: any) => {
		if (updater instanceof Function) {
			columnOrder = updater(columnOrder);
		} else {
			columnOrder = updater;
		}
		options.update((old) => ({
			...old,
			state: {
				...old.state,
				columnOrder
			}
		}));
	};

	const setColumnVisibility = (updater: any) => {
		if (updater instanceof Function) {
			columnVisibility = updater(columnVisibility);
		} else {
			columnVisibility = updater;
		}
		options.update((old) => ({
			...old,
			state: {
				...old.state,
				columnVisibility
			}
		}));
	};

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

	function handleCurrPageInput(e: Event) {
		const target = e.target as HTMLInputElement;
		setCurrentPage(parseInt(target.value) - 1);
	}
	//console.log(items);
	const defaultColumns = columnFields;

	const storedValue = localStorage.getItem(`TanstackConfiguration-${dataSourceName}`);
	const columnsData = columnFields;

	const options = writable<TableOptions<any>>({
		data: tableData,
		columns: columnsData.map((item: any) => {
			return defaultColumns.find((col: any) => col.accessorKey == item.accessorKey);
		}),

		state: {
			sorting,
			columnOrder,
			globalFilter: globalSearchValue,
			columnFilters: columnSearchValue
		},
		onSortingChange: setSorting,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onColumnOrderChange: setColumnOrder,
		ColumnVisibilityChange: setColumnVisibility
	});

	var table = createSvelteTable(options);

	$: {
		// Create a reactive statement that updates the filteredData array whenever the searchValue changes

		options.update((old) => ({
			...old,
			state: {
				...old.state,
				globalFilter: globalSearchValue
			}
		}));
		// Sort data based on current sorting state
		//console.log($options);
		if (sorting.length > 0) {
			const sortColumn = sorting[0];
			filteredData.sort((a, b) => {
				const aValue = a[sortColumn.id];
				const bValue = b[sortColumn.id];
				if (aValue < bValue) {
					return sortColumn.desc ? 1 : -1;
				} else if (aValue > bValue) {
					return sortColumn.desc ? -1 : 1;
				} else {
					return 0;
				}
			});
		}
	}

	//workaround for svelte-table bug
	let flexRender = flexRenderBugged as (...args: Parameters<typeof flexRenderBugged>) => any;

	//tick logic
	let SelectAll = false;
	let selectedMap = writable({});
	export let selectedRows: any[] = [];

	// Subscribe to changes in the selectedMap
	selectedMap.subscribe((map) => {
		// Create a new array of selected rows
		selectedRows = Object.keys(map) // Get all keys from the map
			.filter((key) => map[key]) // Filter out keys where the value is falsey
			.map((key, index) => ({
				// Map each key to a new object
				index, // Keep the original index
				key, // Keep the original key
				data: tableData.find((_, i) => i == parseInt(key)) // Find the corresponding data from tableData
			}));
	});

	// TODO:debug why the first 2 row don't get selected?
	function updateSelectedMap(selectAll: boolean) {
		selectedMap.update((map) => {
			filteredData.forEach((row, index) => {
				//console.log(row);
				map[index] = selectAll;
			});
			//console.log('filteredData:', filteredData); // Log the value of filteredData
			//console.log('selectedMap:', map); // Log the value of selectedMap
			return map;
		});
	}
	$: updateSelectedMap(SelectAll);

	// dnd actions
	const flipDurationMs = 100;

	// TODO: Don't update table on drag and drop, only on release for performance
	function handleDndConsider(e: { detail: { items: { id: string; name: string; isVisible: boolean }[] } }) {
		columnFields = e.detail.items;
	}

	function handleDndFinalize(e: { detail: { items: { id: string; name: string; isVisible: boolean }[] } }) {
		columnFields = e.detail.items;

		// Update column Order based on new order
		const newOrder = {};
		columnFields.forEach((item) => {
			newOrder[item.id] = item.isVisible;
		});

		columnFields = columnFields.map((item) => {
			return {
				...item,
				getToggleVisibilityHandler() {
					return () => {
						const newVisibility = { ...$table.getState().columnVisibility };
						newVisibility[item.id] = !newVisibility[item.id];
						$table.setColumnVisibility(newVisibility);
					};
				}
			};
		});

		$table.setColumnOrder(newOrder);

		var remappedColumns = columnFields.map((item) => {
			return defaultColumns.find((col: any) => {
				return col.accessorKey == item.id;
			});
		});

		options.update((old) => {
			return {
				...old,
				columns: remappedColumns
			};
		});

		// Update localStorage with the remapped columns configuration
		localStorage.setItem(
			`TanstackConfiguration-${dataSourceName}`,
			JSON.stringify(
				remappedColumns.map((item) => {
					return {
						...item,
						visible: getColumnByName(item.accessorKey)?.getIsVisible()
					};
				})
			)
		);

		table = createSvelteTable(options);
	}

	// Add toggle Order function to each column object
	columnFields = columnFields.map((item) => {
		return {
			...item,
			getToggleVisibilityHandler() {
				return () => {
					const newVisibility = { ...$table.getState().columnVisibility };
					newVisibility[item.id] = !newVisibility[item.id];
					$table.setColumnVisibility(newVisibility);
				};
			}
		};
	});

	function getColumnByName(name) {
		return $table.getAllLeafColumns().find((col) => {
			return col.id == name;
		});
	}

	function calculateAvailablePageSizes(totalRows, pageSizeOptions) {
		const availableSizes = pageSizeOptions.filter((size) => size <= totalRows);
		return availableSizes;
	}

	const pageSizeOptions = [10, 25, 50, 100, 500, 1000, 2000, 5000, 10000]; // You can adjust this array as needed

	$: availablePageSizes = calculateAvailablePageSizes(filteredData.length, pageSizeOptions);

	//console.log('items', items);
</script>

<!-- TanstackHeader -->
{#if columnShow}
	<div class="rounded-b-0 flex flex-col justify-center rounded-t-md border-b bg-surface-300 text-center dark:bg-surface-700">
		<div class="text-white dark:text-primary-500">Drag & Drop Columns / Click to hide</div>

		<!-- toggle all -->
		<div class="flex w-full items-center justify-center">
			<label class="mr-3">
				<input
					checked={$table.getIsAllColumnsVisible()}
					on:change={(e) => {
						console.info($table.getToggleAllColumnsVisibilityHandler()(e));
					}}
					type="checkbox"
				/>{' '}
				{m.tanstacktable_all()}
			</label>

			<!-- Column Header -->
			<section
				class="flex flex-wrap justify-center gap-1 rounded-md p-2"
				use:dndzone={{ items: columnFields, flipDurationMs }}
				on:consider={handleDndConsider}
				on:finalize={handleDndFinalize}
			>
				{#each columnFields as item (item.id)}
					<button
						class="chip {$table
							.getAllLeafColumns()
							.find((col) => col.id == item.id)
							?.getIsVisible() ?? false
							? 'variant-filled-secondary'
							: 'variant-ghost-secondary'} w-100 mr-2 flex items-center justify-center"
						animate:flip={{ duration: flipDurationMs }}
						on:click={() => {
							getColumnByName(item.id)?.toggleVisibility();
							localStorage.setItem(
								`TanstackColumnVisibility-${dataSourceName}`,
								JSON.stringify(
									columnFields.map((item) => {
										return {
											// Headers: item.Headers,
											accessorKey: item.id,
											visible: getColumnByName(item.id)?.getIsVisible()
										};
									})
								)
							);
						}}
					>
						{#if $table
							.getAllLeafColumns()
							.find((col) => col.id == item.id)
							?.getIsVisible() ?? false}
							<span><iconify-icon icon="fa:check" /></span>
						{/if}
						<span class="ml-2 capitalize">{item.header}</span>
					</button>
				{/each}
			</section>
		</div>
	</div>
{/if}

<!-- Tanstack Table -->
<div class="table-container">
	<table class="table table-hover {density === 'compact' ? 'table-compact' : density === 'normal' ? '' : 'table-comfortable'}">
		<!-- Tanstack Header -->
		<thead class="text-black dark:text-primary-500">
			{#each $table.getHeaderGroups() as headerGroup}
				<tr class="divide-x divide-surface-200 border-b border-surface-400 dark:divide-surface-400">
					<th class="w-8 bg-white dark:bg-surface-900">
						<TanstackIcons bind:checked={SelectAll} />
					</th>
					<!-- Tanstack Other Headers -->
					{#each headerGroup.headers as header, index}
						<th class="bg-white dark:bg-surface-900">
							{#if !header.isPlaceholder}
								<button
									class:cursor-pointer={header.column.getCanSort()}
									class:select-none={header.column.getCanSort()}
									on:keydown
									on:click={header.column.getToggleSortingHandler()}
								>
									<svelte:component this={flexRender(header.column.columnDef.header, header.getContext())} />
									{#if header.column.getIsSorted() === 'asc'}
										<iconify-icon icon="material-symbols:arrow-upward-rounded" width="16" />
									{:else if header.column.getIsSorted() === 'desc'}
										<iconify-icon icon="material-symbols:arrow-downward-rounded" width="16" />
									{/if}
								</button>

								{#if filterShow}
									{!columnSearchValue[index] &&
										(columnSearchValue[index] = {
											id: header.column.id,
											value: ''
										}) &&
										''}
									<div transition:slide|global>
										<FloatingInput
											type="text"
											icon="material-symbols:search-rounded"
											label="Filter ..."
											bind:value={columnSearchValue[index].value}
											on:input={(e) => {
												// Update filter value for this column
												columnSearchValue[index] = {
													id: header.column.id,
													value: asAny(e).target.value
												};
												options.update((old) => ({
													...old,
													state: {
														...old.state,

														columnFilters: [...columnSearchValue].filter((item) => {
															return item?.value?.length > 0;
														})
													}
												}));
											}}
										/>
									</div>
								{/if}
							{/if}
						</th>
					{/each}
				</tr>
			{/each}
		</thead>

		<!-- Tanstack Body -->
		<tbody>
			{#each $table.getRowModel().rows as row}
				<tr
					on:keydown
					on:click={() => {
						entryData.set(row.original);
						mode.set('edit');
						handleSidebarToggle();
						console.log(row.original);
					}}
					class="bg-white last:border-0 dark:bg-surface-900"
				>
					<!-- TickRows -->
					<td class="">
						<TanstackIcons
							bind:checked={$selectedMap[row.id]}
							on:keydown
							on:click={() => {
								selectedMap.update((map) => ({ ...map, [row.id]: !map[row.id] }));
								mode.set('edit');
								handleSidebarToggle();
							}}
							class="ml-1"
						/>
					</td>

					{#each row.getVisibleCells() as cell}
						<td class="break-all border-x border-surface-200 last:border-0 dark:border-surface-400">
							<svelte:component this={flexRender(cell.column.columnDef.cell, cell.getContext())} />
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>

		<!-- Tanstack Footer -->
		<!-- TODO: only use if footer if required -->
		<!-- <tfoot>
				{#each $table.getFooterGroups() as footerGroup}
					<tr>
						{#each footerGroup.headers as header}
							<th>
								{#if !header.isPlaceholder}
									<svelte:component
										this={flexRender(header.column.columnDef.footer, header.getContext())}
									/>
								{/if}
							</th>
						{/each}
					</tr>
				{/each}
			</tfoot> -->
	</table>

	<!-- Pagination Desktop -->
	<div class="my-3 flex items-center justify-around text-surface-500">
		<!-- show & count rows -->
		<div class="hidden text-sm text-surface-500 dark:text-surface-400 md:block">
			{m.tanstacktable_page()}
			<span class="text-black dark:text-white">{$table.getState().pagination.pageIndex + 1}</span>
			{m.tanstacktable_of()}
			<!-- TODO: Get actual pages -->
			<!-- <span class="text-surface-700 dark:text-white">{$table.getState().pagination.pageCount}</span> -->
			<span class="text-black dark:text-white"
				>{Math.ceil($table.getPrePaginationRowModel().rows.length / $table.getState().pagination.pageSize)}</span
			>
			- (<span class="text-black dark:text-white"> {$table.getPrePaginationRowModel().rows.length}</span>
			{m.tanstacktable_total()}

			{#if $table.getPrePaginationRowModel().rows.length === 1}
				{m.tanstacktable_row()}
			{:else}
				{m.tanstacktable_rows()}
			{/if})
		</div>

		<!-- number of pages -->
		{#if $table.getPrePaginationRowModel().rows.length > 10}
			<!-- number of pages -->
			<select
				value={$table.getState().pagination.pageSize}
				on:change={setPageSize}
				class="select variant-ghost hidden max-w-[100px] rounded py-2 text-sm text-surface-500 dark:text-white sm:block"
			>
				{#each availablePageSizes as pageSize}
					<option value={pageSize}>
						{pageSize}
						{m.tanstacktable_rows()}
					</option>
				{/each}
			</select>
		{/if}

		<!-- next/previous pages -->
		<div class="variant-ghost btn-group inline-flex text-surface-500 transition duration-150 ease-in-out dark:text-white [&>*+*]:border-surface-500">
			<button
				type="button"
				class="w-6"
				aria-label="Go to First Page"
				on:keydown
				on:click={() => setCurrentPage(0)}
				class:is-disabled={!$table.getCanPreviousPage()}
				disabled={!$table.getCanPreviousPage()}
			>
				<iconify-icon icon="material-symbols:first-page" width="24" />
			</button>

			<button
				type="button"
				class="w-6"
				aria-label="Go to Previous Page"
				on:keydown
				on:click={() => setCurrentPage($table.getState().pagination.pageIndex - 1)}
				class:is-disabled={!$table.getCanPreviousPage()}
				disabled={!$table.getCanPreviousPage()}
			>
				<iconify-icon icon="material-symbols:chevron-left" width="24" />
			</button>

			<!-- input display -->
			<div class="flex items-center justify-center px-2 text-sm">
				<span class="pr-2"> {m.tanstacktable_page()} </span>

				<input
					type="number"
					value={$table.getState().pagination.pageIndex + 1}
					min={0}
					max={$table.getPageCount() - 1}
					on:change={handleCurrPageInput}
					class="variant-ghost-surface border-0 outline-none"
				/>
				<span class="pl-2">
					{' '}{m.tanstacktable_of()}{' '}
					<span class="">{$table.getPageCount()}</span>
				</span>
			</div>

			<button
				type="button"
				class="w-6"
				aria-label="Go to Next Page"
				on:keydown
				on:click={() => setCurrentPage($table.getState().pagination.pageIndex + 1)}
				class:is-disabled={!$table.getCanNextPage()}
				disabled={!$table.getCanNextPage()}
			>
				<iconify-icon icon="material-symbols:chevron-right" width="24" />
			</button>

			<button
				type="button"
				class="w-6"
				aria-label="Go to Last Page"
				on:keydown
				on:click={() => setCurrentPage($table.getPageCount() - 1)}
				class:is-disabled={!$table.getCanNextPage()}
				disabled={!$table.getCanNextPage()}
			>
				<iconify-icon icon="material-symbols:last-page" width="24" />
			</button>
		</div>
	</div>

	<!-- Pagination Mobile-->
	<div class="mb-2 flex flex-col items-center justify-center gap-2 md:hidden">
		{#if $table.getPrePaginationRowModel().rows.length > 10}
			<!-- number of pages -->
			<select value={$table.getState().pagination.pageSize} on:change={setPageSize} class="select max-w-[100px] text-sm sm:hidden">
				{#each availablePageSizes as pageSize}
					<option value={pageSize}>
						{pageSize}
						{m.tanstacktable_rows()}
					</option>
				{/each}
			</select>
		{/if}

		<!-- Pagination -->
		<div class="text-sm text-gray-400">
			<span class="text-black dark:text-white">{$table.getState().pagination.pageIndex + 1}</span>
			{m.tanstacktable_of()}
			<!-- TODO: Get actual page -->
			<!-- <span class="text-surface-700 dark:text-white"
				>{$table.getState().pagination.pageIndex + 1}</span
			> -->
			<span class="text-black dark:text-white"
				>{Math.ceil($table.getPrePaginationRowModel().rows.length / $table.getState().pagination.pageSize)}</span
			>
			- (<span class="text-black dark:text-white">{$table.getPrePaginationRowModel().rows.length}</span>
			{m.tanstacktable_total()}

			{#if $table.getPrePaginationRowModel().rows.length === 1}
				{m.tanstacktable_row()}
			{:else}
				{m.tanstacktable_rows()}{/if}
		</div>
	</div>
</div>
