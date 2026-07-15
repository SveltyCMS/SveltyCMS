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

	// Props
	const { data } = $props();
	const { user: serverUser, isFirstUser, isMultiTenant, is2FAEnabledGlobal } = $derived(data);

	// Make user data reactive
	const user = $derived({
		_id: serverUser?._id ?? '',
		email: serverUser?.email ?? '',
		username: serverUser?.username ?? '',
		role: serverUser?.role ?? '',
		avatar: serverUser?.avatar ?? '/Default_User.svg',
		tenantId: serverUser?.tenantId ?? '', // Add tenantId
		is2FAEnabled: serverUser?.is2FAEnabled ?? false,
		isAdmin: serverUser?.isAdmin ?? false, // Add isAdmin property
		permissions: []
	});

	// Function to open 2FA modal
	function open2FAModal(): void {
		modalState.trigger(ModalTwoFactorAuth, { user }, async (r: any) => {
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
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: 'self', newUserData })
			});

			if (res.ok) {
				toast.success('Preferences updated');
				await invalidateAll();
			} else {
				toast.error('Failed to update preferences');
			}
		} catch {
			toast.error('Error updating preferences');
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

		// Note: Avatar initialization is handled by the layout component
		// to ensure consistent avatar state across the application
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

	// Modal Confirm
	function modalConfirm(): void {
		showConfirm({
			title: usermodalconfirmtitle(),
			body: usermodalconfirmbody(),
			// confirmText: usermodalconfirmdeleteuser(),
			onConfirm: async () => {
				const res = await fetch('/api/user/deleteUsers', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify([user])
				});
				if (res.status === 200) {
					await invalidateAll();
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
				<div class="flex items-center gap-2 mb-5 pb-3 border-b border-surface-200 dark:border-surface-700">
					<iconify-icon icon="mdi:account-circle" class="text-tertiary-500 dark:text-primary-400" width={20}></iconify-icon>
					<h3 class="text-base font-semibold text-surface-900 dark:text-surface-100">Identity</h3>
				</div>

				<!-- Avatar (centered, with edit overlay) -->
				<div class="flex flex-col items-center mb-5">
					<div class="relative group mb-3">
						<Avatar
							src={normalizeAvatarUrl(user.avatar)}
							initials="AV"
							size="size-24"
							class="rounded-full border-2 border-surface-200 dark:border-surface-600 shadow-md"
						/>
						<!-- Edit overlay -->
						<button
							onclick={modalEditAvatar}
							title={userpage_editavatar()}
							class="absolute bottom-0 inset-e-0 p-1.5 rounded-full bg-tertiary-500 dark:bg-primary-500 text-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity hover:scale-110"
						>
							<iconify-icon icon="mdi:camera-plus" width={16}></iconify-icon>
						</button>
					</div>
					<span class="text-sm font-medium text-surface-600 dark:text-surface-300">Click avatar to change</span>
				</div>

				<!-- Identity fields (read-only display) -->
				<div class="space-y-3">
					<div>
						<span class="block text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-1">{username()}</span>
						<p class="text-sm font-medium text-surface-900 dark:text-surface-100">{user.username || '—'}</p>
					</div>
					<div>
						<span class="block text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-1">{email()}</span>
						<p class="text-sm font-medium text-surface-900 dark:text-surface-100">{user.email || '—'}</p>
					</div>
					<div>
						<span class="block text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-1">{role()}</span>
						<p class="text-sm font-medium text-surface-900 dark:text-surface-100 capitalize">{user.role || '—'}</p>
					</div>
					<div>
						<span class="block text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-1">{userpage_user_id()}</span>
						<p class="text-xs font-mono text-surface-600 dark:text-surface-400 truncate">{user._id || 'N/A'}</p>
					</div>
					{#if isMultiTenant && user?.tenantId}
						<div>
							<span class="block text-xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-1">Tenant ID</span>
							<p class="text-xs font-mono text-surface-600 dark:text-surface-400 truncate">{user.tenantId}</p>
						</div>
					{/if}
				</div>

				<!-- Identity actions -->
				<div class="mt-5 pt-4 border-t border-surface-200 dark:border-surface-700 space-y-2">
					<Button
						variant="outline"
						size="sm"
						leadingIcon="bi:pencil-fill"
						onclick={modalUserForm}
						aria-label="Edit User Settings"
						data-testid="edit-user-settings-btn"
						class="w-full justify-start"
					>
						{userpage_edit_usersetting()}
					</Button>
					{#if isFirstUser}
						<Button
							variant="outline"
							size="sm"
							leadingIcon="bi:trash3-fill"
							onclick={modalConfirm}
							class="w-full justify-start preset-ghost-error-500"
						>
							{button_delete()}
						</Button>
					{/if}
				</div>
			</AdminCard>
		</section>

		<!-- ═══ COLUMN 2: Security ═══ -->
		<section in:fly={{ y: 20, delay: 100, duration: 300 }}>
			<AdminCard class="border border-surface-200 bg-white dark:bg-surface-900/60 dark:border-surface-800 p-6 shadow-sm h-full">
				<div class="flex items-center gap-2 mb-5 pb-3 border-b border-surface-200 dark:border-surface-700">
					<iconify-icon icon="mdi:shield-lock-outline" class="text-tertiary-500 dark:text-primary-400" width={20}></iconify-icon>
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
							<Button variant="ghost" size="sm" onclick={modalUserForm} class="text-xs">
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
								<Button variant="ghost" size="sm" onclick={open2FAModal} class="text-xs {user?.is2FAEnabled ? 'text-success-500' : ''}">
									{user?.is2FAEnabled ? 'Manage' : 'Setup'}
								</Button>
							</div>
						</div>
					{/if}

					<!-- Passkeys -->
					<div class="pb-4 border-b border-surface-100 dark:border-surface-800">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<iconify-icon icon="mdi:fingerprint" class="text-surface-500" width={18}></iconify-icon>
								<div>
									<p class="text-sm font-medium text-surface-900 dark:text-surface-100">Passkeys</p>
									<p class="text-xs text-surface-500 dark:text-surface-400">Passwordless biometric login</p>
								</div>
							</div>
							<Checkbox
								checked={(serverUser?.preferences as any)?.auth?.passkeyEnabled ?? false}
								onchange={async (enabled) => updateRtcPreference('passkeyEnabled' as any, enabled)}
								size="sm"
							/>
						</div>
					</div>

					<!-- Magic Link -->
					<div class="pb-4 border-b border-surface-100 dark:border-surface-800">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<iconify-icon icon="mdi:magic-staff" class="text-surface-500" width={18}></iconify-icon>
								<div>
									<p class="text-sm font-medium text-surface-900 dark:text-surface-100">Magic Link</p>
									<p class="text-xs text-surface-500 dark:text-surface-400">Passwordless email login</p>
								</div>
							</div>
							<Checkbox
								checked={(serverUser?.preferences as any)?.auth?.magicLinkEnabled ?? false}
								onchange={async (enabled) => updateRtcPreference('magicLinkEnabled' as any, enabled)}
								size="sm"
							/>
						</div>
					</div>

					<!-- OAuth -->
					<div class="pb-4 border-b border-surface-100 dark:border-surface-800">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<iconify-icon icon="mdi:account-group-outline" class="text-surface-500" width={18}></iconify-icon>
								<div>
									<p class="text-sm font-medium text-surface-900 dark:text-surface-100">OAuth Login</p>
									<p class="text-xs text-surface-500 dark:text-surface-400">Sign in with Google, GitHub</p>
								</div>
							</div>
							<Checkbox
								checked={(serverUser?.preferences as any)?.auth?.oauthEnabled ?? false}
								onchange={async (enabled) => updateRtcPreference('oauthEnabled' as any, enabled)}
								size="sm"
							/>
						</div>
					</div>

					<!-- Permissions -->
					{#if user.permissions.length > 0}
						<div>
							<div class="flex items-center gap-2 mb-2">
								<iconify-icon icon="mdi:shield-check" class="text-surface-500" width={18}></iconify-icon>
								<p class="text-sm font-medium text-surface-900 dark:text-surface-100">Permissions</p>
							</div>
							<div class="flex flex-wrap gap-1">
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
				<div class="flex items-center gap-2 mb-5 pb-3 border-b border-surface-200 dark:border-surface-700">
					<iconify-icon icon="mdi:tune-variant" class="text-tertiary-500 dark:text-primary-400" width={20}></iconify-icon>
					<h3 class="text-base font-semibold text-surface-900 dark:text-surface-100">Preferences</h3>
				</div>

				<div class="space-y-4">
					<!-- Workspace Appearance -->
					<div class="pb-4 border-b border-surface-100 dark:border-surface-800">
						<div class="flex items-center gap-2 mb-2">
							<iconify-icon icon="mdi:palette-outline" class="text-surface-500" width={18}></iconify-icon>
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
						<Button variant="outline" size="sm" href="/config/appearance" class="w-full text-xs">
							<iconify-icon icon="mdi:open-in-new" width={14} class="me-1"></iconify-icon>
							Open Appearance Settings
						</Button>
					</div>

					<!-- Collaboration -->
					<div class="pb-4 border-b border-surface-100 dark:border-surface-800">
						<div class="flex items-center gap-2 mb-3">
							<iconify-icon icon="mdi:forum" class="text-surface-500" width={18}></iconify-icon>
							<p class="text-sm font-medium text-surface-900 dark:text-surface-100">Collaboration</p>
						</div>
						<div class="space-y-3">
							<div class="flex items-center justify-between">
								<span class="text-sm text-surface-700 dark:text-surface-300">Real-time editing</span>
								<Checkbox
									checked={serverUser?.preferences?.rtc?.enabled ?? true}
									onchange={async (enabled) => updateRtcPreference('enabled', enabled)}
									size="sm"
								/>
							</div>
							<div class="flex items-center justify-between">
								<span class="text-sm text-surface-700 dark:text-surface-300">Sound notifications</span>
								<Checkbox
									checked={serverUser?.preferences?.rtc?.sound ?? true}
									onchange={async (sound) => updateRtcPreference('sound', sound)}
									size="sm"
								/>
							</div>
						</div>
					</div>

					<!-- Privacy & Data -->
					<div>
						<button
							onclick={modalPrivacyData}
							class="w-full flex items-center gap-2 p-3 rounded-lg border border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors text-start"
						>
							<iconify-icon icon="mdi:shield-account" class="text-surface-500" width={18}></iconify-icon>
							<div class="flex-1">
								<p class="text-sm font-medium text-surface-900 dark:text-surface-100">Privacy & Data</p>
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
			<AdminArea currentUser={{ ...user } as any} isMultiTenant={isMultiTenant!} roles={data.roles as any} />
		</div>
	</PermissionGuard>
</div>
</AdminPageShell>
