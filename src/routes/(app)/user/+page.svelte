<!--
@file src/routes/(app)/user/+page.svelte
@component
**Personal account page — tabs under PageTitle**

### Tabs
1. **Identity** — profile, edit, change password, 2FA badge → modal
2. **Security** — sessions, 2FA, auth prefs, permissions
3. **Settings** — appearance, collaboration, privacy/GDPR
4. **User Management** (admin) — Users | Invitations table + expanded toolbar

### Plugin zones
- `user_profile` · `user_security` · `user_preferences` / `user_profile_sidebar`
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import FloatingInput from '@components/ui/floating-input.svelte';
	import Avatar from '@components/ui/avatar.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import Select from '@components/ui/select.svelte';
	import Toggle from '@components/ui/toggle.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import Tabs from '@components/ui/tabs.svelte';
	import Slot from '@src/components/system/slot.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { userThemePrefs } from '@src/stores/theme-store.svelte';
	import { updateUserThemePrefs } from '../config/design-system/appearance-api';
	import { isAdmin } from '@src/databases/auth/constants';
	import {
		adminarea_activesession,
		button_cancel,
		button_confirm,
		button_delete,
		button_refresh,
		common_loading,
		config_tile_design,
		email,
		form_password,
		system_permission,
		twofa_status_disabled,
		twofa_status_enabled,
		twofa_title,
		usermodalconfirmbody,
		usermodalconfirmtitle,
		usermodaluser_edittitle,
		usermodaluser_settingbody,
		username,
		userpage_2fa_manage_aria,
		userpage_2fa_off,
		userpage_2fa_on,
		userpage_2fa_setup_aria,
		userpage_account_deleted,
		userpage_account_removed,
		userpage_action_manage,
		userpage_action_setup,
		userpage_apply_appearance,
		userpage_appearance_applied,
		userpage_authenticators_registered,
		userpage_auth_error,
		userpage_avatar_saved,
		userpage_avatar_updated,
		userpage_card_style,
		userpage_change_password,
		userpage_collaboration,
		userpage_could_not_reach_server,
		userpage_current_password,
		userpage_current_session,
		userpage_current_this_tab,
		userpage_delete_failed,
		userpage_density,
		userpage_density_compact,
		userpage_density_cozy,
		userpage_density_spacious,
		userpage_device_android_phone,
		userpage_device_android_tablet,
		userpage_device_browser,
		userpage_device_chrome,
		userpage_device_chromebook,
		userpage_device_edge,
		userpage_device_firefox,
		userpage_device_ipad,
		userpage_device_iphone,
		userpage_device_linux_pc,
		userpage_device_mac,
		userpage_device_opera,
		userpage_device_pc,
		userpage_device_phone,
		userpage_device_safari,
		userpage_device_tablet,
		userpage_device_unknown,
		userpage_device_windows_pc,
		userpage_edit_profile,
		userpage_edit_user_body,
		userpage_edit_usersetting,
		userpage_editavatar,
		userpage_end_session_aria,
		userpage_end_session_body,
		userpage_end_session_confirm,
		userpage_end_session_title,
		userpage_enable_magic_link,
		userpage_enable_oauth,
		userpage_enable_passkey,
		userpage_enable_rtc,
		userpage_enable_sound,
		userpage_failed_load_sessions,
		userpage_help_2fa,
		userpage_help_2fa_aria,
		userpage_help_appearance,
		userpage_help_appearance_aria,
		userpage_help_avatar,
		userpage_help_card_style,
		userpage_help_card_style_aria,
		userpage_help_collaboration,
		userpage_help_collaboration_aria,
		userpage_help_density,
		userpage_help_density_aria,
		userpage_help_email,
		userpage_help_email_aria,
		userpage_help_high_contrast,
		userpage_help_high_contrast_aria,
		userpage_help_id,
		userpage_help_id_aria,
		userpage_help_magic,
		userpage_help_magic_aria,
		userpage_help_oauth,
		userpage_help_oauth_aria,
		userpage_help_passkeys,
		userpage_help_passkeys_aria,
		userpage_help_passkeys_biometrics_aria,
		userpage_help_password,
		userpage_help_password_aria,
		userpage_help_permissions,
		userpage_help_permissions_aria,
		userpage_help_privacy,
		userpage_help_privacy_aria,
		userpage_help_reduced_motion,
		userpage_help_reduced_motion_aria,
		userpage_help_role,
		userpage_help_role_aria,
		userpage_help_rtc_aria,
		userpage_help_rtc_enabled,
		userpage_help_rtc_sound,
		userpage_help_rtc_sound_aria,
		userpage_help_sessions,
		userpage_help_sessions_aria,
		userpage_help_tenant,
		userpage_help_tenant_aria,
		userpage_help_username,
		userpage_help_username_aria,
		userpage_high_contrast,
		userpage_last_active,
		userpage_login_prefs_title,
		userpage_magic_hint,
		userpage_magic_link,
		userpage_manage_roles_permissions,
		userpage_management_intro,
		userpage_missing_user_id,
		userpage_network_error,
		userpage_no_sessions,
		userpage_not_configured,
		userpage_nothing_to_revoke,
		userpage_oauth_hint,
		userpage_oauth_login,
		userpage_only_this_tab,
		userpage_open_design_system_aria,
		userpage_other_sign_in,
		userpage_passkey_hint,
		userpage_passkeys,
		userpage_passkeys_biometrics_title,
		userpage_password_stored_prefix,
		userpage_password_stored_suffix,
		userpage_preference_disabled,
		userpage_preference_enabled,
		userpage_privacy_action_desc,
		userpage_privacy_action_title,
		userpage_privacy_data_title,
		userpage_privacy_extensions_title,
		userpage_privacy_open_aria,
		userpage_reauth_body,
		userpage_reauth_title,
		userpage_reduced_motion,
		userpage_refresh_sessions_aria,
		userpage_reload_try_again,
		userpage_revoke_all,
		userpage_revoke_all_others_body_plural,
		userpage_revoke_all_others_body_singular,
		userpage_revoke_all_others_title,
		userpage_revoke_confirm,
		userpage_revoke_device_all_aria,
		userpage_revoke_device_body_plural,
		userpage_revoke_device_body_singular,
		userpage_revoke_failed,
		userpage_revoke_group_other_title,
		userpage_revoke_group_title,
		userpage_revoke_other_body_plural,
		userpage_revoke_other_body_singular,
		userpage_revoke_session_body,
		userpage_revoke_session_error,
		userpage_revoke_session_title,
		userpage_save_failed,
		userpage_role_administrator,
		userpage_role_developer,
		userpage_role_editor,
		userpage_role_guest,
		userpage_rtc_editing,
		userpage_security,
		userpage_session_ended,
		userpage_session_signed_in_device,
		userpage_session_this_device,
		userpage_sessions_2fa_title,
		userpage_sessions_by_device_aria,
		userpage_sessions_count,
		userpage_sessions_on_device_aria,
		userpage_sessions_revoked,
		userpage_sessions_revoked_desc,
		userpage_sign_out_all_others_aria,
		userpage_sign_out_device_others_aria,
		userpage_sign_out_others,
		userpage_signed_out,
		userpage_sound_notifications,
		userpage_tab_identity,
		userpage_tab_management,
		userpage_tab_settings,
		userpage_tabs_aria,
		userpage_tenant,
		userpage_theme_default,
		userpage_title,
		userpage_update_failed,
		userpage_variant_bordered,
		userpage_variant_elevated,
		userpage_variant_flat,
		userpage_verification_failed,
		userpage_verifying,
		userpage_workspace_appearance,
		userpage_workspace_collab_title,
		userpage_you_are_here
	} from '@src/paraglide/messages';
	import { normalizeAvatarUrl } from '@utils/avatar';
	import { onMount, untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import { formatDateTime } from '@utils/format-date';
	import AdminArea from './components/admin-area.svelte';
	import ModalTwoFactorAuth from './components/modal-two-factor-auth.svelte';
	import ModalPasskeyManagement from './components/modal-passkey-management.svelte';
	import { setCollection } from '@src/stores/collection-store.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { globalSearch } from '@utils/global-search-index.svelte';
	import { modalState, showConfirm } from '@utils/modal.svelte';
	import ModalEditAvatar from './components/modal-edit-avatar.svelte';
	import ModalEditForm from './components/modal-edit-form.svelte';
	import ModalPrivacyData from './components/modal-privacy-data.svelte';
	import { getActiveSessions, revokeSession, reauthForSessionManagement } from './user.remote';

	const { data } = $props();
	const serverUser = $derived(data.user);
	const isFirstUser = $derived(data.isFirstUser);
	const isMultiTenant = $derived(data.isMultiTenant);
	const is2FAEnabledGlobal = $derived(data.is2FAEnabledGlobal);

	type AccountTab = 'identity' | 'security' | 'settings' | 'management';
	let activeTab = $state<AccountTab>('identity');

	// Compact appearance prefs (full layout editor lives on Design System → My Overrides).
	// untrack: one-time seed from page data — avoids state_referenced_locally on $props().
	const initialThemePrefs = untrack(
		() =>
			(data.user?.preferences?.theme ?? {}) as {
				density?: string;
				variant?: string;
				reducedMotion?: boolean;
				highContrast?: boolean;
			}
	);
	let myDensity = $state(initialThemePrefs.density ?? '');
	let myVariant = $state(initialThemePrefs.variant ?? '');
	let myReducedMotion = $state(initialThemePrefs.reducedMotion ?? false);
	let myHighContrast = $state(initialThemePrefs.highContrast ?? false);
	let savingAppearance = $state(false);

	async function saveQuickAppearance() {
		savingAppearance = true;
		try {
			const prefs: Record<string, unknown> = {
				reducedMotion: myReducedMotion,
				highContrast: myHighContrast
			};
			if (myDensity) prefs.density = myDensity;
			if (myVariant) prefs.variant = myVariant;
			const res = await updateUserThemePrefs(prefs);
			if (!res.success) throw new Error(res.message || userpage_save_failed());
			userThemePrefs.apply(prefs as any);
			toast.success(userpage_appearance_applied());
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : String(e));
		} finally {
			savingAppearance = false;
		}
	}

	const rolePermissionFallback = $derived.by(() => {
		const roles = (data.roles ?? []) as Array<{
			_id?: string;
			name?: string;
			permissions?: string[];
		}>;
		const roleKey = serverUser?.role;
		const match = roles.find((r) => r._id === roleKey || r.name === roleKey);
		return Array.isArray(match?.permissions) ? match.permissions : [];
	});

	const user = $derived({
		_id: serverUser?._id ?? '',
		email: serverUser?.email ?? '',
		username: serverUser?.username ?? '',
		role: serverUser?.role ?? '',
		avatar: serverUser?.avatar ?? '/Default_User.svg',
		tenantId: serverUser?.tenantId ?? '',
		is2FAEnabled: serverUser?.is2FAEnabled ?? false,
		isAdmin: serverUser?.isAdmin ?? false,
		authenticators: serverUser?.authenticators ?? [],
		permissions:
			Array.isArray(serverUser?.permissions) && serverUser.permissions.length > 0
				? (serverUser.permissions as string[])
				: rolePermissionFallback.length > 0
					? rolePermissionFallback
					: serverUser?.isAdmin
						? ['system:admin', 'user:read', 'user:write', 'config:settings']
						: []
	});

	const canManageUsers = $derived(
		isAdmin(user) ||
			isAdmin(data) ||
			(data as { permissions?: Record<string, { hasPermission?: boolean }> }).permissions?.[
				'config/adminArea'
			]?.hasPermission === true
	);

	const accountTabs = $derived([
		{
			id: 'identity',
			label: userpage_tab_identity(),
			shortLabel: userpage_tab_identity(),
			icon: 'mdi:account-circle-outline'
		},
		{
			id: 'security',
			label: userpage_security(),
			shortLabel: userpage_security(),
			icon: 'mdi:shield-lock-outline'
		},
		{
			id: 'settings',
			label: userpage_tab_settings(),
			shortLabel: userpage_tab_settings(),
			icon: 'mdi:cog-outline'
		},
		...(canManageUsers
			? [
					{
						id: 'management',
						label: userpage_tab_management(),
						shortLabel: userpage_action_manage(),
						icon: 'mdi:account-group-outline'
					}
				]
			: [])
	]);

	type SessionRow = {
		_id?: string;
		id?: string;
		isCurrent?: boolean;
		userAgent?: string;
		ip?: string;
		ipAddress?: string;
		createdAt?: string;
		lastAccess?: string;
		lastActiveAt?: string;
	};
	let sessions = $state<SessionRow[]>([]);
	let sessionsLoading = $state(false);
	let sessionsError = $state<string | null>(null);

	/** Normalize API session rows for grouping + display (field aliases, single current). */
	function normalizeSessions(raw: SessionRow[]): SessionRow[] {
		const rows = raw.map((s) => {
			const sid = String(s._id ?? s.id ?? '');
			return {
				...s,
				_id: sid,
				id: sid,
				ip: s.ip ?? s.ipAddress,
				lastAccess: s.lastAccess ?? s.lastActiveAt ?? s.createdAt,
				userAgent: s.userAgent ?? '',
				isCurrent: !!s.isCurrent
			};
		});
		// Client safety net: never show two "current" badges
		let saw = false;
		for (const r of rows) {
			if (r.isCurrent) {
				if (saw) r.isCurrent = false;
				else saw = true;
			}
		}
		return rows;
	}

	async function loadSessions(): Promise<void> {
		sessionsLoading = true;
		sessionsError = null;
		try {
			const result = await getActiveSessions(undefined as any);
			if (result.error) {
				sessionsError = result.error;
				sessions = [];
			} else {
				sessions = normalizeSessions((result.sessions ?? []) as SessionRow[]);
			}
		} catch (err) {
			sessionsError = err instanceof Error ? err.message : userpage_failed_load_sessions();
			sessions = [];
		} finally {
			sessionsLoading = false;
		}
	}

	type DeviceKind = 'phone' | 'tablet' | 'pc' | 'mac' | 'unknown';

	type DeviceInfo = {
		/** Group key for merging sessions on the same physical browser/device */
		key: string;
		/** e.g. Mac, Windows PC, iPhone, Android tablet */
		deviceLabel: string;
		/** phone | tablet | pc | mac */
		kind: DeviceKind;
		browser: string;
		icon: string;
		title: string;
	};

	/** Parse UA → Mac / PC / phone / tablet + browser for readable device rows */
	function parseDevice(uaRaw: string | undefined): DeviceInfo {
		const ua = uaRaw?.trim() ?? '';
		if (!ua) {
			return {
				key: 'unknown',
				deviceLabel: userpage_device_unknown(),
				kind: 'unknown',
				browser: userpage_device_browser(),
				icon: 'mdi:monitor',
				title: userpage_device_unknown()
			};
		}

		let browser = userpage_device_browser();
		if (/Edg\//i.test(ua)) browser = userpage_device_edge();
		else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = userpage_device_opera();
		else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = userpage_device_chrome();
		else if (/Firefox\//i.test(ua)) browser = userpage_device_firefox();
		else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = userpage_device_safari();

		let kind: DeviceKind = 'pc';
		let deviceLabel = userpage_device_pc();
		let icon = 'mdi:monitor';

		if (/iPhone/i.test(ua)) {
			kind = 'phone';
			deviceLabel = userpage_device_iphone();
			icon = 'mdi:cellphone';
		} else if (/iPad/i.test(ua)) {
			kind = 'tablet';
			deviceLabel = userpage_device_ipad();
			icon = 'mdi:tablet';
		} else if (/Android/i.test(ua)) {
			if (/Mobile/i.test(ua) && !/Tablet/i.test(ua)) {
				kind = 'phone';
				deviceLabel = userpage_device_android_phone();
				icon = 'mdi:cellphone';
			} else {
				kind = 'tablet';
				deviceLabel = userpage_device_android_tablet();
				icon = 'mdi:tablet';
			}
		} else if (/Macintosh|Mac OS X/i.test(ua)) {
			// iPadOS 13+ can spoof Mac — MobileSafari without mobile token is still Mac-like
			if (/Mobile\//i.test(ua) && /Safari/i.test(ua)) {
				kind = 'tablet';
				deviceLabel = userpage_device_ipad();
				icon = 'mdi:tablet';
			} else {
				kind = 'mac';
				deviceLabel = userpage_device_mac();
				icon = 'mdi:apple';
			}
		} else if (/Windows NT/i.test(ua)) {
			kind = 'pc';
			deviceLabel = userpage_device_windows_pc();
			icon = 'mdi:microsoft-windows';
		} else if (/CrOS/i.test(ua)) {
			kind = 'pc';
			deviceLabel = userpage_device_chromebook();
			icon = 'mdi:laptop';
		} else if (/Linux/i.test(ua)) {
			kind = 'pc';
			deviceLabel = userpage_device_linux_pc();
			icon = 'mdi:linux';
		} else if (/Mobile|webOS|BlackBerry/i.test(ua)) {
			kind = 'phone';
			deviceLabel = userpage_device_phone();
			icon = 'mdi:cellphone';
		} else if (/Tablet/i.test(ua)) {
			kind = 'tablet';
			deviceLabel = userpage_device_tablet();
			icon = 'mdi:tablet';
		}

		const key = `${kind}|${deviceLabel}|${browser}|${ua.slice(0, 80)}`;
		return {
			key,
			deviceLabel,
			kind,
			browser,
			icon,
			title: `${deviceLabel} · ${browser}`
		};
	}

	function sessionWhen(session: SessionRow): string {
		const raw = session.lastAccess || session.createdAt;
		if (!raw) return '';
		return formatDateTime(raw, { dateStyle: 'medium', timeStyle: 'short' });
	}

	function sessionWhenMs(session: SessionRow): number {
		const raw = session.lastAccess || session.createdAt;
		if (!raw) return 0;
		const t = new Date(raw).getTime();
		return Number.isNaN(t) ? 0 : t;
	}

	/** One row per device/browser (merge duplicate tabs/sessions on the same machine) */
	type SessionGroup = {
		key: string;
		title: string;
		icon: string;
		deviceLabel: string;
		browser: string;
		isCurrent: boolean;
		ip?: string;
		lastActiveLabel: string;
		sessionCount: number;
		/** Individual sessions in this device group (for expandable list) */
		members: SessionRow[];
		/** Sessions that can be revoked (non-current) */
		revokableIds: string[];
		primaryId: string;
	};

	const sessionGroups = $derived.by((): SessionGroup[] => {
		const map = new Map<string, SessionRow[]>();
		for (const s of sessions) {
			const info = parseDevice(s.userAgent);
			// Missing UA: still group all “current” together so we don’t list this-tab twice
			const key =
				info.key === 'unknown'
					? s.isCurrent
						? 'current-unknown'
						: `orphan-${String(s._id ?? s.id ?? 'unknown')}`
					: `${info.key}|${s.ip ?? ''}`;
			const list = map.get(key) ?? [];
			list.push(s);
			map.set(key, list);
		}

		const groups: SessionGroup[] = [];
		for (const [key, list] of map) {
			const sorted = [...list].sort((a, b) => sessionWhenMs(b) - sessionWhenMs(a));
			const newest = sorted[0];
			const info = parseDevice(newest.userAgent);
			const isCurrent = list.some((s) => s.isCurrent);
			const revokableIds = list
				.filter((s) => !s.isCurrent)
				.map((s) => String(s._id ?? s.id ?? ''))
				.filter(Boolean);
			const last = sessionWhen(newest);
			const title =
				info.key === 'unknown'
					? isCurrent
						? userpage_session_this_device()
						: userpage_session_signed_in_device()
					: info.title;

			groups.push({
				key,
				title,
				icon: info.icon,
				deviceLabel: info.deviceLabel,
				browser: info.browser,
				isCurrent,
				ip: newest.ip,
				lastActiveLabel: last,
				sessionCount: list.length,
				members: sorted,
				revokableIds,
				primaryId: String(newest._id ?? newest.id ?? key)
			});
		}

		// Current device first, then by last active
		return groups.sort((a, b) => {
			if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
			return 0;
		});
	});

	/**
	 * Session member lists are always expanded in the UI.
	 * Individual session revoke buttons removed — one group-level button per device.
	 */

	async function revokeSessionIds(ids: string[], reauthToken?: string): Promise<boolean> {
		for (const id of ids) {
			if (!id) continue;
			try {
				const result = await revokeSession({ sessionId: id, reauthToken });
				if (!result.success) {
					toast.error({
						title: userpage_revoke_failed(),
						description: result.error || userpage_revoke_session_error()
					});
					return false;
				}
			} catch (err) {
				toast.error({
					title: userpage_revoke_failed(),
					description: err instanceof Error ? err.message : userpage_revoke_session_error()
				});
				return false;
			}
		}
		return true;
	}

	/** Revoke one session. Current session → confirm + end this login (redirect to /login). */
	function handleRevokeSession(member: SessionRow): void {
		const mid = String(member._id ?? member.id ?? '');
		if (!mid) return;

		if (member.isCurrent) {
			showConfirm({
				title: userpage_end_session_title(),
				body: userpage_end_session_body(),
				theme: { variant: 'filled', color: 'warning' },
				confirmText: userpage_end_session_confirm(),
				onConfirm: async () => {
					const ok = await revokeSessionIds([mid]);
					if (!ok) return;
					toast.success({ title: userpage_signed_out(), description: userpage_session_ended() });
					window.location.href = '/login';
				}
			});
			return;
		}

		showConfirm({
			title: userpage_revoke_session_title(),
			body: userpage_revoke_session_body(),
			theme: { variant: 'filled', color: 'error' },
			confirmText: userpage_revoke_confirm(),
			onConfirm: () => requestReauthAndRevoke([mid])
		});
	}

	/** Revoke all non-current sessions in a device group (or whole remote device). */
	function handleRevokeGroup(group: SessionGroup): void {
		const ids = group.revokableIds;
		if (ids.length === 0) {
			// Entire group is only the current tab — offer end session
			const current = group.members.find((m) => m.isCurrent);
			if (current) handleRevokeSession(current);
			return;
		}

		const body = group.isCurrent
			? ids.length === 1
				? userpage_revoke_other_body_singular({ count: ids.length })
				: userpage_revoke_other_body_plural({ count: ids.length })
			: group.sessionCount === 1
				? userpage_revoke_device_body_singular({
						count: group.sessionCount,
						device: group.deviceLabel
					})
				: userpage_revoke_device_body_plural({
						count: group.sessionCount,
						device: group.deviceLabel
					});

		showConfirm({
			title: group.isCurrent ? userpage_revoke_group_other_title() : userpage_revoke_group_title(),
			body,
			theme: { variant: 'filled', color: 'error' },
			confirmText: group.isCurrent ? userpage_sign_out_others() : userpage_revoke_all(),
			onConfirm: () => requestReauthAndRevoke(ids)
		});
	}

	/** Revoke every session that is not this browser tab. */
	function handleRevokeAllOthers(): void {
		const others = sessions
			.filter((s) => !s.isCurrent)
			.map((s) => String(s._id ?? s.id ?? ''))
			.filter(Boolean);
		if (others.length === 0) {
			toast.warning({
				title: userpage_nothing_to_revoke(),
				description: userpage_only_this_tab()
			});
			return;
		}
		showConfirm({
			title: userpage_revoke_all_others_title(),
			body:
				others.length === 1
					? userpage_revoke_all_others_body_singular({ count: others.length })
					: userpage_revoke_all_others_body_plural({ count: others.length }),
			theme: { variant: 'filled', color: 'error' },
			confirmText: userpage_sign_out_others(),
			onConfirm: () => requestReauthAndRevoke(others)
		});
	}

	// ── Re-authentication for cross-session revocation (Laravel-style) ────────
	let reauthOpen = $state(false);
	let reauthPassword = $state('');
	let reauthShowPassword = $state(false);
	let reauthError = $state('');
	let reauthBusy = $state(false);
	let pendingRevokeIds: string[] = $state([]);

	/** After the user confirms the revoke, ask for the password proof once. */
	async function requestReauthAndRevoke(ids: string[]): Promise<void> {
		pendingRevokeIds = ids;
		reauthPassword = '';
		reauthError = '';
		reauthOpen = true;
	}

	async function submitReauthAndRevoke(): Promise<void> {
		reauthBusy = true;
		reauthError = '';
		try {
			const res = await reauthForSessionManagement(reauthPassword);
			if (!res.token) {
				reauthError = res.error || userpage_verification_failed();
				return;
			}
			reauthOpen = false;
			const ok = await revokeSessionIds(pendingRevokeIds, res.token);
			if (ok) {
				toast.success({
					title: userpage_sessions_revoked(),
					description: userpage_sessions_revoked_desc()
				});
				await loadSessions();
			}
		} finally {
			reauthBusy = false;
		}
	}

	const otherSessionCount = $derived(sessions.filter((s) => !s.isCurrent).length);

	/** Setup-style help icon next to a field label */
	function helpTitle(key: string): string {
		const help: Record<string, string> = {
			'2fa': userpage_help_2fa(),
			sessions: userpage_help_sessions(),
			passkeys: userpage_help_passkeys(),
			magic: userpage_help_magic(),
			oauth: userpage_help_oauth(),
			permissions: userpage_help_permissions(),
			appearance: userpage_help_appearance(),
			collaboration: userpage_help_collaboration(),
			'rtc-enabled': userpage_help_rtc_enabled(),
			'rtc-sound': userpage_help_rtc_sound(),
			privacy: userpage_help_privacy(),
			avatar: userpage_help_avatar(),
			role: userpage_help_role(),
			id: userpage_help_id(),
			tenant: userpage_help_tenant(),
			username: userpage_help_username(),
			email: userpage_help_email(),
			password: userpage_help_password(),
			density: userpage_help_density(),
			'card-style': userpage_help_card_style(),
			'reduced-motion': userpage_help_reduced_motion(),
			'high-contrast': userpage_help_high_contrast()
		};
		return help[key] ?? '';
	}

	/** Compact help control — same pattern as Security / Setup */
	const helpBtnClass =
		'ms-0.5 shrink-0 text-surface-400 hover:text-tertiary-500 dark:hover:text-primary-500';

	const roleDisplay = $derived.by(() => {
		const r = String(user.role).toLowerCase();
		switch (r) {
			case 'admin':
				return { icon: 'material-symbols:verified-outline', name: userpage_role_administrator() };
			case 'developer':
				return { icon: 'material-symbols:code', name: userpage_role_developer() };
			case 'editor':
				return { icon: 'material-symbols:edit', name: userpage_role_editor() };
			case 'guest':
				return { icon: 'material-symbols:person', name: userpage_role_guest() };
			default:
				return { icon: 'material-symbols:person', name: user.role };
		}
	});

	function open2FAModal(): void {
		modalState.trigger(ModalTwoFactorAuth, { user, size: 'fullscreen' }, async (r: any) => {
			if (r) await refreshAll();
		});
	}

	function openPasskeyModal(): void {
		modalState.trigger(ModalPasskeyManagement, {
			user,
			onSuccess: async () => {
				await refreshAll();
			}
		});
	}

	async function updateRtcPreference(key: string, value: boolean) {
		const isAuth = ['passkeyEnabled', 'magicLinkEnabled', 'oauthEnabled'].includes(key);
		const prefs = serverUser?.preferences as Record<string, any> | undefined;
		const newUserData = {
			preferences: {
				...prefs,
				...(isAuth
					? { auth: { ...prefs?.auth, [key]: value } }
					: { rtc: { ...prefs?.rtc, [key]: value } })
			}
		};

		try {
			const res = await fetch('/api/user/update-user-attributes', {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': page.data.csrfToken
				},
				body: JSON.stringify({ user_id: 'self', newUserData })
			});

			if (res.ok) {
				if (value) {
					toast.success({
						title: twofa_status_enabled(),
						description: userpage_preference_enabled({ key })
					});
				} else {
					toast.warning({
						title: twofa_status_disabled(),
						description: userpage_preference_disabled({ key })
					});
				}
				await refreshAll();
			} else if (res.status === 401 || res.status === 403) {
				toast.error({ title: userpage_auth_error(), description: userpage_reload_try_again() });
			} else {
				const body = await res.json().catch(() => ({}));
				toast.error({
					title: userpage_update_failed(),
					description: (body as any).message || `HTTP ${res.status}`
				});
			}
		} catch (err) {
			toast.error({
				title: userpage_network_error(),
				description: err instanceof Error ? err.message : userpage_could_not_reach_server()
			});
		}
	}

	function executeActions() {
		const actions = globalSearch.triggerActions;
		if (actions.length === 1) {
			actions[0]();
		} else {
			for (const action of actions) action();
		}
		globalSearch.clearTriggerActions();
	}

	onMount(() => {
		if (globalSearch.triggerActions.length > 0) executeActions();
		setCollection(null);
		loadSessions().catch(() => {});
	});

	function modalUserForm(): void {
		modalState.trigger(ModalEditForm, {
			title: usermodaluser_edittitle(),
			body: usermodaluser_settingbody() || userpage_edit_user_body()
		});
	}

	function modalEditAvatar(): void {
		modalState.trigger(
			ModalEditAvatar,
			{
				title: userpage_editavatar(),
				size: 'lg'
			},
			async (r: any) => {
				if (r) {
					toast.success({
						title: userpage_avatar_updated(),
						description: userpage_avatar_saved()
					});
					await refreshAll();
				}
			}
		);
	}

	function modalPrivacyData(): void {
		modalState.trigger(ModalPrivacyData as any, { user });
	}

	function modalConfirm(): void {
		showConfirm({
			title: usermodalconfirmtitle(),
			body: usermodalconfirmbody(),
			theme: { variant: 'filled', color: 'error' },
			onConfirm: async () => {
				if (!user._id) {
					toast.error({ title: userpage_delete_failed(), description: userpage_missing_user_id() });
					return;
				}
				try {
					const res = await fetch('/api/user/batch', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'X-CSRF-Token': page.data.csrfToken || ''
						},
						body: JSON.stringify({ userIds: [user._id], action: 'delete' })
					});
					if (res.ok) {
						toast.success({
							title: userpage_account_deleted(),
							description: userpage_account_removed()
						});
						await refreshAll();
						window.location.href = '/login';
						return;
					}
					const body = await res.json().catch(() => ({}));
					toast.error({
						title: userpage_delete_failed(),
						description: (body as { message?: string }).message || `HTTP ${res.status}`
					});
				} catch (err) {
					toast.error({
						title: userpage_network_error(),
						description: err instanceof Error ? err.message : userpage_could_not_reach_server()
					});
				}
			}
		});
	}

	const cardClass = 'border border-surface-500/30 dark:border-surface-500/40 p-5 sm:p-6 shadow-sm';
	const rowClass =
		'flex items-center justify-between gap-3 py-3 border-b border-surface-100 dark:border-surface-500/40 last:border-0';
	/** Equal width for Security row actions (Setup / Manage / Refresh) */
	const securityActionBtn = 'min-w-[5.5rem] justify-center shrink-0';
	/** Row lead icons: tertiary (light) / primary (dark) */
	const securityRowIcon = 'shrink-0 text-tertiary-500 dark:text-primary-500';
</script>

<AdminPageShell
	title={userpage_title()}
	icon="mdi:account-circle"
	showBackButton={true}
	backUrl="/config"
>
	<div in:fade={{ duration: 250 }} class="flex flex-col gap-2" data-testid="user-account-page">
		<!-- Tabs directly under PageTitle -->
		<Tabs
			tabs={accountTabs}
			bind:activeTab
			variant="underline"
			ariaLabel={userpage_tabs_aria()}
			testId="user-account-tabs"
			onTabChange={(id) => {
				activeTab = id as AccountTab;
			}}
		/>

		<div id="tabpanel-{activeTab}" role="tabpanel" class="min-w-0" data-testid="user-tab-panel">
			{#if activeTab === 'identity'}
				<!-- ═══ TAB 1: Identity — left: avatar + equal badges · right: fields ═══ -->
				<AdminCard class={cardClass} data-testid="user-identity-panel">
					<div
						class="grid grid-cols-1 gap-4 md:grid-cols-[minmax(10rem,12rem)_1fr] md:items-start md:gap-8 lg:gap-10"
					>
						<!-- Left: centered avatar + badges; edit pen is its own control (hit area outside circle) -->
						<div class="flex flex-col items-center gap-3">
							<div class="relative mx-auto size-28 shrink-0">
								<button
									type="button"
									onclick={modalEditAvatar}
									aria-label={userpage_editavatar()}
									title={userpage_editavatar()}
									data-testid="edit-avatar-btn"
									class="size-full rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
								>
									<Avatar
										src={normalizeAvatarUrl(user.avatar)}
										initials={user.username?.slice(0, 2).toUpperCase() || 'AV'}
										size="size-28"
										class="size-full rounded-full border-2 border-surface-500/30 shadow-md pointer-events-none dark:border-surface-600"
									/>
								</button>
								<!-- Pencil outside circle hit area — positioned shell + SystemTooltip + real button -->
								<div class="absolute -inset-e-1 -top-1 z-20">
									<SystemTooltip
										title={helpTitle('avatar')}
										positioning={{ placement: 'top', gutter: 8 }}
									>
										<button
											type="button"
											onclick={(e) => {
												e.preventDefault();
												e.stopPropagation();
												modalEditAvatar();
											}}
											aria-label={userpage_editavatar()}
											title={userpage_editavatar()}
											data-testid="edit-avatar-pencil-btn"
											class="flex size-8 items-center justify-center rounded-full bg-tertiary-500 text-white shadow-md ring-2 ring-surface-50 transition-transform hover:scale-105 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:bg-primary-500 dark:ring-surface-900"
										>
											<iconify-icon icon="bi:pencil-fill" width={13} aria-hidden="true"
											></iconify-icon>
										</button>
									</SystemTooltip>
								</div>
							</div>

							<div class="flex w-full max-w-48 flex-col gap-2" data-testid="user-identity-badges">
								<!-- Shared height/width: white label text on filled chips -->
								<span data-testid="user-role-badge" class="block w-full">
									<span
										class="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded bg-primary-500 px-3 text-xs font-bold uppercase tracking-wide text-white"
									>
										<iconify-icon icon={roleDisplay.icon} width={16} aria-hidden="true"
										></iconify-icon>
										{roleDisplay.name}
										<SystemTooltip title={helpTitle('role')}>
											<button
												type="button"
												tabindex="-1"
												aria-label={userpage_help_role_aria()}
												class="text-white/80 hover:text-white"
											>
												<iconify-icon icon="mdi:help-circle-outline" width={14} aria-hidden="true"
												></iconify-icon>
											</button>
										</SystemTooltip>
									</span>
								</span>
								<span data-testid="user-id-badge" class="block w-full">
									<span
										class="inline-flex h-9 w-full items-center justify-center gap-1 rounded bg-tertiary-600 px-3 font-mono text-[11px] font-bold tracking-wide text-white dark:bg-tertiary-500"
										title={String(user._id)}
									>
										ID: {String(user._id).slice(0, 12)}…
										<SystemTooltip title={helpTitle('id')}>
											<button
												type="button"
												tabindex="-1"
												aria-label={userpage_help_id_aria()}
												class="text-white/80 hover:text-white"
											>
												<iconify-icon icon="mdi:help-circle-outline" width={14} aria-hidden="true"
												></iconify-icon>
											</button>
										</SystemTooltip>
									</span>
								</span>
								{#if isMultiTenant && user.tenantId}
									<span data-testid="user-tenant-badge" class="block w-full">
										<span
											class="inline-flex h-9 w-full items-center justify-center gap-1 rounded-full bg-secondary-600 px-3 font-mono text-[11px] font-bold tracking-wide text-white"
										>
											{userpage_tenant()}
											{String(user.tenantId).slice(0, 12)}…
											<SystemTooltip title={helpTitle('tenant')}>
												<button
													type="button"
													tabindex="-1"
													aria-label={userpage_help_tenant_aria()}
													class="text-white/80 hover:text-white"
												>
													<iconify-icon icon="mdi:help-circle-outline" width={14} aria-hidden="true"
													></iconify-icon>
												</button>
											</SystemTooltip>
										</span>
									</span>
								{/if}
								{#if is2FAEnabledGlobal}
									<button
										type="button"
										onclick={open2FAModal}
										data-testid="identity-2fa-badge-btn"
										aria-label={user.is2FAEnabled
											? userpage_2fa_manage_aria()
											: userpage_2fa_setup_aria()}
										class="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-xs font-bold uppercase tracking-wide text-white transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 {user.is2FAEnabled
											? 'bg-primary-600 dark:bg-primary-500'
											: 'bg-warning-600 dark:bg-warning-500'}"
									>
										<iconify-icon
											icon={user.is2FAEnabled ? 'mdi:shield-check' : 'mdi:shield-alert-outline'}
											width={16}
											aria-hidden="true"
										></iconify-icon>
										{user.is2FAEnabled ? userpage_2fa_on() : userpage_2fa_off()}
									</button>
								{/if}
							</div>
						</div>

						<!-- Right: username · email · password (static mask, no reveal) -->
						<div class="flex min-w-0 flex-col gap-4">
							<div
								class="w-full rounded-xl border border-surface-500/30 px-4 py-3 dark:border-surface-500/40"
							>
								<p
									class="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-surface-500"
								>
									<iconify-icon
										icon="mdi:account"
										width={14}
										class="text-tertiary-500 dark:text-primary-500"
										aria-hidden="true"
									></iconify-icon>
									{username()}
									<SystemTooltip title={helpTitle('username')}>
										<button
											type="button"
											tabindex="-1"
											aria-label={userpage_help_username_aria()}
											class={helpBtnClass}
										>
											<iconify-icon icon="mdi:help-circle-outline" width={14} aria-hidden="true"
											></iconify-icon>
										</button>
									</SystemTooltip>
								</p>
								<p
									class="w-full text-base font-medium text-surface-900 dark:text-surface-100"
									data-testid="profile-username"
								>
									{user.username || '—'}
								</p>
							</div>

							<div
								class="w-full rounded-xl border border-surface-500/30 px-4 py-3 dark:border-surface-500/40"
							>
								<p
									class="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-surface-500"
								>
									<iconify-icon
										icon="mdi:email-outline"
										width={14}
										class="text-tertiary-500 dark:text-primary-500"
										aria-hidden="true"
									></iconify-icon>
									{email()}
									<SystemTooltip title={helpTitle('email')}>
										<button
											type="button"
											tabindex="-1"
											aria-label={userpage_help_email_aria()}
											class={helpBtnClass}
										>
											<iconify-icon icon="mdi:help-circle-outline" width={14} aria-hidden="true"
											></iconify-icon>
										</button>
									</SystemTooltip>
								</p>
								<p
									class="w-full break-all text-base font-medium text-surface-900 dark:text-surface-100"
									data-testid="profile-email"
								>
									{user.email || '—'}
								</p>
							</div>

							<!-- Password never shown in plain text — use Change password only -->
							<div
								class="w-full rounded-xl border border-surface-500/30 px-4 py-3 dark:border-surface-500/40"
								data-testid="profile-password-field"
							>
								<p
									class="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-surface-500"
								>
									<iconify-icon
										icon="mdi:key-variant"
										width={14}
										class="text-tertiary-500 dark:text-primary-500"
										aria-hidden="true"
									></iconify-icon>
									{form_password()}
									<SystemTooltip title={helpTitle('password')}>
										<button
											type="button"
											tabindex="-1"
											aria-label={userpage_help_password_aria()}
											class={helpBtnClass}
										>
											<iconify-icon icon="mdi:help-circle-outline" width={14} aria-hidden="true"
											></iconify-icon>
										</button>
									</SystemTooltip>
								</p>
								<p class="font-mono text-base tracking-widest text-surface-500" aria-hidden="true">
									••••••••••••
								</p>
								<p class="mt-1 text-xs text-surface-500">
									{userpage_password_stored_prefix()}
									<strong class="font-medium text-surface-600 dark:text-surface-400"
										>{userpage_change_password()}</strong
									>
									{userpage_password_stored_suffix()}
								</p>
							</div>

							<div class="flex w-full flex-wrap items-center justify-between gap-3 pt-1">
								<Button
									variant="primary"
									leadingIcon="bi:pencil-fill"
									onclick={modalUserForm}
									aria-label={userpage_edit_usersetting()}
									data-testid="edit-user-settings-btn"
								>
									{userpage_edit_profile()}
								</Button>
								<Button
									variant="surface"
									leadingIcon="mdi:key-variant"
									onclick={modalUserForm}
									data-testid="security-change-password"
									aria-label={userpage_change_password()}
								>
									{userpage_change_password()}
								</Button>
							</div>

							<div data-testid="slot-user_profile" data-zone="user_profile">
								<Slot name="user_profile" props={{ user }} />
							</div>

							{#if isFirstUser}
								<div class="border-t border-surface-500/30 pt-4 dark:border-surface-500/40">
									<Button
										variant="outline"
										size="sm"
										leadingIcon="bi:trash3-fill"
										onclick={modalConfirm}
										class="w-full justify-start text-error-500 border-error-500/40 hover:bg-error-500/10 sm:w-auto"
										data-testid="identity-delete-account-btn"
									>
										{button_delete()}
									</Button>
								</div>
							{/if}
						</div>
					</div>
				</AdminCard>
			{:else if activeTab === 'security'}
				<!-- ═══ TAB 2: Security — help icons match /setup pattern ═══ -->
				<div class="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="user-security-panel">
					<AdminCard class={cardClass}>
						<h3 class="mb-3 text-sm font-semibold uppercase tracking-wider">
							{userpage_sessions_2fa_title()}
						</h3>
						<div class="space-y-1">
							{#if is2FAEnabledGlobal}
								<div class={rowClass} data-testid="security-2fa-section">
									<div class="flex min-w-0 items-center gap-3">
										<iconify-icon
											icon="mdi:two-factor-authentication"
											class={securityRowIcon}
											width={20}
											aria-hidden="true"
										></iconify-icon>
										<div class="min-w-0">
											<p
												class="flex items-center gap-1 text-sm font-medium text-surface-900 dark:text-surface-100"
											>
												{twofa_title()}
												<SystemTooltip title={helpTitle('2fa')}>
													<button
														type="button"
														tabindex="-1"
														aria-label={userpage_help_2fa_aria()}
														class="ms-0.5 text-surface-400 hover:text-tertiary-500 dark:hover:text-primary-500"
													>
														<iconify-icon
															icon="mdi:help-circle-outline"
															width={16}
															aria-hidden="true"
														></iconify-icon>
													</button>
												</SystemTooltip>
											</p>
											<p
												class="text-xs {user.is2FAEnabled
													? 'text-primary-600 dark:text-primary-500'
													: 'text-surface-500'}"
											>
												{user.is2FAEnabled ? twofa_status_enabled() : userpage_not_configured()}
											</p>
										</div>
									</div>
									<Button
										variant="surface"
										size="sm"
										onclick={open2FAModal}
										class="{securityActionBtn} {user.is2FAEnabled
											? 'text-primary-600 dark:text-primary-500'
											: ''}"
										data-testid="security-2fa-btn"
									>
										{user.is2FAEnabled ? userpage_action_manage() : userpage_action_setup()}
									</Button>
								</div>
							{/if}

							<div class={rowClass} data-testid="security-passkey-section">
								<div class="flex min-w-0 items-center gap-3">
									<iconify-icon
										icon="mdi:fingerprint"
										class={securityRowIcon}
										width={20}
										aria-hidden="true"
									></iconify-icon>
									<div class="min-w-0">
										<p
											class="flex items-center gap-1 text-sm font-medium text-surface-900 dark:text-surface-100"
										>
											{userpage_passkeys_biometrics_title()}
											<SystemTooltip title={helpTitle('passkeys')}>
												<button
													type="button"
													tabindex="-1"
													aria-label={userpage_help_passkeys_biometrics_aria()}
													class="ms-0.5 text-surface-400 hover:text-tertiary-500 dark:hover:text-primary-500"
												>
													<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"
													></iconify-icon>
												</button>
											</SystemTooltip>
										</p>
										<p
											class="text-xs {(user.authenticators?.length ?? 0) > 0
												? 'text-primary-600 dark:text-primary-500'
												: 'text-surface-500'}"
										>
											{(user.authenticators?.length ?? 0) > 0
												? userpage_authenticators_registered({ count: user.authenticators.length })
												: userpage_not_configured()}
										</p>
									</div>
								</div>
								<Button
									variant="surface"
									size="sm"
									onclick={openPasskeyModal}
									class="{securityActionBtn} {(user.authenticators?.length ?? 0) > 0
										? 'text-primary-600 dark:text-primary-500'
										: ''}"
									data-testid="security-passkey-btn"
								>
									{(user.authenticators?.length ?? 0) > 0
										? userpage_action_manage()
										: userpage_action_setup()}
								</Button>
							</div>

							<div class="py-3" data-testid="active-sessions-section">
								<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
									<div class="flex min-w-0 items-center gap-2">
										<iconify-icon
											icon="mdi:devices"
											class={securityRowIcon}
											width={20}
											aria-hidden="true"
										></iconify-icon>
										<p
											class="flex items-center gap-1 text-sm font-medium text-surface-900 dark:text-surface-100"
										>
											{adminarea_activesession()}
											<SystemTooltip title={helpTitle('sessions')}>
												<button
													type="button"
													tabindex="-1"
													aria-label={userpage_help_sessions_aria()}
													class="ms-0.5 text-surface-400 hover:text-tertiary-500 dark:hover:text-primary-500"
												>
													<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"
													></iconify-icon>
												</button>
											</SystemTooltip>
										</p>
									</div>
									<div class="flex shrink-0 flex-wrap items-center gap-1.5">
										{#if otherSessionCount > 0}
											<Button
												variant="outline"
												size="sm"
												onclick={handleRevokeAllOthers}
												aria-label={userpage_sign_out_all_others_aria()}
												class="text-xs"
												data-testid="security-sessions-revoke-others-btn"
											>
												{userpage_sign_out_others()} ({otherSessionCount})
											</Button>
										{/if}
										<Button
											variant="surface"
											size="sm"
											onclick={loadSessions}
											disabled={sessionsLoading}
											aria-label={userpage_refresh_sessions_aria()}
											class={securityActionBtn}
											data-testid="security-sessions-refresh-btn"
										>
											{sessionsLoading ? common_loading() : button_refresh()}
										</Button>
									</div>
								</div>
								{#if sessionsError}
									<p class="text-xs text-error-500" role="alert">{sessionsError}</p>
								{:else if sessions.length === 0 && !sessionsLoading}
									<p class="text-xs text-surface-500">
										{userpage_no_sessions()}
									</p>
								{:else}
									<ul
										class="max-h-[min(70vh,40rem)] space-y-2 overflow-y-auto sm:max-h-[min(75vh,48rem)]"
										aria-label={userpage_sessions_by_device_aria()}
									>
										{#each sessionGroups as group (group.key)}
											<li
												class="rounded-lg border {group.isCurrent
													? 'border-primary-500/60 bg-primary-500/10 shadow-sm ring-1 ring-primary-500/30 dark:border-primary-500/50 dark:bg-primary-500/10 dark:ring-primary-500/25'
													: 'border-surface-100 dark:border-surface-500/40'}"
												data-testid="session-group"
												data-current={group.isCurrent ? 'true' : 'false'}
											>
												<div
													class="flex flex-col gap-1 px-3 py-2.5 text-xs sm:flex-row sm:items-center sm:justify-between"
												>
													<div class="flex min-w-0 flex-1 items-start gap-2.5">
														<span
															class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg {group.isCurrent
																? 'bg-primary-500 text-white dark:bg-primary-500 dark:text-surface-950'
																: 'bg-tertiary-500/10 text-tertiary-500 dark:bg-primary-500/10 dark:text-primary-500'}"
															aria-hidden="true"
														>
															<iconify-icon icon={group.icon} width={18}></iconify-icon>
														</span>
														<div class="min-w-0">
															<p class="font-medium text-surface-600 dark:text-surface-400">
																{group.title}
																{#if group.isCurrent}
																	<Badge
																		preset="filled"
																		color="primary"
																		size="sm"
																		class="ms-1 align-middle font-bold uppercase tracking-wide text-white dark:bg-primary-500 dark:text-surface-950"
																	>
																		{userpage_current_session()}
																	</Badge>
																{/if}
																{#if group.sessionCount > 1}
																	<span class="ms-1 text-[11px] font-normal text-surface-500">
																		({userpage_sessions_count({ count: group.sessionCount })})
																	</span>
																{/if}
															</p>
															<p class="mt-0.5 text-[11px] text-surface-500">
																{#if group.isCurrent}
																	<span class="font-medium text-primary-600 dark:text-primary-500"
																		>{userpage_you_are_here()}
																	</span>
																{/if}
																{group.deviceLabel}
																{#if group.browser && group.deviceLabel !== userpage_device_unknown()}
																	· {group.browser}
																{/if}
																{#if group.ip}
																	· {group.ip}
																{/if}
																{#if group.lastActiveLabel}
																	· {userpage_last_active()} {group.lastActiveLabel}
																{/if}
															</p>
														</div>
													</div>
													{#if group.revokableIds.length > 0 || group.isCurrent}
														<Button
															variant="outline"
															size="sm"
															class="shrink-0 self-end text-xs sm:self-center"
															onclick={() => handleRevokeGroup(group)}
															aria-label={group.isCurrent && group.revokableIds.length > 0
																? userpage_sign_out_device_others_aria()
																: group.isCurrent
																	? userpage_end_session_aria()
																	: userpage_revoke_device_all_aria()}
															data-testid="session-group-revoke-btn"
														>
															{#if group.isCurrent && group.revokableIds.length > 0}
																{userpage_sign_out_others()}
															{:else if group.isCurrent}
																{userpage_end_session_confirm()}
															{:else}
																{userpage_revoke_all()}
															{/if}
														</Button>
													{/if}
												</div>
												<!-- Always expanded: list each session under the device -->
												<ul
													class="space-y-1.5 border-t px-3 py-2 {group.isCurrent
														? 'border-primary-500/25 dark:border-primary-500/30'
														: 'border-surface-100 dark:border-surface-500/40'}"
													aria-label={userpage_sessions_on_device_aria()}
													data-testid="session-group-members"
												>
													{#each group.members as member, mi (String(member._id ?? member.id ?? mi))}
														<li
															class="flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[11px] {member.isCurrent
																? 'border border-primary-500/40 bg-primary-500/10 dark:border-primary-500/50 dark:bg-primary-500/10'
																: 'border border-transparent bg-surface-500/80 dark:bg-surface-900/20'}"
															data-testid={member.isCurrent
																? 'session-member-current'
																: 'session-member'}
														>
															<span class="min-w-0 text-surface-600 dark:text-surface-400">
																{#if member.isCurrent}
																	<span
																		class="inline-flex items-center gap-1 font-bold text-primary-600 dark:text-primary-500"
																	>
																		<iconify-icon
																			icon="mdi:check-circle"
																			width={14}
																			aria-hidden="true"
																		></iconify-icon>
																		{userpage_current_this_tab()}
																	</span>
																{:else}
																	<span class="font-medium text-surface-600 dark:text-surface-400"
																		>{userpage_other_sign_in()}</span
																	>
																{/if}
																{#if sessionWhen(member)}
																	<span class="text-surface-500"> · {sessionWhen(member)}</span>
																{/if}
																{#if member.ip || member.ipAddress}
																	<span class="font-mono text-surface-500">
																		· {member.ip || member.ipAddress}</span
																	>
																{/if}
															</span>
														</li>
													{/each}
												</ul>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						</div>
					</AdminCard>

					<AdminCard class={cardClass}>
						<h3 class="mb-3 text-sm font-semibold uppercase tracking-wider">
							{userpage_login_prefs_title()}
						</h3>
						<div class="space-y-1">
							<div class={rowClass} data-testid="pref-passkey">
								<div class="flex min-w-0 items-center gap-3">
									<iconify-icon
										icon="mdi:fingerprint"
										class={securityRowIcon}
										width={20}
										aria-hidden="true"
									></iconify-icon>
									<div class="min-w-0">
										<p
											class="flex items-center gap-1 text-sm font-medium text-surface-900 dark:text-surface-100"
										>
											{userpage_passkeys()}
											<SystemTooltip title={helpTitle('passkeys')}>
												<button
													type="button"
													tabindex="-1"
													aria-label={userpage_help_passkeys_aria()}
													class="ms-0.5 text-surface-400 hover:text-tertiary-500 dark:hover:text-primary-500"
												>
													<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"
													></iconify-icon>
												</button>
											</SystemTooltip>
										</p>
										<p class="text-xs text-surface-500">{userpage_passkey_hint()}</p>
									</div>
								</div>
								<Checkbox
									checked={(serverUser?.preferences as any)?.auth?.passkeyEnabled ?? false}
									onchange={async (enabled) => updateRtcPreference('passkeyEnabled', enabled)}
									size="sm"
									label={userpage_enable_passkey()}
									hideLabel={true}
								/>
							</div>

							<div class={rowClass} data-testid="pref-magic-link">
								<div class="flex min-w-0 items-center gap-3">
									<iconify-icon
										icon="mdi:magic-staff"
										class={securityRowIcon}
										width={20}
										aria-hidden="true"
									></iconify-icon>
									<div class="min-w-0">
										<p
											class="flex items-center gap-1 text-sm font-medium text-surface-900 dark:text-surface-100"
										>
											{userpage_magic_link()}
											<SystemTooltip title={helpTitle('magic')}>
												<button
													type="button"
													tabindex="-1"
													aria-label={userpage_help_magic_aria()}
													class="ms-0.5 text-surface-400 hover:text-tertiary-500 dark:hover:text-primary-500"
												>
													<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"
													></iconify-icon>
												</button>
											</SystemTooltip>
										</p>
										<p class="text-xs text-surface-500">{userpage_magic_hint()}</p>
									</div>
								</div>
								<Checkbox
									checked={(serverUser?.preferences as any)?.auth?.magicLinkEnabled ?? false}
									onchange={async (enabled) => updateRtcPreference('magicLinkEnabled', enabled)}
									size="sm"
									label={userpage_enable_magic_link()}
									hideLabel={true}
								/>
							</div>

							<div class={rowClass} data-testid="pref-oauth">
								<div class="flex min-w-0 items-center gap-3">
									<iconify-icon
										icon="mdi:account-group-outline"
										class={securityRowIcon}
										width={20}
										aria-hidden="true"
									></iconify-icon>
									<div class="min-w-0">
										<p
											class="flex items-center gap-1 text-sm font-medium text-surface-900 dark:text-surface-100"
										>
											{userpage_oauth_login()}
											<SystemTooltip title={helpTitle('oauth')}>
												<button
													type="button"
													tabindex="-1"
													aria-label={userpage_help_oauth_aria()}
													class="ms-0.5 text-surface-400 hover:text-tertiary-500 dark:hover:text-primary-500"
												>
													<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"
													></iconify-icon>
												</button>
											</SystemTooltip>
										</p>
										<p class="text-xs text-surface-500">
											{userpage_oauth_hint()}
										</p>
									</div>
								</div>
								<Checkbox
									checked={(serverUser?.preferences as any)?.auth?.oauthEnabled ?? false}
									onchange={async (enabled) => updateRtcPreference('oauthEnabled', enabled)}
									size="sm"
									label={userpage_enable_oauth()}
									hideLabel={true}
								/>
							</div>

							{#if user.permissions.length > 0}
								<div class="pt-3" data-testid="user-permissions-list">
									<div class="mb-2 flex items-center gap-2">
										<iconify-icon
											icon="mdi:shield-check"
											class={securityRowIcon}
											width={20}
											aria-hidden="true"
										></iconify-icon>
										<p
											class="flex items-center gap-1 text-sm font-medium text-surface-900 dark:text-surface-100"
										>
											{system_permission()}
											<SystemTooltip title={helpTitle('permissions')}>
												<button
													type="button"
													tabindex="-1"
													aria-label={userpage_help_permissions_aria()}
													class="ms-0.5 text-surface-400 hover:text-tertiary-500 dark:hover:text-primary-500"
												>
													<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"
													></iconify-icon>
												</button>
											</SystemTooltip>
										</p>
									</div>
									<div class="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
										{#each user.permissions as permission (permission)}
											<span
												class="inline-flex items-center rounded-full bg-tertiary-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white dark:bg-primary-500 dark:text-surface-950"
											>
												{permission}
											</span>
										{/each}
									</div>
									{#if user.isAdmin}
										<a
											href="/config/access-management"
											data-sveltekit-preload-data="hover"
											data-preload="hover"
											class="mt-2 inline-flex items-center gap-1 text-xs text-tertiary-500 hover:underline dark:text-primary-500"
										>
											<iconify-icon icon="mdi:open-in-new" width={12} aria-hidden="true"
											></iconify-icon>
											{userpage_manage_roles_permissions()}
										</a>
									{/if}
								</div>
							{/if}

							<div class="pt-2" data-testid="slot-user_security" data-zone="user_security">
								<Slot name="user_security" props={{ user }} />
							</div>
						</div>
					</AdminCard>
				</div>
			{:else if activeTab === 'settings'}
				<!-- ═══ TAB 3: User Settings — two columns (Appearance/Collab | Privacy) ═══ -->
				<div class="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="user-settings-panel">
					<AdminCard class={cardClass}>
						<h3 class="mb-3 text-sm font-semibold uppercase tracking-wider">
							{userpage_workspace_collab_title()}
						</h3>
						<div class="space-y-1">
							<div
								class="border-b border-surface-100 py-3 dark:border-surface-500/40"
								data-testid="workspace-appearance-section"
							>
								<div class="mb-2 flex items-center gap-2">
									<iconify-icon
										icon="mdi:palette-outline"
										class="text-tertiary-500 dark:text-primary-500"
										width={20}
										aria-hidden="true"
									></iconify-icon>
									<p
										class="flex items-center gap-1 text-sm font-medium text-surface-900 dark:text-surface-100"
									>
										{userpage_workspace_appearance()}
										<SystemTooltip title={helpTitle('appearance')}>
											<button
												type="button"
												tabindex="-1"
												aria-label={userpage_help_appearance_aria()}
												class={helpBtnClass}
											>
												<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"
												></iconify-icon>
											</button>
										</SystemTooltip>
									</p>
								</div>
								<div
									class="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
									data-testid="user-quick-appearance"
								>
									<div class="flex flex-col gap-1.5">
										<div class="flex items-center gap-1.5">
											<span class="text-sm font-semibold text-surface-600 dark:text-surface-400"
												>{userpage_density()}</span
											>
											<SystemTooltip title={helpTitle('density')}>
												<button
													type="button"
													tabindex="-1"
													aria-label={userpage_help_density_aria()}
													class={helpBtnClass}
												>
													<iconify-icon icon="mdi:help-circle-outline" width={14} aria-hidden="true"
													></iconify-icon>
												</button>
											</SystemTooltip>
										</div>
										<Select
											bind:value={myDensity}
											ariaLabel={userpage_density()}
											options={[
												{ value: '', label: userpage_theme_default() },
												{ value: 'compact', label: userpage_density_compact() },
												{ value: 'cozy', label: userpage_density_cozy() },
												{ value: 'spacious', label: userpage_density_spacious() }
											]}
										/>
									</div>
									<div class="flex flex-col gap-1.5">
										<div class="flex items-center gap-1.5">
											<span class="text-sm font-semibold text-surface-600 dark:text-surface-400"
												>{userpage_card_style()}</span
											>
											<SystemTooltip title={helpTitle('card-style')}>
												<button
													type="button"
													tabindex="-1"
													aria-label={userpage_help_card_style_aria()}
													class={helpBtnClass}
												>
													<iconify-icon icon="mdi:help-circle-outline" width={14} aria-hidden="true"
													></iconify-icon>
												</button>
											</SystemTooltip>
										</div>
										<Select
											bind:value={myVariant}
											ariaLabel={userpage_card_style()}
											options={[
												{ value: '', label: userpage_theme_default() },
												{ value: 'flat', label: userpage_variant_flat() },
												{ value: 'bordered', label: userpage_variant_bordered() },
												{ value: 'elevated', label: userpage_variant_elevated() }
											]}
										/>
									</div>
									<div class="flex items-center justify-between gap-3 py-1">
										<span
											class="flex items-center gap-1.5 text-sm font-semibold text-surface-600 dark:text-surface-400"
										>
											{userpage_reduced_motion()}
											<SystemTooltip title={helpTitle('reduced-motion')}>
												<button
													type="button"
													tabindex="-1"
													aria-label={userpage_help_reduced_motion_aria()}
													class={helpBtnClass}
												>
													<iconify-icon icon="mdi:help-circle-outline" width={14} aria-hidden="true"
													></iconify-icon>
												</button>
											</SystemTooltip>
										</span>
										<Toggle bind:value={myReducedMotion} ariaLabel={userpage_reduced_motion()} />
									</div>
									<div class="flex items-center justify-between gap-3 py-1">
										<span
											class="flex items-center gap-1.5 text-sm font-semibold text-surface-600 dark:text-surface-400"
										>
											{userpage_high_contrast()}
											<SystemTooltip title={helpTitle('high-contrast')}>
												<button
													type="button"
													tabindex="-1"
													aria-label={userpage_help_high_contrast_aria()}
													class={helpBtnClass}
												>
													<iconify-icon icon="mdi:help-circle-outline" width={14} aria-hidden="true"
													></iconify-icon>
												</button>
											</SystemTooltip>
										</span>
										<Toggle bind:value={myHighContrast} ariaLabel={userpage_high_contrast()} />
									</div>
								</div>
								<div class="flex flex-col gap-2 sm:flex-row">
									<Button
										variant="primary"
										size="sm"
										onclick={saveQuickAppearance}
										loading={savingAppearance}
										data-testid="user-save-appearance-btn"
										class="flex-1"
									>
										{userpage_apply_appearance()}
									</Button>
									<Button
										variant="outline"
										href="/config/design-system?tab=overrides"
										data-testid="open-appearance-settings-btn"
										aria-label={userpage_open_design_system_aria()}
										class="flex-1 text-xs font-bold tracking-tight"
									>
										<iconify-icon
											icon="mdi:compass-outline"
											width={14}
											class="me-1"
											aria-hidden="true"
										></iconify-icon>
										{config_tile_design()}
									</Button>
								</div>
							</div>

							<div class="py-3" data-testid="collaboration-prefs">
								<div class="mb-2 flex items-center gap-2">
									<iconify-icon
										icon="mdi:forum"
										class="text-tertiary-500 dark:text-primary-500"
										width={20}
										aria-hidden="true"
									></iconify-icon>
									<p class="flex items-center gap-1 uppercase">
										{userpage_collaboration()}
										<SystemTooltip title={helpTitle('collaboration')}>
											<button
												type="button"
												tabindex="-1"
												aria-label={userpage_help_collaboration_aria()}
												class={helpBtnClass}
											>
												<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"
												></iconify-icon>
											</button>
										</SystemTooltip>
									</p>
								</div>
								<div class="space-y-3 ps-1">
									<div
										class="flex items-center justify-between gap-3"
										data-testid="pref-rtc-enabled"
									>
										<span class="flex min-w-0 items-center gap-1 0">
											{userpage_rtc_editing()}
											<SystemTooltip title={helpTitle('rtc-enabled')}>
												<button
													type="button"
													tabindex="-1"
													aria-label={userpage_help_rtc_aria()}
													class={helpBtnClass}
												>
													<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"
													></iconify-icon>
												</button>
											</SystemTooltip>
										</span>
										<Checkbox
											checked={serverUser?.preferences?.rtc?.enabled ?? true}
											onchange={async (enabled) => updateRtcPreference('enabled', enabled)}
											size="sm"
											label={userpage_enable_rtc()}
											hideLabel={true}
										/>
									</div>
									<div class="flex items-center justify-between gap-3" data-testid="pref-rtc-sound">
										<span class="flex min-w-0 items-center gap-1">
											{userpage_sound_notifications()}
											<SystemTooltip title={helpTitle('rtc-sound')}>
												<button
													type="button"
													tabindex="-1"
													aria-label={userpage_help_rtc_sound_aria()}
													class={helpBtnClass}
												>
													<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"
													></iconify-icon>
												</button>
											</SystemTooltip>
										</span>
										<Checkbox
											checked={serverUser?.preferences?.rtc?.sound ?? true}
											onchange={async (sound) => updateRtcPreference('sound', sound)}
											size="sm"
											label={userpage_enable_sound()}
											hideLabel={true}
										/>
									</div>
								</div>
							</div>
						</div>
					</AdminCard>

					<AdminCard class={cardClass}>
						<h3 class="mb-3 text-sm font-semibold uppercase tracking-wider">
							{userpage_privacy_extensions_title()}
						</h3>
						<div class="space-y-1">
							<div class="py-1" data-testid="privacy-data-section">
								<div class="mb-2 flex items-center gap-2">
									<iconify-icon
										icon="mdi:shield-account"
										class="text-tertiary-500 dark:text-primary-500"
										width={20}
										aria-hidden="true"
									></iconify-icon>
									<p
										class="flex items-center gap-1 text-sm font-medium text-surface-900 dark:text-surface-100"
									>
										{userpage_privacy_data_title()}
										<SystemTooltip title={helpTitle('privacy')}>
											<button
												type="button"
												tabindex="-1"
												aria-label={userpage_help_privacy_aria()}
												class={helpBtnClass}
											>
												<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"
												></iconify-icon>
											</button>
										</SystemTooltip>
									</p>
								</div>
								<button
									type="button"
									onclick={modalPrivacyData}
									data-testid="privacy-data-btn"
									aria-label={userpage_privacy_open_aria()}
									class="flex w-full items-center gap-3 rounded-lg border border-surface-500/30 p-3 text-start transition-colors hover:bg-surface-500/10 dark:border-surface-500/40 dark:hover:bg-surface-800/50"
								>
									<div class="min-w-0 flex-1">
										<p class="text-sm font-medium text-surface-900 dark:text-surface-100">
											{userpage_privacy_action_title()}
										</p>
										<p class="text-xs text-surface-500">
											{userpage_privacy_action_desc()}
										</p>
									</div>
									<iconify-icon
										icon="mdi:chevron-right"
										class="shrink-0 text-surface-400"
										width={18}
										aria-hidden="true"
									></iconify-icon>
								</button>
							</div>

							<div class="pt-2" data-testid="slot-user_preferences" data-zone="user_preferences">
								<Slot name="user_preferences" props={{ user }} />
							</div>
							<div data-testid="slot-user_profile_sidebar" data-zone="user_profile_sidebar">
								<Slot name="user_profile_sidebar" props={{ user }} />
							</div>
						</div>
					</AdminCard>
				</div>
			{:else if activeTab === 'management' && canManageUsers}
				<!-- ╭╥╮ TAB 4: User Management (full width; sub-tabs Users | Invitations) ╭╥╮ -->
				<div class="min-w-0">
					<p
						class="mb-3 text-center text-sm font-medium text-tertiary-600 dark:text-primary-500"
						data-testid="user-management-intro"
					>
						{userpage_management_intro()}
					</p>
					<AdminArea
						currentUser={user as any}
						isMultiTenant={!!isMultiTenant}
						roles={(data.roles ?? []) as any}
					/>
				</div>
			{/if}
		</div>
	</div>
</AdminPageShell>

{#if reauthOpen}
	<!-- Password re-authentication for cross-session revocation (Laravel-style) -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="presentation"
	>
		<div
			class="w-full max-w-sm rounded-2xl bg-surface-500/10 p-6 shadow-xl dark:bg-surface-900"
			role="dialog"
			aria-modal="true"
			aria-labelledby="reauth-title"
		>
			<h3 id="reauth-title" class="text-lg font-semibold text-surface-900 dark:text-surface-100">
				{userpage_reauth_title()}
			</h3>
			<p class="mt-1 text-sm text-surface-500 dark:text-surface-400">
				{userpage_reauth_body()}
			</p>
			<form
				class="mt-4 space-y-4"
				onsubmit={(e) => {
					e.preventDefault();
					submitReauthAndRevoke();
				}}
			>
				<FloatingInput
					type="security"
					name="reauth-password"
					id="reauth-password"
					label={userpage_current_password()}
					bind:value={reauthPassword}
					bind:showPassword={reauthShowPassword}
					autocomplete="current-password"
					icon="mdi:password"
				/>
				{#if reauthError}
					<p class="text-sm text-error-500" role="alert">{reauthError}</p>
				{/if}
				<div class="flex justify-end gap-2">
					<Button
						variant="ghost"
						type="button"
						onclick={() => (reauthOpen = false)}
						disabled={reauthBusy}
					>
						{button_cancel()}
					</Button>
					<Button type="submit" variant="primary" disabled={reauthBusy || !reauthPassword}>
						{reauthBusy ? userpage_verifying() : button_confirm()}
					</Button>
				</div>
			</form>
		</div>
	</div>
{/if}
