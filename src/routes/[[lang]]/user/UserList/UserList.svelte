<script lang="ts">
	import { writable } from 'svelte/store';
	import Multibutton from '$src/routes/[[lang]]/user/UserList/Multibutton.svelte';

	//skelton

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';
	import type { PageData } from '../$types';

	export let list: PageData;

	// Lucia
	import { getUser } from '@lucia-auth/sveltekit/client';
	const user = getUser();

	// Form Data
	const formData = {
		username: $user?.username,
		email: $user?.email,
		role: $user?.role,
		// TODO get right values
		firstAccess: $user?.username,
		lastAccess: $user?.username
	};

	const listOfUsers = JSON.parse(list.user); // Retrieve User and parse them as JSON
	// console.log(listOfUsers);

	// const listOftokens = JSON.parse(token.sign_up_token); // Retrieve the tokens and parse them as JSON
	// console.log(sign_up_token);

	// State to keep track of whether the modal is open or not
	let showModal = false;

	// State to keep track of the selected user
	let selectedUser: any;

	// tanStack Table

	// TODO - -Preplace with Table Columns data
	// let tableColumns: Record<string, boolean> = {
	// 	ID: true,
	// 	Status: true,
	// 	Label: true,
	// 	Email: true
	// };
	// function filter(column: string): void {
	// 	columns[column] = !columns[column];
	// }

	import {
		createSvelteTable,
		flexRender,
		type ColumnDef,
		getCoreRowModel,
		getSortedRowModel,
		type TableOptions
	} from '@tanstack/svelte-table';

	// TODO: Grab real data
	const defaultData: User[] = [
		{
			firstName: 'Robert',
			lastName: 'linsley',
			visits: 100,
			status: 'In Relationship',
			progress: 50
		},
		{
			firstName: 'tandy',
			lastName: 'miller',
			visits: 40,
			status: 'Single',
			progress: 80
		},
		{
			firstName: 'joe',
			lastName: 'dirte',
			visits: 20,
			status: 'Complicated',
			progress: 10
		}
	];

	// Define row shape
	type User = {
		firstName: string;
		lastName: string;
		visits: number;
		status: string;
		progress: number;
	};

	// Display Columns
	const columns: ColumnDef<User>[] = [
		{
			accessorKey: 'firstName',
			cell: (info) => info.getValue(),
			footer: (info) => info.column.id
		},
		{
			accessorFn: (row) => row.lastName,
			id: 'lastName',
			cell: (info) => info.getValue(),
			header: () => 'Last Name',
			footer: (info) => info.column.id
		},

		{
			accessorKey: 'visits',
			header: () => 'Visits',
			footer: (info) => info.column.id
		},
		{
			accessorKey: 'status',
			header: 'Status',
			footer: (info) => info.column.id
		},
		{
			accessorKey: 'progress',
			header: 'Profile Progress',
			footer: (info) => info.column.id
		}
	];

	let columnVisibility = {};

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

	const options = writable<TableOptions<User>>({
		data: defaultData,
		columns,
		state: {
			columnVisibility
		},
		onColumnVisibilityChange: setColumnVisibility,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		debugTable: true
	});

	const rerender = () => {
		options.update((options) => ({
			...options,
			data: defaultData
		}));
	};
	const table = createSvelteTable(options);
</script>

<!-- <Multibutton /> -->
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

<!-- /////////////////////////////////////// -->
<h4 class="mb-2">List of Users Tanstack:</h4>

<div class="card p-4 space-y-4 text-center">
	<div class="flex justify-center space-x-2">
		<!-- <div class="flex flex-wrap gap-2 space-x-2">
			{#each Object.keys(tableColumns) as c}
				<span
					class="chip {tableColumns[c] ? 'variant-filled-tertiary' : 'variant-ghost-secondary'}"
					on:click={() => {
						filter(c);
					}}
					on:keypress
				>
					{#if tableColumns[c]}<span><Icon icon="fa:check" /></span>{/if}
					<span class="capitalize">{c}</span>
				</span>
			{/each}
		</div> -->

		<!-- column chips box -->
		<!-- TODO: Allow drag&drop as well to sort -->
		<div class="flex flex-wrap gap space-x-2">
			<p class="font-normal ">
				<input
					checked={$table.getIsAllColumnsVisible()}
					on:change={(e) => {
						console.info($table.getToggleAllColumnsVisibilityHandler()(e));
					}}
					type="checkbox"
					class="ml-2"
				/>{' '}
				Toggle All
			</p>
			{#each $table.getAllLeafColumns() as column}
				<div
					class="chip {column.getIsVisible()
						? 'variant-filled-secondary'
						: 'variant-ghost-secondary'} "
					on:click={() => {
						column.getToggleVisibilityHandler();
					}}
					on:keypress
				>
					{#if column.getIsVisible()}<span><Icon icon="fa:check" /></span>{/if}
					<span class="capitalize">{column.id}</span>
				</div>
			{/each}
		</div>
	</div>
</div>

<!-- Show/hide Columns
	<div class="inline-block border-2 shadow rounded">
	<div class="px-1 border-b">
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
	{#each $table.getAllLeafColumns() as column}
		<div class="px-1">
			<label>
				<input
					checked={column.getIsVisible()}
					on:change={column.getToggleVisibilityHandler()}
					type="checkbox"
				/>{' '}
				{column.id}
			</label>
		</div>
	{/each}
</div> -->
<div class="table-container">
	<table class="table table-hover ">
		<thead>
			{#each $table.getHeaderGroups() as headerGroup}
				<tr class="divide-x">
					{#each headerGroup.headers as header}
						<th colSpan={header.colSpan}>
							{#if !header.isPlaceholder}
								<svelte:component
									this={flexRender(header.column.columnDef.header, header.getContext())}
								/>
							{/if}
						</th>
					{/each}
					<th class="bg-tertiary-500">Actions</th>
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

					<td>
						<!-- <Multibutton  /> -->
						<!-- <button on:click={modalUserForm}>Edit</button>
						<button on:click={modalConfirm} class="bg-error-500">Delete</button> -->
					</td>
				</tr>
			{/each}
		</tbody>
		<!-- <tfoot>
			{#each $table.getFooterGroups() as footerGroup}
				<tr>
					{#each footerGroup.headers as header}
						<th colSpan={header.colSpan}>
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
</div>

<h4 class="mb-2">List of Users Skelton:</h4>

<table>
	<thead class="bg-surface-600 rounded-t border-b-2">
		<tr class="divide-x-2">
			<th class="px-2">Username</th>
			<th class="px-2">Role</th>
			<th class="px-2">Email</th>
			<th class="px-2">Last Access</th>
			<th class="px-2">First Access</th>
			<th class="px-2">Actions</th>
		</tr>
	</thead>
	<tbody>
		{#each listOfUsers as user}
			<tr class="divide-x-2">
				<td class="px-2">{user.username}</td>
				<td class="px-2">{user.role}</td>
				<td class="px-2">{user.email}</td>
				<td class="px-2">Add Last Access</td>
				<td class="px-2">Add First Access</td>
				<td>
					<Multibutton />
				</td>
			</tr>
		{/each}
	</tbody>
</table>
