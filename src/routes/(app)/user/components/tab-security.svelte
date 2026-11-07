<!--
@file src/routes/(app)/user/components/tab-security.svelte
@component
@description Tab 2: Security — 2FA & passkeys management, active session groups, login preferences, and permissions.
Features:
- Two-factor authentication & Passkey / WebAuthn management modal triggers
- Device session grouping, active device identification, and bulk/individual revocation
- Laravel-style password re-authentication dialog for revoking sessions
- Checkbox preferences: Passkeys, Magic Links, OAuth
- Permissions badge list with direct navigation to Access Management
- Plugin zone: user_security
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import HelpIcon from '@components/ui/help-icon.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import FloatingInput from '@components/ui/floating-input.svelte';
	import Slot from '@src/components/system/slot.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { formatDateTime } from '@utils/format-date';
	import { memoizeLazyLoader } from '@utils/lazy-module';
	import { modalState, showConfirm } from '@utils/modal.svelte';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
	import { refreshAll } from '$app/navigation';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { onMount, untrack } from 'svelte';
	import type {
		UserDisplay,
		SessionRow,
		SessionGroup,
		DeviceInfo,
		DeviceKind
	} from '../user-types';
	import { helpTitle, HELP_BTN_CLASS } from '../user-help';
	import { getActiveSessions, revokeSession, reauthForSessionManagement } from '../user.remote';
	import {
		adminarea_activesession,
		button_cancel,
		button_confirm,
		button_refresh,
		common_loading,
		system_permission,
		twofa_status_disabled,
		twofa_status_enabled,
		twofa_title,
		userpage_action_manage,
		userpage_action_setup,
		userpage_authenticators_registered,
		userpage_auth_error,
		userpage_could_not_reach_server,
		userpage_current_password,
		userpage_current_session,
		userpage_current_this_tab,
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
		userpage_enable_magic_link,
		userpage_enable_oauth,
		userpage_enable_passkey,
		userpage_end_session_aria,
		userpage_end_session_body,
		userpage_end_session_confirm,
		userpage_end_session_title,
		userpage_failed_load_sessions,
		userpage_help_2fa_aria,
		userpage_help_magic_aria,
		userpage_help_oauth_aria,
		userpage_help_passkeys_aria,
		userpage_help_passkeys_biometrics_aria,
		userpage_help_permissions_aria,
		userpage_help_sessions_aria,
		userpage_last_active,
		userpage_login_prefs_title,
		userpage_magic_hint,
		userpage_magic_link,
		userpage_manage_roles_permissions,
		userpage_network_error,
		userpage_no_sessions,
		userpage_not_configured,
		userpage_nothing_to_revoke,
		userpage_oauth_hint,
		userpage_oauth_login,
		userpage_only_this_tab,
		userpage_other_sign_in,
		userpage_passkey_hint,
		userpage_passkeys,
		userpage_passkeys_biometrics_title,
		userpage_preference_disabled,
		userpage_preference_enabled,
		userpage_reauth_body,
		userpage_reauth_title,
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
		userpage_update_failed,
		userpage_verification_failed,
		userpage_verifying,
		userpage_you_are_here
	} from '@src/paraglide/messages';

	interface Props {
		user: UserDisplay;
		serverUser?: Record<string, unknown> | null;
		initialSessions?: SessionRow[] | null;
		is2FAEnabledGlobal: boolean;
		csrfToken?: string;
	}

	const { user, serverUser, initialSessions, is2FAEnabledGlobal, csrfToken }: Props = $props();

	const loadModalTwoFactorAuth = memoizeLazyLoader(() => import('./modal-two-factor-auth.svelte'));
	const loadModalPasskeyManagement = memoizeLazyLoader(
		() => import('./modal-passkey-management.svelte')
	);

	let sessions = $state<SessionRow[]>(
		untrack(() => normalizeSessions((initialSessions ?? []) as SessionRow[]))
	);
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

	async function loadSessions(refresh = false): Promise<void> {
		sessionsLoading = true;
		sessionsError = null;
		try {
			const query = getActiveSessions();
			if (refresh) await query.refresh();
			else await query;

			const result = query.current as { sessions?: unknown[]; error?: string } | undefined;
			if (query.error) {
				sessionsError = query.error.message || userpage_failed_load_sessions();
				sessions = [];
			} else if (result?.error) {
				sessionsError = result.error;
				sessions = [];
			} else {
				const rows = Array.isArray(result?.sessions) ? result.sessions : [];
				sessions = normalizeSessions(rows as SessionRow[]);
			}
		} catch (err) {
			sessionsError = err instanceof Error ? err.message : userpage_failed_load_sessions();
			sessions = [];
		} finally {
			sessionsLoading = false;
		}
	}

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

	const sessionGroups = $derived.by((): SessionGroup[] => {
		const map = new Map<string, SessionRow[]>();
		for (const s of sessions) {
			const info = parseDevice(s.userAgent);
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

		return groups.sort((a, b) => {
			if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
			return 0;
		});
	});

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

	function handleRevokeGroup(group: SessionGroup): void {
		const ids = group.revokableIds;
		if (ids.length === 0) {
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

	// Re-authentication state for cross-session revocation
	let reauthOpen = $state(false);
	let reauthPassword = $state('');
	let reauthShowPassword = $state(false);
	let reauthError = $state('');
	let reauthBusy = $state(false);
	let pendingRevokeIds: string[] = $state([]);

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
				await loadSessions(true);
			}
		} finally {
			reauthBusy = false;
		}
	}

	const otherSessionCount = $derived(sessions.filter((s) => !s.isCurrent).length);

	async function open2FAModal(): Promise<void> {
		const { default: ModalTwoFactorAuth } = await loadModalTwoFactorAuth();
		modalState.trigger(ModalTwoFactorAuth, { user, size: 'fullscreen' }, async (r: unknown) => {
			if (r) await refreshAll();
		});
	}

	async function openPasskeyModal(): Promise<void> {
		const { default: ModalPasskeyManagement } = await loadModalPasskeyManagement();
		modalState.trigger(ModalPasskeyManagement, {
			user,
			onSuccess: async () => {
				await refreshAll();
			}
		});
	}

	async function updateAuthPreference(key: string, value: boolean) {
		const prefs = (serverUser?.preferences ?? {}) as Record<string, unknown>;
		const authPrefs = (prefs.auth ?? {}) as Record<string, unknown>;
		const newUserData = {
			preferences: {
				...prefs,
				auth: { ...authPrefs, [key]: value }
			}
		};

		try {
			const res = await fetch('/api/user/update-user-attributes', {
				method: 'PUT',
				headers: clientJsonHeaders(csrfToken),
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
				const body = (await res.json().catch(() => ({}))) as { message?: string };
				toast.error({
					title: userpage_update_failed(),
					description: body.message || `HTTP ${res.status}`
				});
			}
		} catch (err) {
			toast.error({
				title: userpage_network_error(),
				description: err instanceof Error ? err.message : userpage_could_not_reach_server()
			});
		}
	}

	onMount(() => {
		if (initialSessions == null) loadSessions().catch(() => {});
	});

	const cardClass = 'border border-(--admin-border-default) p-5 sm:p-6 shadow-sm';
	const rowClass =
		'flex items-center justify-between gap-3 py-3 border-b border-surface-100 dark:border-surface-500/40 last:border-0';
	const securityActionBtn = 'min-w-[5.5rem] justify-center shrink-0';
	const securityRowIcon = 'shrink-0 text-tertiary-500 dark:text-primary-500';

	const authPrefs = $derived(
		((serverUser?.preferences ?? {}) as Record<string, Record<string, boolean>>).auth ?? {}
	);
</script>

<div
	class="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:min-h-[calc(100dvh-14rem)]"
	data-testid="user-security-panel"
>
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
							<p class="flex items-center gap-1 text-sm font-medium text-(--admin-text-body)">
								{twofa_title()}
								<SystemTooltip title={helpTitle('2fa')}>
									<HelpIcon
										ariaLabel={userpage_help_2fa_aria()}
										tabindex={0}
										class={HELP_BTN_CLASS}
									/>
								</SystemTooltip>
							</p>
							<p
								class="text-xs {user.is2FAEnabled
									? 'text-primary-600 dark:text-primary-500'
									: 'text-(--admin-text-muted)'}"
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
					<iconify-icon icon="mdi:fingerprint" class={securityRowIcon} width={20} aria-hidden="true"
					></iconify-icon>
					<div class="min-w-0">
						<p class="flex items-center gap-1 text-sm font-medium text-(--admin-text-body)">
							{userpage_passkeys_biometrics_title()}
							<SystemTooltip title={helpTitle('passkeys')}>
								<HelpIcon
									ariaLabel={userpage_help_passkeys_biometrics_aria()}
									tabindex={0}
									class={HELP_BTN_CLASS}
								/>
							</SystemTooltip>
						</p>
						<p
							class="text-xs {(user.authenticators?.length ?? 0) > 0
								? 'text-primary-600 dark:text-primary-500'
								: 'text-(--admin-text-muted)'}"
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
						<iconify-icon icon="mdi:devices" class={securityRowIcon} width={20} aria-hidden="true"
						></iconify-icon>
						<div class="flex items-center gap-1 text-sm font-medium text-(--admin-text-body)">
							{adminarea_activesession()}
							<SystemTooltip title={helpTitle('sessions')}>
								<HelpIcon
									ariaLabel={userpage_help_sessions_aria()}
									tabindex={0}
									class={HELP_BTN_CLASS}
								/>
							</SystemTooltip>
						</div>
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
							onclick={() => loadSessions(true)}
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
					<p class="text-xs text-(--admin-text-muted)">
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
											<p class="font-medium text-(--admin-text-muted)">
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
													<span class="ms-1 text-[11px] font-normal text-(--admin-text-muted)">
														({userpage_sessions_count({ count: group.sessionCount })})
													</span>
												{/if}
											</p>
											<p class="mt-0.5 text-[11px] text-(--admin-text-muted)">
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
												: 'border border-transparent bg-surface-500/10 dark:bg-surface-900/20'}"
											data-testid={member.isCurrent ? 'session-member-current' : 'session-member'}
										>
											<span class="min-w-0 text-(--admin-text-body)">
												{#if member.isCurrent}
													<span
														class="inline-flex items-center gap-1 font-bold text-primary-600 dark:text-primary-500"
													>
														<iconify-icon icon="mdi:check-circle" width={14} aria-hidden="true"
														></iconify-icon>
														{userpage_current_this_tab()}
													</span>
												{:else}
													<span class="font-medium">{userpage_other_sign_in()}</span>
												{/if}
												{#if sessionWhen(member)}
													<span>· {sessionWhen(member)}</span>
												{/if}
												{#if member.ip || member.ipAddress}
													<span class="font-mono">· {member.ip || member.ipAddress}</span>
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
				<div class="flex min-w-0 flex-1 items-center gap-3">
					<iconify-icon icon="mdi:fingerprint" class={securityRowIcon} width={20} aria-hidden="true"
					></iconify-icon>
					<div class="min-w-0 flex-1">
						<div
							class="flex w-full items-center gap-1 text-sm font-medium text-(--admin-text-body)"
						>
							{userpage_passkeys()}
							<SystemTooltip title={helpTitle('passkeys')} triggerClass="ms-auto shrink-0">
								<HelpIcon
									ariaLabel={userpage_help_passkeys_aria()}
									tabindex={0}
									class={HELP_BTN_CLASS}
								/>
							</SystemTooltip>
						</div>
						<p class="text-xs text-(--admin-text-muted)">{userpage_passkey_hint()}</p>
					</div>
				</div>
				<Checkbox
					checked={authPrefs.passkeyEnabled ?? false}
					onchange={async (enabled) => updateAuthPreference('passkeyEnabled', enabled)}
					size="sm"
					label={userpage_enable_passkey()}
					hideLabel={true}
				/>
			</div>

			<div class={rowClass} data-testid="pref-magic-link">
				<div class="flex min-w-0 flex-1 items-center gap-3">
					<iconify-icon icon="mdi:magic-staff" class={securityRowIcon} width={20} aria-hidden="true"
					></iconify-icon>
					<div class="min-w-0 flex-1">
						<div
							class="flex w-full items-center gap-1 text-sm font-medium text-(--admin-text-body)"
						>
							{userpage_magic_link()}
							<SystemTooltip title={helpTitle('magic')} triggerClass="ms-auto shrink-0">
								<HelpIcon
									ariaLabel={userpage_help_magic_aria()}
									tabindex={0}
									class={HELP_BTN_CLASS}
								/>
							</SystemTooltip>
						</div>
						<p class="text-xs text-(--admin-text-muted)">{userpage_magic_hint()}</p>
					</div>
				</div>
				<Checkbox
					checked={authPrefs.magicLinkEnabled ?? false}
					onchange={async (enabled) => updateAuthPreference('magicLinkEnabled', enabled)}
					size="sm"
					label={userpage_enable_magic_link()}
					hideLabel={true}
				/>
			</div>

			<div class={rowClass} data-testid="pref-oauth">
				<div class="flex min-w-0 flex-1 items-center gap-3">
					<iconify-icon
						icon="mdi:account-group-outline"
						class={securityRowIcon}
						width={20}
						aria-hidden="true"
					></iconify-icon>
					<div class="min-w-0 flex-1">
						<div
							class="flex w-full items-center gap-1 text-sm font-medium text-(--admin-text-body)"
						>
							{userpage_oauth_login()}
							<SystemTooltip title={helpTitle('oauth')} triggerClass="ms-auto shrink-0">
								<HelpIcon
									ariaLabel={userpage_help_oauth_aria()}
									tabindex={0}
									class={HELP_BTN_CLASS}
								/>
							</SystemTooltip>
						</div>
						<p class="text-xs text-(--admin-text-muted)">
							{userpage_oauth_hint()}
						</p>
					</div>
				</div>
				<Checkbox
					checked={authPrefs.oauthEnabled ?? false}
					onchange={async (enabled) => updateAuthPreference('oauthEnabled', enabled)}
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
						<div class="flex items-center gap-1 text-sm font-medium text-(--admin-text-body)">
							{system_permission()}
							<SystemTooltip title={helpTitle('permissions')}>
								<HelpIcon
									ariaLabel={userpage_help_permissions_aria()}
									tabindex={0}
									class={HELP_BTN_CLASS}
								/>
							</SystemTooltip>
						</div>
					</div>
					<div class="flex flex-wrap gap-1.5 overflow-y-auto">
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

{#if reauthOpen}
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
			<h3 id="reauth-title" class="text-lg font-semibold text-(--admin-text-body)">
				{userpage_reauth_title()}
			</h3>
			<p class="mt-1 text-sm text-(--admin-text-muted)">
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
