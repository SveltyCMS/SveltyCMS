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
	import type { PageData } from './$types';
	// Auth
	import type { User } from '@src/databases/auth/types';
	import ModalTwoFactorAuth from './components/ModalTwoFactorAuth.svelte';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import '@stores/store.svelte';
	import { avatarSrc } from '@stores/store.svelte';
	import { triggerActionStore } from '@utils/globalSearchIndex';
	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import PermissionGuard from '@components/PermissionGuard.svelte';
	import AdminArea from './components/AdminArea.svelte';
	// Modal Utils & Avatar
	import type { ModalComponent, ModalSettings } from '@utils/modalUtils';
	import { Avatar } from '@skeletonlabs/skeleton-svelte';
	import { setCollection } from '@src/stores/collectionStore.svelte';
	import { showConfirm, showModal } from '@utils/modalUtils';
	import { showToast } from '@utils/toast';
	import ModalEditAvatar from './components/ModalEditAvatar.svelte';
	import ModalEditForm from './components/ModalEditForm.svelte';

	// Props
	const { data } = $props<{ data: PageData }>();
	const { user: serverUser, isFirstUser, isMultiTenant, is2FAEnabledGlobal } = $derived(data);

	// Make user data reactive
	const user = $derived<User>({
		_id: serverUser?._id ?? '',
		email: serverUser?.email ?? '',
		username: serverUser?.username ?? '',
		role: serverUser?.role ?? '',
		avatar: serverUser?.avatar ?? '/Default_User.svg',
		tenantId: serverUser?.tenantId ?? '', // Add tenantId
		permissions: []
	});

	// Define password as state
	let password = $state('hash-password');

	// Function to open 2FA modal
	function open2FAModal(): void {
		const modalComponent: ModalComponent = {
			ref: ModalTwoFactorAuth,
			props: { user }
		};
		const d: ModalSettings = {
			type: 'component',
			title: 'Two-Factor Authentication',
			body: 'Add an extra layer of security to your account by requiring a verification code from your mobile device.',
			component: modalComponent,
			response: async (r: any) => {
				if (r) {
					// Refresh user data after 2FA changes
					await invalidateAll();
				}
			}
		};
		showModal(d);
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
		const modalComponent: ModalComponent = {
			ref: ModalEditForm,
			slot: '<p>Edit Form</p>'
		};

		const d: ModalSettings = {
			type: 'component',
			title: m.usermodaluser_edittitle(),
			body: m.usermodaluser_editbody(),
			component: modalComponent
		};
		showModal(d);
	}

	// Modal Trigger - Edit Avatar
	function modalEditAvatar(): void {
		const modalComponent: ModalComponent = {
			ref: ModalEditAvatar,
			props: { avatarSrc },
			slot: '<p>Edit Form</p>'
		};
		const d: ModalSettings = {
			type: 'component',
			title: m.usermodaluser_settingtitle(),
			body: m.usermodaluser_settingbody(),
			component: modalComponent,
			response: async (r: any) => {
				// Avatar is already updated by the ModalEditAvatar component
				// No need to set avatarSrc here since the modal handles it
				if (r) {
					showToast('<iconify-icon icon="radix-icons:avatar" color="white" width="26" class="mr-1"></iconify-icon> Avatar Updated', 'success');
					// invalidateAll is already called by the ModalEditAvatar component
				}
			}
		};
		showModal(d);
	}

	// Modal Confirm
	function modalConfirm(): void {
		showConfirm({
			title: m.usermodalconfirmtitle(),
			body: m.usermodalconfirmbody(),
			confirmText: m.usermodalconfirmdeleteuser(),
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
	<div class="wrapper mb-2">
		<div class="grid grid-cols-1 grid-rows-2 gap-1 overflow-hidden md:grid-cols-2 md:grid-rows-1">
			<!-- Avatar with user info -->
			<div class="relative flex flex-col items-center justify-center gap-1">
				<Avatar class="size-32">
					<Avatar.Image src={avatarSrc.value && avatarSrc.value.startsWith('data:') ? avatarSrc.value : `${avatarSrc.value}?t=${Date.now()}`} />
					<Avatar.Fallback>AV</Avatar.Fallback>
				</Avatar>

				<!-- Edit button -->
				<button onclick={modalEditAvatar} class="gradient-tertiary w-30 badge absolute -top-44 text-white sm:top-4">{m.userpage_editavatar()}</button>
				<!-- User ID -->
				<div class="gradient-secondary badge mt-1 w-full max-w-xs text-white">
					{m.userpage_user_id()}<span class="ml-2">{user?._id || 'N/A'}</span>
				</div>
				<!-- Role -->
				<div class="gradient-tertiary badge w-full max-w-xs text-white">
					{m.role()}<span class="ml-2">{user?.role || 'N/A'}</span>
				</div>
				<!-- Two-Factor Authentication Status -->
				{#if is2FAEnabledGlobal}
					<button onclick={open2FAModal} class="variant-ghost-surface btn-sm w-full max-w-xs">
						<div class="flex w-full items-center justify-between">
							<span>Two-Factor Auth</span>
							<div class="flex items-center gap-1">
								<iconify-icon
									icon="mdi:{user?.is2FAEnabled ? 'shield-check' : 'shield-off'}"
									width="20"
									class={user?.is2FAEnabled ? 'text-primary-500' : 'text-error-500'}
								></iconify-icon>
								<span class="text-xs">{user?.is2FAEnabled ? 'Enabled' : 'Disabled'}</span>
							</div>
						</div>
					</button>
				{/if}
				<!-- Tenant ID -->
				{#if isMultiTenant}
					<div class="gradient-tertiary badge w-full max-w-xs text-white">
						Tenant ID:<span class="ml-2">{user?.tenantId || 'N/A'}</span>
					</div>
				{/if}
				<!-- Permissions List -->
				{#each user.permissions as permission}
					<div class="gradient-tertiary badge mt-1 w-full max-w-xs text-white">
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
							<iconify-icon icon="bi:pencil-fill" color="white" width="18" class="mr-1"></iconify-icon>{m.userpage_edit_usersetting()}
						</button>

						<!-- Delete Modal Button -->
						{#if isFirstUser}
							<button onclick={modalConfirm} aria-label={m.button_delete()} class="gradient-error btn w-full max-w-sm text-white">
								<iconify-icon icon="bi:trash3-fill" color="white" width="18" class="mr-1"></iconify-icon>
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
			contextId: 'system:admin',
			action: 'manage',
			contextType: 'system',
			description: 'Allows access to admin area for user management'
		}}
		silent={true}
	>
		<div class="wrapper2">
			<AdminArea currentUser={{ ...user }} {isMultiTenant} roles={data.roles} />
		</div>
	</PermissionGuard>
</div>
