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
	import Input from '@components/ui/input.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import PermissionGuard from '@src/components/permission-guard.svelte';
	// ParaglideJS
	import {
		button_delete,
		email,
		form_password,
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
	import { avatarSrc, normalizeAvatarUrl } from '@src/stores/store.svelte.ts';
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

	// Define password as state
	let password = $state('hash-password');

	// Function to open 2FA modal
	function open2FAModal(): void {
		modalState.trigger(ModalTwoFactorAuth, { user }, async (r: any) => {
			if (r) {
				// Refresh user data after 2FA changes
				await invalidateAll();
			}
		});
	}

	// Function to update RTC preferences
	async function updateRtcPreference(key: 'enabled' | 'sound', value: boolean) {
		const newUserData = {
			preferences: {
				rtc: {
					...serverUser?.preferences?.rtc,
					[key]: value
				}
			}
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
	<div class="mb-2">
		<div class="grid grid-cols-1 gap-4 overflow-hidden md:grid-cols-2">
			<!-- Avatar with user info -->
			<div class="relative flex flex-col items-center justify-center gap-1" in:fly={{ y: 20, delay: 100, duration: 300 }}>
				<div class="relative group">
					<Avatar src={normalizeAvatarUrl(avatarSrc.value)} initials="AV" size="size-32" class="rounded-full border border-surface-200 shadow-lg dark:border-surface-700" />

					<!-- Edit button - icon overlay -->
					<Button variant="ghost"
						onclick={modalEditAvatar}
						title={userpage_editavatar()}
					 class="p-0! min-w-0 absolute bottom-0 inset-e-0 rounded-full preset-filled-tertiary-500 dark:preset-filled-primary-500">
						<iconify-icon icon="mdi:pencil" width={18}></iconify-icon>
					</Button>
				</div>
				<!-- User ID -->
				<Badge preset="tonal" color="secondary" class="mt-1 w-full max-w-xs">
					{userpage_user_id()}<span class="ms-2 font-bold">{user?._id || 'N/A'}</span>
				</Badge>
				<!-- Role -->
				<Badge preset="tonal" color="tertiary" class="w-full max-w-xs">{role()}:<span class="ms-2 font-bold">{user?.role || 'N/A'}</span></Badge>
				<!-- Tenant ID -->
				{#if isMultiTenant && user?.tenantId}
					<Badge preset="tonal" color="warning" class="w-full max-w-xs">Tenant ID:<span class="ms-2">{user?.tenantId || 'N/A'}</span></Badge>
				{/if}
				<!-- Two-Factor Authentication Status -->
				{#if is2FAEnabledGlobal}
					<Button variant="error"
						onclick={open2FAModal}
					 size="sm" class="w-full max-w-xs">
						<div class="flex w-full items-center justify-between py-1">
							<div class="flex items-center gap-2">
								<iconify-icon icon="mdi:shield-lock" width={20} class="text-error-500"></iconify-icon>
								<span class="text-sm font-bold">Two-Factor Auth</span>
							</div>
							<div class="flex items-center gap-1">
								<iconify-icon
									icon="mdi:{user?.is2FAEnabled ? 'check-decagram' : 'alert-circle'}"
									width={20}
									class={user?.is2FAEnabled ? 'text-tertiary-500 dark:text-primary-500' : 'text-error-500'}
								></iconify-icon>
								<span class="text-xs font-bold uppercase">{user?.is2FAEnabled ? 'Enabled' : 'Disabled'}</span>
							</div>
						</div>
					</Button>
				{/if}

				<!-- Workspace Appearance -->
				<AdminCard class="w-full max-w-xs p-4">
					<div class="space-y-2">
						<div class="flex items-center gap-2">
							<iconify-icon icon="mdi:palette-outline" class="text-tertiary-500 dark:text-primary-500" width={18}></iconify-icon>
							<span class="text-sm font-semibold">Workspace Appearance</span>
						</div>
						<p class="text-xs text-surface-500 dark:text-surface-400">
							Personal density, layout regions, card style, and accessibility overrides.
						</p>
						{#if serverUser?.preferences?.theme?.density || serverUser?.preferences?.theme?.variant || serverUser?.preferences?.theme?.layoutState}
							<p class="text-xs text-tertiary-600 dark:text-primary-400">
								Active:
								{serverUser.preferences.theme.density || 'theme default'}
								· {serverUser.preferences.theme.variant || 'theme default'}
								{#if serverUser.preferences.theme.layoutState}
									· {Object.keys(serverUser.preferences.theme.layoutState).length} layout override{Object.keys(serverUser.preferences.theme.layoutState).length === 1 ? '' : 's'}
								{/if}
							</p>
						{/if}
						<Button variant="outline" size="sm" href="/config/appearance" class="w-full">
							Open Appearance Settings
						</Button>
					</div>
				</AdminCard>

				<!-- Collaboration Settings -->
				<AdminCard
					class="w-full max-w-xs p-4"
				>
					<div in:fly={{ y: 10, delay: 300, duration: 300 }} class="space-y-3">
						<div class="flex items-center justify-between gap-3">
							<div class="flex items-center gap-2">
								<iconify-icon icon="mdi:forum" class="text-tertiary-500 dark:text-primary-500" width={18}></iconify-icon>
								<span class="text-sm">Real-time Collaboration</span>
							</div>
							<Checkbox
								checked={serverUser?.preferences?.rtc?.enabled ?? true}
								onchange={async (enabled) => updateRtcPreference('enabled', enabled)}
								label="Toggle real-time collaboration"
								size="sm"
							/>
						</div>
						<div class="flex items-center justify-between gap-3">
							<div class="flex items-center gap-2">
								<iconify-icon icon="material-symbols:volume-up-outline" class="text-tertiary-500 dark:text-primary-500" width={18}></iconify-icon>
								<span class="text-sm">Sound Notifications</span>
							</div>
							<Checkbox
								checked={serverUser?.preferences?.rtc?.sound ?? true}
								onchange={async (sound) => updateRtcPreference('sound', sound)}
								label="Toggle sound notifications"
								size="sm"
							/>
						</div>
					</div>
				</AdminCard>

				<!-- Permissions List -->
				{#each user.permissions as permission (permission)}
					<Badge preset="tonal" color="primary" class="mt-1 w-full max-w-xs">{permission}</Badge>
				{/each}
			</div>

			<!-- User fields -->
			{#if user}
				<AdminCard class="p-6">
					<form class="space-y-4">
					<Input
						value={user.username}
						name="username"
						type="text"
						autocomplete="username"
						disabled
						label={username()}
						aria-label={username()}
					/>

					<Input
						value={user.email}
						name="email"
						type="email"
						autocomplete="email"
						disabled
						label={email()}
						aria-label={email()}
					/>

					<Input
						bind:value={password}
						name="password"
						type="password"
						autocomplete="current-password"
						disabled
						label={form_password()}
						aria-label={form_password()}
					/>


					<div class="mt-3 flex flex-col items-center justify-center gap-1.5">
						<!-- Edit Modal Button -->
						<Button
							variant="tertiary"
							size="sm"
							leadingIcon="bi:pencil-fill"
							onclick={modalUserForm}
							aria-label={userpage_edit_usersetting()}
							class="w-full max-w-xs"
						>
							{userpage_edit_usersetting()}
						</Button>

						<!-- GDPR Compact Tile -->
						<Button
							variant="tertiary"
							size="sm"
							leadingIcon="mdi:shield-account"
							trailingIcon="mdi:chevron-right"
							onclick={modalPrivacyData}
							class="w-full max-w-xs justify-between"
						>
							<span class="text-xs font-bold">Privacy & Data (GDPR)</span>
						</Button>

						<!-- Delete Modal Button -->
						{#if isFirstUser}
							<Button
								variant="error"
								size="sm"
								leadingIcon="bi:trash3-fill"
								onclick={modalConfirm}
								aria-label={button_delete()}
								class="w-full max-w-xs"
							>
								{button_delete()}
							</Button>
						{/if}
					</div>
				</form>
				</AdminCard>
			{/if}
		</div>
	</div>

	<!-- Admin area -->
	<PermissionGuard
		config={{
			name: 'Admin Area Access',
			contextId: 'config/adminArea',
			action: 'manage',
			contextType: 'system',
			description: 'Allows access to admin area for user management'
		}}
		silent={true}
	>
		<div in:fly={{ y: 20, delay: 200, duration: 300 }}>
			<AdminArea currentUser={{ ...user } as any} isMultiTenant={isMultiTenant!} roles={data.roles as any} />
		</div>
	</PermissionGuard>
</div>
</AdminPageShell>
