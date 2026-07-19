<!--
@file src/routes/(app)/user/+page.svelte
@component
**This file sets up and displays the user page, providing a streamlined interface for managing user accounts and settings**

@example
<User />

### Props
- `users` {array} - Array of users

### Features
- Displays a list of users
- Provides a user-friendly interface for managing user accounts and settings
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Avatar from "@components/ui/avatar.svelte";
	import Badge from '@components/ui/badge.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import PermissionGuard from '@src/components/permission-guard.svelte';
	// ParaglideJS
	import {
		button_delete,
		email,
		role,
		usermodalconfirmbody,
		usermodalconfirmtitle,
		usermodaluser_edittitle,
		usermodaluser_settingbody,
		usermodaluser_settingtitle,
		username,
		userpage_edit_usersetting,
		userpage_editavatar,
		userpage_title,
		userpage_user_id
	} from '@src/paraglide/messages';
	// Stores
	import { normalizeAvatarUrl } from '@src/stores/store.svelte.ts';
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import AdminArea from './components/admin-area.svelte';
	// Auth
	import ModalTwoFactorAuth from './components/modal-two-factor-auth.svelte';
	import '@src/stores/store.svelte.ts';
	import { setCollection } from '@src/stores/collection-store.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { triggerActionStore } from '@utils/global-search-index';
	import { modalState } from '@utils/modal.svelte';
	import { showConfirm } from '@utils/modal.svelte';
	import ModalEditAvatar from './components/modal-edit-avatar.svelte';
	import ModalEditForm from './components/modal-edit-form.svelte';
	import ModalPrivacyData from './components/modal-privacy-data.svelte';
	import { getActiveSessions, revokeSession } from './user.remote';

	// Props
	const { data } = $props();
	const { user: serverUser, isFirstUser, isMultiTenant, is2FAEnabledGlobal } = $derived(data);

	// Role permissions fallback when user.permissions is empty (display only)
	const rolePermissionFallback = $derived.by(() => {
		const roles = (data.roles ?? []) as Array<{ _id?: string; name?: string; permissions?: string[] }>;
		const roleKey = serverUser?.role;
		const match = roles.find((r) => r._id === roleKey || r.name === roleKey);
		return Array.isArray(match?.permissions) ? match.permissions : [];
	});

	// Make user data reactive — permissions come from load (locals / user / role)
	const user = $derived({
		_id: serverUser?._id ?? '',
		email: serverUser?.email ?? '',
		username: serverUser?.username ?? '',
		role: serverUser?.role ?? '',
		avatar: serverUser?.avatar ?? '/Default_User.svg',
		tenantId: serverUser?.tenantId ?? '',
		is2FAEnabled: serverUser?.is2FAEnabled ?? false,
		isAdmin: serverUser?.isAdmin ?? false,
		permissions: Array.isArray(serverUser?.permissions) && serverUser.permissions.length > 0
			? (serverUser.permissions as string[])
			: rolePermissionFallback
	});

	// Active sessions (security card)
	type SessionRow = {
		_id?: string;
		id?: string;
		isCurrent?: boolean;
		userAgent?: string;
		ip?: string;
		createdAt?: string;
		lastAccess?: string;
	};
	let sessions = $state<SessionRow[]>([]);
	let sessionsLoading = $state(false);
	let sessionsError = $state<string | null>(null);

	async function loadSessions(): Promise<void> {
		sessionsLoading = true;
		sessionsError = null;
		try {
			const result = await getActiveSessions(undefined as any);
			if (result.error) {
				sessionsError = result.error;
				sessions = [];
			} else {
				sessions = (result.sessions ?? []) as SessionRow[];
			}
		} catch (err) {
			sessionsError = err instanceof Error ? err.message : 'Failed to load sessions';
			sessions = [];
		} finally {
			sessionsLoading = false;
		}
	}

	async function handleRevokeSession(session: SessionRow): Promise<void> {
		const sessionId = String(session._id ?? session.id ?? '');
		if (!sessionId || session.isCurrent) return;
		try {
			const result = await revokeSession(sessionId);
			if (!result.success) {
				toast.error({ title: 'Revoke failed', description: result.error || 'Could not revoke session' });
				return;
			}
			toast.success({ title: 'Session revoked', description: 'The device was signed out.' });
			await loadSessions();
		} catch (err) {
			toast.error({
				title: 'Revoke failed',
				description: err instanceof Error ? err.message : 'Could not revoke session'
			});
		}
	}

	function sessionLabel(session: SessionRow): string {
		const ua = session.userAgent?.trim();
		if (ua) return ua.length > 48 ? `${ua.slice(0, 48)}…` : ua;
		if (session.ip) return `IP ${session.ip}`;
		return 'Unknown device';
	}

	// Role display lookup (icon + full name per role)
	const roleDisplay = $derived.by(() => {
		const r = String(user.role).toLowerCase();
		switch (r) {
			case 'admin':       return { icon: 'material-symbols:verified-outline', name: 'Administrator' };
			case 'developer':    return { icon: 'material-symbols:code', name: 'Developer' };
			case 'editor':      return { icon: 'material-symbols:edit', name: 'Editor' };
			case 'guest':       return { icon: 'material-symbols:person', name: 'Guest' };
			default:            return { icon: 'material-symbols:person', name: user.role };
		}
	});

	// Function to open 2FA modal
	function open2FAModal(): void {
		modalState.trigger(ModalTwoFactorAuth, { user, size: 'fullscreen' }, async (r: any) => {
			if (r) {
				// Refresh user data after 2FA changes
				await invalidateAll();
			}
		});
	}

	// Function to update user preferences
	  async function updateRtcPreference(key: string, value: boolean) {
	    const isAuth = ['passkeyEnabled', 'magicLinkEnabled', 'oauthEnabled'].includes(key);
	    const prefs = serverUser?.preferences as Record<string, any> | undefined;
	    const newUserData = {
	      preferences: {
	        ...prefs,
	        ...(isAuth ? {
	          auth: {
	            ...prefs?.auth,
	            [key]: value
	          }
	        } : {
	          rtc: {
	            ...prefs?.rtc,
	            [key]: value
	          }
	        }),
	      },
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
				await invalidateAll();
			} else if (res.status === 401 || res.status === 403) {
				toast.error({ title: 'Auth error', description: 'Please reload the page and try again.' });
			} else {
				const body = await res.json().catch(() => ({}));
				toast.error({ title: 'Update failed', description: (body as any).message || `HTTP ${res.status}` });
			}
		} catch (err) {
			toast.error({ title: 'Network error', description: err instanceof Error ? err.message : 'Could not reach server' });
		}
	}

	// Function to execute actions
	function executeActions() {
		const actions = $triggerActionStore;
		if (actions.length === 1) {
			actions[0]();
		} else {
			for (const action of actions) {
				action();
			}
		}
		triggerActionStore.set([]);
	}

	// Execute actions on mount if triggerActionStore has data
	onMount(() => {
		if ($triggerActionStore.length > 0) {
			executeActions();
		}
		setCollection(null);
		// Prefetch active sessions for the Security card (non-blocking)
		loadSessions().catch(() => {});
	});

	// Modal Trigger - User Form
	function modalUserForm(): void {
		modalState.trigger(ModalEditForm, {
			title: usermodaluser_edittitle(),
			body: usermodaluser_settingbody() || 'Update your user details below.'
		});
	}

	// Modal Trigger - Edit Avatar
	function modalEditAvatar(): void {
		modalState.trigger(
			ModalEditAvatar,
			{
				title: usermodaluser_settingtitle(),
				body: usermodaluser_settingbody(),
				size: 'lg'
			},
			async (r: any) => {
				if (r) {
					toast.success({
						description: '<iconify-icon icon="radix-icons:avatar" width={24} ></iconify-icon> Avatar Updated'
					});
				}
			}
		);
	}

	// Modal Trigger - Privacy & Data (GDPR)
	function modalPrivacyData(): void {
		modalState.trigger(ModalPrivacyData as any, { user });
	}

	// Modal Confirm — first-user self-delete uses the same batch endpoint as admin bulk delete
	function modalConfirm(): void {
		showConfirm({
			title: usermodalconfirmtitle(),
			body: usermodalconfirmbody(),
			onConfirm: async () => {
				if (!user._id) {
					toast.error({ title: 'Delete failed', description: 'Missing user id' });
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
						toast.success({ title: 'Account deleted', description: 'Your account has been removed.' });
						await invalidateAll();
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
</script>

<AdminPageShell title={userpage_title()} icon="mdi:account-circle" showBackButton={true} backUrl="/config">
<div in:fade={{ duration: 300 }}>
	<h2 class="sr-only">Profile Information</h2>

	<!-- ── 3-Column Profile Layout (Linear/GitHub-style) ── -->
	<div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">

		<!-- ═══ COLUMN 1: Identity ═══ -->
		<section in:fly={{ y: 20, delay: 50, duration: 300 }}>
			<AdminCard class="border border-surface-200 bg-white dark:bg-surface-900/60 dark:border-surface-800 p-6 shadow-sm">
				<!-- Section header -->
				<div class="flex items-center justify-between gap-2 mb-5 pb-3 border-b border-surface-200 dark:border-surface-700">
					<div class="flex items-center gap-2">
						<iconify-icon icon="mdi:account-circle" class="text-tertiary-500 dark:text-primary-500" width={20}></iconify-icon>
						<h3 class="text-base font-semibold text-surface-900 dark:text-surface-100">Identity</h3>
					</div>
					<button
						onclick={modalUserForm}
						title={userpage_edit_usersetting()}
						aria-label={userpage_edit_usersetting()}
						data-testid="edit-user-settings-btn"
						class="rounded p-1.5 text-surface-500 transition-colors hover:bg-surface-100 hover:text-surface-900 dark:text-surface-400 dark:hover:bg-surface-700 dark:hover:text-surface-100"
					>
						<iconify-icon icon="bi:pencil-fill" width={18}></iconify-icon>
					</button>
				</div>

				<!-- Avatar (centered, with edit overlay) -->
				<div class="flex flex-col items-center mb-5">
					<button
						onclick={modalEditAvatar}
						title={userpage_editavatar()}
						aria-label={userpage_editavatar()}
						class="relative group mb-3 cursor-pointer"
					>
						<Avatar
							src={normalizeAvatarUrl(user.avatar)}
							initials="AV"
							size="size-24"
							class="rounded-full border-2 border-surface-200 dark:border-surface-600 shadow-md pointer-events-none"
						/>
						<!-- Pencil icon indicator top-left -->
						<span class="absolute top-0 inset-s-0 p-1.5 rounded-full bg-tertiary-500 dark:bg-primary-500 text-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
							<iconify-icon icon="bi:pencil-fill" width={14}></iconify-icon>
						</span>
					</button>
				</div>

				<!-- Identity fields (read-only display) -->
				<div class="space-y-3">
					<div>
						<span class="flex items-center gap-1.5 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-1">
							<iconify-icon icon="mdi:account" width={14} class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
							{username()}
						</span>
						<p class="text-sm font-medium text-surface-900 dark:text-surface-100">{user.username || '—'}</p>
					</div>
					<div>
						<span class="flex items-center gap-1.5 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-1">
							<iconify-icon icon="mdi:email-outline" width={14} class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
							{email()}
						</span>
						<p class="text-sm font-medium text-surface-900 dark:text-surface-100">{user.email || '—'}</p>
					</div>
					<div>
						<span class="flex items-center gap-1.5 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-1">
							<iconify-icon icon="mdi:shield-account-outline" width={14} class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
							{role()}
						</span>
							<Badge variant="primary" class="text-white">
								<iconify-icon icon={roleDisplay.icon} width={20} ></iconify-icon>
								{roleDisplay.name}
							</Badge>
					</div>
					<div>
						<span class="flex items-center gap-1.5 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-1">
							<iconify-icon icon="mdi:identifier" width={14} class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
							{userpage_user_id()}
						</span>
						<Badge preset="tonal" color="tertiary" size="sm" class="font-mono">{user._id || 'N/A'}</Badge>
					</div>
					{#if isMultiTenant && user?.tenantId}
						<div>
							<span class="flex items-center gap-1.5 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-1">
								<iconify-icon icon="mdi:domain" width={14}></iconify-icon>
								Tenant ID
							</span>
							<p class="text-xs font-mono text-surface-600 dark:text-surface-400 truncate">{user.tenantId}</p>
						</div>
					{/if}
				</div>

				<!-- Identity actions -->
				{#if isFirstUser}
					<div class="mt-5 pt-4 border-t border-surface-200 dark:border-surface-700">
						<Button
							variant="outline"
							size="sm"
							leadingIcon="bi:trash3-fill"
							onclick={modalConfirm}
							class="w-full justify-start preset-ghost-error-500"
						>
							{button_delete()}
						</Button>
					</div>
				{/if}
			</AdminCard>
		</section>

		<!-- ═══ COLUMN 2: Security ═══ -->
		<section in:fly={{ y: 20, delay: 100, duration: 300 }}>
			<AdminCard class="border border-surface-200 bg-white dark:bg-surface-900/60 dark:border-surface-800 p-6 shadow-sm h-full">
				<div class="flex justify-center items-center gap-2 mb-5 pb-3 border-b border-surface-200 dark:border-surface-700">
					<iconify-icon icon="mdi:shield-lock-outline" class="text-tertiary-500 dark:text-primary-500" width={20}></iconify-icon>
					<h3 class="text-base font-semibold text-surface-900 dark:text-surface-100">Security</h3>
				</div>

				<div class="space-y-4">
					<!-- Password -->
					<div class="pb-4 border-b border-surface-100 dark:border-surface-800">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<iconify-icon icon="mdi:key-variant" class="text-surface-500" width={18}></iconify-icon>
								<div>
									<p class="text-sm font-medium text-surface-900 dark:text-surface-100">Password</p>
									<p class="text-xs text-surface-500 dark:text-surface-400">Change your account password</p>
								</div>
							</div>
							<Button variant="surface" size="sm" onclick={modalUserForm} class="text-xs">
								Change
							</Button>
						</div>
					</div>

					<!-- Two-Factor Auth -->
					{#if is2FAEnabledGlobal}
						<div class="pb-4 border-b border-surface-100 dark:border-surface-800">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-2">
									<iconify-icon icon="mdi:two-factor-authentication" class="text-surface-500" width={18}></iconify-icon>
									<div>
										<p class="text-sm font-medium text-surface-900 dark:text-surface-100">Two-Factor Auth</p>
										<p class="text-xs {user?.is2FAEnabled ? 'text-success-500' : 'text-surface-500 dark:text-surface-400'}">
											{user?.is2FAEnabled ? 'Enabled' : 'Not configured'}
										</p>
									</div>
								</div>
								<Button variant="surface" size="sm" onclick={open2FAModal} class="text-xs {user?.is2FAEnabled ? 'text-success-500' : ''}">
									{user?.is2FAEnabled ? 'Manage' : 'Setup'}
								</Button>
							</div>
						</div>
					{/if}

					<!-- Passkeys -->
					<div class="pb-4 border-b border-surface-100 dark:border-surface-800" data-testid="pref-passkey">
						<div class="flex items-center justify-between gap-2">
							<div class="flex items-center gap-2 min-w-0">
								<iconify-icon icon="mdi:fingerprint" class="text-surface-500 shrink-0" width={18}></iconify-icon>
								<div class="min-w-0">
									<p class="text-sm font-medium text-surface-900 dark:text-surface-100">Passkeys</p>
									<p class="text-xs text-surface-500 dark:text-surface-400">Prefer passwordless biometric login when available</p>
								</div>
							</div>
							<Checkbox
								checked={(serverUser?.preferences as any)?.auth?.passkeyEnabled ?? false}
								onchange={async (enabled) => updateRtcPreference('passkeyEnabled' as any, enabled)}
								size="sm"
								label="Enable passkey preference"
								hideLabel={true}
							/>
						</div>
					</div>

					<!-- Magic Link -->
					<div class="pb-4 border-b border-surface-100 dark:border-surface-800" data-testid="pref-magic-link">
						<div class="flex items-center justify-between gap-2">
							<div class="flex items-center gap-2 min-w-0">
								<iconify-icon icon="mdi:magic-staff" class="text-surface-500 shrink-0" width={18}></iconify-icon>
								<div class="min-w-0">
									<p class="text-sm font-medium text-surface-900 dark:text-surface-100">Magic Link</p>
									<p class="text-xs text-surface-500 dark:text-surface-400">Prefer passwordless email login when available</p>
								</div>
							</div>
							<Checkbox
								checked={(serverUser?.preferences as any)?.auth?.magicLinkEnabled ?? false}
								onchange={async (enabled) => updateRtcPreference('magicLinkEnabled' as any, enabled)}
								size="sm"
								label="Enable magic link preference"
								hideLabel={true}
							/>
						</div>
					</div>

					<!-- OAuth -->
					<div class="pb-4 border-b border-surface-100 dark:border-surface-800" data-testid="pref-oauth">
						<div class="flex items-center justify-between gap-2">
							<div class="flex items-center gap-2 min-w-0">
								<iconify-icon icon="mdi:account-group-outline" class="text-surface-500 shrink-0" width={18}></iconify-icon>
								<div class="min-w-0">
									<p class="text-sm font-medium text-surface-900 dark:text-surface-100">OAuth Login</p>
									<p class="text-xs text-surface-500 dark:text-surface-400">Prefer sign-in with Google, GitHub when configured</p>
								</div>
							</div>
							<Checkbox
								checked={(serverUser?.preferences as any)?.auth?.oauthEnabled ?? false}
								onchange={async (enabled) => updateRtcPreference('oauthEnabled' as any, enabled)}
								size="sm"
								label="Enable OAuth login preference"
								hideLabel={true}
							/>
						</div>
					</div>

					<!-- Active Sessions -->
					<div class="pb-4 border-b border-surface-100 dark:border-surface-800" data-testid="active-sessions-section">
						<div class="flex items-center justify-between gap-2 mb-2">
							<div class="flex items-center gap-2">
								<iconify-icon icon="mdi:devices" class="text-surface-500" width={18}></iconify-icon>
								<p class="text-sm font-medium text-surface-900 dark:text-surface-100">Active Sessions</p>
							</div>
							<Button
								variant="surface"
								size="sm"
								class="text-xs"
								onclick={loadSessions}
								disabled={sessionsLoading}
								aria-label="Refresh active sessions"
							>
								{sessionsLoading ? 'Loading…' : 'Refresh'}
							</Button>
						</div>
						{#if sessionsError}
							<p class="text-xs text-error-500" role="alert">{sessionsError}</p>
						{:else if sessions.length === 0 && !sessionsLoading}
							<p class="text-xs text-surface-500 dark:text-surface-400">No other sessions found.</p>
						{:else}
							<ul class="space-y-2 max-h-40 overflow-y-auto" aria-label="Active sessions list">
								{#each sessions as session (String(session._id ?? session.id))}
									<li class="flex items-center justify-between gap-2 text-xs">
										<span class="min-w-0 truncate text-surface-700 dark:text-surface-300" title={sessionLabel(session)}>
											{sessionLabel(session)}
											{#if session.isCurrent}
												<Badge preset="tonal" color="success" size="sm" class="ms-1">This device</Badge>
											{/if}
										</span>
										{#if !session.isCurrent}
											<Button
												variant="outline"
												size="sm"
												class="text-xs shrink-0"
												onclick={() => handleRevokeSession(session)}
												aria-label="Revoke session"
											>
												Revoke
											</Button>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</div>

					<!-- Permissions -->
					{#if user.permissions.length > 0}
						<div data-testid="user-permissions-list">
							<div class="flex items-center gap-2 mb-2">
								<iconify-icon icon="mdi:shield-check" class="text-surface-500" width={18}></iconify-icon>
								<p class="text-sm font-medium text-surface-900 dark:text-surface-100">Permissions</p>
							</div>
							<div class="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
								{#each user.permissions as permission (permission)}
									<Badge preset="tonal" color="primary" size="sm">{permission}</Badge>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</AdminCard>
		</section>

		<!-- ═══ COLUMN 3: Preferences ═══ -->
		<section in:fly={{ y: 20, delay: 150, duration: 300 }}>
			<AdminCard class="border border-surface-200 bg-white dark:bg-surface-900/60 dark:border-surface-800 p-6 shadow-sm h-full">
				<div class="flex justify-center items-center gap-2 mb-5 pb-3 border-b border-surface-200 dark:border-surface-700">
					<iconify-icon icon="mdi:tune-variant" class="text-tertiary-500 dark:text-primary-500" width={20}></iconify-icon>
					<h3 class="text-base font-semibold text-surface-900 dark:text-surface-100">Preferences</h3>
				</div>

				<div class="space-y-4">
					<!-- Workspace Appearance — native <a> so href + data-testid are always on the DOM node -->
					<div
						class="pb-4 border-b border-surface-100 dark:border-surface-800"
						data-testid="workspace-appearance-section"
					>
						<div class="flex justify-center items-center gap-2 mb-2">
							<iconify-icon icon="mdi:palette-outline" class="text-tertiary-500 dark:text-primary-500" width={18}></iconify-icon>
							<p class="text-sm font-medium text-surface-900 dark:text-surface-100">Workspace Appearance</p>
						</div>
						<p class="text-xs text-surface-500 dark:text-surface-400 mb-2">
							Density, layout regions, card style, and accessibility.
						</p>
						{#if serverUser?.preferences?.theme?.density || serverUser?.preferences?.theme?.variant}
							<div class="flex flex-wrap gap-1 mb-2">
								{#if serverUser?.preferences?.theme?.density}
									<Badge preset="tonal" color="secondary" size="sm">{serverUser.preferences.theme.density}</Badge>
								{/if}
								{#if serverUser?.preferences?.theme?.variant}
									<Badge preset="tonal" color="secondary" size="sm">{serverUser.preferences.theme.variant}</Badge>
								{/if}
							</div>
						{/if}
						<a
							href="/config/appearance"
							data-testid="open-appearance-settings-btn"
							aria-label="Open Appearance Settings"
							data-sveltekit-preload-data="hover"
							class="btn preset-outlined-surface-500 relative inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-(--admin-radius-button,0.25rem)] px-3 text-xs font-bold tracking-tight transition-all duration-200 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-500 dark:focus-visible:ring-surface-300"
						>
							<iconify-icon icon="mdi:open-in-new" width={14} class="me-1" aria-hidden="true"></iconify-icon>
							Open Appearance Settings
						</a>
					</div>

					<!-- Collaboration -->
					<div class="pb-4 border-b border-surface-100 dark:border-surface-800">
						<div class="flex justify-center items-center gap-2 mb-3">
							<iconify-icon icon="mdi:forum" class="text-tertiary-500 dark:text-primary-500" width={18}></iconify-icon>
							<p class="text-sm font-medium text-surface-900 dark:text-surface-100">Collaboration</p>
						</div>
						<div class="space-y-3" data-testid="collaboration-prefs">
							<div class="flex items-center justify-between" data-testid="pref-rtc-enabled">
								<span class="text-sm text-surface-700 dark:text-surface-300">Real-time editing</span>
								<Checkbox
									checked={serverUser?.preferences?.rtc?.enabled ?? true}
									onchange={async (enabled) => updateRtcPreference('enabled', enabled)}
									size="sm"
									label="Enable real-time editing"
									hideLabel={true}
								/>
							</div>
							<div class="flex items-center justify-between" data-testid="pref-rtc-sound">
								<span class="text-sm text-surface-700 dark:text-surface-300">Sound notifications</span>
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

					<!-- Privacy & Data (GDPR) -->
					<div data-testid="privacy-data-section">
						<button
							onclick={modalPrivacyData}
							data-testid="privacy-data-btn"
							aria-label="Privacy and Data GDPR"
							class="w-full flex items-center gap-2 p-3 rounded-lg border border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors text-start"
						>
							<iconify-icon icon="mdi:shield-account" class="text-tertiary-500 dark:text-primary-500" width={18}></iconify-icon>
							<div class="flex-1">
								<p class="text-sm font-medium text-surface-900 dark:text-surface-100">Privacy & Data (GDPR)</p>
								<p class="text-xs text-surface-500 dark:text-surface-400">View, export, or delete your data</p>
							</div>
							<iconify-icon icon="mdi:chevron-right" class="text-surface-400" width={16}></iconify-icon>
						</button>
					</div>
				</div>
			</AdminCard>
		</section>
	</div>

	<!-- ═══ Admin Area (full-width, below profile) ═══ -->
	<PermissionGuard
		{...({
			config: {
				name: 'Admin Area Access',
				contextId: 'config/adminArea',
				action: 'manage',
				contextType: 'system',
				description: 'Allows access to admin area for user management'
			},
			silent: true
		} as any)}
	>
		<div in:fly={{ y: 20, delay: 200, duration: 300 }}>
			<AdminArea currentUser={user as any} isMultiTenant={isMultiTenant!} roles={data.roles as any} />
		</div>
	</PermissionGuard>
</div>
</AdminPageShell>
