<!--
@file src/routes/(app)/user/components/user-management.svelte
@component
**User management panel — users and tokens Smart Table (server mode).**

### Features
- `createSmartTable({ mode: 'server', onQueryChange })` owns page/sort/selection
- API fetch for `/api/user` and `/api/token` driven by one controller
- Shared table chrome (matches entry-list / media / tokens)
- Bulk actions, copy to clipboard, column manager
-->

<script lang="ts">
	import AdminCard from '@components/admin-card.svelte';
	import Button from '@components/ui/button.svelte';
	import Badge from '@components/ui/badge.svelte';
	import { formatDateTime } from '@utils/format-date';
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
	import Avatar from '@components/ui/avatar.svelte';

	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
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
	import ColumnResizeHandle from '@components/ui/smart-table/column-resize-handle.svelte';
	import SmartTableSavedViewsMenu from '@components/ui/smart-table/smart-table-saved-views-menu.svelte';
	import type { SmartTableSavedView } from '@utils/smart-table-saved-views';
	import { TAB_ROW, TAB_STRIP_FLUSH, tabTrigger } from '@components/ui/tabs/chrome';
	// Types
	import type { Role as RoleType, Token, User } from '@src/databases/auth/types';
	import { convertDateToExpiresFormat, type UserTableRow } from '../user-remote-utils';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
	import { isAdmin } from '@src/databases/auth/constants';
	// Types
	import {
		adminarea_activesession,
		adminarea_blocked,
		adminarea_consumed,
		adminarea_createat,
		adminarea_emailtoken,
		adminarea_expiresin,
		adminarea_lastaccess,
		adminarea_notoken,
		adminarea_nouser,
		adminarea_token,
		adminarea_updatedat,
		adminarea_user_id,
		email,
		entrylist_all,
		form_avatar,
		multibuttontoken_modalbody,
		multibuttontoken_modaltitle,
		role,
		useradmin_action_block,
		useradmin_action_blocked,
		useradmin_action_unblock,
		useradmin_action_unblocked,
		useradmin_active,
		useradmin_admin_block_warning,
		useradmin_admins,
		useradmin_all,
		useradmin_block,
		useradmin_blocked,
		useradmin_click_block_token,
		useradmin_click_block_user,
		useradmin_click_unblock_token,
		useradmin_click_unblock_user,
		useradmin_confirm_block_token_body,
		useradmin_confirm_block_user_body,
		useradmin_confirm_token_block_title,
		useradmin_confirm_unblock_token_body,
		useradmin_confirm_unblock_user_body,
		useradmin_confirm_user_block_title,
		useradmin_copy_failed,
		useradmin_copy_token,
		useradmin_copy_token_tooltip,
		useradmin_copy_user_id,
		useradmin_copy_user_id_tooltip,
		useradmin_empty_description,
		useradmin_expired,
		useradmin_failed_token,
		useradmin_failed_token_reason,
		useradmin_failed_token_status,
		useradmin_failed_user,
		useradmin_failed_user_reason,
		useradmin_failed_user_status,
		useradmin_fetch_error,
		useradmin_fetch_failed,
		useradmin_fetching_data,
		useradmin_input,
		useradmin_invitations,
		useradmin_invite_user,
		useradmin_manage_sessions,
		useradmin_manage_sessions_tooltip,
		useradmin_never,
		useradmin_self_block_warning,
		useradmin_tenant_id,
		useradmin_token_action_success,
		useradmin_token_copied,
		useradmin_unblock,
		useradmin_unknown_error,
		useradmin_update_token_failed,
		useradmin_user_action_success,
		useradmin_user_id_copied,
		useradmin_users,
		useradmin_views_aria,
		username
	} from '@src/paraglide/messages';
	import { globalLoadingStore, loadingOperations } from '@src/stores/loading-store.svelte.ts';
	import { normalizeAvatarUrl } from '@utils/avatar';
	import { toast } from '@src/stores/toast.svelte.ts';
	// Stores
	import { logger } from '@utils/logger';
	import { modalState } from '@utils/modal.svelte';
	import { showConfirm } from '@utils/modal.svelte';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import Multibutton from './multibutton.svelte';
	import ModalEditToken from './modal-edit-token.svelte';
	import ModalUserSessions from './modal-user-sessions.svelte';
	import SmartTableMetricsBadge from '@components/ui/smart-table/smart-table-metrics-badge.svelte';

	type TableDataType = (User | Token) & Record<string, unknown>;

	interface TableHeader {
		id: string;
		key: keyof User | keyof Token;
		label: string;
		visible: boolean;
	}

	// Props - Using API for scalability
	const {
		currentUser = null,
		isMultiTenant = false,
		roles = [],
		initialUsers = null,
		initialTotal = null
	}: {
		currentUser: User | null;
		isMultiTenant: boolean;
		roles: RoleType[];
		/** Page 1 delivered by `+page.server.ts` (LocalCMS) — renders before the first fetch. */
		initialUsers?: UserTableRow[] | null;
		initialTotal?: number | null;
	} = $props();

	// Core view state (must exist before smartTable onQueryChange can fetch)
	let showUserList = $state(true);
	let showUsertoken = $state(false);
	let globalSearchValue = $state('');
	let searchShow = $state(false);
	let filterShow = $state(false);
	let columnShow = $state(false);
	let selectAllColumns = $state(true);

	const viewsScope = $derived(showUserList ? 'users' : 'tokens');

	let activeFacet = $state<'all' | 'admin' | 'user' | 'active' | 'blocked'>('all');

	function selectFacet(facet: 'all' | 'admin' | 'user' | 'active' | 'blocked') {
		activeFacet = facet;
		smartTable.pagination.currentPage = 1;
		fetchData().catch((err) => logger.error('Facet change error:', err));
	}

	function openUserSessions(targetUser: User) {
		modalState.trigger(ModalUserSessions as any, { user: targetUser }, () => {});
	}

	function getSavedViewSnapshot(): Omit<
		SmartTableSavedView,
		'id' | 'createdAt' | 'updatedAt' | 'name'
	> {
		return {
			filters: { activeFacet },
			search: globalSearchValue,
			sort: smartTable.sort,
			pageSize: smartTable.pagination.pageSize
		};
	}

	function applySavedView(view: SmartTableSavedView) {
		if (view.search != null) globalSearchValue = view.search;
		if (view.sort?.sortedBy) smartTable.setSort(view.sort.sortedBy, { emit: false });
		if (view.pageSize) smartTable.setPageSize(view.pageSize, { emit: false });
		if (view.filters && typeof view.filters === 'object' && 'activeFacet' in view.filters) {
			activeFacet = (view.filters as Record<string, any>).activeFacet;
		}
		fetchData().catch(() => {});
	}

	function getAdminRowId(row: TableDataType): string {
		if (isToken(row)) return String(row.token ?? '');
		if (isUser(row)) return String(row._id ?? '');
		return '';
	}

	/** Single controller for page / sort / selection (server mode → API refetch). */
	const smartTable = createSmartTable({
		mode: 'server',
		pageSize: 10,
		// Match the effect below (which switches layout per view) so the initial
		// render already resolves the right persisted layout — switching keys
		// after mount changed density/widths on an already-painted table.
		layoutKey: untrack(() => (showUserList ? 'admin-area-users' : 'admin-area-tokens')),
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

	// Seed the first page from the server load: the table paints with rows instead
	// of an empty state until the refresh in the view effect below lands.
	const serverPage = untrack(() => ({ users: initialUsers, total: initialTotal }));
	if (serverPage.users) {
		const seededRows = serverPage.users as unknown as TableDataType[];
		const seededTotal = serverPage.total ?? seededRows.length;
		smartTable.setRows(seededRows);
		smartTable.setPaginationMeta({
			totalItems: seededTotal,
			pagesCount: Math.max(1, Math.ceil(seededTotal / smartTable.pagination.pageSize)),
			currentPage: 1,
			pageSize: smartTable.pagination.pageSize
		});
	}

	// Guard against out-of-order responses: a slower request issued for the previous
	// view must never write rows/pagination into the table the user is viewing now.
	let fetchRequestId = 0;
	let fetchController: AbortController | null = null;

	async function fetchData() {
		const requestId = ++fetchRequestId;
		const viewAtRequest = showUserList ? 'users' : 'tokens';
		fetchController?.abort();
		const controller = new AbortController();
		fetchController = controller;
		const isLatestRequest = () =>
			requestId === fetchRequestId && (showUserList ? 'users' : 'tokens') === viewAtRequest;

		globalLoadingStore.startLoading(loadingOperations.dataFetch, useradmin_fetching_data());
		try {
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
			if (showUserList && activeFacet !== 'all') {
				if (activeFacet === 'admin' || activeFacet === 'user') {
					params.set('role', activeFacet);
				} else if (activeFacet === 'active') {
					params.set('blocked', 'false');
				} else if (activeFacet === 'blocked') {
					params.set('blocked', 'true');
				}
			}

			const response = await fetch(`${endpoint}?${params.toString()}`, {
				signal: controller.signal
			});
			if (!isLatestRequest()) return;
			if (!response.ok) {
				const errorData = (await response.json().catch(() => ({}))) as { message?: string };
				throw new Error(errorData.message || useradmin_fetch_failed());
			}
			const result = await response.json();
			if (!isLatestRequest() || !result.success) return;
			const items = (result.data || []) as TableDataType[];
			const total = Number(result.pagination?.totalItems ?? items.length);
			smartTable.setRows(items);
			smartTable.setPaginationMeta({
				totalItems: total,
				pagesCount: Math.max(1, Math.ceil(total / smartTable.pagination.pageSize)),
				currentPage: smartTable.pagination.currentPage,
				pageSize: smartTable.pagination.pageSize
			});
		} catch (err) {
			// A superseded request is expected — never report it or clear the current table.
			if (controller.signal.aborted || !isLatestRequest()) {
				logger.debug('AdminArea fetch superseded; response discarded');
				return;
			}
			const errorMessage = err instanceof Error ? err.message : useradmin_unknown_error();
			logger.error('AdminArea fetch error:', errorMessage);
			toast.error(useradmin_fetch_error({ error: errorMessage }));
			smartTable.setRows([]);
			smartTable.setPaginationMeta({ totalItems: 0, pagesCount: 1 });
			throw err;
		} finally {
			if (isLatestRequest()) globalLoadingStore.stopLoading(loadingOperations.dataFetch);
		}
	}

	// Custom event handler for updates from Multibutton
	function handleBatchUpdate(data: { ids: string[]; action: string; type: 'user' | 'token' }) {
		const { ids, action, type } = data;
		logger.debug(`[AdminArea] handleBatchUpdate: ${action} on ${type}`, { count: ids.length });

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
					smartTable.setRows([...updatedData] as TableDataType[]);
				} else {
					logger.debug(`[AdminArea] No items matched for ${action} in current tableData`);
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
		{ label: useradmin_tenant_id(), key: 'tenantId' },
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
		{ label: useradmin_tenant_id(), key: 'tenantId' },
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

	// Initialize displayTableHeaders from the initial view
	let displayTableHeaders: TableHeader[] = $state(untrack(() => buildTableHeaders(showUserList)));

	/**
	 * Build the header set for one view (users or tokens).
	 *
	 * Shared by the initial render and the view-switch effect: the initial
	 * render used to start from an empty array, so SSR emitted a table without
	 * columns that grew into the full grid on hydration.
	 */
	function buildTableHeaders(usersView: boolean): TableHeader[] {
		const baseHeaders = usersView ? tableHeadersUser : tableHeaderToken;
		const relevantHeaders = isMultiTenant
			? baseHeaders
			: baseHeaders.filter((h) => h.key !== 'tenantId');
		// Essential columns only visible by default — rest available via column toggle
		const essentialKeys = usersView
			? ['avatar', 'email', 'username', 'role', 'createdAt', 'blocked']
			: ['email', 'role', 'token', 'expires', 'createdAt', 'blocked'];

		return relevantHeaders.map((header) => ({
			label: header.label,
			key: header.key,
			visible: essentialKeys.includes(header.key),
			id: `header-${header.key}`
		}));
	}

	// Skip the first effect run: the header set above is already applied, and
	// re-applying it would re-render every row right after hydration.
	let appliedHeaderView = untrack(() => `${showUserList ? 'users' : 'tokens'}:${isMultiTenant}`);

	$effect(() => {
		// Update displayTableHeaders when the view changes.
		// 🛡️ The controller calls below mutate smart-table state (lay-out key, columns,
		// widths) — run them untracked so this effect depends only on the view flags and
		// never on state it writes. Tracked writes here re-schedule the effect that made
		// them (effect_update_depth_exceeded).
		const viewKey = `${showUserList ? 'users' : 'tokens'}:${isMultiTenant}`;
		if (viewKey === appliedHeaderView) return;
		appliedHeaderView = viewKey;

		const targetLayoutKey = showUserList ? 'admin-area-users' : 'admin-area-tokens';
		const newHeaders = buildTableHeaders(showUserList);

		untrack(() => {
			smartTable.setLayoutKey(targetLayoutKey);
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
	});

	// Density → controller (for cell padding helpers)
	$effect(() => {
		smartTable.setDensity(density);
	});

	// View / search / user context changes — reset to page 1 (no emit) + fetch once.
	// Track primitive `currentUser?._id` rather than the derived `currentUser` object
	// reference so parent re-renders do not reset pagination/selection or fire duplicate requests.
	const currentUserId = $derived(currentUser?._id ?? '');
	let skipInitialSeedFetch = Boolean(serverPage.users);
	$effect(() => {
		void showUserList;
		void showUsertoken;
		void globalSearchValue;
		void currentUserId;

		untrack(() => {
			if (
				skipInitialSeedFetch &&
				showUserList &&
				!showUsertoken &&
				!globalSearchValue &&
				activeFacet === 'all'
			) {
				skipInitialSeedFetch = false;
				return;
			}
			skipInitialSeedFetch = false;
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
				// Use the row _id as the resource id — the list exposes the *hashed* token
				// value (never the raw credential), so row.token cannot resolve via
				// getTokenByValue (it re-hashes). tokenData._id hits getTokenById instead.
				token: tokenData._id,
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
						description: result.error || useradmin_update_token_failed()
					});
				}
			}
		);
	}

	// Helper function to calculate remaining time until expiration for display in table
	function getRemainingTime(expiresDate: Date | string | null): string {
		if (!expiresDate) {
			return useradmin_never();
		}

		const now = new Date();
		const expires = new Date(expiresDate);
		const diffMs = expires.getTime() - now.getTime();

		// If expired, return the localized state
		if (diffMs <= 0) {
			return useradmin_expired();
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
		return formatDateTime(value as any, undefined, undefined, '-');
	}

	// Toggle user blocked status - always show confirmation modal (like Multibutton)
	async function toggleUserBlocked(user: User) {
		if (!user._id) {
			return;
		}

		// System protection: admins cannot be blocked
		if (isAdmin(user)) {
			toast.warning(useradmin_admin_block_warning());
			return;
		}

		// Prevent admins from blocking themselves
		if (currentUser && user._id === currentUser._id) {
			toast.warning(useradmin_self_block_warning());
			return;
		}

		const action = user.blocked ? 'unblock' : 'block';
		const actionPastTense = user.blocked
			? useradmin_action_unblocked()
			: useradmin_action_blocked();

		// Always show confirmation modal (same logic as Multibutton) with enhanced styling using theme colors
		const actionColor = user.blocked ? 'text-success-500' : 'text-error-500';
		const actionWord = user.blocked ? useradmin_unblock() : useradmin_block();
		const identifier = user.username || user.email || user._id;

		const modalTitle = useradmin_confirm_user_block_title({ actionClass: actionColor, actionWord });
		const modalBody = user.blocked
			? useradmin_confirm_unblock_user_body({ identifier })
			: useradmin_confirm_block_user_body({ identifier });

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

		const actionVerb = action === 'block' ? useradmin_action_block() : useradmin_action_unblock();

		try {
			const response = await fetch('/api/user/batch', {
				method: 'POST',
				headers: clientJsonHeaders(page.data.csrfToken),
				body: JSON.stringify({
					userIds: [user._id],
					action
				})
			});

			if (!response.ok) {
				const errText = await response.text();
				throw new Error(
					errText || useradmin_failed_user_status({ action: actionVerb, status: response.status })
				);
			}

			const result = await response.json();

			if (result.success) {
				// Optimistic update on current smartTable page
				smartTable.setRows(
					smartTable.rows.map((item: Record<string, unknown>) =>
						isUser(item as TableDataType) && (item as unknown as User)._id === user._id
							? { ...item, blocked: !item.blocked }
							: item
					) as TableDataType[]
				);
				toast.success(useradmin_user_action_success({ action: actionPastTense }));
			} else {
				throw new Error(result.message || useradmin_failed_user({ action: actionVerb }));
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : useradmin_unknown_error();
			toast.error(useradmin_failed_user_reason({ action: actionVerb, reason: errorMessage }));
		}
	}

	// Toggle token blocked status - similar to user blocking
	async function toggleTokenBlocked(token: Token) {
		if (!token.token) {
			return;
		}

		const action = token.blocked ? 'unblock' : 'block';
		const actionPastTense = token.blocked
			? useradmin_action_unblocked()
			: useradmin_action_blocked();

		// Show confirmation modal with enhanced styling using theme colors
		const actionColor = token.blocked ? 'text-success-500' : 'text-error-500';
		const actionWord = token.blocked ? useradmin_unblock() : useradmin_block();
		const identifier = token.email || token._id;

		const modalTitle = useradmin_confirm_token_block_title({
			actionClass: actionColor,
			actionWord
		});
		const modalBody = token.blocked
			? useradmin_confirm_unblock_token_body({ identifier })
			: useradmin_confirm_block_token_body({ identifier });

		showConfirm({
			title: modalTitle,
			body: modalBody,
			onConfirm: async () => {
				await performTokenBlockAction(token, action, actionPastTense);
			}
		});
	}

	async function performTokenBlockAction(token: Token, action: string, actionPastTense: string) {
		// Use the row _id — the list exposes the hashed token value, which batch's
		// findToken cannot resolve (getTokenByValue re-hashes the input).
		if (!token._id) return;

		const actionVerb = action === 'block' ? useradmin_action_block() : useradmin_action_unblock();

		try {
			const response = await fetch('/api/token/batch', {
				method: 'POST',
				headers: clientJsonHeaders(page.data.csrfToken),
				body: JSON.stringify({
					tokenIds: [token._id],
					action
				})
			});

			if (!response.ok) {
				const errText = await response.text();
				throw new Error(
					errText || useradmin_failed_token_status({ action: actionVerb, status: response.status })
				);
			}

			const result = await response.json();

			if (result.success) {
				smartTable.setRows(
					smartTable.rows.map((item: Record<string, unknown>) =>
						isToken(item as TableDataType) && (item as unknown as Token).token === token.token
							? { ...item, blocked: !item.blocked }
							: item
					) as TableDataType[]
				);
				toast.success(useradmin_token_action_success({ action: actionPastTense }));
			} else {
				throw new Error(result.message || useradmin_failed_token({ action: actionVerb }));
			}
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : useradmin_unknown_error();
			toast.error(useradmin_failed_token_reason({ action: actionVerb, reason: errorMessage }));
		}
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

	function showView(view: string) {
		if (view === 'users') {
			showUserList = true;
			showUsertoken = false;
		} else {
			showUsertoken = true;
			showUserList = false;
		}
	}
</script>

<!-- Status facets: local snippet, rendered on the toolbar row. -->
{#snippet facetChips()}
	<div
		class="flex flex-wrap items-center gap-1.5 text-xs"
		role="group"
		aria-label="Filter users"
		data-testid="user-facets"
	>
		<button
			type="button"
			onclick={() => selectFacet('all')}
			class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors {activeFacet ===
			'all'
				? 'bg-primary-500 text-white'
				: 'bg-surface-500/10 text-(--admin-text-muted) hover:bg-surface-500/20 dark:text-(--admin-text-muted)'}"
		>
			<span>{useradmin_all()}</span>
			<span class="opacity-70">({systemUserCount})</span>
		</button>
		<button
			type="button"
			onclick={() => selectFacet('admin')}
			class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors {activeFacet ===
			'admin'
				? 'bg-primary-500 text-white'
				: 'bg-surface-500/10 text-(--admin-text-muted) hover:bg-surface-500/20 dark:text-(--admin-text-muted)'}"
		>
			<iconify-icon
				icon="mdi:shield-crown-outline"
				width="14"
				class="text-tertiary-500 dark:text-primary-400"
			></iconify-icon>
			<span>{useradmin_admins()}</span>
		</button>
		<button
			type="button"
			onclick={() => selectFacet('user')}
			class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors {activeFacet ===
			'user'
				? 'bg-primary-500 text-white'
				: 'bg-surface-500/10 text-(--admin-text-muted) hover:bg-surface-500/20 dark:text-(--admin-text-muted)'}"
		>
			<iconify-icon icon="mdi:account-outline" width="14"></iconify-icon>
			<span>{useradmin_users()}</span>
		</button>
		<button
			type="button"
			onclick={() => selectFacet('active')}
			class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors {activeFacet ===
			'active'
				? 'bg-primary-500 text-white'
				: 'bg-surface-500/10 text-(--admin-text-muted) hover:bg-surface-500/20 dark:text-(--admin-text-muted)'}"
		>
			<span class="size-1.5 rounded-full bg-success-500"></span>
			<span>{useradmin_active()}</span>
		</button>
		<button
			type="button"
			onclick={() => selectFacet('blocked')}
			class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors {activeFacet ===
			'blocked'
				? 'bg-primary-500 text-white'
				: 'bg-surface-500/10 text-(--admin-text-muted) hover:bg-surface-500/20 dark:text-(--admin-text-muted)'}"
		>
			<span class="size-1.5 rounded-full bg-error-500"></span>
			<span>{useradmin_blocked()}</span>
		</button>
	</div>
{/snippet}

<AdminCard data-testid="user-admin-area" class="my-2 flex min-h-0 w-full flex-1 flex-col sm:my-3">
	<!-- Header: Tabs + Invite button. The rule belongs to the whole row (it used to end
	     with the tablist, leaving a visible gap under Invite User). It is painted as an
	     inset shadow so the tabs' 2px active underline covers it (`TAB_ROW`). -->
	<div class={TAB_ROW} data-testid="user-admin-header">
		<div class="{TAB_STRIP_FLUSH} grow" role="tablist" aria-label={useradmin_views_aria()}>
			<button
				type="button"
				role="tab"
				aria-selected={showUserList}
				data-testid="admin-tab-users"
				onclick={() => showView('users')}
				class={tabTrigger(showUserList, 'gap-1.5')}
			>
				<iconify-icon icon="mdi:account-group" width={18}></iconify-icon>
				{useradmin_users()}
				<Badge preset="tonal" color="secondary" size="sm" class="ms-1">{systemUserCount}</Badge>
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={showUsertoken}
				data-testid="admin-tab-tokens"
				onclick={() => showView('tokens')}
				class={tabTrigger(showUsertoken, 'gap-1.5')}
			>
				<iconify-icon icon="material-symbols:key-outline" width={18}></iconify-icon>
				{useradmin_invitations()}
			</button>
		</div>
		<Button
			variant="surface"
			size="sm"
			onclick={modalTokenUser}
			aria-label={adminarea_emailtoken()}
			data-testid="email-registration-token-btn"
			leadingIcon="material-symbols:mail"
		>
			{useradmin_invite_user()}
		</Button>
	</div>

	<!-- Toolbar: search / filters / views / status facets share one band with the
	     row actions — facets used to sit on their own row and pushed the table down. -->
	<div class="{SMART_TABLE_TOOLBAR} relative z-30 px-4" data-testid="user-admin-toolbar">
		<div class="order-3 flex flex-wrap items-center gap-2 sm:order-2">
			<TableFilter
				bind:globalSearchValue
				bind:searchShow
				bind:filterShow
				bind:columnShow
				bind:density
			/>
			<SmartTableSavedViewsMenu
				scope={viewsScope}
				getSnapshot={getSavedViewSnapshot}
				onApply={applySavedView}
			/>
			<SmartTableMetricsBadge source={showUserList ? 'UserManagement.list' : 'Tokens.list'} />
			{#if showUserList}
				{@render facetChips()}
			{/if}
		</div>

		<div class="order-2 flex items-center justify-center sm:order-3 relative z-30">
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
			<div class="my-2 flex w-full items-center justify-center gap-1">
				<label class="me-2">
					<input
						type="checkbox"
						bind:checked={selectAllColumns}
						onclick={handleCheckboxChange}
						aria-label={useradmin_input()}
					/>
					{entrylist_all()}
				</label>

				{#each displayTableHeaders as header (header.id)}
					<Button
						variant={header.visible ? 'secondary' : 'ghost'}
						size="sm"
						type="button"
						onclick={() => {
							displayTableHeaders = displayTableHeaders.map((h: TableHeader) =>
								h.id === header.id ? { ...h, visible: !h.visible } : h
							);
							selectAllColumns = displayTableHeaders.every((h: TableHeader) => h.visible);
						}}
						class="text-xs"
					>
						{#if header.visible}
							<iconify-icon icon="fa:check" width={12} class="me-1"></iconify-icon>
						{/if}
						{header.label}
					</Button>
				{/each}
			</div>
		</div>
	{/if}

	<SmartTableShell
		empty={!tableData || tableData.length === 0}
		emptyTitle={showUserList ? adminarea_nouser() : adminarea_notoken()}
		emptyDescription={useradmin_empty_description()}
		emptyIcon={showUserList ? 'mdi:account-off-outline' : 'mdi:key-off-outline'}
		showPagination={!!(tableData && tableData.length > 0)}
		{currentPage}
		{rowsPerPage}
		{pagesCount}
		{totalItems}
		onUpdatePage={(page: number) => smartTable.setPage(page)}
		onUpdateRowsPerPage={(rows: number) => smartTable.setPageSize(rows)}
	>
		<table
			class="{SMART_TABLE} {density === 'compact'
				? 'table-compact'
				: density === 'comfortable'
					? 'table-comfortable'
					: ''}"
		>
			<thead class={SMART_TABLE_THEAD}>
				<tr
					class="border-b border-surface-500/30 text-xs uppercase tracking-wide dark:border-surface-600"
				>
					<TableIcons
						cellClass="w-10 {pinCellClass('start')}"
						checked={selectAll.value}
						onCheck={(checked: boolean) => {
							selectAll.value = checked;
						}}
					/>

					{#each displayTableHeaders.filter((header) => header.visible) as header (header.id)}
						{@const colKey = String(header.key)}
						<th
							class="{SMART_TABLE_TH} relative cursor-pointer hover:bg-surface-500/10 dark:hover:bg-surface-800"
							style={smartTable.getColumnWidthStyle(colKey)}
							aria-sort={sorting.sortedBy === header.key
								? sorting.isSorted === 1
									? 'ascending'
									: 'descending'
								: 'none'}
							onclick={() => smartTable.setSort(colKey)}
						>
							<div class="flex items-center justify-center gap-1">
								{header.label}
								{#if sorting.sortedBy === header.key && sorting.isSorted !== 0}
									<iconify-icon
										icon="material-symbols:arrow-upward-rounded"
										width={18}
										class="origin-center duration-300 ease-in-out {sorting.isSorted === -1
											? 'rotate-180'
											: ''}"
									></iconify-icon>
								{/if}
							</div>
							<ColumnResizeHandle columnKey={colKey} onResize={smartTable.setColumnWidth} />
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
							? 'bg-surface-500/10 opacity-60 dark:bg-surface-900/20'
							: ''} {isExpired ? 'bg-error-500/10 dark:bg-error-900/20' : ''} {rowSelected
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
							cellClass="w-10 {pinCellClass('start')}"
							checked={rowSelected}
							onCheck={() => {
								if (rowId) smartTable.toggleSelect(rowId);
							}}
						/>
						{#each displayTableHeaders.filter((header) => header.visible) as header (header.id)}
							<td class={SMART_TABLE_TD} style={smartTable.getColumnWidthStyle(String(header.key))}>
								{#if header.key === 'blocked'}
									{#if showUserList}
										<button
											type="button"
											onclick={() => isUser(row) && toggleUserBlocked(row)}
											aria-label={row.blocked
												? useradmin_click_unblock_user()
												: useradmin_click_block_user()}
											class="cursor-pointer rounded focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:outline-none"
										>
											<Badge preset="tonal" color={row.blocked ? 'error' : 'success'} size="sm">
												{row.blocked ? useradmin_blocked() : useradmin_active()}
											</Badge>
										</button>
									{:else}
										<button
											type="button"
											onclick={(event: MouseEvent) => {
												event.stopPropagation();
												if (isToken(row)) toggleTokenBlocked(row);
											}}
											aria-label={row.blocked
												? useradmin_click_unblock_token()
												: useradmin_click_block_token()}
											class="cursor-pointer rounded focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:outline-none"
										>
											<Badge preset="tonal" color={row.blocked ? 'error' : 'success'} size="sm">
												{row.blocked ? useradmin_blocked() : useradmin_active()}
											</Badge>
										</button>
									{/if}
								{:else if showUserList && header.key === 'avatar'}
									<!-- Centred under its header like every other column -->
									<div class="flex justify-center">
										<Avatar
											src={currentUser && isUser(row) && row._id === currentUser._id
												? normalizeAvatarUrl(currentUser.avatar ?? '/Default_User.svg')
												: isUser(row) && header.key === 'avatar'
													? normalizeAvatarUrl(row.avatar)
													: '/Default_User.svg'}
											initials="Usr"
											size="size-9"
											class="rounded-full shadow-sm ring-2 ring-(--admin-border-default)"
										/>
									</div>
								{:else if header.key === 'role'}
									<Role
										value={isUser(row) && header.key === 'role'
											? row.role
											: isToken(row) && header.key === 'role'
												? (row.role ?? '')
												: ''}
										{roles}
									/>
								{:else if header.key === '_id'}
									<!-- User ID with clipboard functionality and active sessions modal -->
									<div class="flex items-center justify-center gap-1.5">
										<span class="font-mono text-sm"
											>{isUser(row) ? row._id : isToken(row) ? row._id : '-'}</span
										>
										<SystemTooltip title={useradmin_copy_user_id_tooltip()}>
											<Button
												variant="ghost"
												type="button"
												aria-label={useradmin_copy_user_id()}
												onclick={(event: MouseEvent) => {
													event.stopPropagation();
													const val = String(isUser(row) ? row._id : isToken(row) ? row._id : '');
													navigator.clipboard
														.writeText(val)
														.then(() => {
															toast.success(useradmin_user_id_copied());
														})
														.catch(() => {
															toast.error(useradmin_copy_failed());
														});
												}}
												class="p-0! min-w-0"
											>
												<iconify-icon icon="oui:copy-clipboard" width={18}></iconify-icon>
											</Button>
										</SystemTooltip>
										{#if showUserList && isUser(row)}
											<SystemTooltip title={useradmin_manage_sessions_tooltip()}>
												<Button
													variant="ghost"
													type="button"
													aria-label={useradmin_manage_sessions()}
													onclick={(event: MouseEvent) => {
														event.stopPropagation();
														openUserSessions(row);
													}}
													class="p-0! min-w-0 text-primary-500 hover:text-primary-600 dark:text-primary-400"
												>
													<iconify-icon icon="mdi:devices" width={18}></iconify-icon>
												</Button>
											</SystemTooltip>
										{/if}
									</div>
								{:else if header.key === 'token'}
									<!-- Token with clipboard functionality -->
									<div class="flex items-center justify-center gap-2">
										<span class="max-w-50 truncate font-mono text-sm"
											>{isToken(row) && header.key === 'token' ? row.token : '-'}</span
										>
										<SystemTooltip title={useradmin_copy_token_tooltip()}>
											<Button
												variant="ghost"
												type="button"
												aria-label={useradmin_copy_token()}
												onclick={(event: MouseEvent) => {
													event.stopPropagation();
													const val = isToken(row) && header.key === 'token' ? row.token : '';
													navigator.clipboard
														.writeText(val)
														.then(() => {
															toast.success(useradmin_token_copied());
														})
														.catch(() => {
															toast.error(useradmin_copy_failed());
														});
												}}
												class="p-0! min-w-0"
											>
												<iconify-icon icon="oui:copy-clipboard" width={18}></iconify-icon>
											</Button>
										</SystemTooltip>
									</div>
								{:else if ['createdAt', 'updatedAt', 'lastAccess'].includes(String(header.key))}
									{formatDate(
										isUser(row)
											? row[header.key as keyof User]
											: isToken(row)
												? row[header.key as keyof Token]
												: undefined
									)}
								{:else if header.key === 'expires'}
									{#if isToken(row)}
										{#if row.consumed}
											<span
												class="font-bold text-tertiary-500 dark:text-primary-500 flex items-center justify-center gap-1"
											>
												<iconify-icon icon="mdi:check-circle" width={18}></iconify-icon>
												{adminarea_consumed()}
											</span>
										{:else if row.expires}
											{const isTokenExpired = checkTokenExpired(row)}
											{const remainingTime = getRemainingTime(row.expires)}
											<span class={isTokenExpired ? 'font-semibold text-error-500' : ''}>
												{remainingTime}
												{#if isTokenExpired}
													<iconify-icon
														icon="material-symbols:warning"
														width={24}
														class="ms-1 text-error-500"
													></iconify-icon>
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
</AdminCard>
