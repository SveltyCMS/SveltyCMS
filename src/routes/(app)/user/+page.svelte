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
	import { updateUserThemePrefs } from '../config/design-system/appearance-api';
	import { userThemePrefs } from '@src/stores/user-prefs-overlay.svelte.ts';
	import { isAdmin } from '@src/databases/auth/constants';
	import {
		button_delete,
		email,
		usermodalconfirmbody,
		usermodalconfirmtitle,
		usermodaluser_edittitle,
		usermodaluser_settingbody,
		username,
		userpage_edit_usersetting,
		userpage_editavatar,
		userpage_title
	} from '@src/paraglide/messages';
	import { normalizeAvatarUrl } from '@src/stores/store.svelte.ts';
	import { onMount, untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import AdminArea from './components/admin-area.svelte';
	import ModalTwoFactorAuth from './components/modal-two-factor-auth.svelte';
	import '@src/stores/store.svelte.ts';
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
			},
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
				highContrast: myHighContrast,
			};
			if (myDensity) prefs.density = myDensity;
			if (myVariant) prefs.variant = myVariant;
			const res = await updateUserThemePrefs(prefs);
			if (!res.success) throw new Error(res.message || 'Save failed');
			userThemePrefs.apply(prefs as any);
			toast.success('Appearance preferences applied.');
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : String(e));
		} finally {
			savingAppearance = false;
		}
	}

	const rolePermissionFallback = $derived.by(() => {
		const roles = (data.roles ?? []) as Array<{ _id?: string; name?: string; permissions?: string[] }>;
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
		{ id: 'identity', label: 'Identity', shortLabel: 'Identity', icon: 'mdi:account-circle-outline' },
		{ id: 'security', label: 'Security', shortLabel: 'Security', icon: 'mdi:shield-lock-outline' },
		{ id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: 'mdi:cog-outline' },
		...(canManageUsers
			? [
					{
						id: 'management',
						label: 'User Management',
						shortLabel: 'Manage',
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
			sessionsError = err instanceof Error ? err.message : 'Failed to load sessions';
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
				deviceLabel: 'Unknown device',
				kind: 'unknown',
				browser: 'Browser',
				icon: 'mdi:monitor',
				title: 'Unknown device'
			};
		}

		let browser = 'Browser';
		if (/Edg\//i.test(ua)) browser = 'Edge';
		else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) browser = 'Opera';
		else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
		else if (/Firefox\//i.test(ua)) browser = 'Firefox';
		else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

		let kind: DeviceKind = 'pc';
		let deviceLabel = 'PC';
		let icon = 'mdi:monitor';

		if (/iPhone/i.test(ua)) {
			kind = 'phone';
			deviceLabel = 'iPhone';
			icon = 'mdi:cellphone';
		} else if (/iPad/i.test(ua)) {
			kind = 'tablet';
			deviceLabel = 'iPad';
			icon = 'mdi:tablet';
		} else if (/Android/i.test(ua)) {
			if (/Mobile/i.test(ua) && !/Tablet/i.test(ua)) {
				kind = 'phone';
				deviceLabel = 'Android phone';
				icon = 'mdi:cellphone';
			} else {
				kind = 'tablet';
				deviceLabel = 'Android tablet';
				icon = 'mdi:tablet';
			}
		} else if (/Macintosh|Mac OS X/i.test(ua)) {
			// iPadOS 13+ can spoof Mac — MobileSafari without mobile token is still Mac-like
			if (/Mobile\//i.test(ua) && /Safari/i.test(ua)) {
				kind = 'tablet';
				deviceLabel = 'iPad';
				icon = 'mdi:tablet';
			} else {
				kind = 'mac';
				deviceLabel = 'Mac';
				icon = 'mdi:apple';
			}
		} else if (/Windows NT/i.test(ua)) {
			kind = 'pc';
			deviceLabel = 'Windows PC';
			icon = 'mdi:microsoft-windows';
		} else if (/CrOS/i.test(ua)) {
			kind = 'pc';
			deviceLabel = 'Chromebook';
			icon = 'mdi:laptop';
		} else if (/Linux/i.test(ua)) {
			kind = 'pc';
			deviceLabel = 'Linux PC';
			icon = 'mdi:linux';
		} else if (/Mobile|webOS|BlackBerry/i.test(ua)) {
			kind = 'phone';
			deviceLabel = 'Phone';
			icon = 'mdi:cellphone';
		} else if (/Tablet/i.test(ua)) {
			kind = 'tablet';
			deviceLabel = 'Tablet';
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
		try {
			const d = new Date(raw);
			if (Number.isNaN(d.getTime())) return '';
			return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
		} catch {
			return '';
		}
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
						: `orphan-${String(s._id ?? s.id ?? Math.random())}`
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
						? 'This device (browser)'
						: 'Signed-in device'
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
						title: 'Revoke failed',
						description: result.error || 'Could not revoke session'
					});
					return false;
				}
			} catch (err) {
				toast.error({
					title: 'Revoke failed',
					description: err instanceof Error ? err.message : 'Could not revoke session'
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
				title: 'End this session?',
				body: 'You will be signed out of this browser tab and redirected to the login page. Other devices stay signed in unless you revoke them separately.',
				theme: { variant: 'filled', color: 'warning' },
				confirmText: 'End session',
				onConfirm: async () => {
					const ok = await revokeSessionIds([mid]);
					if (!ok) return;
					toast.success({ title: 'Signed out', description: 'Session ended.' });
					window.location.href = '/login';
				}
			});
			return;
		}

		showConfirm({
			title: 'Revoke this session?',
			body: 'That device or browser will be signed out immediately. You can keep using this tab.',
			theme: { variant: 'filled', color: 'error' },
			confirmText: 'Revoke',
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
			? `Sign out ${ids.length} other session${ids.length === 1 ? '' : 's'} on this device? This tab stays signed in.`
			: `Sign out all ${group.sessionCount} session${group.sessionCount === 1 ? '' : 's'} on ${group.deviceLabel}?`;

		showConfirm({
			title: group.isCurrent ? 'Sign out other sessions on this device?' : 'Revoke device sessions?',
			body,
			theme: { variant: 'filled', color: 'error' },
			confirmText: group.isCurrent ? 'Sign out others' : 'Revoke all',
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
				title: 'Nothing to revoke',
				description: 'Only this tab is signed in.'
			});
			return;
		}
		showConfirm({
			title: 'Sign out all other sessions?',
			body: `This ends ${others.length} other active session${others.length === 1 ? '' : 's'} on every device. This tab stays signed in.`,
			theme: { variant: 'filled', color: 'error' },
			confirmText: 'Sign out others',
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
				reauthError = res.error || 'Verification failed';
				return;
			}
			reauthOpen = false;
			const ok = await revokeSessionIds(pendingRevokeIds, res.token);
			if (ok) {
				toast.success({
					title: 'Sessions revoked',
					description: 'The selected sessions have been signed out.'
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
			'2fa':
				'Two-factor authentication (2FA) adds a one-time code from an authenticator app when you sign in. Setup opens a guided modal with QR code and backup codes.',
			sessions:
				'Each sign-in creates a session. The row marked Current session is this browser tab. You can revoke any other session (signs that device out) or end this session (logs you out here). Use “Sign out others” to keep only this tab.',
			passkeys:
				'Prefer passwordless sign-in with a device passkey (Windows Hello, Touch ID, security key) when the site has passkeys enabled.',
			magic:
				'Prefer a one-time login link sent to your email when magic-link login is enabled for this site.',
			oauth:
				'Prefer sign-in with an external provider (e.g. Google or GitHub) when OAuth is configured by an administrator.',
			permissions:
				'Capabilities granted by your role. Admins can change roles and permissions under Access Management.',
			appearance:
				'Set personal density, card style, and accessibility toggles here, or open Design System → My Overrides for full layout preferences. Workspace admins manage shared themes on the same Design System page.',
			collaboration:
				'Realtime collaboration preferences for concurrent editing and presence. These settings affect your session only — not other users.',
			'rtc-enabled':
				'When enabled, you join realtime editing sessions (presence, live cursors, collaborative updates) on collection entries that support it.',
			'rtc-sound':
				'Play a short sound when collaborators join, leave, or send realtime activity. Turn off for silent work.',
			privacy:
				'GDPR tools: export a machine-readable copy of your personal data, or permanently anonymize your account. Destructive actions require confirmation in a dedicated dialog for safety.',
			avatar:
				'Change your profile photo. Upload a new image (JPEG, PNG, WebP, AVIF, SVG, or GIF — max 5 MB) or remove the current one. Click the avatar or the pencil to open the editor.'
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
				return { icon: 'material-symbols:verified-outline', name: 'Administrator' };
			case 'developer':
				return { icon: 'material-symbols:code', name: 'Developer' };
			case 'editor':
				return { icon: 'material-symbols:edit', name: 'Editor' };
			case 'guest':
				return { icon: 'material-symbols:person', name: 'Guest' };
			default:
				return { icon: 'material-symbols:person', name: user.role };
		}
	});

	function open2FAModal(): void {
		modalState.trigger(ModalTwoFactorAuth, { user, size: 'fullscreen' }, async (r: any) => {
			if (r) await refreshAll();
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
					toast.success({ title: 'Enabled', description: `Preference "${key}" enabled` });
				} else {
					toast.warning({ title: 'Disabled', description: `Preference "${key}" disabled` });
				}
				await refreshAll();
			} else if (res.status === 401 || res.status === 403) {
				toast.error({ title: 'Auth error', description: 'Please reload the page and try again.' });
			} else {
				const body = await res.json().catch(() => ({}));
				toast.error({ title: 'Update failed', description: (body as any).message || `HTTP ${res.status}` });
			}
		} catch (err) {
			toast.error({
				title: 'Network error',
				description: err instanceof Error ? err.message : 'Could not reach server'
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
			body: usermodaluser_settingbody() || 'Update your user details below.'
		});
	}

	function modalEditAvatar(): void {
		modalState.trigger(
			ModalEditAvatar,
			{
				title: userpage_editavatar() || 'Edit Avatar',
				size: 'lg'
			},
			async (r: any) => {
				if (r) {
					toast.success({
						title: 'Avatar updated',
						description: 'Your profile photo was saved.'
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
					toast.error({ title: 'Delete failed', description: 'Missing user id' });
					return;
				}
				try {
					const res = await fetch('/api/user/batch', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': page.data.csrfToken || '' },
						body: JSON.stringify({ userIds: [user._id], action: 'delete' })
					});
					if (res.ok) {
						toast.success({ title: 'Account deleted', description: 'Your account has been removed.' });
						await refreshAll();
						window.location.href = '/login';
						return;
					}
					const body = await res.json().catch(() => ({}));
					toast.error({
						title: 'Delete failed',
						description: (body as { message?: string }).message || `HTTP ${res.status}`
					});
				} catch (err) {
					toast.error({
						title: 'Network error',
						description: err instanceof Error ? err.message : 'Could not reach server'
					});
				}
			}
		});
	}

	const cardClass = 'border border-surface-500/30 dark:border-surface-500/40 p-5 sm:p-6 shadow-sm';
	const rowClass = 'flex items-center justify-between gap-3 py-3 border-b border-surface-100 dark:border-surface-500/40 last:border-0';
	/** Equal width for Security row actions (Setup / Manage / Refresh) */
	const securityActionBtn = 'min-w-[5.5rem] justify-center shrink-0';
	/** Row lead icons: tertiary (light) / primary (dark) */
	const securityRowIcon = 'shrink-0 text-tertiary-500 dark:text-primary-500';
</script>

<AdminPageShell title={userpage_title()} icon="mdi:account-circle" showBackButton={true} backUrl="/config">
	<div in:fade={{ duration: 250 }} class="flex flex-col gap-6" data-testid="user-account-page">
		<!-- Tabs directly under PageTitle -->
		<Tabs
			tabs={accountTabs}
			bind:activeTab
			variant="underline"
			ariaLabel="Account sections"
			testId="user-account-tabs"
			onTabChange={(id) => {
				activeTab = id as AccountTab;
			}}
		/>

		<div id="tabpanel-{activeTab}" role="tabpanel" class="min-w-0" data-testid="user-tab-panel">
			{#if activeTab === 'identity'}
				<!-- ═══ TAB 1: Identity — left: avatar + equal badges · right: fields ═══ -->
				<AdminCard class={cardClass} data-testid="user-identity-panel">
					<div class="grid grid-cols-1 gap-6 md:grid-cols-[minmax(10rem,12rem)_1fr] md:items-start md:gap-8 lg:gap-10">
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
									<SystemTooltip title={helpTitle('avatar')} positioning={{ placement: 'top', gutter: 8 }}>
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
											<iconify-icon icon="bi:pencil-fill" width={13} aria-hidden="true"></iconify-icon>
										</button>
									</SystemTooltip>
								</div>
							</div>

							<div class="flex w-full max-w-48 flex-col gap-2" data-testid="user-identity-badges">
								<!-- Shared height/width: white label text on filled chips -->
								<span data-testid="user-role-badge" class="block w-full">
									<span
										class="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-primary-500 px-3 text-xs font-bold uppercase tracking-wide text-white"
									>
										<iconify-icon icon={roleDisplay.icon} width={16} aria-hidden="true"></iconify-icon>
										{roleDisplay.name}
									</span>
								</span>
								<span data-testid="user-id-badge" class="block w-full">
									<span
										class="inline-flex h-9 w-full items-center justify-center gap-1 rounded-full bg-tertiary-600 px-3 font-mono text-[11px] font-bold tracking-wide text-white dark:bg-tertiary-500"
										title={String(user._id)}
									>
										ID: {String(user._id).slice(0, 12)}…
									</span>
								</span>
								{#if isMultiTenant && user.tenantId}
									<span data-testid="user-tenant-badge" class="block w-full">
										<span
											class="inline-flex h-9 w-full items-center justify-center gap-1 rounded-full bg-secondary-600 px-3 font-mono text-[11px] font-bold tracking-wide text-white"
										>
											Tenant: {String(user.tenantId).slice(0, 12)}…
										</span>
									</span>
								{/if}
								{#if is2FAEnabledGlobal}
									<button
										type="button"
										onclick={open2FAModal}
										data-testid="identity-2fa-badge-btn"
										aria-label={user.is2FAEnabled
											? 'Two-factor authentication enabled. Manage 2FA'
											: 'Two-factor authentication not configured. Setup 2FA'}
										class="inline-flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-xs font-bold uppercase tracking-wide text-white transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 {user.is2FAEnabled
											? 'bg-primary-600 dark:bg-primary-500'
											: 'bg-warning-600 dark:bg-warning-500'}"
									>
										<iconify-icon
											icon={user.is2FAEnabled ? 'mdi:shield-check' : 'mdi:shield-alert-outline'}
											width={16}
											aria-hidden="true"
										></iconify-icon>
										{user.is2FAEnabled ? '2FA on' : '2FA off'}
									</button>
								{/if}
							</div>
						</div>

						<!-- Right: username · email · password (static mask, no reveal) -->
						<div class="flex min-w-0 flex-col gap-4">
							<div class="w-full rounded-xl border border-surface-500/30 px-4 py-3 dark:border-surface-500/40">
								<p class="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-surface-500">
									<iconify-icon icon="mdi:account" width={14} class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"
									></iconify-icon>
									{username()}
								</p>
								<p class="w-full text-base font-medium text-surface-900 dark:text-surface-100" data-testid="profile-username">
									{user.username || '—'}
								</p>
							</div>

							<div class="w-full rounded-xl border border-surface-500/30 px-4 py-3 dark:border-surface-500/40">
								<p class="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-surface-500">
									<iconify-icon
										icon="mdi:email-outline"
										width={14}
										class="text-tertiary-500 dark:text-primary-500"
										aria-hidden="true"
									></iconify-icon>
									{email()}
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
								<p class="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-surface-500">
									<iconify-icon icon="mdi:key-variant" width={14} class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"
									></iconify-icon>
									Password
								</p>
								<p class="font-mono text-base tracking-widest text-surface-500" aria-hidden="true">••••••••••••</p>
								<p class="mt-1 text-xs text-surface-500">
									Passwords are stored hashed and cannot be displayed. Use
									<strong class="font-medium text-surface-600 dark:text-surface-400">Change password</strong> to set a new one.
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
									Edit Profile
								</Button>
								<Button
									variant="surface"
									leadingIcon="mdi:key-variant"
									onclick={modalUserForm}
									data-testid="security-change-password"
									aria-label="Change password"
								>
									Change password
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
										class="w-full justify-start preset-ghost-error-500 sm:w-auto"
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
						<h3 class="mb-3 text-sm font-semibold uppercase tracking-wider text-surface-500">Sessions &amp; 2FA</h3>
						<div class="space-y-1">
							{#if is2FAEnabledGlobal}
								<div class={rowClass} data-testid="security-2fa-section">
									<div class="flex min-w-0 items-center gap-3">
										<iconify-icon icon="mdi:two-factor-authentication" class={securityRowIcon} width={20} aria-hidden="true"
										></iconify-icon>
										<div class="min-w-0">
											<p class="flex items-center gap-1 text-sm font-medium text-surface-900 dark:text-surface-100">
												Two-Factor Authentication
												<SystemTooltip title={helpTitle('2fa')}>
													<button
														type="button"
														tabindex="-1"
														aria-label="Help: Two-Factor Authentication"
														class="ms-0.5 text-surface-400 hover:text-tertiary-500 dark:hover:text-primary-500"
													>
														<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"></iconify-icon>
													</button>
												</SystemTooltip>
											</p>
											<p class="text-xs {user.is2FAEnabled ? 'text-primary-600 dark:text-primary-500' : 'text-surface-500'}">
												{user.is2FAEnabled ? 'Enabled' : 'Not configured'}
											</p>
										</div>
									</div>
									<Button
										variant="surface"
										size="sm"
										onclick={open2FAModal}
										class="{securityActionBtn} {user.is2FAEnabled ? 'text-primary-600 dark:text-primary-500' : ''}"
										data-testid="security-2fa-btn"
									>
										{user.is2FAEnabled ? 'Manage' : 'Setup'}
									</Button>
								</div>
							{/if}

							<div class="py-3" data-testid="active-sessions-section">
								<div class="mb-2 flex flex-wrap items-center justify-between gap-2">
									<div class="flex min-w-0 items-center gap-2">
										<iconify-icon icon="mdi:devices" class={securityRowIcon} width={20} aria-hidden="true"></iconify-icon>
										<p class="flex items-center gap-1 text-sm font-medium text-surface-900 dark:text-surface-100">
											Active Sessions
											<SystemTooltip title={helpTitle('sessions')}>
												<button
													type="button"
													tabindex="-1"
													aria-label="Help: Active Sessions"
													class="ms-0.5 text-surface-400 hover:text-tertiary-500 dark:hover:text-primary-500"
												>
													<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"></iconify-icon>
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
												aria-label="Sign out all other sessions"
												class="text-xs"
												data-testid="security-sessions-revoke-others-btn"
											>
												Sign out others ({otherSessionCount})
											</Button>
										{/if}
										<Button
											variant="surface"
											size="sm"
											onclick={loadSessions}
											disabled={sessionsLoading}
											aria-label="Refresh active sessions"
											class={securityActionBtn}
											data-testid="security-sessions-refresh-btn"
										>
											{sessionsLoading ? 'Loading…' : 'Refresh'}
										</Button>
									</div>
								</div>
								{#if sessionsError}
									<p class="text-xs text-error-500" role="alert">{sessionsError}</p>
								{:else if sessions.length === 0 && !sessionsLoading}
									<p class="text-xs text-surface-500">No sessions listed yet. Refresh to load devices.</p>
								{:else}
									<ul
										class="max-h-[min(70vh,40rem)] space-y-2 overflow-y-auto sm:max-h-[min(75vh,48rem)]"
										aria-label="Active sessions by device"
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
																		Current session
																	</Badge>
																{/if}
																{#if group.sessionCount > 1}
																	<span class="ms-1 text-[11px] font-normal text-surface-500">
																		({group.sessionCount} sessions)
																	</span>
																{/if}
															</p>
															<p class="mt-0.5 text-[11px] text-surface-500">
																{#if group.isCurrent}
																	<span class="font-medium text-primary-600 dark:text-primary-500"
																		>You are here · </span
																	>
																{/if}
																{group.deviceLabel}
																{#if group.browser && group.deviceLabel !== 'Unknown device'}
																	· {group.browser}
																{/if}
																{#if group.ip}
																	· {group.ip}
																{/if}
																{#if group.lastActiveLabel}
																	· Last active {group.lastActiveLabel}
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
																? 'Sign out other sessions on this device'
																: group.isCurrent
																	? 'End current session'
																	: 'Revoke all sessions on this device'}
															data-testid="session-group-revoke-btn"
														>
															{#if group.isCurrent && group.revokableIds.length > 0}
																Sign out others
															{:else if group.isCurrent}
																End session
															{:else}
																Revoke all
															{/if}
														</Button>
													{/if}
												</div>
												<!-- Always expanded: list each session under the device -->
												<ul
													class="space-y-1.5 border-t px-3 py-2 {group.isCurrent
														? 'border-primary-500/25 dark:border-primary-500/30'
														: 'border-surface-100 dark:border-surface-500/40'}"
													aria-label="Sessions on this device"
													data-testid="session-group-members"
												>
													{#each group.members as member, mi (String(member._id ?? member.id ?? mi))}
														<li
															class="flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-[11px] {member.isCurrent
																? 'border border-primary-500/40 bg-primary-500/10 dark:border-primary-500/50 dark:bg-primary-500/10'
																: 'border border-transparent bg-surface-500/80 dark:bg-surface-900/20'}"
															data-testid={member.isCurrent ? 'session-member-current' : 'session-member'}
														>
															<span class="min-w-0 text-surface-600 dark:text-surface-400">
																{#if member.isCurrent}
																	<span
																		class="inline-flex items-center gap-1 font-bold text-primary-600 dark:text-primary-500"
																	>
																		<iconify-icon icon="mdi:check-circle" width={14} aria-hidden="true"
																		></iconify-icon>
																		Current · this tab
																	</span>
																{:else}
																	<span class="font-medium text-surface-600 dark:text-surface-400"
																		>Other sign-in</span
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
						<h3 class="mb-3 text-sm font-semibold uppercase tracking-wider text-surface-500">Login preferences &amp; access</h3>
						<div class="space-y-1">
							<div class={rowClass} data-testid="pref-passkey">
								<div class="flex min-w-0 items-center gap-3">
									<iconify-icon icon="mdi:fingerprint" class={securityRowIcon} width={20} aria-hidden="true"></iconify-icon>
									<div class="min-w-0">
										<p class="flex items-center gap-1 text-sm font-medium text-surface-900 dark:text-surface-100">
											Passkeys
											<SystemTooltip title={helpTitle('passkeys')}>
												<button
													type="button"
													tabindex="-1"
													aria-label="Help: Passkeys"
													class="ms-0.5 text-surface-400 hover:text-tertiary-500 dark:hover:text-primary-500"
												>
													<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"></iconify-icon>
												</button>
											</SystemTooltip>
										</p>
										<p class="text-xs text-surface-500">Prefer passwordless biometric login</p>
									</div>
								</div>
								<Checkbox
									checked={(serverUser?.preferences as any)?.auth?.passkeyEnabled ?? false}
									onchange={async (enabled) => updateRtcPreference('passkeyEnabled', enabled)}
									size="sm"
									label="Enable passkey preference"
									hideLabel={true}
								/>
							</div>

							<div class={rowClass} data-testid="pref-magic-link">
								<div class="flex min-w-0 items-center gap-3">
									<iconify-icon icon="mdi:magic-staff" class={securityRowIcon} width={20} aria-hidden="true"></iconify-icon>
									<div class="min-w-0">
										<p class="flex items-center gap-1 text-sm font-medium text-surface-900 dark:text-surface-100">
											Magic Link
											<SystemTooltip title={helpTitle('magic')}>
												<button
													type="button"
													tabindex="-1"
													aria-label="Help: Magic Link"
													class="ms-0.5 text-surface-400 hover:text-tertiary-500 dark:hover:text-primary-500"
												>
													<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"></iconify-icon>
												</button>
											</SystemTooltip>
										</p>
										<p class="text-xs text-surface-500">Prefer passwordless email login</p>
									</div>
								</div>
								<Checkbox
									checked={(serverUser?.preferences as any)?.auth?.magicLinkEnabled ?? false}
									onchange={async (enabled) => updateRtcPreference('magicLinkEnabled', enabled)}
									size="sm"
									label="Enable magic link preference"
									hideLabel={true}
								/>
							</div>

							<div class={rowClass} data-testid="pref-oauth">
								<div class="flex min-w-0 items-center gap-3">
									<iconify-icon icon="mdi:account-group-outline" class={securityRowIcon} width={20} aria-hidden="true"
									></iconify-icon>
									<div class="min-w-0">
										<p class="flex items-center gap-1 text-sm font-medium text-surface-900 dark:text-surface-100">
											OAuth Login
											<SystemTooltip title={helpTitle('oauth')}>
												<button
													type="button"
													tabindex="-1"
													aria-label="Help: OAuth Login"
													class="ms-0.5 text-surface-400 hover:text-tertiary-500 dark:hover:text-primary-500"
												>
													<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"></iconify-icon>
												</button>
											</SystemTooltip>
										</p>
										<p class="text-xs text-surface-500">Sign in with Google, GitHub when configured</p>
									</div>
								</div>
								<Checkbox
									checked={(serverUser?.preferences as any)?.auth?.oauthEnabled ?? false}
									onchange={async (enabled) => updateRtcPreference('oauthEnabled', enabled)}
									size="sm"
									label="Enable OAuth login preference"
									hideLabel={true}
								/>
							</div>

							{#if user.permissions.length > 0}
								<div class="pt-3" data-testid="user-permissions-list">
									<div class="mb-2 flex items-center gap-2">
										<iconify-icon icon="mdi:shield-check" class={securityRowIcon} width={20} aria-hidden="true"></iconify-icon>
										<p class="flex items-center gap-1 text-sm font-medium text-surface-900 dark:text-surface-100">
											Permissions
											<SystemTooltip title={helpTitle('permissions')}>
												<button
													type="button"
													tabindex="-1"
													aria-label="Help: Permissions"
													class="ms-0.5 text-surface-400 hover:text-tertiary-500 dark:hover:text-primary-500"
												>
													<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"></iconify-icon>
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
											<iconify-icon icon="mdi:open-in-new" width={12} aria-hidden="true"></iconify-icon>
											Manage roles &amp; permissions
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
						<h3 class="mb-3 text-sm font-semibold uppercase tracking-wider text-surface-500">
							Workspace &amp; collaboration
						</h3>
						<div class="space-y-1">
							<div class="border-b border-surface-100 py-3 dark:border-surface-500/40" data-testid="workspace-appearance-section">
								<div class="mb-2 flex items-center gap-2">
									<iconify-icon
										icon="mdi:palette-outline"
										class="text-tertiary-500 dark:text-primary-500"
										width={20}
										aria-hidden="true"
									></iconify-icon>
									<p class="flex items-center gap-1 text-sm font-medium text-surface-900 dark:text-surface-100">
										Workspace Appearance
										<SystemTooltip title={helpTitle('appearance')}>
											<button type="button" tabindex="-1" aria-label="Help: Workspace Appearance" class={helpBtnClass}>
												<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"></iconify-icon>
											</button>
										</SystemTooltip>
									</p>
								</div>
								<div class="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="user-quick-appearance">
									<Select
										bind:value={myDensity}
										label="Density"
										options={[
											{ value: '', label: 'Theme default' },
											{ value: 'compact', label: 'Compact' },
											{ value: 'cozy', label: 'Cozy' },
											{ value: 'spacious', label: 'Spacious' }
										]}
									/>
									<Select
										bind:value={myVariant}
										label="Card style"
										options={[
											{ value: '', label: 'Theme default' },
											{ value: 'flat', label: 'Flat' },
											{ value: 'bordered', label: 'Bordered' },
											{ value: 'elevated', label: 'Elevated' }
										]}
									/>
									<div class="flex flex-col justify-end">
										<Toggle bind:value={myReducedMotion} label="Reduced motion" />
									</div>
									<div class="flex flex-col justify-end">
										<Toggle bind:value={myHighContrast} label="High contrast" />
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
										Apply appearance
									</Button>
									<a
										href="/config/design-system?tab=overrides"
										data-testid="open-appearance-settings-btn"
										aria-label="Open Design System My Overrides"
										data-sveltekit-preload-data="hover"
										data-preload="hover"
										class="btn preset-outlined-surface-500 relative inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-(--admin-radius-button,0.25rem) px-3 text-xs font-bold tracking-tight transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-500"
									>
										<iconify-icon icon="mdi:compass-outline" width={14} class="me-1" aria-hidden="true"></iconify-icon>
										Design System
									</a>
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
									<p class="flex items-center gap-1 text-sm font-medium text-surface-900 dark:text-surface-100">
										Collaboration
										<SystemTooltip title={helpTitle('collaboration')}>
											<button type="button" tabindex="-1" aria-label="Help: Collaboration" class={helpBtnClass}>
												<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"></iconify-icon>
											</button>
										</SystemTooltip>
									</p>
								</div>
								<div class="space-y-3 ps-1">
									<div class="flex items-center justify-between gap-3" data-testid="pref-rtc-enabled">
										<span class="flex min-w-0 items-center gap-1 text-sm text-surface-600 dark:text-surface-400">
											Real-time editing
											<SystemTooltip title={helpTitle('rtc-enabled')}>
												<button type="button" tabindex="-1" aria-label="Help: Real-time editing" class={helpBtnClass}>
													<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"></iconify-icon>
												</button>
											</SystemTooltip>
										</span>
										<Checkbox
											checked={serverUser?.preferences?.rtc?.enabled ?? true}
											onchange={async (enabled) => updateRtcPreference('enabled', enabled)}
											size="sm"
											label="Enable real-time editing"
											hideLabel={true}
										/>
									</div>
									<div class="flex items-center justify-between gap-3" data-testid="pref-rtc-sound">
										<span class="flex min-w-0 items-center gap-1 text-sm text-surface-600 dark:text-surface-400">
											Sound notifications
											<SystemTooltip title={helpTitle('rtc-sound')}>
												<button
													type="button"
													tabindex="-1"
													aria-label="Help: Sound notifications"
													class={helpBtnClass}
												>
													<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"></iconify-icon>
												</button>
											</SystemTooltip>
										</span>
										<Checkbox
											checked={serverUser?.preferences?.rtc?.sound ?? true}
											onchange={async (sound) => updateRtcPreference('sound', sound)}
											size="sm"
											label="Enable sound notifications"
											hideLabel={true}
										/>
									</div>
								</div>
							</div>
						</div>
					</AdminCard>

					<AdminCard class={cardClass}>
						<h3 class="mb-3 text-sm font-semibold uppercase tracking-wider text-surface-500">
							Privacy &amp; extensions
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
									<p class="flex items-center gap-1 text-sm font-medium text-surface-900 dark:text-surface-100">
										Privacy &amp; Data (GDPR)
										<SystemTooltip title={helpTitle('privacy')}>
											<button
												type="button"
												tabindex="-1"
												aria-label="Help: Privacy and Data GDPR"
												class={helpBtnClass}
											>
												<iconify-icon icon="mdi:help-circle-outline" width={16} aria-hidden="true"></iconify-icon>
											</button>
										</SystemTooltip>
									</p>
								</div>
								<button
									type="button"
									onclick={modalPrivacyData}
									data-testid="privacy-data-btn"
									aria-label="Privacy and Data GDPR — open export and erase options"
									class="flex w-full items-center gap-3 rounded-lg border border-surface-500/30 p-3 text-start transition-colors hover:bg-surface-500/10 dark:border-surface-500/40 dark:hover:bg-surface-800/50"
								>
									<div class="min-w-0 flex-1">
										<p class="text-sm font-medium text-surface-900 dark:text-surface-100">
											View, export, or erase your data
										</p>
										<p class="text-xs text-surface-500">
											Opens a secure dialog for download and anonymize actions
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
						Manage organization accounts and invitation tokens. Use search and column tools in the toolbar below.
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
				Confirm your password
			</h3>
			<p class="mt-1 text-sm text-surface-500 dark:text-surface-400">
				Required to sign out other sessions or devices.
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
					label="Current password"
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
						Cancel
					</Button>
					<Button type="submit" variant="primary" disabled={reauthBusy || !reauthPassword}>
						{reauthBusy ? 'Verifying…' : 'Confirm'}
					</Button>
				</div>
			</form>
		</div>
	</div>
{/if}
