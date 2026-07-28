<!--
@file src/routes/(app)/user/components/admin-area.svelte
@component
**Admin area for managing users and tokens — Smart Table server mode.**

### Features
- `createSmartTable({ mode: 'server', onQueryChange })` owns page/sort/selection
- API fetch for `/api/user` and `/api/token` driven by one controller
- Shared table chrome (matches entry-list / media / tokens)
- Bulk actions, copy to clipboard, column manager
-->

<script lang="ts">
	import AdminCard from '@components/admin-card.svelte';
	import Button from '@components/ui/button.svelte';
	// Type guards for template and logic
	function isToken(row: User | Token): row is Token {
		return !!row && 'token' in row && typeof row.token === 'string';
	}
	function isUser(row: User | Token): row is User {
		return !!row && '_id' in row && !('token' in row);
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

	// Components
	import Avatar from "@components/ui/avatar.svelte";

	import FloatingInput from "@components/ui/floating-input.svelte";
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import Boolean from '@src/components/system/table/boolean.svelte';
	import Role from '@src/components/system/table/role.svelte';
	import TableFilter from '@src/components/system/table/table-filter.svelte';
	import TableIcons from '@src/components/system/table/table-icons.svelte';
	import {
		createSmartTable,
		pinCellClass,
		SMART_TABLE,
		SMART_TABLE_COLUMN_MANAGER,
		SMART_TABLE_ROW_HOVER,
		SMART_TABLE_ROW_SELECTED,
		SMART_TABLE_TD,
		SMART_TABLE_TH,
		SMART_TABLE_THEAD,
		SMART_TABLE_TOOLBAR,
		type TableDensity
	} from '@components/ui/smart-table';
	import SmartTableShell from '@components/ui/smart-table/smart-table-shell.svelte';
	// Types
	import { type Role as RoleType, type Token, type User } from '@src/databases/auth/types';
	// Types
	import {
		adminarea_activesession,
		adminarea_adminarea,
		adminarea_blocked,
		adminarea_consumed,
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
	import { normalizeAvatarUrl } from '@src/stores/store.svelte.ts';
	import { toast } from '@src/stores/toast.svelte.ts';
	// Stores
	import { logger } from '@utils/logger';
	import { modalState } from '@utils/modal.svelte';
	import { showConfirm } from '@utils/modal.svelte';
	import { untrack } from 'svelte';
	// @ts-ignore - flip is used in template via animate:flip directive
	import { flip } from 'svelte/animate';
	import { draggable, droppable } from '@thisux/sveltednd';
	import type { DragDropState } from '@thisux/sveltednd';
	import { page } from '$app/state';
	import Multibutton from './multibutton.svelte';
	import ModalEditToken from './modal-edit-token.svelte';

	type TableDataType = (User | Token) & Record<string, unknown>;

	interface TableHeader {
		id: string;
		key: keyof User | keyof Token;
		label: string;
		visible: boolean;
	}

	// Props - Using API for scalability
	const { currentUser = null, isMultiTenant = false, roles = [] }: { currentUser: User | null; isMultiTenant: boolean; roles: RoleType[] } = $props();

	let waitFilterTimeoutId: ReturnType<typeof setTimeout>;
	const waitFilter = (fn: () => void) => {
		clearTimeout(waitFilterTimeoutId);
		waitFilterTimeoutId = setTimeout(fn, 300);
	};
	const flipDurationMs = 300;

	// Core view state (must exist before smartTable onQueryChange can fetch)
	let showUserList = $state(true);
	let showUsertoken = $state(false);
	let showExpiredTokens = $state(false);
	let globalSearchValue = $state('');
	let searchShow = $state(false);
	let filterShow = $state(false);
	let columnShow = $state(false);
	let filters = $state<Record<string, string | undefined>>({});
	let selectAllColumns = $state(true);

	function getAdminRowId(row: TableDataType): string {
		if (isToken(row)) return String(row.token ?? '');
		if (isUser(row)) return String(row._id ?? '');
		return '';
	}

	/** Single controller for page / sort / selection (server mode → API refetch). */
	const smartTable = createSmartTable({
		mode: 'server',
		pageSize: 10,
		layoutKey: 'admin-area-users-tokens',
		getRowId: (row: Record<string, unknown>) => getAdminRowId(row as TableDataType),
		onQueryChange: () => {
			fetchData().catch((err) => logger.error('AdminArea smartTable query change:', err));
		}
	}) as unknown as ReturnType<typeof createSmartTable<TableDataType & Record<string, unknown>>>;

	// System-wide user count for bulk safety checks (search/pagination must not shrink this).
	const systemUserCount = $derived(page.data.totalUsers ?? smartTable.pagination.totalItems);
	const tableData = $derived(smartTable.rows);
	const totalItems = $derived(smartTable.pagination.totalItems);
	const pagesCount = $derived(smartTable.pagination.pagesCount);
	const currentPage = $derived(smartTable.pagination.currentPage);
	const rowsPerPage = $derived(smartTable.pagination.pageSize);
	const sorting = $derived(smartTable.sort);

	async function fetchData() {
		await globalLoadingStore.withLoading(
			loadingOperations.dataFetch,
			async () => {
				const endpoint = showUserList ? '/api/user' : '/api/token';
				// eslint-disable-next-line svelte/prefer-svelte-reactivity
				const params = new URLSearchParams();
				params.set('page', String(smartTable.pagination.currentPage));
				params.set('limit', String(smartTable.pagination.pageSize));
				params.set('sort', smartTable.sort.sortedBy || 'createdAt');
				if (smartTable.sort.isSorted !== 0) {
					params.set('order', smartTable.sort.isSorted === 1 ? 'asc' : 'desc');
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
						const items = (result.data || []) as TableDataType[];
						const total = Number(result.pagination?.totalItems ?? items.length);
						smartTable.setRows(items);
						smartTable.setPaginationMeta({
							totalItems: total,
							pagesCount: Math.max(1, Math.ceil(total / smartTable.pagination.pageSize)),
							currentPage: smartTable.pagination.currentPage,
							pageSize: smartTable.pagination.pageSize
						});
					}
				} catch (err) {
					const errorMessage = err instanceof Error ? err.message : 'Unknown error';
					logger.error('AdminArea fetch error:', errorMessage);
					toast.error(`Error fetching data: ${errorMessage}`);
					smartTable.setRows([]);
					smartTable.setPaginationMeta({ totalItems: 0, pagesCount: 1 });
					throw err;
				}
			},
			'Fetching admin data'
		);
	}

	// Custom event handler for updates from Multibutton
	function handleBatchUpdate(data: { ids: string[]; action: string; type: 'user' | 'token' }) {
		const { ids, action, type } = data;
		console.log(`[AdminArea] handleBatchUpdate: ${action} on ${type}`, ids);

		if (action === 'refresh') {
			fetchData().catch(() => {});
			return;
		}

		// Optimistic update on current smartTable page slice
		const current = smartTable.rows;
		if (current && current.length > 0) {
			let updated = false;

			if (action === 'delete') {
				const updatedData = current.filter((item: User | Token) => {
					if (type === 'user' && isUser(item)) {
						return !ids.includes(item._id);
					}
					if (type === 'token' && isToken(item)) {
						return !ids.includes(item.token);
					}
					return true;
				});

				if (updatedData.length !== current.length) {
					smartTable.setRows(updatedData as TableDataType[]);
					updated = true;
				}
			} else {
				const updatedData = current.map((item: User | Token) => {
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
					console.log(`[AdminArea] Updating tableData locally for ${action}`);
					smartTable.setRows([...updatedData] as TableDataType[]);
				} else {
					console.warn(`[AdminArea] No items matched for ${action} in current tableData`);
				}
			}

			if (updated) {
				smartTable.clearSelection();
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

	const selectAll = {
		get value() {
			return smartTable.allSelected;
		},
		set value(v: boolean) {
			smartTable.setSelectAll(v);
		}
	};

	let density = $state<TableDensity>(
		(() => {
			if (typeof localStorage === 'undefined') return 'normal';
			try {
				const settings = localStorage.getItem('userPaginationSettings');
				const d = settings ? (JSON.parse(settings).density as TableDensity) : 'normal';
				return d === 'compact' || d === 'comfortable' || d === 'normal' ? d : 'normal';
			} catch {
				return 'normal';
			}
		})()
	);

	// Initialize displayTableHeaders with a safe default
	let displayTableHeaders: TableHeader[] = $state([]);

	$effect(() => {
		// Update displayTableHeaders when view changes
		const baseHeaders = showUserList ? tableHeadersUser : tableHeaderToken;
		const relevantHeaders = isMultiTenant ? baseHeaders : baseHeaders.filter((h) => h.key !== 'tenantId');
		const newHeaders = relevantHeaders.map((header) => ({
			label: header.label,
			key: header.key,
			visible: true,
			id: `header-${header.key}`
		}));
		displayTableHeaders = newHeaders;
		smartTable.setColumns(
			newHeaders.map((h) => ({
				key: String(h.key),
				label: h.label,
				sortable: true,
				visible: h.visible
			}))
		);
	});

	// Density → controller (for cell padding helpers)
	$effect(() => {
		smartTable.setDensity(density);
	});

	// View / search / user context changes — reset to page 1 (no emit) + fetch once
	$effect(() => {
		void showUserList;
		void showUsertoken;
		void globalSearchValue;
		void currentUser;

		untrack(() => {
			smartTable.clearSelection();
			smartTable.setPaginationMeta({ currentPage: 1 });
			fetchData().catch((err) => {
				logger.error('AdminArea effect fetchData error:', err);
			});
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
					fetchData().catch(() => {});
				} else if (result?.success === false) {
					toast.error({
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

		// System protection: admins cannot be blocked
		if (user.role === 'admin' || user.isAdmin) {
			toast.warning('System admins cannot be blocked.');
			return;
		}

		// Prevent admins from blocking themselves
		if (currentUser && user._id === currentUser._id) {
			toast.warning('You cannot block your own account');
			return;
		}

		const action = user.blocked ? 'unblock' : 'block';
		const actionPastTense = user.blocked ? 'unblocked' : 'blocked';

		// Always show confirmation modal (same logic as Multibutton) with enhanced styling using theme colors
		const actionColor = user.blocked ? 'text-success-500' : 'text-error-500';
		const actionWord = user.blocked ? 'Unblock' : 'Block';
		const identifier = user.username || user.email || user._id;

		const modalTitle = `Please Confirm User <span class="${actionColor} font-bold">${actionWord}</span>`;
		const modalBody = user.blocked
			? `Are you sure you want to <span class="text-success-500 font-semibold">unblock</span> user <span class="text-tertiary-500 font-medium">${identifier}</span>? This will allow them to access the system again.`
			: `Are you sure you want to <span class="text-error-500 font-semibold">block</span> user <span class="text-tertiary-500 font-medium">${identifier}</span>? This will prevent them from accessing the system.`;

		showConfirm({
			title: modalTitle,
			body: modalBody,
			onConfirm: async () => {
				await performBlockAction(user, action, actionPastTense);
			}
		});
	}

	async function performBlockAction(user: User, action: string, actionPastTense: string) {
		if (!user._id) return;

		try {
			const response = await fetch('/api/user/batch', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': page.data.csrfToken || ''
				},
				body: JSON.stringify({
					userIds: [user._id],
					action
				})
			});

			if (!response.ok) {
				const errText = await response.text();
				throw new Error(errText || `Failed to ${action} user (Status: ${response.status})`);
			}

			const result = await response.json();

			if (result.success) {
				// Optimistic update on current smartTable page
				smartTable.setRows(
					smartTable.rows.map((item: Record<string, unknown>) =>
						isUser(item as TableDataType) && (item as unknown as User)._id === user._id ? { ...item, blocked: !item.blocked } : item
					) as TableDataType[]
				);
				toast.success(`User ${actionPastTense} successfully`);
			} else {
				throw new Error(result.message || `Failed to ${action} user`);
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Unknown error';
			toast.error(`Failed to ${action} user: ${errorMessage}`);
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
		const identifier = token.email || token._id;

		const modalTitle = `Please Confirm Token <span class="${actionColor} font-bold">${actionWord}</span>`;
		const modalBody = token.blocked
			? `Are you sure you want to <span class="text-success-500 font-semibold">unblock</span> token for <span class="text-tertiary-500 font-medium">${identifier}</span>? This will allow the token to be used again.`
			: `Are you sure you want to <span class="text-error-500 font-semibold">block</span> token for <span class="text-tertiary-500 font-medium">${identifier}</span>? This will prevent the token from being used.`;

		showConfirm({
			title: modalTitle,
			body: modalBody,
			onConfirm: async () => {
				await performTokenBlockAction(token, action, actionPastTense);
			}
		});
	}

	async function performTokenBlockAction(token: Token, action: string, actionPastTense: string) {
		if (!token.token) return;

		try {
			const response = await fetch('/api/token/batch', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': page.data.csrfToken || ''
				},
				body: JSON.stringify({
					tokenIds: [token.token],
					action
				})
			});

			if (!response.ok) {
				const errText = await response.text();
				throw new Error(errText || `Failed to ${action} token (Status: ${response.status})`);
			}

			const result = await response.json();

			if (result.success) {
				smartTable.setRows(
					smartTable.rows.map((item: Record<string, unknown>) =>
						isToken(item as TableDataType) && (item as unknown as Token).token === token.token ? { ...item, blocked: !item.blocked } : item
					) as TableDataType[]
				);
				toast.success(`Token ${actionPastTense} successfully`);
			} else {
				throw new Error(result.message || `Failed to ${action} token`);
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : 'Unknown error';
			toast.error(`Failed to ${action} token: ${errorMessage}`);
		}
	}

	function handleColumnDrop(state: DragDropState<TableHeader>) {
		const dragged = state.draggedItem;
		if (!dragged) return;
		const fromIndex = displayTableHeaders.indexOf(dragged);
		if (fromIndex < 0) return;

		const targetEl = state.targetElement?.closest('[data-header-id]') as HTMLElement | null;
		const targetHeaderId = targetEl?.dataset?.headerId;

		let targetIndex: number;
		if (targetHeaderId) {
			targetIndex = displayTableHeaders.findIndex(h => h.id === targetHeaderId);
			if (state.dropPosition === 'after') targetIndex++;
		} else {
			targetIndex = displayTableHeaders.length;
		}
		targetIndex = Math.max(0, Math.min(targetIndex, displayTableHeaders.length));

		if (fromIndex === targetIndex) return;
		displayTableHeaders = untrack(() => {
			const newItems = [...displayTableHeaders];
			newItems.splice(fromIndex, 1);
			const adjusted = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
			newItems.splice(adjusted, 0, dragged);
			return newItems;
		});
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
					// Automatically switch to Token view so the user can copy the newly generated token
					showUsertoken = true;
					showUserList = false;
					fetchData().catch(() => {});
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

	// --- SERVER-SIDE PAGINATION via createSmartTable (API owns filter/sort/page) ---
	const selectedRows = $derived(smartTable.getSelectedRows() as TableDataType[]);

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

<AdminCard
	data-testid="user-admin-area"
	class="flex flex-col border border-surface-200 bg-white p-6 shadow-sm backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/50"
>
	<p class="h2 mb-2 text-center text-3xl font-bold dark:text-white">{adminarea_adminarea()}</p>

	<div class="flex flex-col flex-wrap items-center justify-evenly gap-2 sm:flex-row xl:justify-between">
		<Button
			variant="outline"
			type="button"
			onclick={modalTokenUser}
			aria-label={adminarea_emailtoken()}
			data-testid="email-registration-token-btn"
			class="gradient-primary w-full text-white sm:max-w-xs"
		>
			<iconify-icon icon="material-symbols:mail" width={24} aria-hidden="true"></iconify-icon>
			<span class="whitespace-normal wrap-break-word">{adminarea_emailtoken()}</span>
		</Button>

		<Button variant="outline"
			type="button"
			onclick={toggleUserToken}
			aria-label={showUsertoken ? adminarea_hideusertoken() : adminarea_showtoken()}
		 class="gradient-secondary w-full text-white sm:max-w-xs">
			<iconify-icon icon="material-symbols:key-outline" width={24}></iconify-icon>
			<span>{showUsertoken ? adminarea_hideusertoken() : adminarea_showtoken()}</span>
		</Button>

		{#if showUsertoken && !showUserList && tableData}
			{const now = new Date()}
			{const expiredTokens = (tableData as TableDataType[]).filter(
				(item): item is Token & Record<string, unknown> => isToken(item as TableDataType) && (item as Token).expires != null && new Date(String((item as Token).expires)) < now
			)}
			{#if expiredTokens.length > 0}
				<Button variant="outline"
					type="button"
					onclick={() => (showExpiredTokens = !showExpiredTokens)}
					aria-label={showExpiredTokens ? 'Hide Expired Tokens' : 'Show Expired Tokens'}
				 class="gradient-secondary w-full text-white sm:max-w-xs">
					<iconify-icon icon="material-symbols:schedule" width={24}></iconify-icon>
					<span>{showExpiredTokens ? 'Hide Expired' : 'Show Expired'}</span>
				</Button>
			{/if}
		{/if}

		<Button variant="outline"
			type="button"
			onclick={toggleUserList}
			aria-label={showUserList ? adminarea_hideuserlist() : adminarea_showuserlist()}
		 class="gradient-tertiary w-full text-white sm:max-w-xs">
			<iconify-icon icon="mdi:account-circle" width={24}></iconify-icon>
			<span>{showUserList ? adminarea_hideuserlist() : adminarea_showuserlist()}</span>
		</Button>
	</div>

	{#if showUserList || showUsertoken}
		<div class={SMART_TABLE_TOOLBAR}>
			<h2 class="order-1 text-xl font-bold text-tertiary-500 dark:text-primary-500">
				{#if showUserList}
					{adminarea_userlist()}
				{:else if showUsertoken}
					{adminarea_listtoken()}
				{/if}
			</h2>

			<div class="order-3 sm:order-2"><TableFilter bind:globalSearchValue bind:searchShow bind:filterShow bind:columnShow bind:density /></div>

			<div class="order-2 flex items-center justify-center sm:order-3">
				<Multibutton
					{selectedRows}
					type={showUserList ? 'user' : 'token'}
					totalUsers={showUserList ? systemUserCount : totalItems}
					{currentUser}
					onUpdate={handleBatchUpdate}
				/>
			</div>
		</div>

		{#if columnShow && (tableData?.length || filterShow)}
			<div class={SMART_TABLE_COLUMN_MANAGER}>
				<div class="text-sm text-surface-700 dark:text-primary-500">{entrylist_dnd()}</div>
				<div class="my-2 flex w-full items-center justify-center gap-1">
					<label class="me-2">
						<input type="checkbox" bind:checked={selectAllColumns} onclick={handleCheckboxChange}  aria-label="Input" />
						{entrylist_all()}
					</label>

					<!-- Droppable only on items (v0.7.0) — nested section+item droppables cause callback ambiguity -->
					<section
						class="flex flex-wrap justify-center gap-1 rounded p-2"
						role="list"
						aria-label="Drag columns to reorder"
					>
						{#each displayTableHeaders as header (header.id)}
							<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
							<span
								animate:flip={{ duration: flipDurationMs }}
								use:draggable={{ container: 'columns', dragData: header, keyboard: true }}
								use:droppable={{
									container: 'columns',
									callbacks: { onDrop: handleColumnDrop },
									direction: 'horizontal',
									attributes: { dragOverClass: 'bg-secondary-200' }
								}}
								data-header-id={header.id}
								role="listitem"
								tabindex="0"
								aria-label={`Column: ${header.label}. Press Space to grab, arrows to move.`}
							>
								<Button
									variant="secondary"
									type="button"
									onclick={() => {
										displayTableHeaders = displayTableHeaders.map((h) =>
											h.id === header.id ? { ...h, visible: !h.visible } : h
										);
										selectAllColumns = displayTableHeaders.every((h) => h.visible);
									}}
									class="chip {header.visible ? ' ' : ' '} w-100 me-2 flex items-center justify-center"
								>
									{#if header.visible}
										<span><iconify-icon icon="fa:check" width={24}></iconify-icon></span>
									{/if}
									<span class="ms-2 capitalize">{header.label}</span>
								</Button>
							</span>
						{/each}
					</section>
				</div>
			</div>
		{/if}

		<SmartTableShell
			empty={!tableData || tableData.length === 0}
			emptyTitle={showUserList ? adminarea_nouser() : adminarea_notoken()}
			emptyDescription="Adjust search or create a new record."
			emptyIcon={showUserList ? 'mdi:account-off-outline' : 'mdi:key-off-outline'}
			showPagination={!!(tableData && tableData.length > 0)}
			currentPage={currentPage}
			rowsPerPage={rowsPerPage}
			pagesCount={pagesCount}
			totalItems={totalItems}
			onUpdatePage={(page: number) => smartTable.setPage(page)}
			onUpdateRowsPerPage={(rows: number) => smartTable.setPageSize(rows)}
		>
				<table class="{SMART_TABLE} {density === 'compact' ? 'table-compact' : density === 'comfortable' ? 'table-comfortable' : ''}">
					<thead class={SMART_TABLE_THEAD}>
						{#if filterShow}
							<tr class="border-b border-surface-200/50 dark:border-surface-700/50">
								<th class="border-e border-surface-200/50 dark:border-surface-700/50">
									{#if Object.keys(filters).length > 0}
										<Button variant="ghost" type="button" onclick={() => (filters = {})} aria-label="Clear All Filters" class="p-0! min-w-0 preset-outline">
											<iconify-icon icon="material-symbols:close" width={24}></iconify-icon>
										</Button>
									{/if}
								</th>

								{#each displayTableHeaders.filter((header) => header.visible) as header (header.id)}
									<th class="border-e border-surface-200/50 dark:border-surface-700/50">
										<div class="flex items-center justify-between">
											<FloatingInput
												type="text"
												icon="material-symbols:search-rounded"
												label={entrylist_filter()}
												name={header.key}
												onInput={(value: string) => handleInputChange(value, String(header.key))}
											/>
										</div>
									</th>
								{/each}
							</tr>
						{/if}

						<tr
							class="border-b border-surface-300 dark:border-surface-50 font-semibold tracking-wide uppercase text-xs"
						>
							<TableIcons
								cellClass="w-10 text-center border-e border-surface-300 dark:border-surface-600 {pinCellClass('start')}"
								checked={selectAll.value}
								onCheck={(checked: boolean) => {
									selectAll.value = checked;
								}}
							/>

							{#each displayTableHeaders.filter((header) => header.visible) as header (header.id)}
								<th
									class="{SMART_TABLE_TH} cursor-pointer hover:bg-surface-100/50 dark:hover:bg-surface-800/50"
									aria-sort={sorting.sortedBy === header.key
										? sorting.isSorted === 1
											? 'ascending'
											: 'descending'
										: 'none'}
									onclick={() => smartTable.setSort(String(header.key))}
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
						{#each tableData as row, index (getAdminRowId(row) || index)}
							{@const rowId = getAdminRowId(row)}
							{@const rowSelected = smartTable.isSelected(rowId)}
							{const expiresVal: string | Date | null = isToken(row) ? row.expires : null}
							{const isConsumed = isToken(row) && row.consumed}
							{const isExpired = showUsertoken && expiresVal && new Date(expiresVal) < new Date()}
							<tr
								class="{isExpired || isConsumed
									? 'bg-surface-50 opacity-60 dark:bg-surface-900/20'
									: ''} {isExpired ? 'bg-error-50 dark:bg-error-900/10' : ''} {rowSelected
									? SMART_TABLE_ROW_SELECTED
									: showUsertoken
										? `cursor-pointer ${SMART_TABLE_ROW_HOVER}`
										: SMART_TABLE_ROW_HOVER}"
								onclick={(event) => {
									// Only handle click if it's on a token row and not on the checkbox
									if (showUsertoken && !(event.target as HTMLElement)?.closest('td:first-child')) {
										if (isToken(row)) editToken(row);
									}
								}}
							>
								<TableIcons
									cellClass="{SMART_TABLE_TD} border-e {pinCellClass('start')}"
									checked={rowSelected}
									onCheck={() => {
										if (rowId) smartTable.toggleSelect(rowId);
									}}
								/>
								{#each displayTableHeaders.filter((header) => header.visible) as header (header.id)}
									<td class={SMART_TABLE_TD}>
										{#if header.key === 'blocked'}
											{#if showUserList}
												<Button variant="outline"
													type="button"
													onclick={() => isUser(row) && toggleUserBlocked(row)}
													aria-label={row.blocked ? 'Click to unblock user' : 'Click to block user'}
													title={row.blocked ? 'Click to unblock user' : 'Click to block user'}
												 size="sm" class="rounded p-1 transition-all hover:scale-105 hover:bg-surface-200 hover:shadow-md dark:hover:bg-surface-600">
													<Boolean value={!!row[header.key]} />
												</Button>
											{:else}
												<Button
													variant="outline"
													type="button"
													onclick={(event: MouseEvent) => {
														event.stopPropagation();
														if (isToken(row)) toggleTokenBlocked(row);
													}}
													aria-label={row.blocked ? 'Click to unblock token' : 'Click to block token'}
													title={row.blocked ? 'Click to unblock token' : 'Click to block token'}
												 size="sm" class="rounded p-1 transition-all hover:scale-105 hover:bg-surface-200 hover:shadow-md dark:hover:bg-surface-600">
													<Boolean value={!!row[header.key]} />
												</Button>
											{/if}
										{:else if showUserList && header.key === 'avatar'}
											<Avatar
												src={currentUser && isUser(row) && row._id === currentUser._id
													? normalizeAvatarUrl(currentUser.avatar ?? '/Default_User.svg')
													: isUser(row) && header.key === 'avatar'
														? normalizeAvatarUrl(row.avatar)
														: '/Default_User.svg'}
												initials="Usr"
												size="size-10"
												class="rounded-full border border-surface-200/50"
											/>
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
													<Button
														variant="ghost"
														type="button"
														aria-label="Copy User ID"
														onclick={(event: MouseEvent) => {
															event.stopPropagation();
															const val = String(isUser(row) ? row._id : isToken(row) ? row._id : '');
															navigator.clipboard
																.writeText(val)
																.then(() => {
																	toast.success('User ID copied to clipboard');
																})
																.catch(() => {
																	toast.error('Failed to copy');
																});
														}}
													 class="p-0! min-w-0 preset-ghost hover: hover:dark:">
														<iconify-icon icon="oui:copy-clipboard" width={18}></iconify-icon>
													</Button>
												</SystemTooltip>
											</div>
										{:else if header.key === 'token'}
											<!-- Token with clipboard functionality -->
											<div class="flex items-center justify-center gap-2">
												<span class="max-w-50 truncate font-mono text-sm">{isToken(row) && header.key === 'token' ? row.token : '-'}</span>
												<SystemTooltip title="Copy Token to clipboard">
													<Button
														variant="ghost"
														type="button"
														aria-label="Copy Token"
														onclick={(event: MouseEvent) => {
															event.stopPropagation();
															const val = isToken(row) && header.key === 'token' ? row.token : '';
															navigator.clipboard
																.writeText(val)
																.then(() => {
																	toast.success('Token copied to clipboard');
																})
																.catch(() => {
																	toast.error('Failed to copy');
																});
														}}
													 class="p-0! min-w-0 preset-ghost hover: hover:dark:">
														<iconify-icon icon="oui:copy-clipboard" width={18}></iconify-icon>
													</Button>
												</SystemTooltip>
											</div>
										{:else if ['createdAt', 'updatedAt', 'lastAccess'].includes(String(header.key))}
											{formatDate(isUser(row) ? row[header.key as keyof User] : isToken(row) ? row[header.key as keyof Token] : undefined)}
										{:else if header.key === 'expires'}
											{#if isToken(row)}
												{#if row.consumed}
													<span class="font-bold text-tertiary-500 dark:text-primary-500 flex items-center justify-center gap-1">
														<iconify-icon icon="mdi:check-circle" width={18}></iconify-icon>
														{adminarea_consumed()}
													</span>
												{:else if row.expires}
													{const isTokenExpired = checkTokenExpired(row)}
													{const remainingTime = getRemainingTime(row.expires)}
													<span class={isTokenExpired ? 'font-semibold text-error-500' : ''}>
														{remainingTime}
														{#if isTokenExpired}
															<iconify-icon icon="material-symbols:warning" width={24} class="ms-1 text-error-500"></iconify-icon>
														{/if}
													</span>
												{:else}
													-
												{/if}
											{:else}
												-
											{/if}
										{:else}
											{getDisplayValue(row, header)}
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
		</SmartTableShell>
	{/if}
</AdminCard>
