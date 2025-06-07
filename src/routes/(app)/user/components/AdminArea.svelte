<!-- 
@file src/routes/(app)/user/components/AdminArea.svelte
@component 
**Admin area for managing users and tokens with efficient filtering and pagination.**
-->

<script lang="ts">
	import { debounce } from '@utils/utils';

	// Components
	import Multibutton from './Multibutton.svelte';
	import TableIcons from '@components/system/table/TableIcons.svelte';
	import TableFilter from '@components/system/table/TableFilter.svelte';
	import Boolean from '@components/system/table/Boolean.svelte';
	import Role from '@components/system/table/Role.svelte';
	import Loading from '@components/Loading.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import TablePagination from '@components/system/table/TablePagination.svelte';
	import PermissionGuard from '@components/PermissionGuard.svelte';
	import ModalEditToken from './ModalEditToken.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { Avatar } from '@skeletonlabs/skeleton';
	import { getModalStore, getToastStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings } from '@skeletonlabs/skeleton';

	// Svelte-dnd-action
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';
	import { PermissionAction, PermissionType } from '@root/src/auth/types';

	// Types
	interface UserData {
		_id: string;
		username: string;
		email: string;
		role: string;
		blocked: boolean;
		avatar?: string;
		activeSessions: number;
		lastAccess: Date;
		createdAt: Date;
		updatedAt: Date;
		[key: string]: any;
	}

	interface TokenData {
		token: string;
		email: string;
		role: string;
		user_id: string;
		blocked: boolean;
		expires: Date;
		createdAt: Date;
		updatedAt: Date;
		[key: string]: any;
	}

	interface AdminData {
		users: UserData[];
		tokens: TokenData[];
	}

	interface TableHeader {
		label: string;
		key: string;
		visible: boolean;
		id: string;
	}

	interface SortingState {
		sortedBy: string;
		isSorted: number; // 1: asc, -1: desc, 0: none
	}

	// Props
	let { adminData } = $props<{ adminData: AdminData | null }>();

	const modalStore = getModalStore();
	const toastStore = getToastStore();
	const waitFilter = debounce(300);
	const flipDurationMs = 300;

	// Table header definitions
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
	] as const;

	const tableHeaderToken = [
		{ label: m.adminarea_token(), key: 'token' },
		{ label: m.adminarea_blocked(), key: 'blocked' },
		{ label: m.form_email(), key: 'email' },
		{ label: m.form_role(), key: 'role' },
		{ label: m.adminarea_expiresin(), key: 'expires' },
		{ label: m.adminarea_createat(), key: 'createdAt' },
		{ label: m.adminarea_updatedat(), key: 'updatedAt' }
	] as const;

	// Core state with proper initialization
	let showUserList = $state(true);
	let showUsertoken = $state(false);
	let isLoading = $state(false);
	let globalSearchValue = $state('');
	let searchShow = $state(false);
	let filterShow = $state(false);
	let columnShow = $state(false);
	let selectAll = $state(false);
	let selectedMap = $state<Record<number, boolean>>({});
	let tableData = $derived.by(() => {
		if (!adminData) return [] as UserData[];
		if (showUserList) {
			return adminData.users as UserData[];
		} else if (showUsertoken) {
			return adminData.tokens as TokenData[];
		}
	});
	let filteredTableData = $state<(UserData | TokenData)[]>([]);
	let selectedRows = $state<(UserData | TokenData)[]>([]);
	let density = $state(
		(() => {
			const settings = localStorage.getItem('userPaginationSettings');
			return settings ? (JSON.parse(settings).density ?? 'normal') : 'normal';
		})()
	);
	let selectAllColumns = $state(true);
	let pagesCount = $state(1);
	let currentPage = $state(1);
	let rowsPerPage = $state(10);
	let filters = $state<{ [key: string]: string }>({});
	let sorting = $state<SortingState>({ sortedBy: '', isSorted: 0 });

	// Initialize displayTableHeaders with a safe default
	let displayTableHeaders = $state<TableHeader[]>(
		(() => {
			const settings = localStorage.getItem('userPaginationSettings');
			const parsed = settings ? JSON.parse(settings) : {};
			return (
				parsed.displayTableHeaders?.map((header: Partial<TableHeader>) => ({
					...header,
					id: crypto.randomUUID()
				})) ??
				tableHeadersUser.map((header) => ({
					label: header.label,
					key: header.key,
					visible: true,
					id: crypto.randomUUID()
				}))
			);
		})()
	);

	// Update displayTableHeaders when view changes
	$effect(() => {
		// Update displayTableHeaders when view changes
		displayTableHeaders = (showUserList ? tableHeadersUser : tableHeaderToken).map((header) => ({
			label: header.label,
			key: header.key,
			visible: true,
			id: crypto.randomUUID()
		}));

		// Update selectedRows based on selectedMap
		selectedRows = Object.entries(selectedMap)
			.filter(([_, isSelected]) => isSelected)
			.map(([index]) => filteredTableData[parseInt(index)]);
	});

	// Modal for token editing
	function modalTokenUser() {
		const modalSettings: ModalSettings = {
			type: 'component',
			title: m.adminarea_title(),
			body: m.adminarea_body(),
			component: {
				ref: ModalEditToken,
				slot: `
					<div class="mb-4">
						<h3 class="text-lg font-bold">Existing Tokens</h3>
						{#if adminData?.tokens?.length > 0}
							<ul class="max-h-40 overflow-y-auto">
								{#each adminData.tokens as token}
									<li class="flex items-center justify-between border-b py-2">
										<span class="truncate">{token.email}</span>
										<span class="text-sm text-gray-500">Expires: {token.expires && token.expires !== null ? new Date(token.expires).toLocaleDateString() : 'Never'}</span>
									</li>
								{/each}
							</ul>
						{:else}
							<p class="text-gray-500">No existing tokens</p>
						{/if}
					</div>
				`,
				props: {
					token: '',
					email: '',
					role: 'user',
					expires: '7d',
					user_id: ''
				}
			},
			response: (result) => {
				if (result?.success === false) {
					const t = {
						message: `<iconify-icon icon="mdi:alert-circle" color="white" width="24" class="mr-1"></iconify-icon> ${result.error || 'Failed to send email'}`,
						background: 'variant-filled-error',
						timeout: 5000,
						classes: 'border-1 !rounded-md'
					};
					toastStore.trigger(t);
				}
			}
		};
		modalStore.trigger(modalSettings);
	}

	function handleDndConsider(event: any) {
		displayTableHeaders = event.detail.items;
	}

	function handleDndFinalize(event: CustomEvent<DndEvent<TableHeader>>) {
		displayTableHeaders = event.detail.items;
		localStorage.setItem('userPaginationSettings', JSON.stringify({ density, displayTableHeaders }));
	}

	// Toggle views
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

<<<<<<< HEAD
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
=======
	// Refresh table data with current filters and sorting
	function refreshTableData() {
		// Apply filters and sorting to tableData
		if (!tableData) return;
		let filtered = [...tableData];

		// Apply global search if value exists
		if (globalSearchValue) {
			filtered = filtered.filter((row) => Object.values(row).some((value) => String(value).toLowerCase().includes(globalSearchValue.toLowerCase())));
>>>>>>> 69c53df49f438e29d4d10f3501b2b2667cbfa787
		}

		// Apply column filters
		Object.entries(filters).forEach(([key, value]) => {
			if (value) {
				filtered = filtered.filter((row) => String(row[key]).toLowerCase().includes(value.toLowerCase()));
			}
		});

		// Apply sorting
		if (sorting.sortedBy && sorting.isSorted !== 0) {
			filtered.sort((a, b) => {
				const aValue = String(a[sorting.sortedBy]).toLowerCase();
				const bValue = String(b[sorting.sortedBy]).toLowerCase();
				return sorting.isSorted === 1 ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
			});
		}

		// Apply pagination
		const start = (currentPage - 1) * rowsPerPage;
		const end = start + rowsPerPage;
		filteredTableData = filtered.slice(start, end);
		pagesCount = Math.ceil(filtered.length / rowsPerPage) || 1;
		if (currentPage > pagesCount) currentPage = pagesCount;
	}

	$effect(() => {
		refreshTableData();
	});

	function handleCheckboxChange() {
		const allColumnsVisible = displayTableHeaders.every((header) => header.visible);
		displayTableHeaders = displayTableHeaders.map((header) => ({
			...header,
			visible: !allColumnsVisible
		}));
		selectAllColumns = !allColumnsVisible;
	}

	function handleInputChange(value: string, headerKey: string) {
		if (value) {
			waitFilter(() => {
				filters = { ...filters, [headerKey]: value };
			});
		} else {
			const newFilters = { ...filters };
			delete newFilters[headerKey];
			filters = newFilters;
		}
	}
</script>

<div class="flex flex-col">
	<p class="h2 mb-2 text-center text-3xl font-bold dark:text-white">{m.adminarea_adminarea()}</p>

	<div class="flex flex-col flex-wrap items-center justify-evenly gap-2 sm:flex-row xl:justify-between">
		<button onclick={modalTokenUser} aria-label={m.adminarea_emailtoken()} class="gradient-primary btn w-full text-white sm:max-w-xs">
			<iconify-icon icon="material-symbols:mail" color="white" width="18" class="mr-1"></iconify-icon>
			<span class="whitespace-normal break-words">{m.adminarea_emailtoken()}</span>
		</button>

		<PermissionGuard
			config={{
				contextId: 'user:manage',
				name: 'Manage User Tokens',
				description: 'Allows management of user tokens in the admin area.',
				action: PermissionAction.MANAGE,
				contextType: PermissionType.USER
			}}
		>
			<button
				onclick={toggleUserToken}
				aria-label={showUsertoken ? m.adminarea_hideusertoken() : m.adminarea_showtoken()}
				class="gradient-secondary btn w-full text-white sm:max-w-xs"
			>
				<iconify-icon icon="material-symbols:key-outline" color="white" width="18" class="mr-1"></iconify-icon>
				<span>{showUsertoken ? m.adminarea_hideusertoken() : m.adminarea_showtoken()}</span>
			</button>
		</PermissionGuard>

		<button
			onclick={toggleUserList}
			aria-label={showUserList ? m.adminarea_hideuserlist() : m.adminarea_showuserlist()}
			class="gradient-tertiary btn w-full text-white sm:max-w-xs"
		>
			<iconify-icon icon="mdi:account-circle" color="white" width="18" class="mr-1"></iconify-icon>
			<span>{showUserList ? m.adminarea_hideuserlist() : m.adminarea_showuserlist()}</span>
		</button>
	</div>

	{#if isLoading}
		<Loading />
	{:else if showUserList || showUsertoken}
		<div class="my-4 flex flex-wrap items-center justify-between gap-1">
			<h2 class="order-1 font-bold text-tertiary-500 dark:text-primary-500">
				{#if showUserList}{m.adminarea_userlist()}{:else if showUsertoken}{m.adminarea_listtoken()}{/if}
			</h2>

			<div class="order-3 sm:order-2">
				<TableFilter bind:globalSearchValue bind:searchShow bind:filterShow bind:columnShow bind:density />
			</div>

			<div class="order-2 flex items-center justify-center sm:order-3">
				<Multibutton {selectedRows} type={showUserList ? 'user' : 'token'} />
			</div>
		</div>

		{#if tableData && tableData.length > 0}
			{#if columnShow}
				<div class="rounded-b-0 flex flex-col justify-center rounded-t-md border-b bg-surface-300 text-center dark:bg-surface-700">
					<div class="text-white dark:text-primary-500">{m.entrylist_dnd()}</div>
					<div class="my-2 flex w-full items-center justify-center gap-1">
						<label class="mr-2">
							<input type="checkbox" bind:checked={selectAllColumns} onclick={handleCheckboxChange} />
							{m.entrylist_all()}
						</label>

						<section
							use:dndzone={{ items: displayTableHeaders, flipDurationMs }}
							onconsider={handleDndConsider}
							onfinalize={handleDndFinalize}
							class="flex flex-wrap justify-center gap-1 rounded-md p-2"
						>
							{#each displayTableHeaders as header (header.id)}
								<button
									class="chip {header.visible ? 'variant-filled-secondary' : 'variant-ghost-secondary'} w-100 mr-2 flex items-center justify-center"
									animate:flip={{ duration: flipDurationMs }}
									onclick={() => {
										displayTableHeaders = displayTableHeaders.map((h) => (h.id === header.id ? { ...h, visible: !h.visible } : h));
										selectAllColumns = displayTableHeaders.every((h) => h.visible);
									}}
								>
									{#if header.visible}
										<span><iconify-icon icon="fa:check"></iconify-icon></span>
									{/if}
									<span class="ml-2 capitalize">{header.label}</span>
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
										<button onclick={() => (filters = {})} aria-label="Clear All Filters" class="variant-outline btn-icon">
											<iconify-icon icon="material-symbols:close" width="24"></iconify-icon>
										</button>
									{/if}
								</th>

								{#each displayTableHeaders.filter((header) => header.visible) as header}
									<th>
										<div class="flex items-center justify-between">
											<FloatingInput
												type="text"
												icon="material-symbols:search-rounded"
												label={m.entrylist_filter()}
												name={header.key}
												onInput={(value) => handleInputChange(value, header.key)}
											/>
										</div>
									</th>
								{/each}
							</tr>
						{/if}

						<tr class="divide-x divide-surface-400 border-b border-black dark:border-white">
							<TableIcons
								checked={selectAll}
								onCheck={(checked) => {
									selectAll = checked;
									for (let i = 0; i < filteredTableData.length; i++) {
										selectedMap[i] = checked;
									}
								}}
							/>

							{#each displayTableHeaders.filter((header) => header.visible) as header}
								<th
									onclick={() => {
										sorting = {
											sortedBy: header.key,
											isSorted: sorting.sortedBy === header.key ? (sorting.isSorted === 1 ? -1 : sorting.isSorted === -1 ? 0 : 1) : 1
										};
									}}
								>
									<div class="flex items-center justify-center text-center">
										{header.label}
										<iconify-icon
											icon="material-symbols:arrow-upward-rounded"
											width="22"
											class="origin-center duration-300 ease-in-out"
											class:up={sorting.isSorted === 1 && sorting.sortedBy === header.key}
											class:invisible={sorting.isSorted === 0 || sorting.sortedBy !== header.key}
										></iconify-icon>
									</div>
								</th>
							{/each}
						</tr>
					</thead>

					<tbody>
						{#each filteredTableData as row, index}
							<tr class="divide-x divide-surface-400">
								<TableIcons
									checked={selectedMap[index] ?? false}
									onCheck={(checked) => {
										selectedMap[index] = checked;
									}}
								/>
								{#each displayTableHeaders.filter((header) => header.visible) as header}
									<td class="text-center">
										{#if header.key === 'blocked'}
											<Boolean value={!!row[header.key]} />
										{:else if showUserList && header.key === 'avatar'}
											<Avatar src={row[header.key] ?? '/Default_User.svg'} width="w-8" />
										{:else if header.key === 'role'}
											<Role value={row[header.key]} />
										{:else if ['createdAt', 'updatedAt', 'lastAccess'].includes(header.key)}
											{row[header.key] && row[header.key] !== null ? new Date(row[header.key]).toLocaleString() : '-'}
										{:else if header.key === 'expires'}
											{row[header.key] && row[header.key] !== null ? new Date(row[header.key]).toLocaleDateString() : '-'}
										{:else}
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											{@html row[header.key] || '-'}
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Pagination  -->

			<div class="mt-2 flex flex-col items-center justify-center px-2 md:flex-row md:justify-between md:p-4">
				<TablePagination
					{currentPage}
					{pagesCount}
					{rowsPerPage}
					rowsPerPageOptions={[2, 10, 25, 50, 100, 500]}
					totalItems={filteredTableData.length}
					onUpdatePage={(page) => {
						currentPage = page;
					}}
					onUpdateRowsPerPage={(rows) => {
						rowsPerPage = rows;
						currentPage = 1;
					}}
				/>
			</div>
		{:else}
			<div class="variant-ghost-error btn text-center font-bold">
				{#if showUserList}{m.adminarea_nouser()}{:else if showUsertoken}{m.adminarea_notoken()}{/if}
			</div>
		{/if}
	{/if}
</div>
