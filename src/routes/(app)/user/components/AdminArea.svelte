<!-- 
@file src/routes/(app)/user/components/AdminArea.svelte
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
	import { debounce } from '@utils/utils';
	import { untrack } from 'svelte';
	import { logger } from '@utils/logger';
	// Stores
	import { avatarSrc } from '@stores/store.svelte';
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';

	// Components
	import PermissionGuard from '@components/PermissionGuard.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import Boolean from '@components/system/table/Boolean.svelte';
	import Role from '@components/system/table/Role.svelte';
	import TableFilter from '@components/system/table/TableFilter.svelte';
	import TableIcons from '@components/system/table/TableIcons.svelte';
	import TablePagination from '@components/system/table/TablePagination.svelte';
	import ModalEditToken from './ModalEditToken.svelte';
	import Multibutton from './Multibutton.svelte';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	// Skeleton
	import { Avatar } from '@skeletonlabs/skeleton-svelte';
	import { modalState, showConfirm } from '@utils/modalState.svelte';
	import { toaster } from '@stores/store.svelte';
	// Svelte-dnd-action
	import { PermissionAction, PermissionType } from '@src/databases/auth/types';
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';

	// Types
	import type { User, Token } from '@src/databases/auth/types';

	type TableDataType = User | Token;

	interface TableHeader {
		label: string;
		key: keyof User | keyof Token;
		visible: boolean;
		id: string;
	}

	// Props - Using API for scalability
	const { currentUser = null, isMultiTenant = false, roles = [] } = $props();

	const waitFilter = debounce(300);
	const flipDurationMs = 300;

	// State for API-fetched data (replaces adminData usage for scalability)
	let tableData: TableDataType[] = $state([]);
	let totalItems = $state(0);

	async function fetchData() {
		await globalLoadingStore.withLoading(
			loadingOperations.dataFetch,
			async () => {
				const endpoint = showUserList ? '/api/admin/users' : '/api/admin/tokens';
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

	// Custom event handler for token updates from Multibutton
	function handleTokenUpdate(event: CustomEvent) {
		const { tokenIds, action } = event.detail;

		// Update the tableData instead of adminData for scalability
		if (tableData) {
			let updated = false;

			if (action === 'delete') {
				// Remove deleted tokens from the table
				const updatedData = tableData.filter((item: User | Token) => !tokenIds.includes((item as Token).token as string));
				if (updatedData.length !== tableData.length) {
					tableData = updatedData;
					updated = true;
				}
			} else {
				// Handle block/unblock actions
				const updatedData = tableData.map((item: User | Token) => {
					if (tokenIds.includes((item as Token).token as string)) {
						updated = true;
						if (action === 'block') {
							return { ...item, blocked: true };
						} else if (action === 'unblock') {
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
				selectedRows = [];
			}
		}
	} // Table header definitions
	const tableHeadersUser = [
		{ label: m.adminarea_blocked(), key: 'blocked' },
		{ label: m.form_avatar(), key: 'avatar' },
		{ label: m.email(), key: 'email' },
		{ label: m.username(), key: 'username' },
		{ label: m.role(), key: 'role' },
		{ label: 'Tenant ID', key: 'tenantId' },
		{ label: m.adminarea_user_id(), key: '_id' },
		{ label: m.adminarea_activesession(), key: 'activeSessions' },
		{ label: m.adminarea_lastaccess(), key: 'lastAccess' },
		{ label: m.adminarea_createat(), key: 'createdAt' },
		{ label: m.adminarea_updatedat(), key: 'updatedAt' }
	] as const;

	const tableHeaderToken = [
		{ label: m.adminarea_blocked(), key: 'blocked' },
		{ label: m.email(), key: 'email' },
		{ label: m.role(), key: 'role' },
		{ label: 'Tenant ID', key: 'tenantId' },
		{ label: m.adminarea_token(), key: 'token' },
		{ label: m.adminarea_expiresin(), key: 'expires' },
		{ label: m.adminarea_createat(), key: 'createdAt' },
		{ label: m.adminarea_updatedat(), key: 'updatedAt' }
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
		if (!tokenData) return;

		modalState.trigger(ModalEditToken as any, {
			token: tokenData.token,
			email: tokenData.email,
			role: tokenData.role,
			expires: convertDateToExpiresFormat(tokenData.expires),
			title: m.multibuttontoken_modaltitle(),
			body: m.multibuttontoken_modalbody(),
			response: (result: any) => {
				if (result && result.success) {
					fetchData();
				} else if (result?.success === false) {
					toaster.error({ description: result.error || 'Failed to update token' });
				}
			}
		});
	}

	// Helper function to convert Date to expires format expected by ModalEditToken
	function convertDateToExpiresFormat(expiresDate: Date | string | null): string {
		if (!expiresDate) return '2 days'; // Default

		const now = new Date();
		const expires = new Date(expiresDate);
		const diffMs = expires.getTime() - now.getTime();
		const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
		const diffDays = Math.ceil(diffHours / 24);

		// Match the available options in ModalEditToken
		if (diffHours <= 2) return '2 hrs';
		if (diffHours <= 12) return '12 hrs';
		if (diffDays <= 2) return '2 days';
		if (diffDays <= 7) return '1 week';
		if (diffDays <= 14) return '2 weeks';
		if (diffDays <= 30) return '1 month';

		return '1 month'; // Max available option
	}

	// Normalize media URLs for table display to avoid requesting bare /files
	function normalizeMediaUrl(url: string | null | undefined): string {
		if (!url) return '/Default_User.svg';
		try {
			if (url.startsWith('data:') || /^https?:\/\//i.test(url)) return url;
			if (url === '/files' || url === '/files/') return '/Default_User.svg';
			if (url.startsWith('/files/')) return url;
			// Allow direct svg in static
			if (/^\/?[^\s?]+\.svg$/i.test(url)) return url.startsWith('/') ? url : `/${url}`;
			// Fallback: prefix media-ish paths with /files/
			const trimmed = url.startsWith('/') ? url.slice(1) : url;
			return `/files/${trimmed}`;
		} catch {
			return '/Default_User.svg';
		}
	}

	// Helper function to calculate remaining time until expiration for display in table
	function getRemainingTime(expiresDate: Date | string | null): string {
		if (!expiresDate) return 'Never';

		const now = new Date();
		const expires = new Date(expiresDate);
		const diffMs = expires.getTime() - now.getTime();

		// If expired, return 'Expired'
		if (diffMs <= 0) return 'Expired';

		const diffMinutes = Math.floor(diffMs / (1000 * 60));
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays > 0) {
			const remainingHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
			return remainingHours > 0 ? `${diffDays}d ${remainingHours}h` : `${diffDays}d`;
		} else if (diffHours > 0) {
			const remainingMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
			return remainingMinutes > 0 ? `${diffHours}h ${remainingMinutes}m` : `${diffHours}h`;
		} else {
			return `${diffMinutes}m`;
		}
	}

	// Safe date formatter for unknown values coming from API
	function formatDate(value: unknown): string {
		if (value === null || value === undefined || value === '') return '-';
		try {
			const d = value instanceof Date ? value : new Date(String(value));
			if (isNaN(d.getTime())) return '-';
			return d.toLocaleString();
		} catch {
			return '-';
		}
	}

	// Toggle user blocked status - always show confirmation modal (like Multibutton)
	async function toggleUserBlocked(user: User) {
		if (!user._id) return;

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
					action: action
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
		if (!token.token) return;

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
					action: action
				})
			});

			const result = await response.json();

			if (result.success) {
				// Update the token in tableData to reflect changes immediately
				const updatedData = tableData.map((item: User | Token) =>
					'token' in item && (item as Token).token === token.token ? { ...item, blocked: !item.blocked } : item
				);
				tableData = updatedData;
				toaster.success({ description: `Token ${actionPastTense} successfully` });
			} else {
				throw new Error(result.message || `Failed to ${action} token`);
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Unknown error';
			toaster.error({ description: `Failed to ${action} token: ${errorMessage}` });
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
		// TODO: Implement modalTokenUser logic or locate missing import
		toaster.warning({ description: 'Feature not implemented yet' });
	}

	// Toggle views
	function toggleUserList() {
		showUserList = !showUserList;
		if (showUsertoken) showUsertoken = false;
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
			.map(([index]) => tableData[parseInt(index)])
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
			const newFilters: Record<string, string | undefined> = { ...filters, [headerKey]: value };
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
	<p class="h2 mb-2 text-center text-3xl font-bold dark:text-white">{m.adminarea_adminarea()}</p>

	<div class="flex flex-col flex-wrap items-center justify-evenly gap-2 sm:flex-row xl:justify-between">
		<button onclick={modalTokenUser} aria-label={m.adminarea_emailtoken()} class="gradient-primary btn w-full text-white sm:max-w-xs">
			<iconify-icon icon="material-symbols:mail" color="white" width="18" class="mr-1"></iconify-icon>
			<span class="whitespace-normal wrap-break-word">{m.adminarea_emailtoken()}</span>
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
						<iconify-icon icon="material-symbols:schedule" color="white" width="18" class="mr-1"></iconify-icon>
						<span>{showExpiredTokens ? 'Hide Expired' : 'Show Expired'}</span>
					</button>
				{/if}
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

	{#if showUserList || showUsertoken}
		<div class="my-4 flex flex-wrap items-center justify-between gap-1">
			<h2 class="order-1 text-xl font-bold text-tertiary-500 dark:text-primary-500">
				{#if showUserList}{m.adminarea_userlist()}{:else if showUsertoken}{m.adminarea_listtoken()}{/if}
			</h2>

			<div class="order-3 sm:order-2">
				<TableFilter bind:globalSearchValue bind:searchShow bind:filterShow bind:columnShow bind:density />
			</div>

			<div class="order-2 flex items-center justify-center sm:order-3">
				<Multibutton {selectedRows} type={showUserList ? 'user' : 'token'} totalUsers={totalItems} {currentUser} onTokenUpdate={handleTokenUpdate} />
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
							{#each displayTableHeaders as header: TableHeader (header.id)}
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
				<table class="table table-interactive {density === 'compact' ? 'table-compact' : density === 'normal' ? '' : 'table-comfortable'}">
					<thead class="text-tertiary-500 dark:text-primary-500">
						{#if filterShow}
							<tr class="divide-x divide-preset-400">
								<th>
									{#if Object.keys(filters).length > 0}
										<button onclick={() => (filters = {})} aria-label="Clear All Filters" class="preset-outline btn-icon">
											<iconify-icon icon="material-symbols:close" width="24"></iconify-icon>
										</button>
									{/if}
								</th>

								{#each displayTableHeaders.filter((header) => header.visible) as header (header.id)}
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

						<tr class="divide-x divide-preset-400 border-b border-black dark:border-white">
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
						{#each tableData as row, index (isUser(row) ? row._id : isToken(row) ? row.token : index)}
							{@const expiresVal: string | Date | null = isToken(row) ? row.expires : null}
							{@const isExpired = showUsertoken && expiresVal && new Date(expiresVal) < new Date()}
							<tr
								class="divide-x divide-preset-400 {isExpired ? 'bg-error-50 opacity-60 dark:bg-error-900/20' : ''} {showUsertoken
									? 'cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-800'
									: ''}"
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
											<Avatar class="overflow-hidden w-10">
												<Avatar.Image
													src={currentUser && isUser(row) && row._id === currentUser._id
														? avatarSrc.value
														: isUser(row) && header.key === 'avatar'
															? normalizeMediaUrl(row.avatar)
															: '/Default_User.svg'}
													class="object-cover"
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
												<button
													class="preset-ghost btn-icon btn-icon-sm hover:preset-filled-tertiary-500"
													aria-label="Copy User ID"
													title="Copy User ID to clipboard"
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
													<iconify-icon icon="oui:copy-clipboard" class="" width="16"></iconify-icon>
												</button>
											</div>
										{:else if header.key === 'token'}
											<!-- Token with clipboard functionality -->
											<div class="flex items-center justify-center gap-2">
												<span class="max-w-[200px] truncate font-mono text-sm">{isToken(row) && header.key === 'token' ? row.token : '-'}</span>
												<button
													class="preset-ghost btn-icon btn-icon-sm hover:preset-filled-tertiary-500"
													aria-label="Copy Token"
													title="Copy Token to clipboard"
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
													<iconify-icon icon="oui:copy-clipboard" class="" width="16"></iconify-icon>
												</button>
											</div>
										{:else if ['createdAt', 'updatedAt', 'lastAccess', 'expires'].includes(header.key)}
											{@const dateKey = header.key as 'createdAt' | 'updatedAt' | 'lastAccess' | 'expires'}
											{@const dateValue = isUser(row) ? row[dateKey as keyof User] : isToken(row) ? row[dateKey as keyof Token] : undefined}
											{formatDate(dateValue)}
										{:else if header.key === 'expires'}
											{#if isToken(row) && header.key === 'expires' && row.expires}
												{@const expiresVal = row.expires as string | Date | null}
												{@const isTokenExpired =
													expiresVal !== null &&
													expiresVal !== undefined &&
													(expiresVal instanceof Date ? expiresVal : new Date(String(expiresVal))) < new Date()}
												{@const remainingTime = getRemainingTime(expiresVal)}
												<span class={isTokenExpired ? 'font-semibold text-error-500' : ''}>
													{remainingTime}
													{#if isTokenExpired}
														<iconify-icon icon="material-symbols:warning" class="ml-1 text-error-500" width="16"></iconify-icon>
													{/if}
												</span>
											{:else}
												-
											{/if}
										{:else}
											{@const displayValue = isUser(row)
												? String(row[header.key as keyof User] ?? '-')
												: isToken(row)
													? String(row[header.key as keyof Token] ?? '-')
													: '-'}
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											{@html displayValue}
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
				{#if showUserList}{m.adminarea_nouser()}{:else if showUsertoken}{m.adminarea_notoken()}{/if}
			</div>
		{/if}
	{/if}
</div>
