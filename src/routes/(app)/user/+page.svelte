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
	import { Avatar } from '@skeletonlabs/skeleton-svelte';
	import PageTitle from '@src/components/page-title.svelte';
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
	import { collaboration } from '@src/stores/collaboration-store.svelte';
	import { avatarSrc, normalizeAvatarUrl } from '@src/stores/store.svelte.ts';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import AdminArea from './components/admin-area.svelte';
	// Auth
	import ModalTwoFactorAuth from './components/modal-two-factor-auth.svelte';
	import '@src/stores/store.svelte.ts';
	import { setCollection } from '@src/stores/collection-store.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { triggerActionStore } from '@utils/global-search-index';
	import { modalState } from '@utils/modal-state.svelte';
	import { showConfirm } from '@utils/modal-utils';
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
				// If RTC was disabled, close connection
				if (key === 'enabled' && !value) {
					collaboration.close();
				} else if (key === 'enabled' && value) {
					collaboration.connect();
				}
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
				body: usermodaluser_settingbody()
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

<!-- Page Title with Back Button -->
<PageTitle name={userpage_title()} icon="mdi:account-circle" showBackButton={true} backUrl="/config" />

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
						title={userpage_editavatar()}
					>
						<iconify-icon icon="mdi:pencil" width={18}></iconify-icon>
					</button>
				</div>
				<!-- User ID -->
				<div class="gradient-secondary badge mt-1 w-full max-w-xs text-white">
					{userpage_user_id()}<span class="ml-2 font-bold">{user?._id || 'N/A'}</span>
				</div>
				<!-- Role -->
				<div class="gradient-tertiary badge w-full max-w-xs text-white">{role()}:<span class="ml-2 font-bold">{user?.role || 'N/A'}</span></div>
				<!-- Tenant ID -->
				{#if isMultiTenant && user?.tenantId}
					<div class="gradient-warning badge w-full max-w-xs text-white">Tenant ID:<span class="ml-2">{user?.tenantId || 'N/A'}</span></div>
				{/if}
				<!-- Two-Factor Authentication Status -->
				{#if is2FAEnabledGlobal}
					<button
						onclick={open2FAModal}
						class="btn {user?.is2FAEnabled ? 'preset-tonal-success' : 'preset-tonal-error'} btn-sm w-full max-w-xs border border-surface-500/20"
					>
						<div class="flex w-full items-center justify-between py-1">
							<div class="flex items-center gap-2">
								<iconify-icon icon="mdi:shield-lock" width={20} class="text-error-500"></iconify-icon>
								<span class="text-sm font-bold">Two-Factor Auth</span>
							</div>
							<div class="flex items-center gap-1">
								<iconify-icon
									icon="mdi:{user?.is2FAEnabled ? 'check-decagram' : 'alert-circle'}"
									width={20}
									class={user?.is2FAEnabled ? 'text-primary-500' : 'text-error-500'}
								></iconify-icon>
								<span class="text-xs font-bold uppercase">{user?.is2FAEnabled ? 'Enabled' : 'Disabled'}</span>
							</div>
						</div>
					</button>
				{/if}

				<!-- Collaboration Settings -->
				<div class="card p-4 w-full max-w-xs space-y-1 bg-surface-200-700-token border border-surface-500 shadow-sm">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<iconify-icon icon="mdi:forum" class="text-primary-500" width={18}></iconify-icon>
							<span class="text-sm">Real-time Collaboration</span>
						</div>
						<input
							type="checkbox"
							class="checkbox checkbox-sm"
							checked={serverUser?.preferences?.rtc?.enabled ?? true}
							onchange={async (e) => {
								const enabled = (e.target as HTMLInputElement).checked;
								await updateRtcPreference('enabled', enabled);
							}}
						/>
					</div>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-2">
							<iconify-icon icon="material-symbols:volume-up-outline" class="text-primary-500" width={18}></iconify-icon>
							<span class="text-sm">Sound Notifications</span>
						</div>
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

				<!-- Permissions List -->
				{#each user.permissions as permission (permission)}
					<div class="gradient-primary badge mt-1 w-full max-w-xs text-white">{permission}</div>
				{/each}
			</div>

			<!-- User fields -->
			{#if user}
				<form>
					<div class="flex items-center gap-2 mb-1">
						<iconify-icon icon="mdi:account" class="text-primary-500" width={20}></iconify-icon>
						<span class="text-sm font-bold">{username()}:</span>
					</div>
					<input value={user.username} name="username" type="text" autocomplete="username" disabled class="input mb-4" />

					<div class="flex items-center gap-2 mb-1">
						<iconify-icon icon="mdi:email" class="text-primary-500" width={20}></iconify-icon>
						<span class="text-sm font-bold">{email()}:</span>
					</div>
					<input value={user.email} name="email" type="email" autocomplete="email" disabled class="input mb-4" />

					<div class="flex items-center gap-2 mb-1">
						<iconify-icon icon="mdi:lock" class="text-primary-500" width={20}></iconify-icon>
						<span class="text-sm font-bold">{form_password()}:</span>
					</div>
					<input bind:value={password} name="password" type="password" autocomplete="current-password" disabled class="input" />

					<div class="mt-4 flex flex-col gap-2">
						<!-- Edit Modal Button -->
						<button onclick={modalUserForm} aria-label={userpage_edit_usersetting()} class="gradient-tertiary btn w-full max-w-sm text-white">
							<iconify-icon icon="bi:pencil-fill" width={24}></iconify-icon>
							{userpage_edit_usersetting()}
						</button>

						<!-- GDPR Compact Tile -->
						<button onclick={modalPrivacyData} class="gradient-tertiary btn w-full max-w-sm flex items-center justify-between text-white">
							<div class="flex items-center gap-3">
								<iconify-icon icon="mdi:shield-account" width={24}></iconify-icon>
								<div class="text-left">
									<h3 class="text-sm font-bold">Privacy & Data (GDPR)</h3>
								</div>
							</div>
							<iconify-icon icon="mdi:chevron-right" width={24}></iconify-icon>
						</button>

						<!-- Delete Modal Button -->
						{#if isFirstUser}
							<button onclick={modalConfirm} aria-label={button_delete()} class="gradient-error btn w-full max-w-sm text-white">
								<iconify-icon icon="bi:trash3-fill" width={24}></iconify-icon>
								{button_delete()}
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
			<AdminArea currentUser={{ ...user }} isMultiTenant={isMultiTenant!} roles={data.roles} />
		</div>
	</PermissionGuard>
</div>
