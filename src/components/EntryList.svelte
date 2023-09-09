<script lang="ts">
	import {
		contentLanguage,
		categories,
		collection,
		mode,
		entryData,
		deleteEntry,
		handleSidebarToggle,
		toggleLeftSidebar,
		storeListboxValue
	} from '@src/stores/store';

	import axios from 'axios';
	import { writable } from 'svelte/store';
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import TanstackIcons from './TanstackIcons.svelte';

	//svelte-dnd-action
	import { dndzone } from 'svelte-dnd-action';

	import Loading from './Loading.svelte';
	let isLoading = false;
	let loadingTimer: any; // recommended time of around 200-300ms

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';

	import TanstackFilter from './TanstackFilter.svelte';

	let searchValue = '';
	let searchShow = false;
	let filterShow = false;
	let columnShow = false;

	// Retrieve density from local storage or set to 'normal' if it doesn't exist
	let density = localStorage.getItem('density') || 'normal';

	import {
		createSvelteTable,
		flexRender as flexRenderBugged,
		getCoreRowModel,
		getSortedRowModel,
		getPaginationRowModel
	} from '@tanstack/svelte-table';
	import type {
		ColumnDef,
		TableOptions,
		SortDirection,
		FilterFn
	} from '@tanstack/table-core/src/types';

	import FloatingInput from './system/inputs/floatingInput.svelte';
	import EntryListMultiButton from './EntryList_MultiButton.svelte';
	import TranslationStatus from './TranslationStatus.svelte';

	let data: { entryList: [any]; totalCount: number } | undefined;
	let tableData: any = [];

	let tickMap = {}; // Object to track ticked rows
	let tickAll = false;

	let sorting: any = [];
	let columnOrder: never[] = [];
	let columnVisibility = {};

	// This function refreshes the data displayed in a table by fetching new data from an API endpoint and updating the tableData and options variables.

	let refresh = async (collection: typeof $collection) => {
		loadingTimer = setTimeout(() => {
			isLoading = true;
		}, 400);

		//console.log('collection', $collection);

		if ($collection.name == '') return;

		data = undefined;
		data = (await axios
			.get(`/api/${$collection.name}?page=${1}&length=${50}`)
			.then((data) => data.data)) as { entryList: [any]; totalCount: number };

		//console.log('data', data);

		tableData = await Promise.all(
			data.entryList.map(async (entry) => {
				let obj: { [key: string]: any } = {};
				for (let field of collection.fields) {
					obj[field.label] = await field.display?.({
						data: entry[field.label],
						collection: $collection.name,
						field,
						entry,
						contentLanguage: $contentLanguage
					});
				}
				obj._id = entry._id;
				return obj;
			})
		);

		console.log(tableData);

		const storedValue = localStorage.getItem(`TanstackConfiguration-${$collection.name}`);
		const columns = storedValue ? JSON.parse(storedValue) : defaultColumns;
		options.update((options) => ({
			...options,
			data: tableData,
			columns: columns.map((item) => {
				return defaultColumns.find((col) => col.accessorKey == item.accessorKey);
			})
		}));

		tickMap = {};
		tickAll = false;

		clearTimeout(loadingTimer);
		isLoading = false;

		// READ CONFIG FROM LOCAL STORAGE AND APPLY THE VISIBILITY
		if (localStorage.getItem(`TanstackConfiguration-${$collection.name}`)) {
			JSON.parse(localStorage.getItem(`TanstackConfiguration-${$collection.name}`)).forEach(
				(item: any) => {
					getColumnByName(item.accessorKey)?.toggleVisibility(item.visible);
				}
			);
		}
	};

	let filteredData = tableData;
	// Create a reactive statement that updates the filteredData array whenever the searchValue changes
	$: {
		if (searchValue) {
			filteredData = tableData.filter((row) => {
				// Check if any of the values in this row match the search value
				return Object.values(row).some((value) =>
					(value as string).toString().toLowerCase().includes(searchValue.toLowerCase())
				);
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

	$: refresh($collection);
	$: process_tickAll(tickAll);
	$: Object.values(tickMap).includes(true) ? mode.set('delete') : mode.set('view');

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
	function process_tickAll(tickAll: boolean) {
		if (tickAll) {
			for (let item in tableData) {
				tickMap[item] = true;
			}
		} else {
			for (let item in tickMap) {
				tickMap[item] = false;
			}
		}
	}

	// Tick Row Process Entry (formerly $deleteEntry)processEntry function
	$deleteEntry = async () => {
		let deleteList: Array<string> = [];
		for (let item in tickMap) {
			//console.log(tableData[item]);
			tickMap[item] && deleteList.push(tableData[item]._id);
		}
		if (deleteList.length == 0) return;
		let formData = new FormData();
		formData.append('ids', JSON.stringify(deleteList));
		await axios.delete(`/api/${$collection.name}`, { data: formData });
		refresh($collection);
		mode.set('view');
	};

	const flipDurationMs = 100;

	// Update items array to be an array of column objects
	let items = $table.getAllLeafColumns().map((column, index) => ({
		id: column.id,
		name: column.id,
		isVisible: column.getIsVisible() // Set initial visibility state based on column visibility
	}));

	//console.log('EntryList item', items);

	function handleDndConsider(e: {
		detail: { items: { id: string; name: string; isVisible: boolean }[] };
	}) {
		items = e.detail.items;
	}

	function handleDndFinalize(e: {
		detail: { items: { id: string; name: string; isVisible: boolean }[] };
	}) {
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
			{#if $categories.length}<div
					class="mb-2 text-xs capitalize text-surface-500 dark:text-surface-300"
				>
					{$categories[0].name}
				</div>{/if}
			<div
				class="-mt-2 flex justify-start text-sm font-bold uppercase dark:text-white md:text-2xl lg:text-xl"
			>
				{#if $collection.icon}<span>
						<iconify-icon
							icon={$collection.icon}
							width="24"
							class="mr-1 text-error-500 sm:mr-2"
						/></span
					>{/if}
				{#if $collection.name}
					<div
						class="flex max-w-[65px] whitespace-normal leading-3 sm:mr-2 sm:max-w-none md:mt-0 md:leading-none xs:mt-1"
					>
						{$collection.name}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<button
		type="button"
		on:keydown
		on:click={() => (searchShow = !searchShow)}
		class="variant-ghost-surface btn-icon sm:hidden"
	>
		<iconify-icon icon="material-symbols:filter-list-rounded" width="30" />
	</button>

	<div class="relative hidden items-center justify-center gap-2 sm:flex">
		<TanstackFilter bind:searchValue bind:filterShow bind:columnShow bind:density />
		<TranslationStatus />
	</div>

	<!-- MultiButton -->
	<EntryListMultiButton />
</div>

<!-- Row 2 for Mobile  / Center on desktop -->
<!-- TODO:add  expand transition -->
<div
	class="relative flex h-14 items-center justify-center gap-1 py-2 dark:bg-surface-800 sm:gap-2 {!searchShow
		? 'hidden'
		: 'block'} sm:hidden"
>
	<TanstackFilter bind:searchValue bind:filterShow bind:columnShow bind:density />
	<TranslationStatus />
</div>

{#if columnShow}
	<!-- chip column order -->
	<div
		class="rounded-b-0 flex flex-col justify-center rounded-t-md border-b bg-surface-300 text-center dark:bg-surface-700"
	>
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
				{$LL.TANSTACK_Toggle()}
			</label>
			<section
				class="flex flex-wrap justify-center gap-1 rounded-md p-2"
				use:dndzone={{ items, flipDurationMs }}
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
{/if}

<!-- Tanstack Table -->
<div class="table-container">
	<table
		class="table table-hover {density === 'compact'
			? 'table-compact'
			: density === 'normal'
			? ''
			: 'table-comfortable'}"
	>
		<!-- Tanstack Header -->
		<thead class="text-primary-500">
			{#each $table.getHeaderGroups() as headerGroup}
				<tr class="divide-x divide-surface-400 border-b">
					<th class="!w-6">
						<TanstackIcons bind:checked={tickAll} />
					</th>

					{#each headerGroup.headers as header}
						<th class="">
							{#if !header.isPlaceholder}
								<button
									class:cursor-pointer={header.column.getCanSort()}
									class:select-none={header.column.getCanSort()}
									on:keydown
									on:click={header.column.getToggleSortingHandler()}
								>
									<svelte:component
										this={flexRender(header.column.columnDef.header, header.getContext())}
									/>
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
					class="divide-x divide-surface-400"
					on:keydown
					on:click={() => {
						entryData.set(data?.entryList[index]);
						//console.log(data)
						mode.set('edit');
						handleSidebarToggle();
					}}
				>
					<td>
						<TanstackIcons bind:checked={tickMap[index]} class="ml-1" />
					</td>

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
			{$LL.TANSTACK_Page()}
			<span class="text-black dark:text-white">{$table.getState().pagination.pageIndex + 1}</span>
			{$LL.TANSTACK_of()}
			<!-- TODO: Get actual pages -->
			<!-- <span class="text-surface-700 dark:text-white">{$table.getState().pagination.pageCount}</span> -->
			<span class="text-black dark:text-white"
				>{Math.ceil(
					$table.getPrePaginationRowModel().rows.length / $table.getState().pagination.pageSize
				)}</span
			>
			- (<span class="text-black dark:text-white"
				>{$table.getPrePaginationRowModel().rows.length}</span
			>
			{$LL.TANSTACK_Total()}

			{#if $table.getPrePaginationRowModel().rows.length === 1}
				{$LL.TANSTACK_Row()})
			{:else}
				{$LL.TANSTACK_Rows()})
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
			class="variant-ghost btn-group inline-flex text-surface-500 transition duration-150 ease-in-out dark:text-white [&>*+*]:border-surface-500"
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
				<span class="pr-2"> {$LL.TANSTACK_Page()} </span>

				<input
					type="number"
					value={$table.getState().pagination.pageIndex + 1}
					min={0}
					max={$table.getPageCount() - 1}
					on:change={handleCurrPageInput}
					class="variant-ghost-surface w-14 border-0"
				/>
				<span class="pl-2">
					{' '}{$LL.TANSTACK_of()}{' '}
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
			<select
				value={$table.getState().pagination.pageSize}
				on:change={setPageSize}
				class="select max-w-[100px] text-sm sm:hidden"
			>
				{#each [10, 25, 50, 100, 500].filter((pageSize) => pageSize <= $table.getPrePaginationRowModel().rows.length) as pageSize}
					<option value={pageSize}>
						{pageSize}
						{$LL.TANSTACK_Rows()}
					</option>
				{/each}
			</select>
		{/if}

		<!-- Pagination -->
		<div class="text-sm text-gray-400">
			<span class="text-black dark:text-white">{$table.getState().pagination.pageIndex + 1}</span>
			{$LL.TANSTACK_of()}
			<!-- TODO: Get actual page -->
			<!-- <span class="text-surface-700 dark:text-white"
				>{$table.getState().pagination.pageIndex + 1}</span
			> -->
			<span class="text-black dark:text-white"
				>{Math.ceil(
					$table.getPrePaginationRowModel().rows.length / $table.getState().pagination.pageSize
				)}</span
			>
			- (<span class="text-black dark:text-white"
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
