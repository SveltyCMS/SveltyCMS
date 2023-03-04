<script lang="ts">
	//skelton
	import { Modal, modalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
	import ModalEditForm from '../ModalEditForm.svelte';
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';

	// Popup Tooltips
	let EditSettings: PopupSettings = {
		event: 'hover',
		target: 'EditPopup',
		placement: 'bottom'
	};
	let DeleteSettings: PopupSettings = {
		event: 'hover',
		target: 'DeletePopup',
		placement: 'bottom'
	};
	let BlockSettings: PopupSettings = {
		event: 'hover',
		target: 'BlockPopup',
		placement: 'bottom'
	};
	let UnblockSettings: PopupSettings = {
		event: 'hover',
		target: 'UnblockPopup',
		placement: 'bottom'
	};

	let multiSelectSettings: PopupSettings = {
		event: 'click', // Set the event as: click | hover | hover-click
		target: 'multiSelect' // Provide a matching 'data-popup' value.
	};

	function modalUserForm(): void {
		const modalComponent: ModalComponent = {
			// Pass a reference to your custom component
			ref: ModalEditForm,
			// Add your props as key/value pairs
			props: { background: 'bg-red-500' },
			// Provide default slot content as a template literal
			slot: '<p>Edit Form</p>'
		};
		const d: ModalSettings = {
			type: 'component',
			// NOTE: title, body, response, etc are supported!
			title: 'Edit User Data',
			body: 'Modify your data and then press Save.',
			component: modalComponent,
			// Pass abitrary data to the component
			response: (r: any) => {
				if (r) console.log('response:', r);
			},

			meta: { foo: 'bar', fizz: 'buzz', fn: ModalEditForm }
		};
		modalStore.trigger(d);
	}

	function modalConfirm(): void {
		const d: ModalSettings = {
			type: 'confirm',
			title: 'Please Confirm User Deletion',
			body: 'Are you sure you wish to proceed?',
			response: (r: boolean) => {
				if (r) console.log('response:', r);
			}
		};
		modalStore.trigger(d);
	}

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';
	import type { PageData } from '../$types';

	export let list: PageData;

	const listOfUsers = JSON.parse(list.user);
	console.log(listOfUsers);

	// State to keep track of whether the modal is open or not
	let showModal = false;

	// State to keep track of the selected user
	let selectedUser: any;

	// define Multifuntion default button
	let multiButton = 'edit';

	import { writable } from 'svelte/store';

	// tanStack Table
	// import {
	// 	ColumnDef,
	// 	createSvelteTable,
	// 	flexRender,
	// 	getCoreRowModel,
	// 	TableOptions
	// } from '@tanstack/svelte-table';

	// type Person = {
	// 	firstName: string;
	// 	lastName: string;
	// 	age: number;
	// 	visits: number;
	// 	status: string;
	// 	progress: number;
	// };

	// const defaultData: Person[] = [
	// 	{
	// 		firstName: 'tanner',
	// 		lastName: 'linsley',
	// 		age: 24,
	// 		visits: 100,
	// 		status: 'In Relationship',
	// 		progress: 50
	// 	},
	// 	{
	// 		firstName: 'tandy',
	// 		lastName: 'miller',
	// 		age: 40,
	// 		visits: 40,
	// 		status: 'Single',
	// 		progress: 80
	// 	},
	// 	{
	// 		firstName: 'joe',
	// 		lastName: 'dirte',
	// 		age: 45,
	// 		visits: 20,
	// 		status: 'Complicated',
	// 		progress: 10
	// 	}
	// ];

	// const defaultColumns: ColumnDef<Person>[] = [
	// 	{
	// 		accessorKey: 'firstName',
	// 		cell: (info) => info.getValue(),
	// 		footer: (info) => info.column.id
	// 	},
	// 	{
	// 		accessorFn: (row) => row.lastName,
	// 		id: 'lastName',
	// 		cell: (info) => info.getValue(),
	// 		header: () => 'Last Name',
	// 		footer: (info) => info.column.id
	// 	},
	// 	{
	// 		accessorKey: 'age',
	// 		header: () => 'Age',
	// 		footer: (info) => info.column.id
	// 	},
	// 	{
	// 		accessorKey: 'visits',
	// 		header: () => 'Visits',
	// 		footer: (info) => info.column.id
	// 	},
	// 	{
	// 		accessorKey: 'status',
	// 		header: 'Status',
	// 		footer: (info) => info.column.id
	// 	},
	// 	{
	// 		accessorKey: 'progress',
	// 		header: 'Profile Progress',
	// 		footer: (info) => info.column.id
	// 	}
	// ];

	// const options = writable<TableOptions<Person>>({
	// 	data: defaultData,
	// 	columns: defaultColumns,
	// 	getCoreRowModel: getCoreRowModel()
	// });

	// const rerender = () => {
	// 	options.update((options) => ({
	// 		...options,
	// 		data: defaultData
	// 	}));
	// };

	// const table = createSvelteTable(options);
</script>

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
					<button on:click={modalUserForm}>Edit</button>
					<button on:click={modalConfirm}>Delete</button>
				</td>
			</tr>
		{/each}
	</tbody>
</table>

<!-- /////////////////////////////////////// -->

<h4 class="mb-2 text-error-500">List of Users Tanstack:</h4>

This breaks
<!-- <div class="table-container">
	<table class="table table-hover">
		<thead>
			{#each $table.getHeaderGroups() as headerGroup}
				<tr>
					{#each headerGroup.headers as header}
						<th>
							{#if !header.isPlaceholder}
								<svelte:component
									this={flexRender(header.column.columnDef.header, header.getContext())}
								/>
							{/if}
						</th>
					{/each}
				</tr>
			{/each}
		</thead>

		<tbody>
			{#each $table.getRowModel().rows as row}
				<tr>
					{#each row.getVisibleCells() as cell}
						<td>
							<svelte:component this={flexRender(cell.column.columnDef.cell, cell.getContext())} />
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div> -->

<!-- create/delete/block/unblock -->
<div class="flex items-center justify-center">
	<!-- the actual buttons -->
	<div class="relative inline-flex shadow-md hover:shadow-lg focus:shadow-lg" role="group">
		{#if multiButton == 'edit'}
			<button
				use:popup={EditSettings}
				on:click={modalUserForm}
				class="relative flex w-[30px] items-center justify-center rounded-l border-r-2 border-white bg-gradient-to-br from-tertiary-600 via-tertiary-500 to-tertiary-400 px-2 py-2 font-bold text-white md:ml-auto md:w-[150px]"
			>
				<!-- Popup Tooltip with the arrow element -->
				<div class="card variant-filled-secondary p-4" data-popup="EditPopup">
					Edit User
					<div class="arrow variant-filled-secondary" />
				</div>
				<Icon icon="material-symbols:edit" width="20" class="mr-1" />
				<div class="hidden md:block">Edit</div>
			</button>
		{:else if multiButton == 'delete'}
			<button
				use:popup={DeleteSettings}
				on:click={modalConfirm}
				class="relative flex w-[30px] items-center justify-center rounded-l border-r-2 border-white bg-gradient-to-br from-error-600 via-error-500 to-error-300 px-2 py-2 font-bold text-white md:ml-auto md:w-[150px]"
				><!-- Popup Tooltip with the arrow element -->
				<div class="card variant-filled-secondary p-4" data-popup="DeletePopup">
					Delete User
					<div class="arrow variant-filled-secondary" />
				</div>
				<Icon icon="bi:trash3-fill" color="white" width="20" class="mr-1" />
				<div class="hidden md:block">Delete</div>
			</button>
		{:else if multiButton == 'block'}
			<button
				use:popup={BlockSettings}
				class="relative flex w-[30px] items-center justify-center rounded-l border-r-2 border-white bg-gradient-to-br from-pink-700 via-pink-500 to-pink-300 px-2 py-2 font-bold text-white md:ml-auto md:w-[150px]"
			>
				<!-- Popup Tooltip with the arrow element -->
				<div class="card variant-filled-secondary p-4" data-popup="BlockPopup">
					Block User
					<div class="arrow variant-filled-secondary" />
				</div>
				<Icon icon="material-symbols:lock" color="white" width="20" class="mr-1" />
				<div class="hidden md:block">Block</div>
			</button>
		{:else if multiButton == 'unblock'}
			<button
				use:popup={UnblockSettings}
				class="relative flex w-[30px] items-center justify-center rounded-l border-r-2 border-white bg-gradient-to-br from-surface-700 via-surface-500 to-surface-300 px-2 py-2 font-bold text-white md:ml-auto md:w-[150px]"
				><!-- Popup Tooltip with the arrow element -->
				<div class="card variant-filled-secondary p-4" data-popup="UnblockPopup">
					Unblock User
					<div class="arrow variant-filled-secondary" />
				</div>

				<Icon icon="material-symbols:lock-open" color="white" width="20" class="mr-1" />
				<div class="hidden md:block">Unblock</div>
			</button>
		{/if}

		<!-- Dropdown selection -->
		<button
			use:popup={multiSelectSettings}
			class="relabsolute  mr-1 inline-block rounded-l-none rounded-r bg-surface-600 px-2 text-xs font-medium uppercase leading-tight text-white transition duration-150 ease-in-out hover:bg-surface-700 focus:bg-surface-700 focus:outline-none focus:ring-0 active:bg-surface-700"
		>
			<Icon icon="mdi:chevron-down" width="20" /></button
		>

		<nav
			class="card list-nav mt-14 mr-1 w-42 bg-surface-600 p-2 shadow-xl dark:border-none dark:bg-surface-300"
			data-popup="multiSelect"
		>
			<ul>
				{#if multiButton != 'edit'}
					<li>
						<button
							class="btn btn-base w-full bg-gradient-to-br from-primary-600 via-primary-500 to-primary-400 font-bold text-white"
						>
							<span><Icon icon="material-symbols:edit" width="20" /></span>
							<span class="font-bold">Edit</span>
						</button>
					</li>{/if}
				{#if multiButton != 'delete'}
					<li>
						<button
							class="btn btn-base w-full bg-gradient-to-br from-error-700 via-error-600 to-error-400 font-bold text-white"
						>
							<span><Icon icon="bi:trash3-fill" width="20" /></span>
							<span class="font-bold">Delete</span>
						</button>
					</li>
				{/if}
				{#if multiButton != 'block'}
					<li>
						<button
							class="btn btn-base w-full bg-gradient-to-br from-pink-700 via-pink-500 to-pink-300 font-bold text-white "
						>
							<span><Icon icon="material-symbols:lock" width="20" /></span>
							<span class="font-bold">Block</span>
						</button>
					</li>
				{/if}
				{#if multiButton != 'unblock'}
					<li>
						<button
							class="btn btn-base w-full bg-gradient-to-br from-surface-700 via-surface-500 to-surface-300 font-bold text-white "
						>
							<span><Icon icon="material-symbols:lock-open" width="20" /></span>
							<span class="font-bold">Unblock</span>
						</button>
					</li>
				{/if}
			</ul>
		</nav>
	</div>
</div>
