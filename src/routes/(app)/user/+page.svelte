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
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	// Auth
	import ModalTwoFactorAuth from './components/ModalTwoFactorAuth.svelte';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import { collaboration } from '@stores/collaborationStore.svelte';
	import '@stores/store.svelte.ts';
	import { avatarSrc, normalizeAvatarUrl } from '@stores/store.svelte.ts';
	import { triggerActionStore } from '@utils/globalSearchIndex';
	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import PermissionGuard from '@components/PermissionGuard.svelte';
	import AdminArea from './components/AdminArea.svelte';
	// Skeleton
	import { Avatar } from '@skeletonlabs/skeleton-svelte';
	import { setCollection } from '@src/stores/collectionStore.svelte';
	import { modalState } from '@utils/modalState.svelte';
	import { showConfirm } from '@utils/modalUtils';
	import { toaster } from '@stores/store.svelte.ts';
	import ModalEditAvatar from './components/ModalEditAvatar.svelte';
	import ModalEditForm from './components/ModalEditForm.svelte';

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
			const res = await fetch('/api/user/updateUserAttributes', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ user_id: 'self', newUserData })
			});

			if (res.ok) {
				toaster.success('Preferences updated');
				await invalidateAll();
				// If RTC was disabled, close connection
				if (key === 'enabled' && !value) {
					collaboration.close();
				} else if (key === 'enabled' && value) {
					collaboration.connect();
				}
			} else {
				toaster.error('Failed to update preferences');
			}
		} catch {
			toaster.error('Error updating preferences');
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
			title: m.usermodaluser_edittitle(),
			body: m.usermodaluser_settingbody() || 'Update your user details below.'
		});
	}

	// Modal Trigger - Edit Avatar
	function modalEditAvatar(): void {
		modalState.trigger(
			ModalEditAvatar,
			{
				title: m.usermodaluser_settingtitle(),
				body: m.usermodaluser_settingbody()
			},
			async (r: any) => {
				if (r) {
					toaster.success({
						description: '<iconify-icon icon="radix-icons:avatar" width={24} ></iconify-icon> Avatar Updated'
					});
				}
			}
		);
	}

	// Modal Confirm
	function modalConfirm(): void {
		showConfirm({
			title: m.usermodalconfirmtitle(),
			body: m.usermodalconfirmbody(),
			// confirmText: m.usermodalconfirmdeleteuser(),
			onConfirm: async () => {
				const res = await fetch(`/api/user/deleteUsers`, {
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

<!-- Page Title with Back Button -->
<PageTitle name={m.userpage_title()} icon="mdi:account-circle" showBackButton={true} backUrl="/config" />

<div class="max-h-[calc(100vh-65px)] overflow-auto">
	<h2 class="sr-only">Profile Information</h2>
	<div class="wrapper mb-2">
		<div class="grid grid-cols-1 grid-rows-2 gap-1 overflow-hidden md:grid-cols-2 md:grid-rows-1">
			<!-- Avatar with user info -->
			<div class="relative flex flex-col items-center justify-center gap-1">
				<div class="relative group">
					<Avatar class="w-32 h-32 rounded-full border border-white shadow-lg dark:border-surface-800">
						<Avatar.Image src={normalizeAvatarUrl(avatarSrc.value)} class="object-cover" />
						<Avatar.Fallback>AV</Avatar.Fallback>
					</Avatar>

					<!-- Edit button - icon overlay -->
					<button
						onclick={modalEditAvatar}
						class="absolute bottom-0 right-0 p-2 rounded-full gradient-tertiary dark:gradient-primary btn-icon"
						title={m.userpage_editavatar()}
					>
						<iconify-icon icon="mdi:pencil" width={18}></iconify-icon>
					</button>
				</div>
				<!-- User ID -->
				<div class="gradient-secondary badge mt-1 w-full max-w-xs text-white">
					{m.userpage_user_id()}<span class="ml-2 font-bold">{user?._id || 'N/A'}</span>
				</div>
				<!-- Role -->
				<div class="gradient-tertiary badge w-full max-w-xs text-white">
					{m.role()}:<span class="ml-2 font-bold">{user?.role || 'N/A'}</span>
				</div>
				<!-- Two-Factor Authentication Status -->
				{#if is2FAEnabledGlobal}
					<button onclick={open2FAModal} class="btn preset-outlined-surface-500 btn-sm w-full max-w-xs">
						<div class="flex w-full items-center justify-between">
							<span>Two-Factor Auth</span>
							<div class="flex items-center gap-1">
								<iconify-icon icon="mdi:{user?.is2FAEnabled ? 'shield-check' : 'shield-off'}" class="text-error-500" width={20}></iconify-icon>
								<span class="text-xs">{user?.is2FAEnabled ? 'Enabled' : 'Disabled'}</span>
							</div>
						</div>
					</button>
				{/if}

				<!-- Collaboration Settings -->
				<div class="card p-4 w-full max-w-xs space-y-4 bg-surface-200-700-token border border-surface-500/20 shadow-sm">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<iconify-icon icon="material-symbols:Forum-outline" class="text-primary-500" width={20}></iconify-icon>
							<span class="text-sm font-bold">Real-time Collaboration</span>
						</div>
						<input
							type="checkbox"
							class="checkbox"
							checked={serverUser?.preferences?.rtc?.enabled ?? true}
							onchange={async (e) => {
								const enabled = (e.target as HTMLInputElement).checked;
								await updateRtcPreference('enabled', enabled);
							}}
						/>
					</div>
					<div class="flex items-center justify-between pl-7 opacity-80">
						<span class="text-xs">Sound Notifications</span>
						<input
							type="checkbox"
							class="checkbox checkbox-sm"
							checked={serverUser?.preferences?.rtc?.sound ?? true}
							onchange={async (e) => {
								const sound = (e.target as HTMLInputElement).checked;
								await updateRtcPreference('sound', sound);
							}}
						/>
					</div>
				</div>

				<!-- Tenant ID -->
				{#if isMultiTenant}
					<div class="gradient-primary badge w-full max-w-xs text-white">
						Tenant ID:<span class="ml-2">{user?.tenantId || 'N/A'}</span>
					</div>
				{/if}
				<!-- Permissions List -->
				{#each user.permissions as permission (permission)}
					<div class="gradient-primary badge mt-1 w-full max-w-xs text-white">
						{permission}
					</div>
				{/each}
			</div>

			<!-- User fields -->
			{#if user}
				<form>
					<label>
						{m.username()}:
						<input value={user.username} name="username" type="text" autocomplete="username" disabled class="input" />
					</label>
					<label>
						{m.email()}:
						<input value={user.email} name="email" type="email" autocomplete="email" disabled class="input" />
					</label>
					<label>
						{m.form_password()}:
						<input bind:value={password} name="password" type="password" autocomplete="current-password" disabled class="input" />
					</label>

					<div class="mt-4 flex flex-col justify-between gap-2 sm:flex-row sm:gap-1">
						<!-- Edit Modal Button -->
						<button
							onclick={modalUserForm}
							aria-label={m.userpage_edit_usersetting()}
							class="gradient-tertiary btn w-full max-w-sm text-white {isFirstUser ? '' : 'mx-auto md:mx-0'}"
						>
							<iconify-icon icon="bi:pencil-fill" width={24}></iconify-icon>{m.userpage_edit_usersetting()}
						</button>

						<!-- Delete Modal Button -->
						{#if isFirstUser}
							<button onclick={modalConfirm} aria-label={m.button_delete()} class="gradient-error btn w-full max-w-sm text-white">
								<iconify-icon icon="bi:trash3-fill" width={24}></iconify-icon>
								{m.button_delete()}
							</button>
						{/if}
					</div>
				</form>
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
		<div class="wrapper2">
			<h2 class="h3 font-bold mb-4 px-2 dark:text-white">Admin Management</h2>
			<AdminArea currentUser={{ ...user }} {isMultiTenant} roles={data.roles} />
		</div>
	</PermissionGuard>
</div>
