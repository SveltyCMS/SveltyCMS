<!--
@file src/routes/(app)/user/components/admin-area.svelte
@component
**Admin area for managing users and tokens with efficient filtering and pagination.**

### Features
- Efficient filtering and pagination
- Sorting by any column
- Bulk actions for tokens
- Copy to clipboard
-
-->

<script lang="ts">
	// Type guards for template and logic
	function isToken(row: User | Token): row is Token {
		return 'token' in row && typeof row.token === 'string';
	}
	function isUser(row: User | Token): row is User {
		return '_id' in row && typeof row._id === 'string';
	}

	function getDisplayValue(row: TableDataType, header: TableHeader): string {
		if (header.key === 'blocked') {
			return '';
		}
		if (isUser(row)) {
			return String(row[header.key as keyof User] ?? '-');
		}
		if (isToken(row)) {
			return String(row[header.key as keyof Token] ?? '-');
		}
		return '-';
	}

	function checkTokenExpired(row: TableDataType): boolean {
		if (!(isToken(row) && row.expires)) {
			return false;
		}
		return new Date(row.expires) < new Date();
	}

	// Types
	import {
		adminarea_activesession,
		adminarea_adminarea,
		adminarea_blocked,
		adminarea_createat,
		adminarea_emailtoken,
		adminarea_expiresin,
		adminarea_hideuserlist,
		adminarea_hideusertoken,
		adminarea_lastaccess,
		adminarea_listtoken,
		adminarea_notoken,
		adminarea_nouser,
		adminarea_showtoken,
		adminarea_showuserlist,
		adminarea_token,
		adminarea_updatedat,
		adminarea_user_id,
		adminarea_userlist,
		email,
		entrylist_all,
		entrylist_dnd,
		entrylist_filter,
		form_avatar,
		multibuttontoken_modalbody,
		multibuttontoken_modaltitle,
		role,
		username
	} from '@src/paraglide/messages';
	import { globalLoadingStore, loadingOperations } from '@src/stores/loading-store.svelte.ts';
	import { avatarSrc, normalizeAvatarUrl, toaster } from '@src/stores/store.svelte.ts';
	// Stores
	import { logger } from '@utils/logger';
	import { modalState } from '@utils/modal-state.svelte';
	import { showConfirm } from '@utils/modal-utils';
	import { debounce } from '@utils/utils';
	import { untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';

	// Components
	import { Avatar } from '@skeletonlabs/skeleton-svelte';
	import Boolean from '@src/components/system/table/Boolean.svelte';
	import Role from '@src/components/system/table/Role.svelte';
	import PermissionGuard from '@src/components/permission-guard.svelte';
	import FloatingInput from '@src/components/system/inputs/floating-input.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import TableFilter from '@src/components/system/table/table-filter.svelte';
	import TableIcons from '@src/components/system/table/table-icons.svelte';
	import TablePagination from '@src/components/system/table/table-pagination.svelte';

	import ModalEditToken from './modal-edit-token.svelte';
	import Multibutton from './Multibutton.svelte';

	// Types
	import { PermissionAction, PermissionType, type Role as RoleType, type Token, type User } from '@src/databases/auth/types';

	type TableDataType = User | Token;

	interface TableHeader {
		id: string;
		key: keyof User | keyof Token;
		label: string;
		visible: boolean;
	}

	// Props - Using API for scalability
	const { currentUser = null, isMultiTenant = false, roles = [] }: { currentUser: User | null; isMultiTenant: boolean; roles: RoleType[] } = $props();

	const waitFilter = debounce(300);
	const flipDurationMs = 300;

	// State for API-fetched data (replaces adminData usage for scalability)
	let tableData: TableDataType[] = $state([]);
	let totalItems = $state(0);

	async function fetchData() {
		await globalLoadingStore.withLoading(
			loadingOperations.dataFetch,
			async () => {
				const endpoint = showUserList ? '/api/user' : '/api/token';
				// eslint-disable-next-line svelte/prefer-svelte-reactivity
				const params = new URLSearchParams();
				params.set('page', String(currentPage));
				params.set('limit', String(rowsPerPage));
				params.set('sort', sorting.sortedBy || 'createdAt');
				if (sorting.isSorted !== 0) {
					params.set('order', sorting.isSorted === 1 ? 'asc' : 'desc');
				}
				if (globalSearchValue) {
					params.set('search', globalSearchValue);
				}

				try {
					const response = await fetch(`${endpoint}?${params.toString()}`);
					if (!response.ok) {
						const errorData = await response.json();
						throw new Error(errorData.message || 'Failed to fetch data');
					}
					const result = await response.json();
					if (result.success) {
						tableData = result.data;
						totalItems = result.pagination.totalItems;
					}
				} catch (err) {
					const errorMessage = err instanceof Error ? err.message : 'Unknown error';
					logger.error('AdminArea fetch error:', errorMessage);
					toaster.error({ description: `Error fetching data: ${errorMessage}` });
					tableData = [];
					totalItems = 0;
				}
			},
			'Fetching admin data'
		);
	}

	// Custom event handler for updates from Multibutton
	function handleBatchUpdate(data: { ids: string[]; action: string; type: 'user' | 'token' }) {
		const { ids, action, type } = data;

		if (action === 'refresh') {
			fetchData();
			return;
		}

		// Update the tableData instead of adminData for scalability
		if (tableData) {
			let updated = false;

			if (action === 'delete') {
				// Remove deleted items from the table
				const updatedData = tableData.filter((item: User | Token) => {
					if (type === 'user' && isUser(item)) {
						return !ids.includes(item._id);
					}
					if (type === 'token' && isToken(item)) {
						return !ids.includes(item.token);
					}
					return true;
				});

				if (updatedData.length !== tableData.length) {
					tableData = updatedData;
					updated = true;
				}
			} else {
				// Handle block/unblock actions
				const updatedData = tableData.map((item: User | Token) => {
					let shouldUpdate = false;
					if (type === 'user' && isUser(item) && ids.includes(item._id)) {
						shouldUpdate = true;
					}
					if (type === 'token' && isToken(item) && ids.includes(item.token)) {
						shouldUpdate = true;
					}

					if (shouldUpdate) {
						updated = true;
						if (action === 'block') {
							return { ...item, blocked: true };
						}
						if (action === 'unblock') {
							return { ...item, blocked: false };
						}
					}
					return item;
				});

				if (updated) {
					tableData = updatedData;
				}
			}

			// Clear selection after any action
			if (updated) {
				selectedMap = {};
				selectAll = false;
			}
		}
	} // Table header definitions
	const tableHeadersUser = [
		{ label: adminarea_blocked(), key: 'blocked' },
		{ label: form_avatar(), key: 'avatar' },
		{ label: email(), key: 'email' },
		{ label: username(), key: 'username' },
		{ label: role(), key: 'role' },
		{ label: 'Tenant ID', key: 'tenantId' },
		{ label: adminarea_user_id(), key: '_id' },
		{ label: adminarea_activesession(), key: 'activeSessions' },
		{ label: adminarea_lastaccess(), key: 'lastAccess' },
		{ label: adminarea_createat(), key: 'createdAt' },
		{ label: adminarea_updatedat(), key: 'updatedAt' }
	] as const;

	const tableHeaderToken = [
		{ label: adminarea_blocked(), key: 'blocked' },
		{ label: email(), key: 'email' },
		{ label: role(), key: 'role' },
		{ label: 'Tenant ID', key: 'tenantId' },
		{ label: adminarea_token(), key: 'token' },
		{ label: adminarea_expiresin(), key: 'expires' },
		{ label: adminarea_createat(), key: 'createdAt' },
		{ label: adminarea_updatedat(), key: 'updatedAt' }
	] as const;

	// Core state with proper initialization
	let showUserList = $state(true);
	let showUsertoken = $state(false);
	let showExpiredTokens = $state(false);
	let globalSearchValue = $state('');
	let searchShow = $state(false);
	let filterShow = $state(false);
	let columnShow = $state(false);
	let selectAll = $state(false);
	let selectedMap: Record<number, boolean> = $state({});

	// Derived rows to display and selection will be defined below
	let density = $state(
		(() => {
			const settings = localStorage.getItem('userPaginationSettings');
			return settings ? (JSON.parse(settings).density ?? 'normal') : 'normal';
		})()
	);
	let selectAllColumns = $state(true);
	// pagesCount becomes derived below
	let currentPage = $state(1);
	let rowsPerPage = $state(10);
	let filters = $state({});
	let sorting = $state({ sortedBy: '', isSorted: 0 });

	// Initialize displayTableHeaders with a safe default
	let displayTableHeaders: TableHeader[] = $state([]);

	$effect(() => {
		// Update displayTableHeaders when view changes
		const baseHeaders = showUserList ? tableHeadersUser : tableHeaderToken;
		const relevantHeaders = isMultiTenant ? baseHeaders : baseHeaders.filter((h) => h.key !== 'tenantId');
		displayTableHeaders = relevantHeaders.map((header) => ({
			label: header.label,
			key: header.key,
			visible: true,
			id: `header-${Math.random().toString(36).substring(2, 15)}-${Date.now().toString(36)}`
		}));
	});

	// Reactive effect to fetch data when dependencies change
	$effect(() => {
		// Rerun when any of these reactive variables change
		void showUserList;
		void showUsertoken;
		void currentPage;
		void rowsPerPage;
		void sorting;
		void globalSearchValue;
		void currentUser; // Watch for changes to current user (triggers refresh after user update)

		untrack(() => {
			fetchData();
		});
	});

	// Function to edit a specific token
	function editToken(tokenId: Token) {
		const tokenData = tokenId;
		if (!tokenData) {
			return;
		}

		modalState.trigger(
			ModalEditToken as any,
			{
				token: tokenData.token,
				email: tokenData.email,
				role: tokenData.role,
				expires: convertDateToExpiresFormat(tokenData.expires),
				title: multibuttontoken_modaltitle(),
				body: multibuttontoken_modalbody(),
				roles // Pass roles explicitly
			},
			(result: any) => {
				if (result?.success) {
					fetchData();
				} else if (result?.success === false) {
					toaster.error({
						description: result.error || 'Failed to update token'
					});
				}
			}
		);
	}

	// Helper function to convert Date to expires format expected by ModalEditToken
	function convertDateToExpiresFormat(expiresDate: Date | string | null): string {
		if (!expiresDate) {
			return '2 days'; // Default
		}

		const now = new Date();
		const expires = new Date(expiresDate);
		const diffMs = expires.getTime() - now.getTime();
		const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
		const diffDays = Math.ceil(diffHours / 24);

		// Match the available options in ModalEditToken
		if (diffHours <= 2) {
			return '2 hrs';
		}
		if (diffHours <= 12) {
			return '12 hrs';
		}
		if (diffDays <= 2) {
			return '2 days';
		}
		if (diffDays <= 7) {
			return '1 week';
		}
		if (diffDays <= 14) {
			return '2 weeks';
		}
		if (diffDays <= 30) {
			return '1 month';
		}

		return '1 month'; // Max available option
	}

	// Helper function to calculate remaining time until expiration for display in table
	function getRemainingTime(expiresDate: Date | string | null): string {
		if (!expiresDate) {
			return 'Never';
		}

		const now = new Date();
		const expires = new Date(expiresDate);
		const diffMs = expires.getTime() - now.getTime();

		// If expired, return 'Expired'
		if (diffMs <= 0) {
			return 'Expired';
		}

		const diffMinutes = Math.floor(diffMs / (1000 * 60));
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays > 0) {
			const remainingHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
			return remainingHours > 0 ? `${diffDays}d ${remainingHours}h` : `${diffDays}d`;
		}
		if (diffHours > 0) {
			const remainingMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
			return remainingMinutes > 0 ? `${diffHours}h ${remainingMinutes}m` : `${diffHours}h`;
		}
		return `${diffMinutes}m`;
	}

	// Safe date formatter for unknown values coming from API
	function formatDate(value: unknown): string {
		if (value === null || value === undefined || value === '') {
			return '-';
		}
		try {
			const d = value instanceof Date ? value : new Date(String(value));
			if (Number.isNaN(d.getTime())) {
				return '-';
			}
			return d.toLocaleString();
		} catch {
			return '-';
		}
	}

	// Toggle user blocked status - always show confirmation modal (like Multibutton)
	async function toggleUserBlocked(user: User) {
		if (!user._id) {
			return;
		}

		// Prevent admins from blocking themselves
		if (currentUser && user._id === currentUser._id) {
			toaster.warning({ description: 'You cannot block your own account' });
			return;
		}

		const action = user.blocked ? 'unblock' : 'block';
		const actionPastTense = user.blocked ? 'unblocked' : 'blocked';

		// Always show confirmation modal (same logic as Multibutton) with enhanced styling using theme colors
		const actionColor = user.blocked ? 'text-success-500' : 'text-error-500';
		const actionWord = user.blocked ? 'Unblock' : 'Block';

		const modalTitle = `Please Confirm User <span class="${actionColor} font-bold">${actionWord}</span>`;
		const modalBody = user.blocked
			? `Are you sure you want to <span class="text-success-500 font-semibold">unblock</span> user <span class="text-tertiary-500 font-medium">${user.email}</span>? This will allow them to access the system again.`
			: `Are you sure you want to <span class="text-error-500 font-semibold">block</span> user <span class="text-tertiary-500 font-medium">${user.email}</span>? This will prevent them from accessing the system.`;

		showConfirm({
			title: modalTitle,
			body: modalBody,
			onConfirm: async () => {
				await performBlockAction(user, action, actionPastTense);
			}
		});
	}

	async function performBlockAction(user: User, action: string, actionPastTense: string) {
		try {
			const response = await fetch('/api/user/batch', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					userIds: [user._id],
					action
				})
			});

			const result = await response.json();

			if (result.success) {
				// Update the user in tableData to reflect changes immediately
				const updatedData = tableData.map((item: User | Token) =>
					'_id' in item && (item as User)._id === user._id ? { ...item, blocked: !item.blocked } : item
				);
				tableData = updatedData;
				toaster.success({ description: `User ${actionPastTense} successfully` });
			} else {
				throw new Error(result.message || `Failed to ${action} user`);
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Unknown error';
			toaster.error({ description: `Failed to ${action} user: ${errorMessage}` });
		}
	}

	// Toggle token blocked status - similar to user blocking
	async function toggleTokenBlocked(token: Token) {
		if (!token.token) {
			return;
		}

		const action = token.blocked ? 'unblock' : 'block';
		const actionPastTense = token.blocked ? 'unblocked' : 'blocked';

		// Show confirmation modal with enhanced styling using theme colors
		const actionColor = token.blocked ? 'text-success-500' : 'text-error-500';
		const actionWord = token.blocked ? 'Unblock' : 'Block';

		const modalTitle = `Please Confirm Token <span class="${actionColor} font-bold">${actionWord}</span>`;
		const modalBody = token.blocked
			? `Are you sure you want to <span class="text-success-500 font-semibold">unblock</span> token for <span class="text-tertiary-500 font-medium">${token.email}</span>? This will allow the token to be used again.`
			: `Are you sure you want to <span class="text-error-500 font-semibold">block</span> token for <span class="text-tertiary-500 font-medium">${token.email}</span>? This will prevent the token from being used.`;

		showConfirm({
			title: modalTitle,
			body: modalBody,
			onConfirm: async () => {
				await performTokenBlockAction(token, action, actionPastTense);
			}
		});
	}

	async function performTokenBlockAction(token: Token, action: string, actionPastTense: string) {
		try {
			const response = await fetch('/api/token/batch', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					tokenIds: [token.token],
					action
				})
			});

			const result = await response.json();

			if (result.success) {
				// Update the token in tableData to reflect changes immediately
				const updatedData = tableData.map((item: User | Token) => {
					const isTokenItem = 'token' in item && item.token !== undefined;
					return isTokenItem && item.token === token.token ? { ...item, blocked: !item.blocked } : item;
				});
				tableData = updatedData;
				toaster.success({ description: `Token ${actionPastTense} successfully` });
			} else {
				throw new Error(result.message || `Failed to ${action} token`);
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Unknown error';
			toaster.error({
				description: `Failed to ${action} token: ${errorMessage}`
			});
		}
	}

	function handleDndConsider(event: CustomEvent) {
		displayTableHeaders = event.detail.items;
	}

	function handleDndFinalize(event: CustomEvent) {
		displayTableHeaders = event.detail.items;
		localStorage.setItem('userPaginationSettings', JSON.stringify({ density, displayTableHeaders }));
	}

	function modalTokenUser() {
		modalState.trigger(
			ModalEditToken as any,
			{
				title: multibuttontoken_modaltitle(),
				body: multibuttontoken_modalbody(),
				roles, // Pass available roles
				user: currentUser // Pass current user context if needed
			},
			(result: any) => {
				// Refresh data if token was created
				if (result?.success) {
					fetchData();
				}
			}
		);
	}

	// Toggle views
	function toggleUserList() {
		showUserList = !showUserList;
		if (showUsertoken) {
			showUsertoken = false;
		}
	}

	function toggleUserToken() {
		showUsertoken = !showUsertoken;
		showUserList = false;
	}

	// --- SERVER-SIDE PAGINATION: API handles filtering, sorting, pagination ---
	// tableData is now the current page from API, not all data
	// totalItems is the total count from API

	const pagesCount = $derived.by(() => Math.ceil(totalItems / rowsPerPage) || 1);

	// Derive selected rows from selectedMap; ensure type compatibility by mapping to UserData | TokenData
	let selectedRows: TableDataType[] = $derived.by(() =>
		Object.entries(selectedMap)
			.filter(([, isSelected]) => isSelected)
			.map(([index]) => tableData[Number.parseInt(index, 10)])
			.filter((item): item is User | Token => item !== undefined && item !== null)
	);

	// Reset selection and page when the data source changes
	$effect(() => {
		void tableData; // track dependency
		untrack(() => {
			selectedMap = {};
			selectAll = false;
			currentPage = 1;
		});
	});

	// Keep current page in bounds when page count shrinks
	$effect(() => {
		if (currentPage > pagesCount) {
			currentPage = pagesCount;
		}
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
			const newFilters: Record<string, string | undefined> = {
				...filters,
				[headerKey]: value
			};
			waitFilter(() => {
				filters = newFilters;
			});
		} else {
			const newFilters: Record<string, string | undefined> = { ...filters };
			delete newFilters[headerKey];
			filters = newFilters;
		}
	}
</script>

<div class="flex flex-col">
	<p class="h2 mb-2 text-center text-3xl font-bold dark:text-white">{adminarea_adminarea()}</p>

	<div class="flex flex-col flex-wrap items-center justify-evenly gap-2 sm:flex-row xl:justify-between">
		<button onclick={modalTokenUser} aria-label={adminarea_emailtoken()} class="gradient-primary btn w-full text-white sm:max-w-xs">
			<iconify-icon icon="material-symbols:mail" width={24}></iconify-icon>
			<span class="whitespace-normal wrap-break-word">{adminarea_emailtoken()}</span>
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
				aria-label={showUsertoken ? adminarea_hideusertoken() : adminarea_showtoken()}
				class="gradient-secondary btn w-full text-white sm:max-w-xs"
			>
				<iconify-icon icon="material-symbols:key-outline" width={24}></iconify-icon>
				<span>{showUsertoken ? adminarea_hideusertoken() : adminarea_showtoken()}</span>
			</button>

			{#if showUsertoken && !showUserList && tableData}
				{@const now = new Date()}
				{@const expiredTokens = tableData.filter(
					(item): item is Token => isToken(item) && item.expires != null && new Date(String(item.expires)) < now
				)}
				{#if expiredTokens.length > 0}
					<button
						onclick={() => (showExpiredTokens = !showExpiredTokens)}
						aria-label={showExpiredTokens ? 'Hide Expired Tokens' : 'Show Expired Tokens'}
						class="gradient-secondary btn w-full text-white sm:max-w-xs"
					>
						<iconify-icon icon="material-symbols:schedule" width={24}></iconify-icon>
						<span>{showExpiredTokens ? 'Hide Expired' : 'Show Expired'}</span>
					</button>
				{/if}
			{/if}
		</PermissionGuard>

		<button
			onclick={toggleUserList}
			aria-label={showUserList ? adminarea_hideuserlist() : adminarea_showuserlist()}
			class="gradient-tertiary btn w-full text-white sm:max-w-xs"
		>
			<iconify-icon icon="mdi:account-circle" width={24}></iconify-icon>
			<span>{showUserList ? adminarea_hideuserlist() : adminarea_showuserlist()}</span>
		</button>
	</div>

	{#if showUserList || showUsertoken}
		<div class="my-4 flex flex-wrap items-center justify-between gap-1">
			<h2 class="order-1 text-xl font-bold text-tertiary-500 dark:text-primary-500">
				{#if showUserList}
					{adminarea_userlist()}
				{:else if showUsertoken}
					{adminarea_listtoken()}
				{/if}
			</h2>

			<div class="order-3 sm:order-2"><TableFilter bind:globalSearchValue bind:searchShow bind:filterShow bind:columnShow bind:density /></div>

			<div class="order-2 flex items-center justify-center sm:order-3">
				<Multibutton {selectedRows} type={showUserList ? 'user' : 'token'} totalUsers={totalItems} {currentUser} onUpdate={handleBatchUpdate} />
			</div>
		</div>

		{#if tableData && tableData.length > 0}
			{#if columnShow}
				<div class="rounded-b-0 flex flex-col justify-center rounded-t-md border-b bg-surface-300 text-center dark:bg-surface-700">
					<div class="text-white dark:text-primary-500">{entrylist_dnd()}</div>
					<div class="my-2 flex w-full items-center justify-center gap-1">
						<label class="mr-2">
							<input type="checkbox" bind:checked={selectAllColumns} onclick={handleCheckboxChange} />
							{entrylist_all()}
						</label>

						<section
							use:dndzone={{ items: displayTableHeaders, flipDurationMs }}
							onconsider={handleDndConsider}
							onfinalize={handleDndFinalize}
							class="flex flex-wrap justify-center gap-1 rounded-md p-2"
						>
							{#each displayTableHeaders as header (header.id)}
								<button
									class="chip {header.visible
										? 'preset-filled-secondary-500'
										: 'preset-ghost-secondary-500'} w-100 mr-2 flex items-center justify-center"
									animate:flip={{ duration: flipDurationMs }}
									onclick={() => {
										displayTableHeaders = displayTableHeaders.map((h) => (h.id === header.id ? { ...h, visible: !h.visible } : h));
										selectAllColumns = displayTableHeaders.every((h) => h.visible);
									}}
								>
									{#if header.visible}
										<span><iconify-icon icon="fa:check" width={24}></iconify-icon></span>
									{/if}
									<span class="ml-2 capitalize">{header.label}</span>
								</button>
							{/each}
						</section>
					</div>
				</div>
			{/if}

			<div class="table-container max-h-[calc(100vh-120px)] overflow-auto">
				<table class="table table-interactive {density === 'compact' ? 'table-compact' : density === 'normal' ? '' : 'table-comfortable'}">
					<thead
						class="divide-x divide-surface-200/50 dark:divide-surface-50 text-surface-500 dark:text-surface-300 bg-secondary-100 dark:bg-surface-800/50"
					>
						{#if filterShow}
							<tr class="divide-x divide-surface-200/50 dark:divide-surface-700/50">
								<th>
									{#if Object.keys(filters).length > 0}
										<button onclick={() => (filters = {})} aria-label="Clear All Filters" class="preset-outline btn-icon">
											<iconify-icon icon="material-symbols:close" width={24}></iconify-icon>
										</button>
									{/if}
								</th>

								{#each displayTableHeaders.filter((header) => header.visible) as header (header.id)}
									<th>
										<div class="flex items-center justify-between">
											<FloatingInput
												type="text"
												icon="material-symbols:search-rounded"
												label={entrylist_filter()}
												name={header.key}
												onInput={(value) => handleInputChange(value, header.key)}
											/>
										</div>
									</th>
								{/each}
							</tr>
						{/if}

						<tr
							class="divide-x divide-surface-300 dark:divide-surface-50 border-b border-surface-300 dark:border-surface-50 font-semibold tracking-wide uppercase text-xs"
						>
							<TableIcons
								cellClass="w-10 text-center"
								checked={selectAll}
								onCheck={(checked: boolean) => {
									selectAll = checked;
									for (let i = 0; i < tableData.length; i++) {
										selectedMap[i] = checked;
									}
								}}
							/>

							{#each displayTableHeaders.filter((header) => header.visible) as header (header.id)}
								<th
									class="cursor-pointer text-tertiary-500 dark:text-primary-500 hover:bg-surface-100/50 dark:hover:bg-surface-800/50 transition-colors"
									onclick={() => {
										sorting = {
											sortedBy: header.key,
											isSorted: sorting.sortedBy === header.key ? (sorting.isSorted === 1 ? -1 : sorting.isSorted === -1 ? 0 : 1) : 1
										};
									}}
								>
									<div class="flex items-center justify-center gap-1">
										{header.label}
										{#if sorting.sortedBy === header.key && sorting.isSorted !== 0}
											<iconify-icon
												icon="material-symbols:arrow-upward-rounded"
												width={18}
												class="origin-center duration-300 ease-in-out {sorting.isSorted === -1 ? 'rotate-180' : ''}"
											></iconify-icon>
										{/if}
									</div>
								</th>
							{/each}
						</tr>
					</thead>

					<tbody class="divide-y divide-surface-200/30 dark:divide-surface-700/30">
						{#each tableData as row, index (row._id || index)}
							{@const expiresVal: string | Date | null = isToken(row) ? row.expires : null}
							{@const isExpired = showUsertoken && expiresVal && new Date(expiresVal) < new Date()}
							<tr
								class="divide-x divide-surface-200/50 dark:divide-surface-50 {isExpired
									? 'bg-error-50 opacity-60 dark:bg-error-900/20'
									: ''} {showUsertoken ? 'cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800' : ''}"
								onclick={(event) => {
									// Only handle click if it's on a token row and not on the checkbox
									if (showUsertoken && !(event.target as HTMLElement)?.closest('td:first-child')) {
										if (isToken(row)) editToken(row);
									}
								}}
							>
								<TableIcons
									checked={selectedMap[index] ?? false}
									onCheck={(checked: boolean) => {
										selectedMap[index] = checked;
									}}
								/>
								{#each displayTableHeaders.filter((header) => header.visible) as header (header.id)}
									<td class="text-center">
										{#if header.key === 'blocked'}
											{#if showUserList}
												<button
													onclick={() => isUser(row) && toggleUserBlocked(row)}
													class="btn-sm cursor-pointer rounded-md p-1 transition-all duration-200 hover:scale-105 hover:bg-surface-200 hover:shadow-md dark:hover:bg-surface-600"
													aria-label={row.blocked ? 'Click to unblock user' : 'Click to block user'}
													title={row.blocked ? 'Click to unblock user' : 'Click to block user'}
												>
													<Boolean value={!!row[header.key]} />
												</button>
											{:else}
												<button
													onclick={(event) => {
														event.stopPropagation();
														if (isToken(row)) toggleTokenBlocked(row);
													}}
													class="btn-sm cursor-pointer rounded-md p-1 transition-all duration-200 hover:scale-105 hover:bg-surface-200 hover:shadow-md dark:hover:bg-surface-600"
													aria-label={row.blocked ? 'Click to unblock token' : 'Click to block token'}
													title={row.blocked ? 'Click to unblock token' : 'Click to block token'}
												>
													<Boolean value={!!row[header.key]} />
												</button>
											{/if}
										{:else if showUserList && header.key === 'avatar'}
											<Avatar class="size-10 overflow-hidden rounded-full border border-surface-200/50 dark:text-surface-50/50">
												<Avatar.Image
													src={currentUser && isUser(row) && row._id === currentUser._id
														? normalizeAvatarUrl(avatarSrc.value)
														: isUser(row) && header.key === 'avatar'
															? normalizeAvatarUrl(row.avatar)
															: '/Default_User.svg'}
													class="h-full w-full object-cover"
												/>
												<Avatar.Fallback>User</Avatar.Fallback>
											</Avatar>
										{:else if header.key === 'role'}
											<Role
												value={isUser(row) && header.key === 'role' ? row.role : isToken(row) && header.key === 'role' ? (row.role ?? '') : ''}
												{roles}
											/>
										{:else if header.key === '_id'}
											<!-- User ID with clipboard functionality -->
											<div class="flex items-center justify-center gap-2">
												<span class="font-mono text-sm">{isUser(row) ? row._id : isToken(row) ? row._id : '-'}</span>
												<SystemTooltip title="Copy User ID to clipboard">
													<button
														class="preset-ghost btn-icon btn-icon-sm hover:preset-filled-tertiary-500 hover:dark:preset-filled-primary-500"
														aria-label="Copy User ID"
														onclick={(event) => {
															event.stopPropagation();
															const val = String(isUser(row) ? row._id : isToken(row) ? row._id : '');
															navigator.clipboard
																.writeText(val)
																.then(() => {
																	toaster.success({ description: 'User ID copied to clipboard' });
																})
																.catch(() => {
																	toaster.error({ description: 'Failed to copy' });
																});
														}}
													>
														<iconify-icon icon="oui:copy-clipboard" width={18}></iconify-icon>
													</button>
												</SystemTooltip>
											</div>
										{:else if header.key === 'token'}
											<!-- Token with clipboard functionality -->
											<div class="flex items-center justify-center gap-2">
												<span class="max-w-50 truncate font-mono text-sm">{isToken(row) && header.key === 'token' ? row.token : '-'}</span>
												<SystemTooltip title="Copy Token to clipboard">
													<button
														class="preset-ghost btn-icon btn-icon-sm hover:preset-filled-tertiary-500 hover:dark:preset-filled-primary-500"
														aria-label="Copy Token"
														onclick={(event) => {
															event.stopPropagation();
															const val = isToken(row) && header.key === 'token' ? row.token : '';
															navigator.clipboard
																.writeText(val)
																.then(() => {
																	toaster.success({ description: 'Token copied to clipboard' });
																})
																.catch(() => {
																	toaster.error({ description: 'Failed to copy' });
																});
														}}
													>
														<iconify-icon icon="oui:copy-clipboard" width={18}></iconify-icon>
													</button>
												</SystemTooltip>
											</div>
										{:else if ['createdAt', 'updatedAt', 'lastAccess'].includes(header.key)}
											{formatDate(isUser(row) ? row[header.key as keyof User] : isToken(row) ? row[header.key as keyof Token] : undefined)}
										{:else if header.key === 'expires'}
											{#if isToken(row) && row.expires}
												{@const isTokenExpired = checkTokenExpired(row)}
												{@const remainingTime = getRemainingTime(row.expires)}
												<span class={isTokenExpired ? 'font-semibold text-error-500' : ''}>
													{remainingTime}
													{#if isTokenExpired}
														<iconify-icon icon="material-symbols:warning" width={24} class="ml-1 text-error-500"></iconify-icon>
													{/if}
												</span>
											{:else}
												-
											{/if}
										{:else}
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											{@html getDisplayValue(row, header)}
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
					bind:currentPage
					bind:rowsPerPage
					{pagesCount}
					{totalItems}
					rowsPerPageOptions={[2, 10, 25, 50, 100, 500]}
					onUpdatePage={(page: number) => {
						currentPage = page;
					}}
					onUpdateRowsPerPage={(rows: number) => {
						rowsPerPage = rows;
						currentPage = 1;
					}}
				/>
			</div>
		{:else}
			<div class="preset-ghost-error-500 btn text-center font-bold">
				{#if showUserList}
					{adminarea_nouser()}
				{:else if showUsertoken}
					{adminarea_notoken()}
				{/if}
			</div>
		{/if}
	{/if}
</div>
