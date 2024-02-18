<script lang="ts">
	// Stores
	import { contentLanguage, categories, collection, mode, entryData, modifyEntry } from '@stores/store';
	import { handleSidebarToggle, toggleLeftSidebar } from '@stores/sidebarStore';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	import axios from 'axios';
	import { writable } from 'svelte/store';
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import TanstackIcons from './system/tanstack/TanstackIcons.svelte';

	//svelte-dnd-action
	import { dndzone } from 'svelte-dnd-action';

	import Loading from './Loading.svelte';
	let isLoading = false;
	let loadingTimer: any; // recommended time of around 200-300ms

	import TanstackFilter from './system/tanstack/TanstackFilter.svelte';

	let globalSearchValue = '';
	let searchShow = false;
	let filterShow = false;
	let columnShow = false;

	// Retrieve density from local storage or set to 'normal' if it doesn't exist
	let density = localStorage.getItem('density') || 'normal';

	import { createSvelteTable, flexRender as flexRenderBugged, getCoreRowModel, getSortedRowModel } from '@tanstack/svelte-table';
	import type { TableOptions } from '@tanstack/table-core/src/types';

	import FloatingInput from './system/inputs/floatingInput.svelte';
	import EntryListMultiButton from './EntryList_MultiButton.svelte';
	import TranslationStatus from './TranslationStatus.svelte';
	import { getFieldName } from '@utils/utils';

	let data: { entryList: [any]; totalCount: number } | undefined;
	let tableData: any = [];

	//tick logic
	let SelectAll = false;
	let selectedMap = writable({});

	let sorting: any = [];
	let columnOrder: never[] = [];
	let columnVisibility = {};

	// This function refreshes the data displayed in a table by fetching new data from an API endpoint and updating the tableData and options variables.

	let refresh = async (fetch: boolean = true) => {
		loadingTimer && clearTimeout(loadingTimer);

		if ($collection.name == '') return;

		if (fetch) {
			loadingTimer = setTimeout(() => {
				isLoading = true;
			}, 400);

			data = (await axios.get(`/api/${$collection.name}?page=${1}&length=${50}`).then((data) => data.data)) as {
				entryList: [any];
				totalCount: number;
			};

			isLoading = false;
			clearTimeout(loadingTimer);
		}

		data &&
			(tableData = await Promise.all(
				data.entryList.map(async (entry) => {
					let obj: { [key: string]: any } = {};
					for (let field of $collection.fields) {
						if ('callback' in field) {
							field.callback({ data });
						}
						obj[field.label] = await field.display?.({
							data: entry[getFieldName(field)],
							collection: $collection.name,
							field,
							entry,
							contentLanguage: $contentLanguage
						});
					}
					obj._id = entry._id;
					return obj;
				})
			));

		const storedValue = localStorage.getItem(`TanstackConfiguration-${$collection.name}`);
		const columns = storedValue ? JSON.parse(storedValue) : defaultColumns;

		options.update((options) => ({
			...options,
			data: tableData,
			columns: columns.map((item) => {
				return defaultColumns.find((col) => col.accessorKey == item.accessorKey);
			})
		}));

		// READ CONFIG FROM LOCAL STORAGE AND APPLY THE VISIBILITY
		if (localStorage.getItem(`TanstackConfiguration-${$collection.name}`)) {
			JSON.parse(localStorage.getItem(`TanstackConfiguration-${$collection.name}`)).forEach((item: any) => {
				getColumnByName(item.accessorKey)?.toggleVisibility(item.visible);
			});
		}
	};

	let filteredData = tableData;
	// Create a reactive statement that updates the filteredData array whenever the searchValue changes
	$: {
		if (globalSearchValue) {
			filteredData = tableData.filter((row) => {
				// Check if any of the values in this row match the search value
				return Object.values(row).some((value) => (value as string).toString().toLowerCase().includes(globalSearchValue.toLowerCase()));
			});
		} else {
			filteredData = tableData;
		}
	}

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

	$: {
		refresh();
		$collection;
	}
	$: {
		refresh(false);
		$contentLanguage;
	}
	$: process_selectAll(SelectAll);
	$: Object.values(selectedMap).includes(true) ? mode.set('delete') : mode.set('view');

	const defaultColumns = $collection.fields.map((field) => ({
		id: field.label,
		accessorKey: field.label
	}));

	const storedValue = localStorage.getItem(`TanstackConfiguration-${$collection.name}`);
	const columns = storedValue ? JSON.parse(storedValue) : defaultColumns;

	const options = writable<TableOptions<any>>({
		data: tableData,
		columns: columns.map((item) => {
			return defaultColumns.find((col) => col.accessorKey == item.accessorKey);
		}),

		state: {
			sorting,
			columnOrder
		},
		onSortingChange: setSorting,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		onColumnOrderChange: setColumnOrder,
		ColumnVisibilityChange: setColumnVisibility
	});

	var table = createSvelteTable(options);

	//workaround for svelte-table bug
	let flexRender = flexRenderBugged as (...args: Parameters<typeof flexRenderBugged>) => any;

	// Tick All
	function process_selectAll(selectAll: boolean) {
		if (selectAll) {
			for (let item in tableData) {
				selectedMap[item] = true;
			}
		} else {
			for (let item in selectedMap) {
				selectedMap[item] = false;
			}
		}
	}

	// Tick Row - modify STATUS of an Entry
	$modifyEntry = async (status: 'delete' | 'publish' | 'unpublish' | 'schedule' | 'clone' | 'test') => {
		// Initialize an array to store the IDs of the items to be modified
		let modifyList: Array<string> = [];

		// Loop over the selectedMap object
		for (let item in selectedMap) {
			// If the item is ticked, add its ID to the modifyList
			selectedMap[item] && modifyList.push(tableData[item]._id);
		}

		// If no items are ticked, exit the function
		if (modifyList.length == 0) return;

		// Initialize a new FormData object
		let formData = new FormData();

		// Define a map from input status to output status
		let statusMap = {
			delete: 'deleted',
			publish: 'published',
			unpublish: 'unpublished',
			schedule: 'scheduled',
			clone: 'cloned',
			test: 'testing'
		};

		// Append the IDs of the items to be modified to formData
		formData.append('ids', JSON.stringify(modifyList));

		// Append the status to formData
		formData.append('status', statusMap[status]);

		// Use the status to determine which API endpoint to call and what HTTP method to use
		switch (status) {
			case 'delete':
				// If the status is 'Delete', call the delete endpoint
				await axios.delete(`/api/${$collection.name}`, { data: formData });
				break;
			case 'publish':
			case 'unpublish':
			case 'test':
				// If the status is 'publish', 'unpublish', 'schedule', or 'clone', call the patch endpoint
				await axios.patch(`/api/${$collection.name}/setStatus`, formData).then((res) => res.data);
				break;
			case 'clone':
				await axios.post(`/api/${$collection.name}/clone`, formData);
				break;
			case 'schedule':
				await axios.post(`/api/${$collection.name}/schedule`, formData);
				break;
		}

		// Refresh the collection
		refresh();

		// Set the mode to 'view'
		mode.set('view');
		// console.log('EntryList.svelte', $mode);
	};

	const flipDurationMs = 100;

	// Update items array to be an array of column objects
	let items = $table.getAllLeafColumns().map((column, index) => ({
		id: column.id,
		name: column.id,
		isVisible: column.getIsVisible() // Set initial visibility state based on column visibility
	}));

	// console.log('EntryList item', items);

	function handleDndConsider(e: { detail: { items: { id: string; name: string; isVisible: boolean }[] } }) {
		items = e.detail.items;
	}

	function handleDndFinalize(e: { detail: { items: { id: string; name: string; isVisible: boolean }[] } }) {
		items = e.detail.items;

		// Update column Order based on new order
		const newOrder = {};
		items.forEach((item) => {
			newOrder[item.id] = item.isVisible;
		});

		items = items.map((item) => {
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

		// console.log('table', $table.setColumnOrder);
		// console.log('columnOrder2', columnOrder);

		var remappedColumns = items.map((item) => {
			return defaultColumns.find((col) => {
				return col.accessorKey == item.id;
			});
		});
		options.update((old) => {
			return {
				...old,
				columns: remappedColumns
			};
		});
		localStorage.setItem(
			`TanstackConfiguration-${$collection.name}`,
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
	items = items.map((item) => {
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
	// console.log('columnOrder', columnOrder);
	// console.log('items', items);

	function getColumnByName(name) {
		return $table.getAllLeafColumns().find((col) => {
			return col.id == name;
		});
	}

	// define status badge color
	function getStatusClass(status) {
		switch (status) {
			case 'publish':
				return 'gradient-tertiary';
			case 'unpublish':
				return 'gradient-yellow';
			case 'schedule':
				return 'gradient-pink';
			default:
				return 'gradient-error';
		}
	}
</script>

<!-- TanstackHeader -->
<div class="mb-2 flex justify-between dark:text-white">
	<!-- Row 1 for Mobile -->
	<div class="flex items-center justify-between">
		<!-- Hamburger -->
		{#if $toggleLeftSidebar === 'closed'}
			<button
				type="button"
				on:keydown
				on:click={() => {
					// console.log('Hamburger clicked');
					toggleLeftSidebar.click();
				}}
				class="variant-ghost-surface btn-icon mt-1"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24" />
			</button>
		{/if}
		<!-- Collection type with icon -->
		<!-- TODO: Translate Collection Name -->
		<div class="mr-1 flex flex-col {!$toggleLeftSidebar ? 'ml-2' : 'ml-1 sm:ml-2'}">
			{#if $categories.length}<div class="mb-2 text-xs capitalize text-surface-500 dark:text-surface-300 rtl:text-left">
					{$categories[0].name}
				</div>{/if}
			<div class="-mt-2 flex justify-start text-sm font-bold uppercase dark:text-white md:text-2xl lg:text-xl">
				{#if $collection.icon}<span> <iconify-icon icon={$collection.icon} width="24" class="mr-1 text-error-500 sm:mr-2" /></span>{/if}
				{#if $collection.name}
					<div class="flex max-w-[65px] whitespace-normal leading-3 sm:mr-2 sm:max-w-none md:mt-0 md:leading-none xs:mt-1">
						{$collection.name}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<button type="button" on:keydown on:click={() => (searchShow = !searchShow)} class="variant-ghost-surface btn-icon sm:hidden">
		<iconify-icon icon="material-symbols:filter-list-rounded" width="30" />
	</button>

	<div class="relative hidden items-center justify-center gap-2 sm:flex">
		<TanstackFilter bind:globalSearchValue bind:filterShow bind:columnShow bind:density />
		<TranslationStatus />
	</div>

	<!-- MultiButton -->
	<EntryListMultiButton />
</div>

<!-- Row 2 for Mobile  / Center on desktop -->
<!-- TODO:add  expand transition -->
<div class="relative flex h-14 items-center justify-center gap-1 py-2 dark:bg-surface-800 sm:gap-2 {!searchShow ? 'hidden' : 'block'} sm:hidden">
	<TanstackFilter bind:globalSearchValue bind:filterShow bind:columnShow bind:density />
	<TranslationStatus />
</div>

{#if columnShow}
	<!-- chip column order -->
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
				{m.entrylist_all()}
			</label>
			<section
				class="flex flex-wrap justify-center gap-1 rounded-md p-2"
				use:dndzone={{ items: items, flipDurationMs }}
				on:consider={handleDndConsider}
				on:finalize={handleDndFinalize}
			>
				{#each items as item (item.id)}
					<button
						class="chip {$table
							.getAllLeafColumns()
							.find((col) => col.id == item.name)
							?.getIsVisible() ?? false
							? 'variant-filled-secondary'
							: 'variant-ghost-secondary'} w-100 mr-2 flex items-center justify-center"
						animate:flip={{ duration: flipDurationMs }}
						on:click={() => {
							getColumnByName(item.name)?.toggleVisibility();
							localStorage.setItem(
								`TanstackConfiguration-${$collection.name}`,
								JSON.stringify(
									items.map((item) => {
										return {
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
							.find((col) => col.id == item.name)
							?.getIsVisible() ?? false}
							<span><iconify-icon icon="fa:check" /></span>
						{/if}
						<span class="ml-2 capitalize">{item.name}</span>
					</button>
				{/each}
			</section>
		</div>
	</div>
{/if}

<!-- Tanstack Table -->
{#if isLoading}
	<Loading />
{:else}
	<!-- Tanstack Table -->
	<div class="table-container z-0">
		<table class="table table-hover {density === 'compact' ? 'table-compact' : density === 'normal' ? '' : 'table-comfortable'}">
			<!-- Tanstack Header -->
			<thead class="text-dark dark:text-primary-500">
				{#each $table.getHeaderGroups() as headerGroup}
					<tr class="divide-x divide-surface-400 border-b border-black dark:border-white">
						<!-- Tanstack Tickbox -->
						<th class="!w-6">
							<TanstackIcons bind:checked={SelectAll} />
						</th>

						<!-- Tanstack Other Headers -->
						{#each headerGroup.headers as header}
							<th class="">
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
										<div transition:slide|global>
											<FloatingInput
												type="text"
												icon="material-symbols:search-rounded"
												label="Filter ..."
												on:input={(e) => {
													// Update filter value for this column
													header.column.setFilter(e.target.value);
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

			<tbody>
				{#each $table.getRowModel().rows as row, index}
					<tr
						class={`${
							data?.entryList[index]?.status == 'unpublished' ? '!bg-yellow-700' : data?.entryList[index]?.status == 'testing' ? 'bg-red-800' : ''
						} divide-x divide-surface-400`}
						on:keydown
						on:click={() => {
							entryData.set(data?.entryList[index]);
							//console.log(data)
							mode.set('edit');
							handleSidebarToggle();
						}}
					>
						<!-- TickRows -->
						<td>
							<TanstackIcons
								bind:checked={selectedMap[index]}
								on:keydown
								on:click={() => {
									selectedMap.update((map) => ({ ...map, [row.id]: !map[row.id] }));
									mode.set('edit');
									handleSidebarToggle();
								}}
								class="ml-1"
							/>
						</td>

						<!-- <td>
						<span class="badge rounded-full {getStatusClass(row.status)}">
							{#if row.status === 'publish'}
								<iconify-icon icon="bi:hand-thumbs-up-fill" width="24" />
							{:else if row.status === 'unpublish'}
								<iconify-icon icon="bi:pause-circle" width="24" />
							{:else if row.status === 'schedule'}
								<iconify-icon icon="bi:clock" width="24" />
							{:else if row.status === 'undefined'}
								<iconify-icon icon="material-symbols:error" width="24" />
							{/if}
						</span>
					</td> -->

						{#each row.getVisibleCells() as cell}
							<td>
								<!-- {cell.getValue()} -->
								{@html cell.getValue()}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>

			<!-- <tfoot>
			{#each $table.getFooterGroups() as footerGroup}
				<tr>
					{#each footerGroup.headers as header}
						<th>
							{#if !header.isPlaceholder}
								<svelte:component this={flexRender(header.column.columnDef.footer, header.getContext())} />
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
				{m.entrylist_page()}
				<span class="text-black dark:text-white">{$table.getState().pagination.pageIndex + 1}</span>
				{m.entrylist_of()}
				<!-- TODO: Get actual pages -->
				<!-- <span class="text-surface-700 dark:text-white">{$table.getState().pagination.pageCount}</span> -->
				<span class="text-black dark:text-white"
					>{Math.ceil($table.getPrePaginationRowModel().rows.length / $table.getState().pagination.pageSize)}</span
				>
				- (<span class="text-black dark:text-white">{$table.getPrePaginationRowModel().rows.length}</span>
				{m.entrylist_total()}

				{#if $table.getPrePaginationRowModel().rows.length === 1}
					{m.entrylist_row()})
				{:else}
					{m.entrylist_rows()})
				{/if}
			</div>

			<!-- number of pages -->
			{#if $table.getPrePaginationRowModel().rows.length > 10}
				<!-- number of pages -->
				<select
					value={$table.getState().pagination.pageSize}
					on:change={setPageSize}
					class="select variant-ghost hidden max-w-[100px] rounded py-2 text-sm text-surface-500 dark:text-white sm:block"
				>
					{#each [10, 25, 50, 100, 500].filter((pageSize) => pageSize <= $table.getPrePaginationRowModel().rows.length) as pageSize}
						<option value={pageSize}>
							{pageSize} Rows
						</option>
					{/each}
				</select>
			{/if}

			<!-- next/previous pages -->
			<div
				class="variant-outline btn-group inline-flex text-surface-500 transition duration-150 ease-in-out dark:text-white [&>*+*]:border-surface-500"
			>
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
					<span class="pr-2"> {m.entrylist_page()} </span>

					<input
						type="number"
						value={$table.getState().pagination.pageIndex + 1}
						min={0}
						max={$table.getPageCount() - 1}
						on:change={handleCurrPageInput}
						class="variant-ghost w-12 text-center"
					/>
					<span class="pl-2">
						{' '}{m.entrylist_of()}{' '}
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
		<div class="flex flex-col items-center justify-center gap-2 md:hidden">
			{#if $table.getPrePaginationRowModel().rows.length > 10}
				<!-- number of pages -->
				<select value={$table.getState().pagination.pageSize} on:change={setPageSize} class="select max-w-[100px] text-sm sm:hidden">
					{#each [10, 25, 50, 100, 500].filter((pageSize) => pageSize <= $table.getPrePaginationRowModel().rows.length) as pageSize}
						<option value={pageSize}>
							{pageSize}
							{m.entrylist_row()}
						</option>
					{/each}
				</select>
			{/if}

			<!-- Pagination -->
			<div class="text-sm text-gray-400">
				<span class="text-black dark:text-white">{$table.getState().pagination.pageIndex + 1}</span>
				{m.entrylist_of()}
				<!-- TODO: Get actual page -->
				<!-- <span class="text-surface-700 dark:text-white"
				>{$table.getState().pagination.pageIndex + 1}</span
			> -->
				<span class="text-black dark:text-white"
					>{Math.ceil($table.getPrePaginationRowModel().rows.length / $table.getState().pagination.pageSize)}</span
				>
				- (<span class="text-black dark:text-white">{$table.getPrePaginationRowModel().rows.length}</span>
				{m.entrylist_total()}

				{#if $table.getPrePaginationRowModel().rows.length === 1}
					{m.entrylist_row()})
				{:else}
					{m.entrylist_rows()})
				{/if}
			</div>
		</div>
	</div>
{/if}
