<script lang="ts">
	import type { PageData } from '../$types';
	import axios from 'axios';
	import { asAny, debounce } from '@src/utils/utils';
	import { linear } from 'svelte/easing';

	// Components
	import Multibutton from './Multibutton.svelte';
	import MultibuttonToken from './MultibuttonToken.svelte';
	import TableIcons from '@src/components/system/icons/TableIcons.svelte';
	import TableFilter from '@components/system/table/TableFilter.svelte';
	import Boolean from '@components/system/table/Boolean.svelte';
	import Role from '@components/system/table/Role.svelte';
	import Loading from '@src/components/Loading.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { Avatar } from '@skeletonlabs/skeleton';
	import ModalTokenUser from './ModalTokenUser.svelte';
	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';
	import { getModalStore } from '@skeletonlabs/skeleton';
	import { writable } from 'svelte/store';
	import FloatingInput from '@src/components/system/inputs/floatingInput.svelte';

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

	let isLoading = false;
	let loadingTimer: any; // recommended time of around 200-300ms

	function toggleUserList() {
		showUserList = !showUserList;
		if (showUsertoken) showUsertoken = false;
		refreshTableData();
	}

	function toggleUserToken() {
		showUsertoken = !showUsertoken;
		showUserList = false;
		refreshTableData();
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
		{ label: m.adminarea_userid(), key: 'id' },
		{ label: m.adminarea_blocked(), key: 'blocked' },
		{ label: m.adminarea_avatar(), key: 'avatar' },
		{ label: m.adminarea_email(), key: 'email' },
		{ label: m.adminarea_username(), key: 'username' },
		{ label: m.adminarea_role(), key: 'role' },
		{ label: m.adminarea_activesession(), key: 'activeSessions' },
		{ label: m.adminarea_lastaccess(), key: 'lastAccess' },
		{ label: m.adminarea_createat(), key: 'createdAt' },
		{ label: m.adminarea_updatedat(), key: 'updatedAt' }
	];

	// Display User Token Columns
	const tableHeaderToken = [
		{ label: m.adminarea_userid(), key: 'userID' },
		{ label: m.adminarea_blocked(), key: 'blocked' },
		{ label: m.adminarea_email(), key: 'email' },
		{ label: m.adminarea_role(), key: 'role' },
		{ label: m.adminarea_expiresin(), key: 'expiresIn' },
		{ label: m.adminarea_createat(), key: 'createdAt' },
		{ label: m.adminarea_updatedat(), key: 'updatedAt' }
	];

	// Define table data for both user list and tokens
	let tableData: any[] = [];
	let tableDataUserToken: any[] = [];

	// Filter
	let filters: { [key: string]: string } = {}; // Set initial filters object
	let filteredTableData: any[] = [];
	let waitFilter = debounce(300); // Debounce filter function for 300ms

	// Pagination
	let rowsPerPage = 10; // Set initial rowsPerPage value
	let currentPage = 1; // Set initial currentPage value

	//svelte-dnd-action
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import { dndzone } from 'svelte-dnd-action';

	const flipDurationMs = 300;
	let columnOrder: string[] = []; // This will hold the order of your columns
	let columnVisibility: { [key: string]: boolean } = {}; // This will hold the visibility status of your columns

	function handleDndConsider(data: { items: { id: string; isVisible: boolean }[] }) {
		// No need to reassign the data object, directly access its items property
		const items = data.items;

		// You can potentially log or inspect the items here to understand the order before dropping
		console.log('Items before dropping:', items);
	}

	function handleDndFinalize(data: { items: { id: string; isVisible: boolean }[] }) {
		const clickedColumn = data.items[0].id; // Assuming the first item is the clicked/dragged column

		// Update sorting for the clicked column (toggle sort or change field)
		sorting[clickedColumn] = {
			sortedBy: tableHeadersUser.find((header) => header.label === clickedColumn)?.key || '', // Get field key for clicked column from tableHeadersUser
			isSorted: sorting[clickedColumn]?.isSorted === 1 ? -1 : 1 // Toggle sort direction
		};

		// Update table data based on the new sorting
		tableData.sort((a, b) => {
			const sortFieldA = a[sorting.sortedBy];
			const sortFieldB = b[sorting.sortedBy];

			if (sorting.isSorted === 1) {
				// Ascending order
				return sortFieldA.localeCompare(sortFieldB);
			} else {
				// Descending order
				return sortFieldB.localeCompare(sortFieldA);
			}
		});

		// Refresh the table to display the sorted data
		refreshTableData();
	}

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

				// Format the data for the table
				tableData = responseData.map((item) => {
					const formattedItem: any = {};
					for (const header of showUserList ? tableHeadersUser : tableHeaderToken) {
						const { key } = header;
						formattedItem[key] = item[key] || 'NO DATA';
						if (key === 'createdAt' || key === 'updatedAt') {
							formattedItem[key] = new Date(item[key]).toLocaleString();
						}
						if (key === 'expiresIn') {
							formattedItem[key] = new Date(item[key]).toLocaleString();
						}
					}

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
		localStorage.setItem('columnOrder', JSON.stringify(columnOrder));
		localStorage.setItem('columnVisibility', JSON.stringify(columnVisibility));
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
					{#if showUserList}
						<Multibutton {selectedRows} on:crudAction={handleCRUDAction} />
					{:else if showUsertoken}
						<MultibuttonToken {selectedRows} on:crudAction={handleCRUDAction} />
					{/if}
				</div>
			</div>
		</div>

		{#if tableData.length > 0}
			<!-- UserTable -->{#if columnShow}
				<!-- column order -->
				<div class="rounded-b-0 flex flex-col justify-center rounded-t-md border-b bg-surface-300 text-center dark:bg-surface-700">
					<div class="text-white dark:text-primary-500">Drag & Drop Columns / Click to hide</div>
					<!-- all -->
					<div class="my-2 flex w-full items-center justify-center gap-1">
						<label class="mr-3">
							<input type="checkbox" bind:checked={SelectAll} />
							{m.entrylist_all()}
						</label>

						<section
							use:dndzone={{ items: showUserList ? tableHeadersUser : tableHeaderToken, flipDurationMs }}
							on:consider={handleDndConsider}
							on:finalize={handleDndFinalize}
							class="flex flex-wrap justify-center gap-1 rounded-md p-2"
						>
							{#each showUserList ? tableHeadersUser : tableHeaderToken as header, index}
								<button
									class="chip {columnVisibility[header.key]
										? 'variant-filled-secondary'
										: 'variant-ghost-secondary'} w-100 mr-2 flex items-center justify-center"
									on:click={() => {
										columnVisibility[header.key] = !columnVisibility[header.key];
										localStorage.setItem('columnVisibility', JSON.stringify(columnVisibility));
									}}
								>
									{#if columnVisibility[header.key]}
										<span><iconify-icon icon="fa:check" /></span>
									{/if}
									<span class="ml-2 capitalize">{header.key}</span>
								</button>
							{/each}
						</section>
					</div>
				</div>
			{/if}
			<div class="table-container max-h-[calc(100vh-55px)] overflow-auto">
				<table
					class="table table-interactive table-hover {density === 'compact' ? 'table-compact' : density === 'normal' ? '' : 'table-comfortable'}"
				>
					<!-- Table Header -->
					<thead class="top-0 text-tertiary-500 dark:text-primary-500">
						{#if filterShow}
							<tr class="divide-x divide-surface-400">
								<th>
									<!-- blank -->
								</th>

								<!-- Filter -->
								{#each showUserList ? tableHeadersUser : tableHeaderToken as header}
									<th>
										<div class="flex items-center justify-between">
											<FloatingInput
												type="text"
												icon="material-symbols:search-rounded"
												label="Filter ..."
												name={header.key}
												on:input={(e) => {
													let value = asAny(e.target).value;
													if (value) {
														waitFilter(() => {
															filters[header.key] = value;
														});
													} else {
														delete filters[header.key];
														filters = filters;
													}
												}}
											/>
										</div>
									</th>
								{/each}
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
							<tr
								class="divide-x divide-surface-400"
								on:click={() => {
									handleCRUDAction(row);
								}}
							>
								<td class="!pl-[25px]">
									<!-- TODO: need to be linked to blocked status -->
									<TableIcons />
								</td>

								{#each showUserList ? tableHeadersUser : tableHeaderToken as header}
									<td class="text-center">
										{#if header.key === 'blocked'}
											<!-- Convert the string value to a boolean before passing it to the Boolean component -->
											<Boolean value={row[header.key] === 'true'} />
										{:else if showUserList && header.key === 'avatar'}
											<!--Use Avatar component-->
											<Avatar src={row[header.key]} fallback="/Default_User.svg" width="w-8" />
										{:else if header.key === 'role'}
											<!-- Use the Role component to display the roles -->
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
