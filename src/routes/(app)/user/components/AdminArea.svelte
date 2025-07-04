<!-- 
@file src/routes/(app)/user/components/AdminArea.svelte
@component 
**Admin area for managing users and tokens with efficient filtering and pagination.**
-->

<script lang="ts">
	import { debounce } from '@utils/utils';

	// Stores
	import { avatarSrc } from '@stores/store.svelte';

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
		username: string;
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
	let { adminData, currentUser = null } = $props<{ adminData: AdminData | null; currentUser?: { _id: string; [key: string]: any } | null }>();

	const modalStore = getModalStore();
	const toastStore = getToastStore();
	const waitFilter = debounce(300);
	const flipDurationMs = 300;

	// Table header definitions
	const tableHeadersUser = [
		{ label: m.adminarea_blocked(), key: 'blocked' },
		{ label: m.form_avatar(), key: 'avatar' },
		{ label: m.form_email(), key: 'email' },
		{ label: m.form_username(), key: 'username' },
		{ label: m.form_role(), key: 'role' },
		{ label: m.adminarea_user_id(), key: '_id' },
		{ label: m.adminarea_activesession(), key: 'activeSessions' },
		{ label: m.adminarea_lastaccess(), key: 'lastAccess' },
		{ label: m.adminarea_createat(), key: 'createdAt' },
		{ label: m.adminarea_updatedat(), key: 'updatedAt' }
	] as const;

	const tableHeaderToken = [
		{ label: m.adminarea_blocked(), key: 'blocked' },
		{ label: m.form_email(), key: 'email' },
		{ label: m.form_username(), key: 'username' },
		{ label: m.form_role(), key: 'role' },
		{ label: m.adminarea_token(), key: 'token' },
		{ label: m.adminarea_expiresin(), key: 'expires' },
		{ label: m.adminarea_createat(), key: 'createdAt' },
		{ label: m.adminarea_updatedat(), key: 'updatedAt' }
	] as const;

	// Core state with proper initialization
	let showUserList = $state(true);
	let showUsertoken = $state(false);
	let showExpiredTokens = $state(false);
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
			const tokens = adminData.tokens as TokenData[];
			if (showExpiredTokens) {
				return tokens; // Show all tokens including expired ones
			} else {
				// Filter out expired tokens
				const now = new Date();
				return tokens.filter((token) => {
					if (!token.expires) return true; // Keep tokens without expiration
					return new Date(token.expires) > now; // Keep only non-expired tokens
				});
			}
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
					expires: '',
					username: ''
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

	// Function to edit a specific token
	function editToken(tokenData: TokenData) {
		const modalSettings: ModalSettings = {
			type: 'component',
			title: m.multibuttontoken_modaltitle(),
			body: m.multibuttontoken_modalbody(),
			component: {
				ref: ModalEditToken,
				props: {
					token: tokenData.token,
					email: tokenData.email,
					role: tokenData.role,
					username: tokenData.username,
					expires: convertDateToExpiresFormat(tokenData.expires)
				}
			},
			response: (result) => {
				if (result?.success === false) {
					const t = {
						message: `<iconify-icon icon="mdi:alert-circle" color="white" width="24" class="mr-1"></iconify-icon> ${result.error || 'Failed to update token'}`,
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

	// Helper function to convert Date to expires format expected by ModalEditToken
	function convertDateToExpiresFormat(expiresDate: Date | string | null): string {
		if (!expiresDate) return '7d'; // Default

		const now = new Date();
		const expires = new Date(expiresDate);
		const diffMs = expires.getTime() - now.getTime();
		const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
		const diffDays = Math.ceil(diffHours / 24);

		// Match the available options in ModalEditToken
		if (diffHours <= 1) return '1h';
		if (diffDays <= 1) return '1d';
		if (diffDays <= 7) return '7d';
		if (diffDays <= 30) return '30d';
		if (diffDays <= 90) return '90d';

		return '90d'; // Max available option
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

	// Refresh table data with current filters and sorting
	function refreshTableData() {
		// Apply filters and sorting to tableData
		if (!tableData) return;
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

			{#if showUsertoken}
				<button
					onclick={() => (showExpiredTokens = !showExpiredTokens)}
					aria-label={showExpiredTokens ? 'Hide Expired Tokens' : 'Show Expired Tokens'}
					class="gradient-secondary btn w-full text-white sm:max-w-xs"
				>
					<iconify-icon icon="material-symbols:schedule" color="white" width="18" class="mr-1"></iconify-icon>
					<span>{showExpiredTokens ? 'Hide Expired' : 'Show Expired'}</span>
				</button>
			{/if}
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
			<h2 class="order-1 text-xl font-bold text-tertiary-500 dark:text-primary-500">
				{#if showUserList}{m.adminarea_userlist()}{:else if showUsertoken}{m.adminarea_listtoken()}{/if}
			</h2>

			<div class="order-3 sm:order-2">
				<TableFilter bind:globalSearchValue bind:searchShow bind:filterShow bind:columnShow bind:density />
			</div>

			<div class="order-2 flex items-center justify-center sm:order-3">
				<Multibutton {selectedRows} type={showUserList ? 'user' : 'token'} totalUsers={adminData?.users?.length || 0} {currentUser} />
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
							{@const isExpired = showUsertoken && row.expires && new Date(row.expires) < new Date()}
							<tr
								class="divide-x divide-surface-400 {isExpired ? 'bg-error-50 opacity-60 dark:bg-error-900/20' : ''} {showUsertoken
									? 'cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800'
									: ''}"
								onclick={(event) => {
									// Only handle click if it's on a token row and not on the checkbox
									if (showUsertoken && !(event.target as HTMLElement)?.closest('td:first-child')) {
										editToken(row as TokenData);
									}
								}}
							>
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
											<!-- Use reactive avatarSrc for current user, otherwise use row data -->
											<Avatar
												src={currentUser && row._id === currentUser._id ? avatarSrc.value : (row[header.key] ?? '/Default_User.svg')}
												width="w-8"
											/>
										{:else if header.key === 'role'}
											<Role value={row[header.key]} />
										{:else if ['createdAt', 'updatedAt', 'lastAccess'].includes(header.key)}
											{row[header.key] && row[header.key] !== null ? new Date(row[header.key]).toLocaleString() : '-'}
										{:else if header.key === 'expires'}
											{#if row[header.key] && row[header.key] !== null}
												{@const expirationDate = new Date(row[header.key])}
												{@const isTokenExpired = expirationDate < new Date()}
												<span class={isTokenExpired ? 'font-semibold text-error-500' : ''}>
													{expirationDate.toLocaleDateString()}
													{#if isTokenExpired}
														<iconify-icon icon="material-symbols:warning" class="ml-1 text-error-500" width="16"></iconify-icon>
													{/if}
												</span>
											{:else}
												-
											{/if}
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

			<!-- FIX: Added mb-16 for margin-bottom on mobile and other screen sizes -->
			<div class="mb-16 mt-2 flex flex-col items-center justify-center px-2 md:flex-row md:justify-between md:p-4">
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
