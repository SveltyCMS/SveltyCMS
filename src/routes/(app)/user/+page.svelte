<!-- 
@file src/routes/(app)/user/+page.svelte
@description This file sets up and displays the user page, providing a streamlined interface for managing user accounts and settings.
-->

<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import type { User } from '@src/auth/types';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import '@stores/store.svelte';
	import { avatarSrc } from '@stores/store.svelte';
	import { triggerActionStore } from '@utils/globalSearchIndex';
	import { collection } from '@src/stores/collectionStore.svelte';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import PermissionGuard from '@components/PermissionGuard.svelte';
	import AdminArea from './components/AdminArea.svelte';

	// Import the permissionConfigs
	import { permissionConfigs } from '@src/auth/permissionManager';

	// Skeleton
	import { Avatar } from '@skeletonlabs/skeleton-svelte';

	// Modals
	import ModalEditAvatar from './components/ModalEditAvatar.svelte';
	import ModalEditForm from './components/ModalEditForm.svelte';
	import ModalConfirm from '@components/ModalConfirm.svelte';

	// Props
	let { data } = $props<{ data: PageData }>();
	let { user: serverUser, isFirstUser } = $derived(data);

	// Initialize user state directly
	let user = $state<User>({
		_id: '',
		email: '',
		username: '',
		role: '',
		avatar: '/Default_User.svg',
		permissions: []
	});

	// Keep user data in sync with server data
	$effect(() => {
		if (serverUser) {
			user = {
				_id: serverUser._id ?? '',
				email: serverUser.email ?? '',
				username: serverUser.username ?? '',
				role: serverUser.role ?? '',
				avatar: serverUser.avatar ?? '/Default_User.svg',
				permissions: serverUser.permissions ?? []
			};
			// Set avatar source once on initialization
			avatarSrc.set(serverUser.avatar || '/Default_User.svg');
		}
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
		collection.set({} as any);
	});
</script>

<!-- Page Title with Back Button -->
<PageTitle name={m.userpage_title()} icon="mdi:account-circle" showBackButton={true} backUrl="/config" />

<div class="max-h-[calc(100vh-65px)] overflow-auto">
	<div class="wrapper mb-2">
		<div class="grid grid-cols-1 grid-rows-2 gap-1 overflow-hidden md:grid-cols-2 md:grid-rows-1">
			<!-- Avatar with user info -->
			<div class="relative flex flex-col items-center justify-center gap-1">
				<Avatar src={`${$avatarSrc}?t=${Date.now()}`} name="Avatar" size="w-32" />

				<!-- Edit button -->
				<ModalEditAvatar />

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
					<!-- Email -->
					<label>
						{m.form_email()}:
						<input bind:value={user.email} name="email" type="email" disabled class="input" />
					</label>
					<!-- Password -->
					<label>
						{m.form_password()}:
						<input bind:value={password} name="password" type="password" disabled class="input" />
					</label>

					<div class="mt-4 flex flex-col justify-between gap-2 sm:flex-row sm:gap-1">
						<!-- Edit Modal Button -->
						<ModalEditForm isGivenData={true} username={user.username} email={user.email} role={user.role} user_id={user._id} />

						<!-- Delete Modal Button -->
						{#if isFirstUser}
							<ModalConfirm {user} />
						{/if}
					</div>
				</form>
			{/if}
		</div>
	</div>

	<!-- Admin area -->
	<PermissionGuard config={permissionConfigs.adminAreaPermissionConfig}>
		<div class="wrapper2">
			<AdminArea adminData={data.adminData} />
		</div>
	</PermissionGuard>
</div>
