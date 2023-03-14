<script lang="ts">
	import { writable } from 'svelte/store';
	import Multibutton from '$src/routes/[[lang]]/user/UserList/Multibutton.svelte';

	//skelton
	import { Avatar } from '@skeletonlabs/skeleton';
	import { Drawer, drawerStore } from '@skeletonlabs/skeleton';
	import type { DrawerSettings } from '@skeletonlabs/skeleton';

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

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';
	import type { PageData } from '../$types';

	export let list: PageData;

	// Lucia
	import { getUser } from '@lucia-auth/sveltekit/client';
	const user = getUser();

	const listOfUsers = JSON.parse(list.user); // Retrieve User and parse them as JSON

	// State to keep track of whether the modal is open or not
	let showModal = false;

	// State to keep track of the selected user
	let selectedUser: any;

	let columnShow = false;
	let filterShow = false;

	// tanStack Table

	// search filter
	// TODO: Search be selected column
	// let filterData = '';
	// function updateFilter(e: KeyboardEvent) {
	// 	filterData = (e.target as HTMLInputElement).value.toLowerCase();
	// }

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

	import moment from 'moment';

	const numFormat = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

	function getSortSymbol(isSorted: boolean | SortDirection) {
		return isSorted ? (isSorted === 'asc' ? '🔼' : '🔽') : '';
	}

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
		//  <Avatar src={user.avatar} width="w-10" />
		{
			accessorKey: 'avatar',
			footer: (info) => info.column.id,
			header: () => 'Avatar'
		},
		{
			accessorKey: 'username',
			footer: (info) => info.column.id,
			header: () => 'Username'
		},
		{
			accessorKey: 'role',
			header: () => 'Role',
			footer: (info) => info.column.id
		},
		{
			accessorKey: 'email',
			header: () => 'Email',
			footer: (info) => info.column.id
		},
		{
			accessorFn: (cell) => moment(cell.createdAt).fromNow(),
			accessorKey: 'createdAt',
			header: () => 'Member For',
			footer: (info) => info.column.id
		},
		{
			accessorFn: (cell) => moment(cell.lastAccessAt).fromNow(),
			accessorKey: 'lastAccessAt',
			header: () => 'Last Access',
			footer: (info) => info.column.id
		}
		// {
		// 	accessorKey: 'id',
		// 	header: 'ID',
		// 	size: 60
		// }
	];

	let globalFilter = '';
	let columnVisibility = {};
	let sorting = {};

	const setColumnVisibility = (updater) => {
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

	const setSorting = (updater) => {
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
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onColumnVisibilityChange: setColumnVisibility,

		globalFilterFn: globalFilterFn,
		getFacetedRowModel: getFacetedRowModel(),
		getFacetedUniqueValues: getFacetedUniqueValues(),
		getFacetedMinMaxValues: getFacetedMinMaxValues(),
		getPaginationRowModel: getPaginationRowModel(),
		state: {
			globalFilter,
			columnVisibility,
			pagination: {
				pageSize: 10,
				pageIndex: 0
			}
		},
		enableGlobalFilter: true
	});

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
Cant get Vaild Invites from DB
<!-- <table>
	<thead class="bg-surface-600 rounded-t border-b-2">
		<tr class="divide-x-2">
			<th class="px-2">Id</th>
			<th class="px-2">Email</th>
			<th class="px-2">valid</th>
		</tr>
	</thead>
	<tbody>
		{#each listOftokens as token}
			<tr class="divide-x-2">
				<td class="px-2">{token.email}</td>
				<td class="px-2">{token.role}</td>
				<td class="px-2">{token.expiresAt}</td>
				<td>
					<button>Edit</button>
					<button>Delete</button>
				</td>
			</tr>
		{/each}
	</tbody>
</table> -->

<!-- ////////////////////////////////////////// -->
<h4 class="mb-2">List of Users Tanstack:</h4>

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
			class="absolute inset-y-0 my-auto h-8 w-12 border-transparent stroke-black px-3.5 dark:stroke-white "
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

		<button class="btn variant-ghost" on:click={() => (columnShow = !columnShow)}>
			<Icon icon="fluent:column-triple-edit-24-regular" width="20" class="mr-1" />Columns<Icon
				icon="mdi:chevron-down"
				width="20"
				class="text-white ml-2"
			/>
		</button>

		<button class="btn variant-ghost" on:click={triggerFacets}>
			<Icon icon="carbon:filter-edit" width="20" class="mr-1" />Filter/Facets<Icon
				icon="mdi:chevron-down"
				width="20"
				class="text-white ml-2"
			/>
		</button>
	</div>

	<div class="md:items-end"><Multibutton /></div>
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
				Toggle All
			</label>
		</div>
		<!-- Show/hide Columns via chips -->
		<div class="flex flex-wrap items-center justify-center">
			{#each $table.getAllLeafColumns() as column}
				<div
					class="chip {column.getIsVisible()
						? 'variant-filled-secondary'
						: 'variant-ghost-secondary'} mx-2 my-1"
				>
					<label>
						<input
							checked={column.getIsVisible()}
							on:change={column.getToggleVisibilityHandler()}
							type="checkbox"
						/>{' '}
						<span class="capitalize">{column.id}</span>
					</label>
				</div>
			{/each}
			<div class="text-error-500">please fix</div>
			{#each $table.getAllLeafColumns() as column}
				<span
					class="chip {column.getIsVisible()
						? 'variant-filled-secondary'
						: 'variant-ghost-secondary'} mx-2 my-1"
					on:click={() => {
						{
							column.getIsVisible(column.id);
						}
					}}
					on:keypress
				>
					{#if column.getIsVisible()}<span><Icon icon="fa:check" /></span>{/if}
					<span class="capitalize">{column.id}</span>
				</span>
			{/each}
		</div>
	</div>
{/if}

<!-- Facets blocks -->
<Drawer>
	<p class="mb-3">Facets Filters</p>
	<!-- TODO add right Facets -->
	{#each headerGroups as headerGroup}
		{#each headerGroup.headers as header}
			{#if header.column.id === 'country'}
				<details open>
					<summary> <h3 class="has-text-weight-semibold is-inline-block">Countries</h3></summary>
					<FacetCheckboxes table={$table} column={header.column} />
				</details>
			{:else if header.column.id === 'state'}
				<details open>
					<summary> <h3 class="has-text-weight-semibold is-inline-block">State</h3></summary>
					<FacetCheckboxes table={$table} column={header.column} />
				</details>
			{:else if header.column.id === 'total'}
				<details open>
					<summary> <h3 class="has-text-weight-semibold is-inline-block">Total</h3></summary>
					<FacetMinMax table={$table} column={header.column} />
				</details>
			{/if}
		{/each}
	{/each}
</Drawer>

<!-- tanstack table -->
<div class="table-container">
	<table class="table table-hover ">
		<thead>
			{#each $table.getHeaderGroups() as headerGroup}
				<tr class="divide-x">
					{#each headerGroup.headers as header}
						<th colSpan={header.colSpan}>
							{#if !header.isPlaceholder}
								<button
									class="button is-white"
									class:is-disabled={!header.column.getCanSort()}
									disabled={!header.column.getCanSort()}
									on:click={header.column.getToggleSortingHandler()}
								>
									<svelte:component
										this={flexRender(header.column.columnDef.header, header.getContext())}
									/>
									<span class="pl-1">
										{getSortSymbol(header.column.getIsSorted())}
									</span>
								</button>
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

	<!-- paginagtion -->
	<!-- TODO need more work use the css from entrylist -->

	<!-- Pagination -->
	<div class="flex justify-around items-center my-3">
		<!-- show & count rows -->
		<div class="text-surface-400 text-sm">
			Showing
			<span class="text-white">{$table.getState().pagination.pageIndex + 1}</span>
			to
			<!-- TODO: Get actual page -->
			<span class="text-white">{$table.getState().pagination.pageIndex + 1}</span>
			of
			<span class="text-white">{$table.getPrePaginationRowModel().rows.length}</span> Total
			<!-- TODO: check if only 1 Row -->
			{#if 1 === 1}
				Row
			{:else}
				Rows{/if}
		</div>

		<!-- number of pages -->
		<select
			value={$table.getState().pagination.pageSize}
			on:change={setPageSize}
			class="max-w-[100px] select variant-ghost text-sm"
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
				class="w-5"
				on:click={() => setCurrentPage(0)}
				class:is-disabled={!$table.getCanPreviousPage()}
				disabled={!$table.getCanPreviousPage()}
			>
				{'<<'}
			</button>

			<button
				class="w-5"
				on:click={() => setCurrentPage($table.getState().pagination.pageIndex - 1)}
				class:is-disabled={!$table.getCanPreviousPage()}
				disabled={!$table.getCanPreviousPage()}
			>
				{'<'}
			</button>
			<div class="px-2 justify-center items-center text-sm">
				<span> Page </span>

				<input
					type="number"
					value={$table.getState().pagination.pageIndex + 1}
					min={0}
					max={$table.getPageCount() - 1}
					on:change={handleCurrPageInput}
					class="input w-16 !border-0 variant-ghost mt-[1px] rounded-none"
				/>
				<span>
					{' '}of{' '}
					{$table.getPageCount()}
				</span>
			</div>
			<button
				class="w-5"
				on:click={() => setCurrentPage($table.getState().pagination.pageIndex + 1)}
				class:is-disabled={!$table.getCanNextPage()}
				disabled={!$table.getCanNextPage()}
			>
				{'>'}
			</button>
			<button
				class="w-5"
				on:click={() => setCurrentPage($table.getPageCount() - 1)}
				class:is-disabled={!$table.getCanNextPage()}
				disabled={!$table.getCanNextPage()}
			>
				{'>>'}
			</button>
		</div>
	</div>
</div>

<h4 class="mb-2 mt-10">List of Users Skeleton:</h4>

<table>
	<thead class="bg-surface-600 rounded-t border-b-2">
		<tr class="divide-x-2">
			<th class="px-2">Avatar</th>
			<th class="px-2">Username</th>
			<th class="px-2">Role</th>
			<th class="px-2">Email</th>
			<th class="px-2">expiresAt</th>
			<th class="px-2">resetRequestedAt</th>
			<th class="px-2">resetToken</th>
			<th class="px-2">Last Access</th>
			<th class="px-2">First Access</th>
		</tr>
	</thead>
	<tbody>
		{#each listOfUsers as user}
			<tr class="divide-x-2">
				<td class="px-2"> <Avatar src={user.avatar} width="w-10" /></td>
				<td class="px-2">{user.username}</td>
				<td class="px-2">{user.role}</td>
				<td class="px-2">{user.email}</td>
				<td class="px-2">{user.expiresAt}</td>
				<td class="px-2">{user.resetRequestedAt}</td>
				<td class="px-2">{user.resetToken}</td>
				<td class="px-2">Add Last Access</td>
				<td class="px-2">Add First Access</td>
			</tr>
		{/each}
	</tbody>
</table>
