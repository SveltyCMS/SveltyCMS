<script lang="ts">
	import type { PageData } from './$types';
	import axios from 'axios';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import '@stores/store';
	import { avatarSrc } from '@stores/store';

	import { triggerActionStore } from '@utils/globalSearchIndex';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import PermissionGuard from '@src/components/PermissionGuard.svelte';
	import AdminArea from './components/AdminArea.svelte';

	export let data: PageData;
	const { user, isFirstUser } = data;
	import type { PermissionConfig } from '@src/auth/permissionCheck';

	// Define permissions for different contexts
	const adminAreaPermissionConfig: PermissionConfig = {
		contextId: 'config/accessManagement',
		requiredRole: 'admin',
		action: 'read',
		contextType: 'system'
	};

	// Skeleton
	import { Avatar } from '@skeletonlabs/skeleton';
	import ModalEditAvatar from './components/ModalEditAvatar.svelte';
	import ModalEditForm from './components/ModalEditForm.svelte';
	import { getToastStore, getModalStore } from '@skeletonlabs/skeleton';

	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	avatarSrc.set(user?.avatar || '/Default_User.svg');

	// Define password as 'hash-password'
	let password = 'hash-password';

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

		avatarSrc.subscribe(() => {});
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
			component: modalComponent,
			response: async (r: any) => {
				if (r) {
					console.log('Response:', r);
					const data = { ...r, user_id: user?._id };
					const res = await axios.post('?/updateUserAttributes', data);

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
			response: (r: { dataURL: string }) => {
				if (r) {
					avatarSrc.set(r.dataURL);
					const t = {
						message: '<iconify-icon icon="radix-icons:avatar" color="white" width="26" class="mr-1"></iconify-icon> Avatar Updated',
						background: 'gradient-primary',
						timeout: 3000,
						classes: 'border-1 !rounded-md'
					};
					toastStore.trigger(t);
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

<div class="my-2 flex items-center justify-between">
	<PageTitle name={m.userpage_title()} icon="mdi:account-circle" />
</div>

<div class="max-h-[calc(100vh-65px)] overflow-auto">
	<div class="wrapper mb-2">
		<div class="grid grid-cols-1 grid-rows-2 gap-1 overflow-hidden md:grid-cols-2 md:grid-rows-1">
			<!-- Avatar with user info -->
			<div class="relative flex flex-col items-center justify-center gap-1">
				<Avatar src={$avatarSrc ? $avatarSrc : '/Default_User.svg'} initials="AV" rounded-none class="w-32" />

				<!-- Edit button -->
				<button on:click={modalEditAvatar} class="gradient-primary w-30 badge absolute top-8 text-white sm:top-4">{m.userpage_editavatar()}</button>
				<!-- User ID -->
				<div class="gradient-secondary badge mt-1 w-full max-w-xs text-white">
					{m.userpage_user_id()}<span class="ml-2">{user?._id || 'N/A'}</span>
				</div>
				<!-- Role -->
				<div class="gradient-tertiary badge w-full max-w-xs text-white">
					{m.form_role()}:<span class="ml-2">{user?.role || 'N/A'}</span>
				</div>
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
						<button on:click={modalUserForm} class="gradient-tertiary btn w-full max-w-sm text-white {isFirstUser ? '' : 'mx-auto md:mx-0'}">
							<iconify-icon icon="bi:pencil-fill" color="white" width="18" class="mr-1" />{m.userpage_edit_usersetting()}
						</button>

						<!-- Delete Modal Button (reverse logic for isFirstUser)-->
						{#if isFirstUser}
							<button on:click={modalConfirm} class="gradient-error btn w-full max-w-sm text-white">
								<iconify-icon icon="bi:trash3-fill" color="white" width="18" class="mr-1" />
								{m.button_delete()}
							</button>
						{/if}
					</div>
				</form>
			{/if}
		</div>
	</div>

	<!-- Admin area -->
	<PermissionGuard config={adminAreaPermissionConfig}>
		<div class="wrapper2">
			<AdminArea {data} />
		</div>
	</PermissionGuard>
</div>