<!-- 
@file src/routes/(app)/user/components/AdminArea.svelte
@component 
**Admin area for managing users and tokens with efficient filtering and pagination.**
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
	import type { ModalSettings } from '@utils/skeletonCompat';
	import { Avatar, clipboard } from '@utils/skeletonCompat';
	import { showConfirm, showModal } from '@utils/modalUtils';
	import { showToast } from '@utils/toast';
	// Svelte-dnd-action
	import { PermissionAction, PermissionType } from '@src/databases/auth/types';
	import { dndzone } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';

	// Types
	import type { User, Token } from '@src/databases/auth/types';

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

	// Props - Using API for scalability
	const {
		currentUser = null,
		isMultiTenant = false,
		roles = []
	} = $props<{ currentUser?: { _id: string; [key: string]: unknown } | null; isMultiTenant?: boolean; roles?: Role[] }>();

	const waitFilter = debounce(300);
	const flipDurationMs = 300;

	// State for API-fetched data (replaces adminData usage for scalability)
	let tableData = $state<(User | Token)[]>([]);
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
					showToast(`Error fetching data: ${errorMessage}`, 'error');
					tableData = [];
					totalItems = 0;
				}
			},
			'Fetching admin data'
		);
	}

	// Custom event handler for token updates from Multibutton
	function handleTokenUpdate(event: CustomEvent<{ tokenIds: string[]; action: string }>) {
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
	let selectedMap = $state<Record<number, boolean>>({});

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
	let filters = $state<{ [key: string]: string }>({});
	let sorting = $state<SortingState>({ sortedBy: '', isSorted: 0 });

	// Initialize displayTableHeaders with a safe default
	let displayTableHeaders = $state<TableHeader[]>([]);

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
						<p class="text-gray-500">Token list will refresh after creation</p>
					</div>
				`,
				props: {
					token: '',
					email: '',
					role: 'user',
					expires: ''
				}
			},
			response: (result) => {
				// On success, refresh data without changing view state
				if (result && result.success) {
					// Don't change the view state, just refresh the data
					fetchData(); // Refetch data
					return;
				}
				if (result?.success === false) {
					showToast(result.error || 'Failed to send email', 'error');
				}
			}
		};
		showModal(modalSettings);
	}

	// Function to edit a specific token
	function editToken(tokenData: Token) {
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
					expires: convertDateToExpiresFormat(tokenData.expires)
				}
			},
			response: (result) => {
				// On success, refresh the data without changing view state
				if (result && result.success) {
					// Don't change the view state, just refresh the data
					fetchData(); // Refetch data
					return;
				}
				if (result?.success === false) {
					showToast(result.error || 'Failed to update token', 'error');
				}
			}
		};
		showModal(modalSettings);
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
			showToast('You cannot block your own account', 'warning');
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
			confirmText: actionWord,
			confirmClasses: user.blocked ? 'variant-filled-warning' : 'bg-pink-500 hover:bg-pink-600 text-white',
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
				showToast(`User ${actionPastTense} successfully`, 'success');
			} else {
				throw new Error(result.message || `Failed to ${action} user`);
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Unknown error';
			showToast(`Failed to ${action} user: ${errorMessage}`, 'error');
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
			confirmText: actionWord,
			confirmClasses: token.blocked ? 'variant-filled-warning' : 'bg-pink-500 hover:bg-pink-600 text-white',
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
				showToast(`Token ${actionPastTense} successfully`, 'success');
			} else {
				throw new Error(result.message || `Failed to ${action} token`);
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Unknown error';
			showToast(`Failed to ${action} token: ${errorMessage}`, 'error');
		}
	}

	function handleDndConsider(event: CustomEvent<{ items: TableHeader[] }>) {
		displayTableHeaders = event.detail.items;
	}

	function handleDndFinalize(event: CustomEvent<{ items: TableHeader[] }>) {
		displayTableHeaders = event.detail.items;
		localStorage.setItem('userPaginationSettings', JSON.stringify({ density, displayTableHeaders }));
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

	const pagesCount = $derived.by<number>(() => Math.ceil(totalItems / rowsPerPage) || 1);

	// Derive selected rows from selectedMap; ensure type compatibility by mapping to UserData | TokenData
	let selectedRows: Array<User | Token> = $derived.by(() =>
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
				<Multibutton {selectedRows} type={showUserList ? 'user' : 'token'} totalUsers={totalItems} {currentUser} on:tokenUpdate={handleTokenUpdate} />
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

						<tr class="divide-x divide-surface-400 border-b border-black dark:border-white">
							<TableIcons
								cellClass="w-10 text-center"
								checked={selectAll}
								onCheck={(checked) => {
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
							{@const expiresVal = isToken(row) ? (row.expires as string | Date | null) : null}
							{@const isExpired =
								showUsertoken &&
								expiresVal !== null &&
								expiresVal !== undefined &&
								(expiresVal instanceof Date ? expiresVal : new Date(String(expiresVal))) < new Date()}
							<tr
								class="divide-x divide-surface-400 {isExpired ? 'bg-error-50 opacity-60 dark:bg-error-900/20' : ''} {showUsertoken
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
									onCheck={(checked) => {
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
											<!-- Use reactive avatarSrc for current user, otherwise use row data -->
											<Avatar
												src={currentUser && isUser(row) && row._id === currentUser._id
													? avatarSrc.value
													: isUser(row) && header.key === 'avatar'
														? normalizeMediaUrl(row.avatar)
														: ''}
												width="w-8"
											/>
										{:else if header.key === 'role'}
											<Role
												value={isUser(row) && header.key === 'role' ? row.role : isToken(row) && header.key === 'role' ? (row.role ?? '') : ''}
												{roles}
											/>
										{:else if header.key === '_id'}
											<!-- User ID with clipboard functionality -->
											<div class="flex items-center justify-center gap-2">
												<span class="font-mono text-sm">{row[header.key]}</span>
												<button
													use:clipboard={String(row[header.key] ?? '')}
													class="variant-ghost btn-icon btn-icon-sm hover:variant-filled-tertiary"
													aria-label="Copy User ID"
													title="Copy User ID to clipboard"
													onclick={(event) => {
														event.stopPropagation();
														showToast('User ID copied to clipboard', 'success');
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
													use:clipboard={isToken(row) && header.key === 'token' ? row.token : ''}
													class="variant-ghost btn-icon btn-icon-sm hover:variant-filled-tertiary"
													aria-label="Copy Token"
													title="Copy Token to clipboard"
													onclick={(event) => {
														event.stopPropagation();
														showToast('Token copied to clipboard', 'success');
													}}
												>
													<iconify-icon icon="oui:copy-clipboard" class="" width="16"></iconify-icon>
												</button>
											</div>
										{:else if ['createdAt', 'updatedAt', 'lastAccess'].includes(header.key)}
											{isUser(row) && (header.key === 'createdAt' || header.key === 'updatedAt' || header.key === 'lastAccess')
												? formatDate(row[header.key as keyof User])
												: isToken(row) && (header.key === 'createdAt' || header.key === 'updatedAt' || header.key === 'expires')
													? formatDate(row[header.key as keyof Token])
													: '-'}
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
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											{@html isUser(row) && typeof row[header.key as keyof User] === 'string'
												? row[header.key as keyof User]
												: isToken(row) && typeof row[header.key as keyof Token] === 'string'
													? row[header.key as keyof Token]
													: '-'}
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
