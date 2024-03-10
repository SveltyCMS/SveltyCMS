<script lang="ts">
	import type { PageData } from '../$types';
	import axios from 'axios';
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';

	// Components
	import Multibutton from './Multibutton.svelte';
	import TableFilter from '@components/system/table/TableFilter.svelte';
	import Boolean from '@components/system/table/Boolean.svelte';
	import Role from '@components/system/table/Role.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { Avatar } from '@skeletonlabs/skeleton';
	import ModalTokenUser from './ModalTokenUser.svelte';
	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';
	import { getModalStore } from '@skeletonlabs/skeleton';
	import { writable } from 'svelte/store';
	import Loading from '@src/components/Loading.svelte';
	import TableIcons from '@src/components/system/icons/TableIcons.svelte';
	import { mode } from '@src/stores/store';

	const modalStore = getModalStore();

	export let data: PageData;

	// Modal Trigger - Generate User Registration email Token
	function modalTokenUser(): void {
		const modalComponent: ModalComponent = {
			// Pass a reference to your custom component
			ref: ModalTokenUser,

			// Provide default slot content as a template literal
			slot: '<p>Edit Form</p>'
		};
		const d: ModalSettings = {
			type: 'component',
			// NOTE: title, body, response, etc are supported!
			title: m.adminarea_title(),
			body: m.adminarea_body(),
			component: modalComponent,

			// Pass arbitrary data to the component
			response: (r) => {
				//console.log('Modal response:', r);
				return;
			}
		};

		modalStore.trigger(d);
	}

	let showUserList = false;
	let showMoreUserList = false;
	let showUsertoken = false;
	let showMoreUserToken = false;

	let isLoading = false;
	let loadingTimer: any; // recommended time of around 200-300ms

	function toggleUserList() {
		showUserList = !showUserList;
		refreshTableData();
		if (showUsertoken) showUsertoken = false;
	}

	function toggleUserToken() {
		showUsertoken = !showUsertoken;
		refreshTableData();
		if (showUserList) showUserList = false;
	}

	// TableFilter
	let globalSearchValue = '';
	let searchShow = false;
	let filterShow = false;
	let columnShow = false;
	let density = 'normal';
	export let selectedRows: any[] = [];

	// Display User Columns
	const tableHeadersUser = [
		{ label: 'UserID', key: 'id' },
		{ label: 'Blocked', key: 'blocked' },
		{ label: 'Avatar', key: 'avatar' },
		{ label: 'Email', key: 'email' },
		{ label: 'Username', key: 'username' },
		{ label: 'Role', key: 'role' },
		{ label: 'Active Sessions', key: 'activeSessions' },
		{ label: 'Last Access', key: 'lastAccess' },
		{ label: 'Created At', key: 'createdAt' },
		{ label: 'Updated At', key: 'updatedAt' }
	];

	// Display User Token Columns
	const tableHeaderToken = [
		{ label: 'UserID', key: 'id' },
		{ label: 'Blocked', key: 'blocked' },
		{ label: 'Email', key: 'email' },
		{ label: 'Role', key: 'role' },
		{ label: 'Created At', key: 'createdAt' },
		{ label: 'Updated At', key: 'updatedAt' }
	];

	type TableHeader = { label: string; key: string };
	type UserData = Record<string, string>;

	let userInfo: UserData[] = [];
	let userToken: UserData[] = [];

	// Define table data for both user list and tokens
	let tableData: any[] = [];
	let tableDataUserToken: any[] = [];
	let filteredTableData: typeof userInfo = [];
	let modifyMap: { [key: number]: boolean } = {};
	let filters: { [key: string]: string } = {};

	//Load Table data
	async function refreshTableData() {
		// Clear loading timer
		loadingTimer && clearTimeout(loadingTimer);

		try {
			let responseData: any;
			if (showUserList || showUsertoken) {
				// Set loading to true
				loadingTimer = setTimeout(() => {
					isLoading = true;
				}, 400);

				if (showUserList) {
					// Load All available Users
					responseData = data.allUsers;
				} else {
					// Load all Send Registration Tokens
					responseData = data.tokens;
				}

				console.log('responseData', responseData);
				// Format the data for the table
				tableData = responseData.map((item) => {
					const formattedItem: any = {};
					for (const header of showUserList ? tableHeadersUser : tableHeaderToken) {
						const { label, key } = header;
						formattedItem[label] = item[key] || 'NO DATA';
						if (key === 'createdAt' || key === 'updatedAt') {
							formattedItem[label] = new Date(item[key]).toLocaleString();
						}
					}
					console.log('Formatted Item:', formattedItem);
					return formattedItem;
				});

				// Reset filters
				filters = {};

				// Set loading to false
				isLoading = false;
				clearTimeout(loadingTimer);
			} else {
				// If neither showUserList nor showUsertoken is true, clear the tableData
				tableData = [];
			}
		} catch (error) {
			console.error('Error fetching data:', error);
		}
	}
	//Call refreshTableData initially to populate the table
	refreshTableData();

	$: {
		filteredTableData = tableData.filter((item) => {
			return Object.entries(item).every(([key, value]) => {
				if (filters[key]) {
					return (value as string).toString().toLowerCase().includes(filters[key]);
				} else {
					return true;
				}
			});
		});
	}

	// Columns Sorting
	let sorting: { sortedBy: string; isSorted: 0 | 1 | -1 } = {
		sortedBy: tableData.length > 0 ? Object.keys(tableData[0])[0] : '', // Set default sortedBy based on first key in tableData (if available)
		isSorted: 1 // 1 for ascending order, -1 for descending order and 0 for not sorted
	};

	// Pagination
	let rowsPerPage = 10; // Set initial rowsPerPage value
	let currentPage = 1; // Set initial currentPage value

	// This function handles changes in the dropdown (assuming it has a class 'select')
	function rowsPerPageHandler(event: any) {
		rowsPerPage = parseInt(event.target.value); // Update rowsPerPage with the selected value
		refreshTableData(); // Trigger data refresh with the new rowsPerPage
	}

	// Tick row logic
	let SelectAll = false;
	let selectedMap = writable({});

	// Tick  All Rows
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

	// Store values in local storage
	$: {
		localStorage.setItem('density', density);
		localStorage.setItem('sorting', JSON.stringify(sorting));
		localStorage.setItem('currentPage', JSON.stringify(currentPage));
		localStorage.setItem('rowsPerPage', JSON.stringify(rowsPerPage));
		localStorage.setItem('filters', JSON.stringify(filters));
		// localStorage.setItem('columnOrder', JSON.stringify(columnOrder));
		// localStorage.setItem('columnVisibility', JSON.stringify(columnVisibility));
	}

	// Define a reactive variable to hold the current action
	let currentAction = null;

	// Define the function to handle the CRUD action
	function handleCRUDAction(action: any) {
		currentAction = action;
	}
</script>

<div class="flex flex-col">
	<p class="h2 mb-2 text-center text-3xl font-bold dark:text-white">
		{m.adminarea_adminarea()}
	</p>
	<div class=" flex flex-col flex-wrap items-center justify-evenly gap-2 sm:flex-row xl:justify-between">
		<!-- Email Token -->
		<button on:click={modalTokenUser} class="gradient-primary btn w-full text-white sm:max-w-xs">
			<iconify-icon icon="material-symbols:mail" color="white" width="18" class="mr-1" />
			<span class="whitespace-normal break-words">{m.adminarea_emailtoken()}</span>
		</button>

		{#if tableDataUserToken}
			<!-- Show User Token -->
			<button on:click={toggleUserToken} class="gradient-secondary btn w-full text-white sm:max-w-xs">
				<iconify-icon icon="material-symbols:key-outline" color="white" width="18" class="mr-1" />
				<span>{showUsertoken ? m.adminarea_hideusertoken() : m.adminarea_showtoken()}</span>
			</button>
		{/if}

		<!-- Show User List -->
		<button on:click={toggleUserList} class="gradient-tertiary btn w-full text-white sm:max-w-xs">
			<iconify-icon icon="mdi:account-circle" color="white" width="18" class="mr-1" />
			<span>{showUserList ? m.adminarea_hideuserlist() : m.adminarea_showuserlist()}</span>
		</button>
	</div>

	<!--Table -->
	{#if isLoading}
		<Loading />
	{:else if showUserList || showUsertoken}
		<div class="my-4 flex flex-wrap items-center justify-center gap-1 sm:justify-between">
			<h2 class="order-1 font-bold text-tertiary-500 dark:text-primary-500">
				{#if showUserList}
					{m.adminarea_userlist()}
				{:else if showUsertoken}
					{m.adminarea_listtoken()}
				{/if}
			</h2>

			<div class="order-3 sm:order-2">
				<TableFilter bind:globalSearchValue bind:searchShow bind:filterShow bind:columnShow bind:density />
			</div>

			<div class="order-2 flex items-center justify-between gap-3 sm:order-3">
				<div class="sm:flex-row">
					<button type="button" class="btn-ghost btn mx-2 sm:hidden" on:keydown on:click={() => (showMoreUserList = !showMoreUserList)}>
						<span class="fa fa-filter mr-2"></span>
					</button>
					<Multibutton {selectedRows} on:crudAction={handleCRUDAction} />
				</div>
			</div>
		</div>

		{#if showUserList && tableData.length > 0}
			<!-- UserTable -->
			<div class="table-container max-h-[calc(100vh-55px)] overflow-auto">
				<table
					class="table table-interactive table-hover ta{density === 'compact' ? 'table-compact' : density === 'normal' ? '' : 'table-comfortable'}"
				>
					<!-- Table Header -->
					<thead class="top-0 text-tertiary-500 dark:text-primary-500">
						{#if filterShow}
							<tr class="divide-x divide-surface-400">
								<th>
									<!-- blank -->
								</th>

								<!-- Filter -->
								Filters
							</tr>
						{/if}
						<tr class="divide-x divide-surface-400 border-b border-black dark:border-white">
							<th class="!pl-[25px]">
								<TableIcons bind:checked={SelectAll} on:change={() => process_selectAll(SelectAll)} status="all" />
							</th>

							{#each showUserList ? tableHeadersUser : tableHeaderToken as header}
								<th
									on:click={() => {
										//sorting
										sorting = {
											sortedBy: header.key,
											isSorted: (() => {
												if (header.key !== sorting.sortedBy) {
													return 1;
												}
												if (sorting.isSorted === 0) {
													return 1;
												} else if (sorting.isSorted === 1) {
													return -1;
												} else {
													return 0;
												}
											})()
										};
									}}
								>
									<div class="flex items-center justify-center text-center">
										{header.label}

										<iconify-icon
											icon="material-symbols:arrow-upward-rounded"
											width="22"
											class="origin-center duration-300 ease-in-out"
											class:up={sorting.isSorted === 1}
											class:invisible={sorting.isSorted == 0 || sorting.sortedBy != header.label}
										/>
									</div>
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each filteredTableData as row, index}
							<tr class="divide-x divide-surface-400" on:click={() => (modifyMap[index] = !modifyMap[index])}>
								<td class="!pl-[25px]">
									<!-- TODO: need to be linked to blocked status -->
									<TableIcons />
								</td>
								{#each showUserList ? tableHeadersUser : tableHeaderToken as header}
									<td class="text-center font-bold">
										{#if header.key === 'blocked'}
											<!-- Convert the string value to a boolean before passing it to the Boolean component -->
											<Boolean value={row[header.key] === 'true'} />
										{:else if header.key === 'role'}
											<!-- Use the Role component to display the role -->
											<Role value={row[header.key]} />
										{:else}
											{@html row[header.key]}
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>

				<!-- Pagination  -->
				<div class="text-token my-3 flex flex-col items-center justify-center md:flex-row md:justify-around">
					<div class="mb-2 md:mb-0">
						<span class="text-sm">{m.entrylist_page()}</span> <span class="text-tertiary-500 dark:text-primary-500">{currentPage}</span>
						<span class="text-sm"> {m.entrylist_of()} </span>
						<span class="text-tertiary-500 dark:text-primary-500">{Math.ceil(tableData.length / rowsPerPage)}</span>
					</div>

					<div class="variant-outline btn-group">
						<!-- First page -->
						<button
							type="button"
							class="btn"
							on:click={() => {
								currentPage = 1;
								refreshTableData();
							}}
						>
							<iconify-icon icon="material-symbols:first-page" width="24" class:disabled={currentPage === 1} />
						</button>

						<!-- Previous page -->
						<button
							type="button"
							class="btn"
							on:click={() => {
								currentPage = Math.max(1, currentPage - 1);
								refreshTableData();
							}}
						>
							<iconify-icon icon="material-symbols:chevron-left" width="24" class:disabled={currentPage === 1} />
						</button>

						<!-- Next page -->
						<button
							type="button"
							class="btn"
							on:click={() => {
								currentPage = Math.min(currentPage + 1, Math.ceil(tableData.length / rowsPerPage));
								refreshTableData();
							}}
						>
							<iconify-icon
								icon="material-symbols:chevron-right"
								width="24"
								class:active={currentPage === Math.ceil(tableData.length / rowsPerPage)}
							/>
						</button>

						<!-- Last page -->
						<button
							type="button"
							class="btn"
							on:click={() => {
								currentPage = Math.ceil(tableData.length / rowsPerPage);
								refreshTableData();
							}}
						>
							<iconify-icon icon="material-symbols:last-page" width="24" class:disabled={currentPage === Math.ceil(tableData.length / rowsPerPage)} />
						</button>
					</div>
				</div>
			</div>
		{:else}
			<div class="variant-ghost-error btn text-center font-bold">
				{#if showUserList}
					{m.adminarea_nouser()}
				{:else if showUsertoken}
					{m.adminarea_notoken()}
				{/if}
			</div>
		{/if}
	{/if}
</div>
