<script lang="ts">
	import axios from 'axios';
	import type { PageData } from '../$types';
	import { writable } from 'svelte/store';
	import { asAny, debounce, getFieldName, generateUniqueId } from '@utils/utils';

	// Components
	import Multibutton from './Multibutton.svelte';
	import MultibuttonToken from './MultibuttonToken.svelte';
	import TableIcons from '@src/components/system/table/TableIcons.svelte';
	import TableFilter from '@components/system/table/TableFilter.svelte';
	import Boolean from '@components/system/table/Boolean.svelte';
	import Role from '@components/system/table/Role.svelte';
	import Loading from '@components/Loading.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { Avatar } from '@skeletonlabs/skeleton';
	import ModalTokenUser from './ModalTokenUser.svelte';
	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';
	import { getToastStore, getModalStore } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
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
			response: () => {
				return;
			}
		};

		modalStore.trigger(d);
	}

	let showUserList = false;
	let showUsertoken = false;

	// Svelte-dnd-action
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';

	const flipDurationMs = 300;

	function handleDndConsider(event: any) {
		displayTableHeaders = event.detail.items;
	}

	function handleDndFinalize(event: any) {
		displayTableHeaders = event.detail.items;
	}

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

	// Define local stores for user and token data
	let userTableData = [];
	let tokenTableData = [];

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

	// Buttons
	let globalSearchValue = '';
	let searchShow = false;
	let filterShow = false;
	let columnShow = false;

	// Retrieve userPaginationSettings from local storage or set default values
	let userPaginationSettings: any = localStorage.getItem('userPaginationSettings')
		? JSON.parse(localStorage.getItem('userPaginationSettings') as string)
		: {
				density: 'normal',
				sorting: { sortedBy: '', isSorted: 0 },
				currentPage: 1,
				rowsPerPage: 10,
				filters: {},
				displayTableHeaders: []
			};

	let density: string = userPaginationSettings.density || 'normal'; // Retrieve density from local storage or set to 'normal' if it doesn't exist
	let selectAllColumns = true; // Initialize to true to show all columns by default

	export let selectedRows: any[] = [];

	// Define table data for both user list and tokens
	let tableHeaders: Array<{ label: string; name: string }> = [];
	let tableData: any[] = [];
	let tableDataUserToken: any[] = [];

	// Initialize displayTableHeaders with the values from entryListPaginationSettings or default to tableHeaders
	let displayTableHeaders: { label: string; name: string; id: string; visible: boolean }[] =
		userPaginationSettings.displayTableHeaders.length > 0
			? userPaginationSettings.displayTableHeaders
			: tableData.map((header) => ({ ...header, visible: true }));

	// Tick row logic
	let SelectAll = false;
	let selectedMap = writable({});

	// Filter
	let filters: { [key: string]: string } = userPaginationSettings.filters || {};
	let filteredTableData: any[] = [];
	let waitFilter = debounce(300); // Debounce filter function for 300ms

	// Pagination
	let pagesCount: number = userPaginationSettings.pagesCount || 1; // Initialize pagesCount
	let currentPage: number = userPaginationSettings.currentPage || 1; // Set initial currentPage value
	let rowsPerPage: number = userPaginationSettings.rowsPerPage || 10; // Set initial rowsPerPage value
	let rowsPerPageOptions = [10, 25, 50, 100, 500]; // Set initial rowsPerPage value options

	// Declare isFirstPage and isLastPage variables
	let isFirstPage: boolean;
	let isLastPage: boolean;

	// Define the rowsPerPageHandler function
	function rowsPerPageHandler(event: Event) {
		// Get the selected value from the event
		const selectedValue = (event.target as HTMLSelectElement).value;
		// Update the rows per page value
		rowsPerPage = parseInt(selectedValue); // Assuming rowsPerPage is a number
		// Optionally, you can call the refreshTableData function here if needed
		refreshTableData();
	}

	// Load Table data
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

				// Format the data for the table based on which table is being shown
				const tableHeaders = showUserList ? tableHeadersUser : tableHeaderToken;

				tableData = responseData.map((item) => {
					const formattedItem = {};
					for (const header of tableHeaders) {
						const { key } = header;
						formattedItem[key] = item[key] || 'NO DATA';
						if (key === 'createdAt' || key === 'updatedAt' || key === 'expiresIn') {
							formattedItem[key] = new Date(item[key]).toLocaleString();
						}
					}
					return formattedItem;
				});

				// Reset filters
				filters = {};

				// Inside the refreshTableData function
				if (userPaginationSettings.displayTableHeaders.length > 0) {
					// Initialize displayTableHeaders with the values from entryListPaginationSettings
					displayTableHeaders = userPaginationSettings.displayTableHeaders.map((header) => ({
						...header,
						id: generateUniqueId() // Add unique id for each header
					}));
				} else if (tableData.length > 0) {
					// If userPaginationSettings.displayTableHeaders doesn't exist, initialize displayTableHeaders with the same values as tableHeaders
					displayTableHeaders = tableData.map((header) => ({
						...header,
						visible: true, // Assuming all columns are initially visible
						id: generateUniqueId() // Add unique id for each header
					}));
				}

				SelectAll = false;

				// Update pagesCount after fetching data
				pagesCount = pagesCount || 1;

				// Update isFirstPage and isLastPage based on currentPage and pagesCount
				isFirstPage = currentPage === 1;
				isLastPage = currentPage === pagesCount;

				// Adjust currentPage to the last page if it exceeds the new total pages count after changing the rows per page.
				if (currentPage > (pagesCount || 0)) {
					currentPage = pagesCount || 1;
				}

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

	// React to changes in density setting and update local storage
	$: {
		userPaginationSettings = { ...userPaginationSettings, filters, sorting, density, currentPage, rowsPerPage, displayTableHeaders }; //
		localStorage.setItem('userPaginationSettings', JSON.stringify(userPaginationSettings)); // Update local storage
		//console.log('Updated userPaginationSettings:', userPaginationSettings);
	}

	// Adjusted filtering logic to prevent strict filtering
	$: {
		filteredTableData = tableData.filter((item) => {
			return Object.entries(item).some(([key, value]) => {
				if (filters[key]) {
					return (value as string).toString().toLowerCase().includes(filters[key].toLowerCase());
				} else {
					return true;
				}
			});
		});
	}

	// Columns Sorting
	let sorting: { sortedBy: string; isSorted: 0 | 1 | -1 } = localStorage.getItem('sorting')
		? JSON.parse(localStorage.getItem('sorting') as string)
		: {
				sortedBy: tableData.length > 0 ? Object.keys(tableData[0])[0] : '', // Set default sortedBy based on first key in tableData (if available)
				isSorted: 1 // 1 for ascending order, -1 for descending order and 0 for not sorted
			};

	// Tick  All Rows
	function process_selectAll(selectAll: boolean) {
		if (selectAll) {
			// Iterate only over visible entries
			for (let item in tableData) {
				selectedMap[item] = true;
			}
		} else {
			// Clear all selections
			for (let item in selectedMap) {
				selectedMap[item] = false;
			}
		}
	}

	// Update Tick All Rows
	$: process_selectAll(SelectAll);

	$: {
		tableHeaders = displayTableHeaders.filter((header) => header.visible);
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
	<div class="flex flex-col flex-wrap items-center justify-evenly gap-2 sm:flex-row xl:justify-between">
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
		<div class="my-4 flex flex-wrap items-center justify-between gap-1">
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

			<div class="order-2 flex items-center justify-center sm:order-3">
				<!-- Content based on conditions -->
				{#if showUserList}
					<Multibutton {selectedRows} on:crudAction={handleCRUDAction} />
				{:else if showUsertoken}
					<MultibuttonToken {selectedRows} on:crudAction={handleCRUDAction} />
				{/if}
			</div>
		</div>

		{#if tableData.length > 0}
			<!-- UserTable -->
			{#if columnShow}
				<!-- Column order -->
				<div class="rounded-b-0 flex flex-col justify-center rounded-t-md border-b bg-surface-300 text-center dark:bg-surface-700">
					<div class="text-white dark:text-primary-500">{m.entrylist_dnd()}</div>
					<!-- Select All Columns -->
					<div class="my-2 flex w-full items-center justify-center gap-1">
						<label class="mr-2">
							<input
								type="checkbox"
								bind:checked={selectAllColumns}
								on:change={() => {
									// Check if all columns are currently visible
									const allColumnsVisible = displayTableHeaders.every((header) => header.visible);

									// Toggle visibility of all columns based on the current state of selectAllColumns
									displayTableHeaders = displayTableHeaders.map((header) => ({
										...header,
										visible: !allColumnsVisible
									}));

									// Update selectAllColumns based on the new visibility state of all columns
									selectAllColumns = !allColumnsVisible;
								}}
							/>
							{m.entrylist_all()}
						</label>

						<section
							use:dndzone={{
								items: displayTableHeaders,
								flipDurationMs
							}}
							on:consider={handleDndConsider}
							on:finalize={handleDndFinalize}
							class="flex flex-wrap justify-center gap-1 rounded-md p-2"
						>
							{#each displayTableHeaders as header (header.id)}
								<button
									class="chip {header.visible ? 'variant-filled-secondary' : 'variant-ghost-secondary'} w-100 mr-2 flex items-center justify-center"
									animate:flip={{ duration: flipDurationMs }}
									on:click={() => {
										// Toggle the visibility of the header
										header.visible = !header.visible;

										// Check if all columns are currently visible
										const allColumnsVisible = displayTableHeaders.every((header) => header.visible);

										// Update selectAllColumns based on the visibility of all columns
										selectAllColumns = allColumnsVisible;
									}}
								>
									{#if header.visible}
										<span><iconify-icon icon="fa:check" /></span>
									{/if}
									<span class="ml-2 capitalize">{header.name}</span>
								</button>
							{/each}
						</section>
					</div>
				</div>
			{/if}

			<div class="table-container max-h-[calc(100vh-120px)] overflow-auto">
				<table
					class="table table-interactive table-hover {density === 'compact' ? 'table-compact' : density === 'normal' ? '' : 'table-comfortable'}"
				>
					<!-- Table Header -->
					<thead class="text-tertiary-500 dark:text-primary-500">
						{#if filterShow}
							<tr class="divide-x divide-surface-400">
								<th>
									<!-- Clear All Filters Button -->
									{#if Object.keys(filters).length > 0}
										<button
											class="variant-outline btn-icon"
											on:click={() => {
												// Clear all filters
												filters = {};
											}}
										>
											<iconify-icon icon="material-symbols:close" width="24" />
										</button>
									{/if}
								</th>

								<!-- Filter -->
								{#each showUserList ? tableHeadersUser : tableHeaderToken as header}
									<th>
										<div class="flex items-center justify-between">
											<FloatingInput
												type="text"
												icon="material-symbols:search-rounded"
												label={m.entrylist_filter()}
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
							<TableIcons bind:checked={SelectAll} iconStatus="all" />

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
								<TableIcons bind:checked={selectedMap[index]} />
								<!-- <TableIcons iconStatus={data?.entryList[index]?.status} bind:checked={selectedMap[index]} /> -->

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
				<div class="sticky bottom-0 left-0 right-0 z-10 flex flex-col items-center justify-center px-2 md:flex-row md:justify-between md:p-4">
					<div class="mb-1 text-xs md:mb-0 md:text-sm">
						<span>{m.entrylist_page()}</span> <span class="text-tertiary-500 dark:text-primary-500">{currentPage}</span>
						<span>{m.entrylist_of()}</span> <span class="text-tertiary-500 dark:text-primary-500">{pagesCount || 0}</span>
					</div>

					<div class="variant-outline btn-group">
						<!-- First page -->
						<button
							type="button"
							class="btn"
							disabled={isFirstPage}
							aria-label="Go to first page"
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
							disabled={isFirstPage}
							aria-label="Go to Previous page"
							on:click={() => {
								currentPage = Math.max(1, currentPage - 1);
								refreshTableData();
							}}
						>
							<iconify-icon icon="material-symbols:chevron-left" width="24" class:disabled={currentPage === 1} />
						</button>

						<!-- Rows per page select dropdown -->
						{#if rowsPerPage !== undefined}
							<select
								value={rowsPerPage}
								on:change={rowsPerPageHandler}
								class="mt-0.5 bg-transparent text-center text-tertiary-500 dark:text-primary-500"
							>
								{#each rowsPerPageOptions as pageSize}
									<option class="bg-surface-500 text-white" value={pageSize}> {pageSize} {m.entrylist_rows()} </option>
								{/each}
							</select>
						{/if}

						<!-- Next page -->
						<button
							type="button"
							class="btn"
							disabled={isLastPage}
							aria-label="Go to Next page"
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
							disabled={isLastPage}
							aria-label="Go to Last page"
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
			<!-- Display a message when no data is yet available -->
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
