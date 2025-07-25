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
	import axios from 'axios';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';
	// Auth
	import type { User } from '@src/auth/types';

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
	// Skeleton
	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';
	import { Avatar, getModalStore, getToastStore } from '@skeletonlabs/skeleton';
	import { collection } from '@src/stores/collectionStore.svelte';
	import ModalEditAvatar from './components/ModalEditAvatar.svelte';
	import ModalEditForm from './components/ModalEditForm.svelte';

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Props
	let { data } = $props<{ data: PageData }>();
	let { user: serverUser, isFirstUser } = $derived(data);

	// Make user data reactive
	let user = $derived<User>({
		_id: serverUser?._id ?? '',
		email: serverUser?.email ?? '',
		username: serverUser?.username ?? '',
		role: serverUser?.role ?? '',
		avatar: serverUser?.avatar ?? '/Default_User.svg',
		permissions: []
	});

	// Define password as state
	let password = $state('hash-password');

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
		collection.set(null);

		// Initialize avatarSrc with user's actual avatar from database
		// Use serverUser directly to avoid fallback values
		if (serverUser?.avatar && serverUser.avatar !== '/Default_User.svg') {
			avatarSrc.set(serverUser.avatar);
			console.log('Avatar initialized from database:', serverUser.avatar);
		} else {
			// Set to default if no avatar in database
			avatarSrc.set('/Default_User.svg');
			console.log('Avatar set to default');
		}
	});

	// Modal Trigger - User Form
	function modalUserForm(): void {
		const modalComponent: ModalComponent = {
			ref: ModalEditForm,
			slot: '<p>Edit Form</p>'
		};

		type UserFormResponse = Partial<Pick<User, 'username' | 'email' | 'role' | 'avatar'>>;

		const d: ModalSettings = {
			type: 'component',
			title: m.usermodaluser_edittitle(),
			body: m.usermodaluser_editbody(),
			component: modalComponent,
			response: async (r: UserFormResponse) => {
				if (r) {
					const data = { user_id: user._id, newUserData: r };
					const res = await axios.put('/api/user/updateUserAttributes', data);
					const t = {
						message: '<iconify-icon icon="mdi:check-outline" color="white" width="26" class="mr-1"></iconify-icon> User Data Updated',
						background: 'gradient-tertiary',
						timeout: 3000,
						classes: 'border-1 !rounded-md'
					};
					toastStore.trigger(t);

					if (res.status === 200) {
						await invalidateAll();
					}
				}
			}
		};
		modalStore.trigger(d);
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
			response: async (r: { dataURL: string }) => {
				if (r) {
					avatarSrc.set(r.dataURL);
					const t = {
						message: '<iconify-icon icon="radix-icons:avatar" color="white" width="26" class="mr-1"></iconify-icon> Avatar Updated',
						background: 'gradient-primary',
						timeout: 3000,
						classes: 'border-1 !rounded-md'
					};
					toastStore.trigger(t);
					await invalidateAll(); // Reload the page data to get the updated user object
				}
			}
		};
		modalStore.trigger(d);
	}

	// Modal Confirm
	function modalConfirm(): void {
		const d: ModalSettings = {
			type: 'confirm',
			title: m.usermodalconfirmtitle(),
			body: m.usermodalconfirmbody(),
			response: async (r: boolean) => {
				if (!r) return;
				const res = await fetch(`/api/user/deleteUsers`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify([user])
				});
				if (res.status === 200) {
					await invalidateAll();
				}
			},
			buttonTextCancel: m.button_cancel(),
			buttonTextConfirm: m.usermodalconfirmdeleteuser()
		};
		modalStore.trigger(d);
	}
</script>

<!-- Page Title with Back Button -->
<PageTitle name={m.userpage_title()} icon="mdi:account-circle" showBackButton={true} backUrl="/config" />

<div class="max-h-[calc(100vh-65px)] overflow-auto">
	<div class="wrapper mb-2">
		<div class="grid grid-cols-1 grid-rows-2 gap-1 overflow-hidden md:grid-cols-2 md:grid-rows-1">
			<!-- Avatar with user info -->
			<div class="relative flex flex-col items-center justify-center gap-1">
				<Avatar src={`${avatarSrc.value}?t=${Date.now()}`} initials="AV" rounded-none class="w-32" />

				<!-- Edit button -->
				<button onclick={modalEditAvatar} class="gradient-primary w-30 badge absolute top-8 text-white sm:top-4">{m.userpage_editavatar()}</button>
				<!-- User ID -->
				<div class="gradient-secondary badge mt-1 w-full max-w-xs text-white">
					{m.userpage_user_id()}<span class="ml-2">{user?._id || 'N/A'}</span>
				</div>
				<!-- Role -->
				<div class="gradient-tertiary badge w-full max-w-xs text-white">
					{m.form_role()}:<span class="ml-2">{user?.role || 'N/A'}</span>
				</div>
				<!-- Permissions List -->
				{#each user.permissions as permission}
					<div class="gradient-primary badge mt-1 w-full max-w-xs text-white">
						{permission}
					</div>
				{/each}
			</div>

			<!-- User fields -->
			{#if user}
				<form>
					<label>
						{m.form_username()}:
						<input bind:value={user.username} name="username" type="text" disabled class="input" />
					</label>
					<label>
						{m.form_email()}:
						<input bind:value={user.email} name="email" type="email" disabled class="input" />
					</label>
					<label>
						{m.form_password()}:
						<input bind:value={password} name="password" type="password" disabled class="input" />
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
			<AdminArea adminData={data.adminData} currentUser={user} />
		</div>
	</PermissionGuard>
</div>
