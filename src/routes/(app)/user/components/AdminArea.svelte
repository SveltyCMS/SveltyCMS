<script lang="ts">
	import axios from 'axios';
	import type { PageData } from '../$types';
	import { writable } from 'svelte/store';
	import { asAny, debounce } from '@utils/utils';

	// Components
	import Multibutton from './Multibutton.svelte';
	import MultibuttonToken from './MultibuttonToken.svelte';
	import TableIcons from '@src/components/system/table/TableIcons.svelte';
	import TableFilter from '@components/system/table/TableFilter.svelte';
	import Boolean from '@components/system/table/Boolean.svelte';
	import Role from '@components/system/table/Role.svelte';
	import Loading from '@components/Loading.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import TablePagination from '@src/components/system/table/TablePagination.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { Avatar } from '@skeletonlabs/skeleton';
	import ModalTokenUser from './ModalTokenUser.svelte';
	import { getModalStore } from '@skeletonlabs/skeleton';

	const modalStore = getModalStore();
	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';

	export let data: PageData;

	// Modal Trigger - Generate User Registration email Token
	function modalTokenUser(): void {
		const modalComponent: ModalComponent = {
			ref: ModalTokenUser,
			slot: '<p>Edit Form</p>'
		};
		const d: ModalSettings = {
			type: 'component',
			title: m.adminarea_title(),
			body: m.adminarea_body(),
			component: modalComponent,
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

	const userTableData = [];
	const tokenTableData = [];

	const tableHeadersUser = [
		{ label: m.adminarea_user_id(), key: '_id' },
		{ label: m.adminarea_blocked(), key: 'blocked' },
		{ label: m.form_avatar(), key: 'avatar' },
		{ label: m.form_email(), key: 'email' },
		{ label: m.form_username(), key: 'username' },
		{ label: m.form_role(), key: 'role' },
		{ label: m.adminarea_activesession(), key: 'activeSessions' },
		{ label: m.adminarea_lastaccess(), key: 'lastAccess' },
		{ label: m.adminarea_createat(), key: 'createdAt' },
		{ label: m.adminarea_updatedat(), key: 'updatedAt' }
	];

	const tableHeaderToken = [
		{ label: m.adminarea_user_id(), key: 'user_id' },
		{ label: m.adminarea_blocked(), key: 'blocked' },
		{ label: m.form_email(), key: 'email' },
		{ label: m.adminarea_expiresin(), key: 'expiresIn' },
		{ label: m.adminarea_createat(), key: 'createdAt' },
		{ label: m.adminarea_updatedat(), key: 'updatedAt' }
	];

	let globalSearchValue = '';
	let searchShow = false;
	let filterShow = false;
	let columnShow = false;

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

	let density: string = userPaginationSettings.density || 'normal';
	let selectAllColumns = true;

	export let selectedRows: any[] = [];

	let tableHeaders: Array<{ label: string; name: string }> = [];
	let tableData: any[] = [];
	const tableDataUserToken: any[] = [];

	let displayTableHeaders: { label: string; name: string; id: string; visible: boolean }[] =
		userPaginationSettings.displayTableHeaders.length > 0
			? userPaginationSettings.displayTableHeaders
			: tableData.map((header) => ({ ...header, visible: true }));

	let SelectAll = false;
	const selectedMap = writable({});

	let filters: { [key: string]: string } = userPaginationSettings.filters || {};
	let filteredTableData: any[] = [];
	const waitFilter = debounce(300);

	let pagesCount: number = userPaginationSettings.pagesCount || 1;
	let currentPage: number = userPaginationSettings.currentPage || 1;
	let rowsPerPage: number = userPaginationSettings.rowsPerPage || 10;
	const rowsPerPageOptions = [2, 10, 25, 50, 100, 500];

	async function refreshTableData() {
		// Clear loading timer & show loader
		loadingTimer && clearTimeout(loadingTimer);

		try {
			let responseData: any;
			if (showUserList || showUsertoken) {
				// Show loader
				loadingTimer = setTimeout(() => {
					isLoading = true;
				}, 400);

				// Get User/Token data
				if (showUserList) {
					responseData = await axios.get('/api/getUsers').then((data) => data.data);
				} else {
					responseData = await axios.get('/api/getTokens').then((data) => data.data);
				}

				const tableHeaders = showUserList ? tableHeadersUser : tableHeaderToken;

				debugger;
				tableData = responseData.map((item) => {
					const formattedItem = {};
					for (const header of tableHeaders) {
						const { key } = header;
						//console.log(key, item[key]);
						// Display avatar image in table
						if (key === 'avatar') {
							if (item[key]) {
								const avatarUrl = `${item[key].thumbnail.url}`;
								console.log('Avatar URL:', avatarUrl); // Log the constructed URL
								formattedItem[key] = avatarUrl;
							} else {
								formattedItem[key] = '/Default_User.svg';
							}
						} else {
							debugger;
							formattedItem[key] = item[key] || 'NO DATA';

							// Display CreatedAt/UpdatedAt in table
							if (key === 'createdAt' || key === 'updatedAt' || key === 'expiresIn') {
								formattedItem[key] = new Date(item[key]).toLocaleString();
							}
						}
					}
					return formattedItem;
				});

				filters = {};

				// Set table headers
				if (userPaginationSettings.displayTableHeaders.length > 0) {
					displayTableHeaders = userPaginationSettings.displayTableHeaders.map((header) => ({
						...header,
						id: crypto.randomUUID()
					}));
				} else if (tableData.length > 0) {
					displayTableHeaders = tableData.map((header) => ({
						...header,
						visible: true,
						id: crypto.randomUUID()
					}));
				}

				SelectAll = false;
				const totalRows = tableData.length;
				pagesCount = Math.ceil(totalRows / rowsPerPage);

				// Reset currentPage to 1 if it exceeds the new total pages
				if (currentPage > pagesCount) {
					currentPage = 1;
				}

				// Slice tableData for current page
				const startIndex = (currentPage - 1) * rowsPerPage;
				const endIndex = startIndex + rowsPerPage;
				tableData = tableData.slice(startIndex, endIndex);

				isLoading = false;
				clearTimeout(loadingTimer);
			} else {
				tableData = [];
			}
		} catch (error) {
			console.error('Error fetching data:', error);
		}
	}

	refreshTableData();

	$: {
		userPaginationSettings = { ...userPaginationSettings, filters, sorting, density, currentPage, rowsPerPage, displayTableHeaders };
		localStorage.setItem('userPaginationSettings', JSON.stringify(userPaginationSettings));
	}

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

	let sorting: { sortedBy: string; isSorted: 0 | 1 | -1 } = localStorage.getItem('sorting')
		? JSON.parse(localStorage.getItem('sorting') as string)
		: {
				sortedBy: tableData.length > 0 ? Object.keys(tableData[0])[0] : '',
				isSorted: 1
			};

	function process_selectAll(selectAll: boolean) {
		if (selectAll) {
			for (const item in tableData) {
				selectedMap[item] = true;
			}
		} else {
			for (const item in selectedMap) {
				selectedMap[item] = false;
			}
		}
	}

	$: process_selectAll(SelectAll);

	$: {
		tableHeaders = displayTableHeaders.filter((header) => header.visible);
	}

	let currentAction = null;

	function handleCRUDAction(action: any) {
		currentAction = action;
	}
</script>

<div class="flex flex-col">
	<p class="h2 mb-2 text-center text-3xl font-bold dark:text-white">
		{m.adminarea_adminarea()}
	</p>
	<div class="flex flex-col flex-wrap items-center justify-evenly gap-2 sm:flex-row xl:justify-between">
		<button on:click={modalTokenUser} class="gradient-primary btn w-full text-white sm:max-w-xs">
			<iconify-icon icon="material-symbols:mail" color="white" width="18" class="mr-1" />
			<span class="whitespace-normal break-words">{m.adminarea_emailtoken()}</span>
		</button>

		{#if tableDataUserToken}
			<button on:click={toggleUserToken} class="gradient-secondary btn w-full text-white sm:max-w-xs">
				<iconify-icon icon="material-symbols:key-outline" color="white" width="18" class="mr-1" />
				<span>{showUsertoken ? m.adminarea_hideusertoken() : m.adminarea_showtoken()}</span>
			</button>
		{/if}

		<button on:click={toggleUserList} class="gradient-tertiary btn w-full text-white sm:max-w-xs">
			<iconify-icon icon="mdi:account-circle" color="white" width="18" class="mr-1" />
			<span>{showUserList ? m.adminarea_hideuserlist() : m.adminarea_showuserlist()}</span>
		</button>
	</div>

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
				{#if showUserList}
					<Multibutton {selectedRows} on:crudAction={handleCRUDAction} />
				{:else if showUsertoken}
					<MultibuttonToken {selectedRows} on:crudAction={handleCRUDAction} />
				{/if}
			</div>
		</div>

		{#if tableData.length > 0}
			{#if columnShow}
				<div class="rounded-b-0 flex flex-col justify-center rounded-t-md border-b bg-surface-300 text-center dark:bg-surface-700">
					<div class="text-white dark:text-primary-500">{m.entrylist_dnd()}</div>
					<div class="my-2 flex w-full items-center justify-center gap-1">
						<label class="mr-2">
							<input
								type="checkbox"
								bind:checked={selectAllColumns}
								on:change={() => {
									const allColumnsVisible = displayTableHeaders.every((header) => header.visible);
									displayTableHeaders = displayTableHeaders.map((header) => ({
										...header,
										visible: !allColumnsVisible
									}));
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
										header.visible = !header.visible;
										const allColumnsVisible = displayTableHeaders.every((header) => header.visible);
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
					<thead class="text-tertiary-500 dark:text-primary-500">
						{#if filterShow}
							<tr class="divide-x divide-surface-400">
								<th>
									{#if Object.keys(filters).length > 0}
										<button
											class="variant-outline btn-icon"
											on:click={() => {
												filters = {};
											}}
										>
											<iconify-icon icon="material-symbols:close" width="24" />
										</button>
									{/if}
								</th>

								{#each showUserList ? tableHeadersUser : tableHeaderToken as header}
									<th>
										<div class="flex items-center justify-between">
											<FloatingInput
												type="text"
												icon="material-symbols:search-rounded"
												label={m.entrylist_filter()}
												name={header.key}
												on:input={(e) => {
													const value = asAny(e.target).value;
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
								{#each showUserList ? tableHeadersUser : tableHeaderToken as header}
									<td class="text-center">
										{#if header.key === 'blocked'}
											<Boolean value={row[header.key] === 'true'} />
										{:else if showUserList && header.key === 'avatar'}
											<Avatar src={row[header.key]} fallback="/Default_User.svg" width="w-8" />
										{:else if header.key === 'role'}
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
			</div>

			<!-- Pagination  -->
			<div class="relative bottom-0 left-0 right-0 mt-2 flex flex-col items-center justify-center px-2 md:flex-row md:justify-between md:p-4">
				<TablePagination
					{currentPage}
					{pagesCount}
					{rowsPerPage}
					{rowsPerPageOptions}
					on:updatePage={(e) => {
						currentPage = e.detail;
						refreshTableData();
					}}
					on:updateRowsPerPage={(e) => {
						rowsPerPage = e.detail;
						refreshTableData();
					}}
				/>
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
