<!-- AdminArea.svelte -->
<script lang="ts">
	import { asAny, debounce } from '@utils/utils';
	import { PermissionAction, PermissionType } from '@src/auth/permissionTypes';

	// Components
	import Multibutton from './Multibutton.svelte';
	import MultibuttonToken from './MultibuttonToken.svelte';
	import TableIcons from '@components/system/table/TableIcons.svelte';
	import TableFilter from '@components/system/table/TableFilter.svelte';
	import Boolean from '@components/system/table/Boolean.svelte';
	import Role from '@components/system/table/Role.svelte';
	import Loading from '@components/Loading.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import TablePagination from '@components/system/table/TablePagination.svelte';
	import PermissionGuard from '@components/PermissionGuard.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { Avatar } from '@skeletonlabs/skeleton';
	import ModalTokenUser from './ModalTokenUser.svelte';
	import { getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';

	// Types
	interface AdminUser {
		_id: string;
		blocked: boolean;
		avatar?: string;
		email: string;
		username: string;
		role: string;
		activeSessions: number;
		lastAccess: Date;
		createdAt: Date;
		updatedAt: Date;
		[key: string]: any;
	}

	interface AdminToken {
		token: string;
		blocked: boolean;
		email: string;
		expires: Date;
		createdAt: Date;
		updatedAt: Date;
		[key: string]: any;
	}

	interface AdminData {
		users: AdminUser[];
		tokens: AdminToken[];
	}

	let { adminData, manageUsersPermissionConfig } = $props<{
		adminData: AdminData | null;
		manageUsersPermissionConfig: any;
	}>();

	const modalStore = getModalStore();

	let showUserList = $state(false);
	let showUsertoken = $state(false);
	let isLoading = $state(false);
	let loadingTimer = $state<any>(null);
	let globalSearchValue = $state('');
	let searchShow = $state(false);
	let filterShow = $state(false);
	let columnShow = $state(false);
	let SelectAll = $state(false);

	let selectedMap = $state<Record<number, boolean>>({});
	let selectedRows = $state<any[]>([]);
	let tableData = $state<(AdminUser | AdminToken)[]>([]);
	let filteredTableData = $state<(AdminUser | AdminToken)[]>([]);

	// Update selectedRows whenever selectedMap changes
	$effect(() => {
		const currentFilteredData = filteredTableData;
		selectedRows = Object.entries(selectedMap)
			.filter(([_, isSelected]) => isSelected)
			.map(([index]) => ({
				data: currentFilteredData[parseInt(index)]
			}));
	});

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

	// Svelte-dnd-action
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';

	const flipDurationMs = 300;

	function handleDndConsider(event: any) {
		const items = event.detail.items;
		displayTableHeaders = items;
	}

	function handleDndFinalize(event: any) {
		const items = event.detail.items;
		displayTableHeaders = items;
	}

	function toggleUserList() {
		const newShowUserList = !showUserList;
		showUserList = newShowUserList;
		if (showUsertoken) showUsertoken = false;
		refreshTableData();
	}

	function toggleUserToken() {
		const newShowUserToken = !showUsertoken;
		showUsertoken = newShowUserToken;
		showUserList = false;
		refreshTableData();
	}

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
		{ label: m.adminarea_token(), key: 'token' },
		{ label: m.adminarea_blocked(), key: 'blocked' },
		{ label: m.form_email(), key: 'email' },
		{ label: m.adminarea_expiresin(), key: 'expiresIn' },
		{ label: m.adminarea_createat(), key: 'createdAt' },
		{ label: m.adminarea_updatedat(), key: 'updatedAt' }
	];

	let userPaginationSettings = $state(
		localStorage.getItem('userPaginationSettings')
			? JSON.parse(localStorage.getItem('userPaginationSettings') as string)
			: {
					density: 'normal',
					sorting: { sortedBy: '', isSorted: 0 },
					currentPage: 1,
					rowsPerPage: 10,
					filters: {},
					displayTableHeaders: []
				}
	);

	let density = $state(userPaginationSettings.density || 'normal');
	let selectAllColumns = $state(true);

	let tableHeaders = $state<Array<{ label: string; name: string }>>([]);

	let displayTableHeaders = $state(
		userPaginationSettings.displayTableHeaders.length > 0
			? userPaginationSettings.displayTableHeaders.map((header: any) => ({
					...header,
					id: crypto.randomUUID()
				}))
			: []
	);

	let filters = $state<{ [key: string]: string }>(userPaginationSettings.filters || {});
	const waitFilter = debounce(300);

	let pagesCount = $state(userPaginationSettings.pagesCount || 1);
	let currentPage = $state(userPaginationSettings.currentPage || 1);
	let rowsPerPage = $state(userPaginationSettings.rowsPerPage || 10);
	const rowsPerPageOptions = [2, 10, 25, 50, 100, 500];

	function formatDate(dateStr: string | Date): string {
		try {
			const date = new Date(dateStr);
			if (date instanceof Date && !isNaN(date.getTime())) {
				return new Intl.DateTimeFormat('default', {
					year: 'numeric',
					month: 'short',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit'
				}).format(date);
			}
		} catch (error) {
			console.error('Date formatting error:', error);
		}
		return 'Invalid Date';
	}

	async function refreshTableData() {
		if (loadingTimer) clearTimeout(loadingTimer);

		if (showUserList || showUsertoken) {
			loadingTimer = setTimeout(() => {
				isLoading = true;
			}, 400);

			if (adminData) {
				const newTableData = showUserList ? adminData.users : adminData.tokens;
				tableData = newTableData;
			}

			const currentTableHeaders = showUserList ? tableHeadersUser : tableHeaderToken;

			const formattedTableData = tableData.map((item, index) => {
				const formattedItem: { [key: string]: any } = {};
				for (const header of currentTableHeaders) {
					const { key } = header;
					if (key === 'avatar') {
						formattedItem[key] = item[key] || '/Default_User.svg';
					} else if (['createdAt', 'updatedAt', 'lastAccess'].includes(key)) {
						formattedItem[key] = formatDate(item[key]);
					} else if (key === 'expiresIn') {
						formattedItem[key] = formatDate(item.expires);
					} else if (key === 'role') {
						if (index === 0) {
							formattedItem[key] = 'admin';
						} else {
							formattedItem[key] = item[key] || 'user';
						}
					} else {
						formattedItem[key] = item[key] ?? 'NO DATA';
					}
				}
				return formattedItem as AdminUser | AdminToken;
			});

			tableData = formattedTableData;
			filters = {};

			if (userPaginationSettings.displayTableHeaders.length > 0) {
				const newDisplayTableHeaders = userPaginationSettings.displayTableHeaders.map((header: any) => ({
					...header,
					id: crypto.randomUUID()
				}));
				displayTableHeaders = newDisplayTableHeaders;
			} else if (tableData.length > 0) {
				const newDisplayTableHeaders = Object.keys(tableData[0]).map((key) => ({
					label: key,
					name: key,
					visible: true,
					id: crypto.randomUUID()
				}));
				displayTableHeaders = newDisplayTableHeaders;
			}

			SelectAll = false;
			selectedMap = {};

			const totalRows = tableData.length;
			const newPagesCount = Math.ceil(totalRows / rowsPerPage);
			pagesCount = newPagesCount;

			if (currentPage > pagesCount) {
				currentPage = 1;
			}

			const startIndex = (currentPage - 1) * rowsPerPage;
			const endIndex = startIndex + rowsPerPage;
			const paginatedData = tableData.slice(startIndex, endIndex);
			tableData = paginatedData;
			filteredTableData = [...paginatedData];

			isLoading = false;
			if (loadingTimer) clearTimeout(loadingTimer);
		} else {
			tableData = [];
			filteredTableData = [];
		}
	}
	refreshTableData();

	$effect(() => {
		const newSettings = { ...userPaginationSettings, filters, sorting, density, currentPage, rowsPerPage, displayTableHeaders };
		userPaginationSettings = newSettings;
		localStorage.setItem('userPaginationSettings', JSON.stringify(newSettings));
	});

	$effect(() => {
		const currentFilters = filters;
		const currentTableData = tableData;

		const newFilteredData = currentTableData.filter((item) => {
			return Object.entries(item).some(([key, value]) => {
				if (currentFilters[key]) {
					return String(value).toLowerCase().includes(currentFilters[key].toLowerCase());
				} else {
					return true;
				}
			});
		});

		filteredTableData = newFilteredData;
	});

	let sorting = $state(
		localStorage.getItem('sorting')
			? JSON.parse(localStorage.getItem('sorting') as string)
			: {
					sortedBy: tableData.length > 0 ? Object.keys(tableData[0])[0] : '',
					isSorted: 1
				}
	);

	function process_selectAll(selectAll: boolean) {
		if (selectAll) {
			const currentFilteredData = filteredTableData;
			const newSelectedMap: Record<number, boolean> = {};
			currentFilteredData.forEach((_, index) => {
				newSelectedMap[index] = true;
			});
			selectedMap = newSelectedMap;
		} else {
			selectedMap = {};
		}
	}

	$effect(() => {
		process_selectAll(SelectAll);
	});

	$effect(() => {
		const visibleHeaders = displayTableHeaders.filter((header) => header.visible);
		tableHeaders = visibleHeaders;
	});

	function handleCheckboxChange() {
		const allColumnsVisible = displayTableHeaders.every((header) => header.visible);
		const newDisplayTableHeaders = displayTableHeaders.map((header) => ({
			...header,
			visible: !allColumnsVisible
		}));
		displayTableHeaders = newDisplayTableHeaders;
		selectAllColumns = !allColumnsVisible;
	}

	function handleInputChange(e: Event, headerKey: string) {
		const value = asAny(e.target).value;
		if (value) {
			waitFilter(() => {
				const newFilters = { ...filters };
				newFilters[headerKey] = value;
				filters = newFilters;
			});
		} else {
			const newFilters = { ...filters };
			delete newFilters[headerKey];
			filters = newFilters;
		}
	}

	function handlePageUpdate(e: CustomEvent) {
		const newPage = e.detail;
		currentPage = newPage;
		refreshTableData();
	}

	function handleRowsPerPageUpdate(e: CustomEvent) {
		const newRowsPerPage = e.detail;
		rowsPerPage = newRowsPerPage;
		refreshTableData();
	}
</script>

<div class="flex flex-col">
	<p class="h2 mb-2 text-center text-3xl font-bold dark:text-white">
		{m.adminarea_adminarea()}
	</p>

	<PermissionGuard config={manageUsersPermissionConfig}>
		<div class="flex flex-col flex-wrap items-center justify-evenly gap-2 sm:flex-row xl:justify-between">
			<button onclick={modalTokenUser} aria-label={m.adminarea_emailtoken()} class="gradient-primary btn w-full text-white sm:max-w-xs">
				<iconify-icon icon="material-symbols:mail" color="white" width="18" class="mr-1"></iconify-icon>
				<span class="whitespace-normal break-words">{m.adminarea_emailtoken()}</span>
			</button>

			<PermissionGuard
				config={{ contextId: 'user:manage', name: 'Manage User Tokens', action: PermissionAction.MANAGE, contextType: PermissionType.USER }}
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
	</PermissionGuard>

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
					<Multibutton {selectedRows} />
				{:else if showUsertoken}
					<MultibuttonToken {selectedRows} />
				{/if}
			</div>
		</div>

		{#if tableData.length > 0}
			{#if columnShow}
				<div class="rounded-b-0 flex flex-col justify-center rounded-t-md border-b bg-surface-300 text-center dark:bg-surface-700">
					<div class="text-white dark:text-primary-500">{m.entrylist_dnd()}</div>
					<div class="my-2 flex w-full items-center justify-center gap-1">
						<label class="mr-2">
							<input type="checkbox" bind:checked={selectAllColumns} onchange={handleCheckboxChange} />
							{m.entrylist_all()}
						</label>

						<section
							use:dndzone={{
								items: displayTableHeaders,
								flipDurationMs
							}}
							onconsider={handleDndConsider}
							onfinalize={handleDndFinalize}
							class="flex flex-wrap justify-center gap-1 rounded-md p-2"
						>
							{#each displayTableHeaders as header (header.id)}
								<button
									class="chip {header.visible ? 'variant-filled-secondary' : 'variant-ghost-secondary'} w-100 mr-2 flex items-center justify-center"
									animate:flip={{ duration: flipDurationMs }}
									onclick={() => {
										const newDisplayTableHeaders = displayTableHeaders.map((h) => {
											if (h.id === header.id) {
												return { ...h, visible: !h.visible };
											}
											return h;
										});
										displayTableHeaders = newDisplayTableHeaders;
										const allColumnsVisible = newDisplayTableHeaders.every((h) => h.visible);
										selectAllColumns = allColumnsVisible;
									}}
								>
									{#if header.visible}
										<span><iconify-icon icon="fa:check"></iconify-icon></span>
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
											onclick={() => {
												filters = {};
											}}
											aria-label="Clear All Filters"
											class="variant-outline btn-icon"
										>
											<iconify-icon icon="material-symbols:close" width="24"></iconify-icon>
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
												on:input={(e) => handleInputChange(e, header.key)}
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
									onclick={() => {
										const newSorting = {
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
										sorting = newSorting;
									}}
								>
									<div class="flex items-center justify-center text-center">
										{header.label}

										<iconify-icon
											icon="material-symbols:arrow-upward-rounded"
											width="22"
											class="origin-center duration-300 ease-in-out"
											class:up={sorting.isSorted === 1}
											class:invisible={sorting.isSorted === 0 || sorting.sortedBy !== header.label}
										></iconify-icon>
									</div>
								</th>
							{/each}
						</tr>
					</thead>

					<tbody>
						{#each filteredTableData as row, index}
							<tr class="divide-x divide-surface-400">
								<TableIcons bind:checked={selectedMap[index]} iconStatus="single" />
								{#each showUserList ? tableHeadersUser : tableHeaderToken as header}
									<td class="text-center">
										{#if header.key === 'blocked'}
											<Boolean value={String(row[header.key]) === 'true'} />
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
					on:updatePage={handlePageUpdate}
					on:updateRowsPerPage={handleRowsPerPageUpdate}
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
