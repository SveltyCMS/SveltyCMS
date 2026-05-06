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
	import PageTitle from '@src/components/page-title.svelte';
	import PermissionGuard from '@src/components/permission-guard.svelte';
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
	import { collaboration } from '@src/stores/collaboration-store.svelte';
	import { avatarSrc, normalizeAvatarUrl } from '@src/stores/store.svelte.ts';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import AdminArea from './components/admin-area.svelte';
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

	const { data } = $props();
	const { user: serverUser, isFirstUser, isMultiTenant, is2FAEnabledGlobal } = $derived(data);

	const user = $derived({
		_id: serverUser?._id ?? '',
		email: serverUser?.email ?? '',
		username: serverUser?.username ?? '',
		role: serverUser?.role ?? '',
		avatar: serverUser?.avatar ?? '/Default_User.svg',
		tenantId: serverUser?.tenantId ?? '',
		is2FAEnabled: serverUser?.is2FAEnabled ?? false,
		permissions: []
	});

	let password = $state('hash-password');
	let avatarLoadFailed = $state(false);
	let previousAvatarUrl = $state('');

	const currentAvatarUrl = $derived(normalizeAvatarUrl(avatarSrc.value));

	$effect(() => {
		const nextAvatarUrl = currentAvatarUrl;

		if (nextAvatarUrl !== previousAvatarUrl) {
			previousAvatarUrl = nextAvatarUrl;
			avatarLoadFailed = false;
		}
	});

	function open2FAModal(): void {
		modalState.trigger(ModalTwoFactorAuth, { user }, async (r: any) => {
			if (r) {
				await invalidateAll();
			}
		});
	}

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

	onMount(() => {
		if ($triggerActionStore.length > 0) {
			executeActions();
		}
		setCollection(null);
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

	function modalPrivacyData(): void {
		modalState.trigger(ModalPrivacyData as any, { user });
	}

	function modalConfirm(): void {
		showConfirm({
			title: usermodalconfirmtitle(),
			body: usermodalconfirmbody(),
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

<PageTitle name={userpage_title()} icon="mdi:account-circle" showBackButton={true} backUrl="/config" />

<div class="max-h-[calc(100vh-65px)] overflow-auto">
	<h2 class="sr-only">Profile Information</h2>

	<div class="wrapper mb-2">
		<div class="grid grid-cols-1 grid-rows-2 gap-1 overflow-hidden md:grid-cols-2 md:grid-rows-1">
			<div class="relative flex flex-col items-center justify-center gap-1">
				<div class="group relative">
					<div class="h-32 w-32 overflow-hidden rounded-full border border-white bg-surface-200 shadow-lg dark:border-surface-800 dark:bg-surface-700">
						{#if avatarLoadFailed}
							<div class="flex h-full w-full items-center justify-center text-2xl font-bold text-surface-700 dark:text-surface-100">
								AV
							</div>
						{:else}
							<img
								src={currentAvatarUrl}
								alt="User Avatar"
								class="h-full w-full object-cover"
								onerror={() => (avatarLoadFailed = true)}
							/>
						{/if}
					</div>

					<button
						onclick={modalEditAvatar}
						class="gradient-tertiary btn-icon absolute bottom-0 right-0 rounded-full p-2 dark:gradient-primary"
						title={userpage_editavatar()}
					>
						<iconify-icon icon="mdi:pencil" width={18}></iconify-icon>
					</button>
				</div>

				<div class="gradient-secondary badge mt-1 w-full max-w-xs text-white">
					{userpage_user_id()}<span class="ml-2 font-bold">{user?._id || 'N/A'}</span>
				</div>

				<div class="gradient-tertiary badge w-full max-w-xs text-white">
					{role()}:<span class="ml-2 font-bold">{user?.role || 'N/A'}</span>
				</div>

				{#if isMultiTenant && user?.tenantId}
					<div class="gradient-warning badge w-full max-w-xs text-white">
						Tenant ID:<span class="ml-2">{user?.tenantId || 'N/A'}</span>
					</div>
				{/if}

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

				<div class="card bg-surface-200-700-token w-full max-w-xs space-y-1 border border-surface-500 p-4 shadow-sm">
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

				{#each user.permissions as permission (permission)}
					<div class="gradient-primary badge mt-1 w-full max-w-xs text-white">{permission}</div>
				{/each}
			</div>

			{#if user}
				<form>
					<div class="mb-1 flex items-center gap-2">
						<iconify-icon icon="mdi:account" class="text-primary-500" width={20}></iconify-icon>
						<span class="text-sm font-bold">{username()}:</span>
					</div>
					<input value={user.username} name="username" type="text" autocomplete="username" disabled class="input mb-4" />

					<div class="mb-1 flex items-center gap-2">
						<iconify-icon icon="mdi:email" class="text-primary-500" width={20}></iconify-icon>
						<span class="text-sm font-bold">{email()}:</span>
					</div>
					<input value={user.email} name="email" type="email" autocomplete="email" disabled class="input mb-4" />

					<div class="mb-1 flex items-center gap-2">
						<iconify-icon icon="mdi:lock" class="text-primary-500" width={20}></iconify-icon>
						<span class="text-sm font-bold">{form_password()}:</span>
					</div>
					<input bind:value={password} name="security" type="security" autocomplete="current-password" disabled class="input" />

					<div class="mt-4 flex flex-col items-center justify-center gap-2">
						<button onclick={modalUserForm} aria-label={userpage_edit_usersetting()} class="gradient-tertiary btn w-full max-w-sm text-white">
							<iconify-icon icon="bi:pencil-fill" width={24}></iconify-icon>
							{userpage_edit_usersetting()}
						</button>

						<button onclick={modalPrivacyData} class="gradient-tertiary btn flex w-full max-w-sm items-center justify-between text-white">
							<div class="flex items-center gap-3">
								<iconify-icon icon="mdi:shield-account" width={24}></iconify-icon>
								<div class="text-left">
									<h3 class="text-sm font-bold">Privacy & Data (GDPR)</h3>
								</div>
							</div>
							<iconify-icon icon="mdi:chevron-right" width={24}></iconify-icon>
						</button>

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
			<AdminArea currentUser={{ ...user } as any} isMultiTenant={isMultiTenant!} roles={data.roles as any} />
		</div>
	</PermissionGuard>
</div>