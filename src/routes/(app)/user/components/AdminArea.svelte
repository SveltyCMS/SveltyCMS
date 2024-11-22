<!-- 
@file src/routes/(app)/user/components/AdminArea.svelte
@component 
**Admin area for managing users and tokens**
-->
<script lang="ts">
	import { debounce } from '@utils/utils';
	import { PermissionAction, PermissionType } from '@src/auth/permissionTypes';

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

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { Avatar } from '@skeletonlabs/skeleton';
	import { getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';

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
		isSorted: number;
	}

	// Props
	let { adminData } = $props<{
		adminData: AdminData | null;
	}>();

	const modalStore = getModalStore();
	const waitFilter = debounce(300);

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
		{ label: m.adminarea_expiresin(), key: 'expiresIn' },
		{ label: m.adminarea_createat(), key: 'createdAt' },
		{ label: m.adminarea_updatedat(), key: 'updatedAt' }
	] as const;

	// State Management using Svelte 5's $ prefix
	let showUserList = $state(false);
	let showUsertoken = $state(false);
	let isLoading = $state(false);
	let globalSearchValue = $state('');
	let searchShow = $state(false);
	let filterShow = $state(false);
	let columnShow = $state(false);
	let SelectAll = $state(false);
	let selectedMap = $state<Record<number, boolean>>({});
	let tableData = $state<(UserData | TokenData)[]>([]);
	let filteredTableData = $state<(UserData | TokenData)[]>([]);
	let selectedRows = $state<SelectedRow[]>([]);
	let density = $state(
		localStorage.getItem('userPaginationSettings') ? JSON.parse(localStorage.getItem('userPaginationSettings') as string).density : 'normal'
	);
	let selectAllColumns = $state(true);
	let pagesCount = $state(1);
	let currentPage = $state(1);
	let rowsPerPage = $state(10);
	let filters = $state<{ [key: string]: string }>({});

	// Initialize displayTableHeaders
	let displayTableHeaders = $state<TableHeader[]>(
		localStorage.getItem('userPaginationSettings')
			? JSON.parse(localStorage.getItem('userPaginationSettings') as string).displayTableHeaders.map((header: Partial<TableHeader>) => ({
					...header,
					id: crypto.randomUUID()
				}))
			: tableHeadersUser.map((header) => ({
					label: header.label,
					key: header.key,
					visible: true,
					id: crypto.randomUUID()
				}))
	);

	// Update displayTableHeaders when view changes
	$effect(() => {
		displayTableHeaders = (showUserList ? tableHeadersUser : tableHeaderToken).map((header) => ({
			label: header.label,
			key: header.key,
			visible: true,
			id: crypto.randomUUID()
		}));
	});

	$effect(() => {
		selectedRows = Object.entries(selectedMap)
			.filter(([_, isSelected]) => isSelected)
			.map(([index]) => ({
				data: filteredTableData[parseInt(index)]
			}));
	});

	// Derived values
	interface SelectedRow {
		data: UserData | TokenData;
	}

	let sorting = $state<SortingState>({
		sortedBy: '',
		isSorted: 1
	});

	if (localStorage.getItem('sorting')) {
		const savedSorting = JSON.parse(localStorage.getItem('sorting') as string);
		sorting = savedSorting;
	}

	function modalTokenUser(): void {
		const modalComponent: ModalComponent = {
			ref: ModalEditToken,
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
	import ModalEditToken from './ModalEditToken.svelte';

	const flipDurationMs = 300;

	function handleDndConsider(event: any) {
		displayTableHeaders = event.detail.items;
	}

	function handleDndFinalize(event: any) {
		displayTableHeaders = event.detail.items;
	}

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

	// Refresh table data with current filters and sorting
	function refreshTableData() {
		// Apply filters and sorting to tableData
		let filtered = [...tableData];

		// Apply global search if value exists
		if (globalSearchValue) {
			filtered = filtered.filter((row) => Object.values(row).some((value) => String(value).toLowerCase().includes(globalSearchValue.toLowerCase())));
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

		// Update filtered data and calculate pages
		filteredTableData = filtered;
		pagesCount = Math.ceil(filtered.length / rowsPerPage);
		currentPage = Math.min(currentPage, pagesCount);
	}

	// Initialize table data when adminData changes
	$effect(() => {
		if (adminData) {
			if (showUserList) {
				tableData = adminData.users;
			} else if (showUsertoken) {
				tableData = adminData.tokens;
			}
			refreshTableData();
		}
	});

	// Refresh table data when filters change
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

	refreshTableData();
</script>

<div class="flex flex-col">
	<p class="h2 mb-2 text-center text-3xl font-bold dark:text-white">
		{m.adminarea_adminarea()}
	</p>

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
				<Multibutton {selectedRows} type={showUserList ? 'user' : 'token'} />
			</div>
		</div>

		{#if tableData.length > 0}
			{#if columnShow}
				<div class="rounded-b-0 flex flex-col justify-center rounded-t-md border-b bg-surface-300 text-center dark:bg-surface-700">
					<div class="text-white dark:text-primary-500">{m.entrylist_dnd()}</div>
					<div class="my-2 flex w-full items-center justify-center gap-1">
						<label class="mr-2">
							<input type="checkbox" bind:checked={selectAllColumns} onclick={handleCheckboxChange} />
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
										displayTableHeaders = displayTableHeaders.map((h) => {
											if (h.id === header.id) {
												return { ...h, visible: !h.visible };
											}
											return h;
										});
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
								checked={SelectAll}
								onCheck={(checked) => {
									SelectAll = checked;
									for (const key in selectedMap) {
										selectedMap[key] = checked;
									}
								}}
							/>

							{#each displayTableHeaders.filter((header) => header.visible) as header}
								<th
									onclick={() => {
										sorting = {
											sortedBy: header.key,
											isSorted: header.key !== sorting.sortedBy ? 1 : sorting.isSorted === 0 ? 1 : sorting.isSorted === 1 ? -1 : 0
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
								<TableIcons
									checked={selectedMap[index] || false}
									onCheck={(checked) => {
										selectedMap[index] = checked;
									}}
								/>
								{#each displayTableHeaders.filter((header) => header.visible) as header}
									<td class="text-center">
										{#if header.key === 'blocked'}
											<Boolean value={String(row[header.key]) === 'true'} />
										{:else if showUserList && header.key === 'avatar'}
											<Avatar src={row[header.key]} fallback="/Default_User.svg" width="w-8" />
										{:else if header.key === 'role'}
											<Role value={row[header.key]} />
										{:else if header.key === 'createdAt' || header.key === 'updatedAt' || header.key === 'lastAccess'}
											{new Date(row[header.key]).toLocaleString()}
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
					rowsPerPageOptions={[2, 10, 25, 50, 100, 500]}
					totalItems={filteredTableData.length}
					onUpdatePage={(page) => {
						currentPage = page;
						refreshTableData();
					}}
					onUpdateRowsPerPage={(rows) => {
						rowsPerPage = rows;
						currentPage = 1;
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
