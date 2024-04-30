<script lang="ts">
	import type { PageData } from './$types';
	import axios from 'axios';
	import { invalidateAll } from '$app/navigation';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Auth
	import type { User } from '@src/auth/types';
	const user: User = $page.data.user;
	let isFirstUser = $page.data.isFirstUser;

	// Stores
	import '@stores/store';
	import { page } from '$app/stores';
	import { avatarSrc } from '@stores/store';
	import { triggerActionStore } from '@utils/globalSearchIndex';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import AdminArea from './components/AdminArea.svelte';

	function executeActions() {
		//console.log('executeActions called');
		// Get the current value of the triggerActionStore
		const actions = $triggerActionStore;

		// Execute the actions
		if (actions.length === 1) {
			// Only one action present, directly execute it
			//console.log('single action', actions[0]);
			actions[0];
		} else {
			// Multiple actions present, iterate and execute each one sequentially
			//console.log('multiple actions');
			for (const action of actions) {
				console.log(action);
				action;
			}
		}

		// Clear the triggerActionStore
		triggerActionStore.set([]);
	}

	// Execute actions on mount if triggerActionStore has data
	document.addEventListener('DOMContentLoaded', () => {
		// Execute actions on mount if triggerActionStore has data
		if ($triggerActionStore.length > 0) {
			//console.log('$triggerActionStore called:', $triggerActionStore);
			executeActions();
		}
	});

	export let data: PageData;

	// Skeleton
	import { Avatar } from '@skeletonlabs/skeleton';
	import ModalEditAvatar from './components/ModalEditAvatar.svelte';
	import ModalEditForm from './components/ModalEditForm.svelte';
	import { getToastStore, getModalStore } from '@skeletonlabs/skeleton';

	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	avatarSrc.set(user?.avatar || '/Default_User.svg');

	// define password as 'hash-password'
	let password = 'hash-password';

	// Modal Trigger - User Form
	function modalUserForm(): void {
		// console.log('Triggered - modalUserForm');
		const modalComponent: ModalComponent = {
			// Pass a reference to your custom component
			ref: ModalEditForm,

			// Provide default slot content as a template literal
			slot: '<p>Edit Form</p>'
		};

		const d: ModalSettings = {
			type: 'component',
			// NOTE: title, body, response, etc are supported!
			title: m.usermodaluser_edittitle(),
			body: m.usermodaluser_editbody(),
			component: modalComponent,

			// Pass arbitrary data to the component
			response: async (r: any) => {
				if (r) {
					console.log('Response:', r);

					// Prepare the data
					const data = { ...r, userId: user.id };

					// Make the POST request using axios
					const res = await axios.post('?/editUser', data);

					// Trigger the toast
					const t = {
						message: '<iconify-icon icon="mdi:check-outline" color="white" width="26" class="mr-1"></iconify-icon> User Data Updated',
						// Provide any utility or variant background style:
						background: 'gradient-tertiary',
						timeout: 3000,
						// Add your custom classes here:
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
		// console.log('Triggered - modalEditAvatar');
		const modalComponent: ModalComponent = {
			// Pass a reference to your custom component
			ref: ModalEditAvatar,
			props: { avatarSrc },

			// Add your props as key/value pairs
			// props: { background: 'bg-pink-500' },
			// Provide default slot content as a template literal
			slot: '<p>Edit Form</p>'
		};
		const d: ModalSettings = {
			type: 'component',
			// NOTE: title, body, response, etc are supported!
			title: m.usermodaluser_settingtitle(),
			body: m.usermodaluser_settingbody(),
			component: modalComponent,
			// Pass arbitrary data to the component

			response: (r: { dataURL: string }) => {
				console.log('ModalEditAvatar response:', r);
				if (r) {
					avatarSrc.set(r.dataURL); // Update the avatarSrc store with the new URL

					// Trigger the toast
					const t = {
						message: '<iconify-icon icon="radix-icons:avatar" color="white" width="26" class="mr-1"></iconify-icon> Avatar Updated',

						// Provide any utility or variant background style:
						background: 'gradient-primary',
						timeout: 3000,
						// Add your custom classes here:
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

			// TRUE if confirm pressed, FALSE if cancel pressed
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
			// Optionally override the button text
			// TODO: fix light background and change Delete button to red
			//backdropClasses: 'bg-white',
			buttonTextCancel: m.button_cancel(),
			buttonTextConfirm: m.usermodalconfirmdeleteuser()
		};
		modalStore.trigger(d);
	}
</script>

<div class="my-2 flex items-center justify-between">
	<PageTitle name={m.userpage_title()} icon="" />
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
					{m.userpage_userid()}<span class="ml-2">{user.id}</span>
				</div>
				<!-- Role -->
				<div class="gradient-tertiary badge w-full max-w-xs text-white">
					{m.form_role()}:<span class="ml-2">{user.role}</span>
				</div>
			</div>

			<!-- User fields -->
			<form>
				<label
					>{m.form_username()}:
					<input bind:value={user.username} name="username" type="text" disabled class="input" />
				</label>
				<label
					>{m.form_email()}:
					<input bind:value={user.email} name="email" type="email" disabled class="input" />
				</label>
				<label
					>{m.form_password()}:
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
		</div>
	</div>

	<!-- Admin area -->
	{#if user.role === 'admin'}
		<div class="wrapper2">
			<AdminArea {data} />
		</div>
	{/if}
</div>
