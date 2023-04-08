<script lang="ts">
	import { writable } from 'svelte/store';
	import Multibutton from '$src/routes/[[lang]]/user/UserList/Multibutton.svelte';

	//skelton
	import { Avatar } from '@skeletonlabs/skeleton';
	import { Drawer, drawerStore } from '@skeletonlabs/skeleton';
	import type { DrawerSettings } from '@skeletonlabs/skeleton';
	import { Accordion, AccordionItem } from '@skeletonlabs/skeleton';
	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';

	function triggerFacets(): void {
		const drawerSettings: DrawerSettings = {
			id: 'facets',
			// Provide your property overrides:
			position: 'left',
			// bgDrawer: 'bg-purple-900 text-white',
			// bgBackdrop: 'bg-gradient-to-tr from-indigo-500/50 via-purple-500/50 to-pink-500/50',
			width: 'w-[280px] md:w-[480px]',
			//padding: 'p-4',
			// rounded: 'rounded-xl',
			// Metadata
			meta: 'Facet Drawer'
		};
		drawerStore.open(drawerSettings);
	}

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';
	import type { PageData } from '../$types';

	export let parent: PageData;

	const user = parent.user;

	const listOfUsers = JSON.parse(parent.users); // Retrieve User and parse them as JSON

	// State to keep track of whether the modal is open or not
	let showModal = false;

	// State to keep track of the selected user
	let selectedUser: any;

	let columnShow = false;
	let filterShow = false;

	// #############################################
	// tanStack Table
	// #############################################

	// search filter
	// TODO: Search be selected column
	let filterData = '';
	function updateFilter(e: KeyboardEvent) {
		filterData = (e.target as HTMLInputElement).value.toLowerCase();
	}

	import {
		createSvelteTable,
		flexRender,
		getCoreRowModel,
		getSortedRowModel,
		getFilteredRowModel,
		getFacetedRowModel,
		getFacetedUniqueValues,
		getFacetedMinMaxValues,
		getPaginationRowModel
	} from '@tanstack/svelte-table';

	import type { ColumnDef, TableOptions, SortDirection, FilterFn } from '@tanstack/svelte-table';
	import { rankItem } from '@tanstack/match-sorter-utils';

	import FacetCheckboxes from '$src/components/tanstackTable/FacetCheckboxes.svelte';
	import FacetMinMax from '$src/components/tanstackTable/FacetMinMax.svelte';

	import exportExcel from '$src/components/excelExport';
	function clickDownload() {
		exportExcel($table, 'user', true);
	}

	import moment from 'moment';
	import Role from './Role.svelte';

	type User = {
		avatar: string;
		email: string;
		role: string;
		username: string;
		lastAccessAt: string;
		createdAt: string;
	};

	const defaultData = listOfUsers.map((user: User) => ({
		avatar: user.avatar,
		username: user.username,
		email: user.email,
		role: user.role,
		lastAccessAt: user.lastAccessAt,
		createdAt: user.createdAt
	}));

	const globalFilterFn: FilterFn<any> = (row, columnId, value, addMeta) => {
		if (Array.isArray(value)) {
			if (value.length === 0) return true;
			return value.includes(row.getValue(columnId));
		}
		// Rank the item
		const itemRank = rankItem(row.getValue(columnId), value);
		// Store the itemRank info
		addMeta({
			itemRank
		});
		// Return if the item should be filtered in/out
		return itemRank.passed;
	};

	// Display Columns
	const defaultColumns: ColumnDef<User>[] = [
		{
			accessorKey: 'avatar',
			header: () => 'Avatar',
			footer: (info) => info.column.id,
			cell: (info) =>
				flexRender(Avatar, {
					src: info.row.original.avatar,
					width: 'w-8'
				})
		},
		{
			accessorKey: 'username',
			header: () => 'Username',
			footer: (info) => info.column.id,
			cell: (info) => info.getValue(),
			filterFn: globalFilterFn
		},
		{
			accessorKey: 'role',
			header: () => 'Role',
			footer: (info) => info.column.id,
			cell: (info) =>
				flexRender(Role, {
					value: info.getValue()
				}),
			filterFn: globalFilterFn
		},
		{
			accessorKey: 'email',
			header: () => 'Email',
			footer: (info) => info.column.id,
			cell: (info) => info.getValue(),
			filterFn: globalFilterFn
		},
		{
			accessorKey: 'createdAt',
			header: () => 'Member For',
			footer: (info) => info.column.id,
			accessorFn: (cell) => moment(cell.createdAt).fromNow(),
			filterFn: globalFilterFn
		},
		{
			accessorKey: 'lastAccessAt',
			header: () => 'Last Access',
			footer: (info) => info.column.id,
			accessorFn: (cell) => moment(cell.lastAccessAt).fromNow(),
			filterFn: globalFilterFn
		}
		// {
		// 	accessorKey: 'id',
		// 	header: 'ID',
		// 	cell: (info) => (info.getValue() as number).toString()
		// }
	];

	let globalFilter = '';
	// let rowSelection = '';
	// let onRowSelectionChange = '';
	// let setRowSelection = '';
	let columnVisibility = {};
	let sorting: any = [];

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

	const options = writable<TableOptions<User>>({
		data: defaultData,
		columns: defaultColumns,
		state: {
			sorting
		},
		onSortingChange: setSorting,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onColumnVisibilityChange: setColumnVisibility,

		// onColumnOrderChange: setColumnOrder,
		// onRowSelectionChange: setRowSelection,

		globalFilterFn: globalFilterFn,
		onSortingChange: setSorting,
		getFacetedRowModel: getFacetedRowModel(),
		getFacetedUniqueValues: getFacetedUniqueValues(),
		getFacetedMinMaxValues: getFacetedMinMaxValues(),
		getPaginationRowModel: getPaginationRowModel(),

		state: {
			globalFilter,
			columnVisibility,
			// rowSelection,
			// columnOrder,
			pagination: {
				pageSize: 10,
				pageIndex: 0
			}
		}
		// enableGlobalFilter: true
		// enableRowSelection: true //enable row selection for all rows
		// enableRowSelection: row => row.original.age > 18, // or enable row selection conditionally per row

		// debugTable: true
		// debugHeaders: true,
		// debugColumns: true
	});

	const refreshData = () => {
		//console.info('refresh');
		options.update((prev) => ({
			...prev,
			data: defaultData
		}));
	};

	const rerender = () => {
		options.update((options) => ({
			...options,
			data: defaultData
		}));
	};

	const table = createSvelteTable(options);

	function setGlobalFilter(filter: string) {
		globalFilter = filter;
		options.update((old) => {
			return {
				...old,
				state: {
					...old.state,
					globalFilter: filter
				}
			};
		});
	}
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

	let timer: NodeJS.Timeout;

	function handleSearch(e: Event) {
		clearTimeout(timer);
		timer = setTimeout(() => {
			const target = e.target as HTMLInputElement;
			setGlobalFilter(target.value);
		}, 300);
	}

	function handleCurrPageInput(e: Event) {
		const target = e.target as HTMLInputElement;
		setCurrentPage(parseInt(target.value) - 1);
	}

	const noTypeCheck = (x: any) => x;

	let headerGroups = $table.getHeaderGroups();
</script>

<h4 class="mb-2 text-error-500">List of aktive Users Invites:</h4>

<table>
	<thead class="bg-surface-600 rounded-t border-b-2 text-white">
		<tr class="divide-x-2">
			<th class="px-2">Email</th>
			<th class="px-2">role</th>
			<th class="px-2">valid</th>
			<th class="px-2">Action</th>
		</tr>
	</thead>
	<tbody>
		<tr class="divide-x-2">
			<td class="px-2">email</td>
			<td class="px-2">role</td>
			<td class="px-2">expiers At</td>
			<td>
				<button class="btn btn-sm px-2">Delete</button>
			</td>
		</tr>
	</tbody>
</table>
<hr />
<!-- ////////////////////////////////////////// -->
<h4 class="my-4">{$LL.TANSTACK_UserList()}</h4>

<div class="flex flex-col md:flex-row md:items-center md:justify-between mb-2 gap-2">
	<div class="flex justify-between items-center gap-2 relative mx-auto">
		<!-- Search selected column -->
		<input
			{...noTypeCheck(null)}
			on:keyup={handleSearch}
			on:search={handleSearch}
			placeholder={$LL.SBL_Search()}
			class="input relative z-10 h-10 w-full cursor-pointer rounded-md border border-surface-700 bg-surface-300/50 pl-12 text-black shadow-xl outline-none focus:cursor-text dark:bg-surface-600/50 dark:text-white"
		/>
		<!-- Search icon -->
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="absolute inset-y-0 my-auto h-8 w-12 border-transparent stroke-black px-3.5 dark:stroke-white"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
			/>
		</svg>
		<!-- Column Order/ Sort-->
		<button class="btn variant-ghost" on:click={() => (columnShow = !columnShow)}>
			<iconify-icon icon="fluent:column-triple-edit-24-regular" width="20" class="mr-1" />
			<span class="hidden sm:block">{$LL.TANSTACK_Column()}</span><iconify-icon
				icon="mdi:chevron-down"
				width="20"
				class="text-white ml-2"
			/>
		</button>

		<!-- Filter -->
		<button class="btn variant-ghost" on:click={triggerFacets}>
			<iconify-icon icon="carbon:filter-edit" width="20" class="mr-1" />
			<span class="hidden sm:block">{$LL.TANSTACK_Filter()}</span><iconify-icon
				icon="mdi:chevron-down"
				width="20"
				class="text-white ml-2"
			/>
		</button>

		<!-- Export -->
		<button class="btn variant-ghost" on:click={clickDownload}>
			<iconify-icon icon="dashicons:database-export" width="20" class="mr-1" />
			<span class="hidden sm:block">{$LL.TANSTACK_Export()}</span>
			<!-- <iconify-icon 
				icon="mdi:chevron-down"
				width="20"
				class="text-white ml-2"
			/> -->
		</button>
	</div>
	<!-- TODO: Multibutton breaks if used 2x times -->
	<div class="md:items-end">
		<Multibutton />
	</div>
</div>
{#if columnShow}
	<div class="md:mr-2 md:mb-0 mb-4 flex items-center justify-center md:justify-end" />

	<div class="flex flex-col md:flex-row md:flex-wrap md:items-center md:justify-center">
		<!-- toggle all -->
		<div class="flex items-center mb-2 md:mb-0 md:mr-4">
			<label>
				<input
					checked={$table.getIsAllColumnsVisible()}
					on:change={(e) => {
						console.info($table.getToggleAllColumnsVisibilityHandler()(e));
					}}
					type="checkbox"
				/>{' '}
				{$LL.TANSTACK_Toggle()}
			</label>
		</div>
		<!-- Show/hide Columns via chips -->
		<div class="flex flex-wrap items-center justify-center">
			{#each $table.getAllLeafColumns() as column}
				<span
					class="chip {column.getIsVisible()
						? 'variant-filled-secondary'
						: 'variant-ghost-secondary'} mx-2 my-1"
					on:click={column.getToggleVisibilityHandler()}
					on:keypress
				>
					{#if column.getIsVisible()}<span><iconify-icon icon="fa:check" /></span>{/if}
					<span class="capitalize">{column.id}</span>
				</span>
			{/each}
		</div>
	</div>
{/if}

<!-- Facets blocks -->
<Drawer>
	<h2 class="mb-3 text-center">Facets Filters</h2>
	<Accordion>
		{#each headerGroups as headerGroup}
			{#each headerGroup.headers as header}
				{#if header.column.id === 'role'}
					<AccordionItem open>
						<svelte:fragment slot="lead" />
						<svelte:fragment slot="summary">Roles</svelte:fragment>
						<svelte:fragment slot="content"
							><FacetCheckboxes table={$table} column={header.column} /></svelte:fragment
						>
					</AccordionItem>
				{/if}
			{/each}
		{/each}
	</Accordion>
</Drawer>

<!-- tanstack table -->
<div class="table-container">
	<table class="table table-hover">
		<thead>
			{#each $table.getHeaderGroups() as headerGroup}
				<tr class="divide-x">
					{#each headerGroup.headers as header}
						<th colSpan={header.colSpan} class="text-center">
							{#if !header.isPlaceholder}
								<div
									class:cursor-pointer={header.column.getCanSort()}
									class:select-none={header.column.getCanSort()}
									on:click={header.column.getToggleSortingHandler()}
								>
									<svelte:component
										this={flexRender(header.column.columnDef.header, header.getContext())}
									/>
									{{
										asc: ' 🔼',
										desc: ' 🔽'
									}[header.column.getIsSorted().toString()] ?? ''}
								</div>
							{/if}
						</th>
					{/each}
				</tr>
			{/each}
		</thead>
		<tbody>
			{#each $table.getCoreRowModel().rows.slice(0, 20) as row}
				<tr class="divide-x">
					{#each row.getVisibleCells() as cell}
						<td>
							<svelte:component this={flexRender(cell.column.columnDef.cell, cell.getContext())} />
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>

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
