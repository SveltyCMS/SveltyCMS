<script lang="ts">
	import axios from 'axios';

	// Lucia
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';

	export let data: PageData;

	handleSession(page);
	const user = getUser();

	let avatarSrc = $user?.avatar;
	let showUserList = true;

	let id = $user?.userId;
	let username = $user?.username;
	let role = $user?.role;
	let email = $user?.email;
	// TODO  Get hashed password
	let password = 'hash-password';

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';

	// show/hide Left Sidebar
	import AnimatedHamburger from '$src/components/AnimatedHamburger.svelte';

	import UserList from './UserList/UserList.svelte';

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	import { getUser, handleSession } from '@lucia-auth/sveltekit/client';

	// Skeleton
	import { Avatar } from '@skeletonlabs/skeleton';
	import ModalEditAvatar from './ModalEditAvatar.svelte';
	import ModalEditForm from './ModalEditForm.svelte';
	import ModalTokenUser from './ModalTokenUser.svelte';
	import { modalStore } from '@skeletonlabs/skeleton';
	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';

	// Modal Trigger - User Form
	function modalUserForm(): void {
		const modalComponent: ModalComponent = {
			// Pass a reference to your custom component
			ref: ModalEditForm,
			// Add your props as key/value pairs
			props: { background: 'bg-surface-100-800-token' },
			// Provide default slot content as a template literal
			slot: '<p>Edit Form</p>'
		};
		const d: ModalSettings = {
			type: 'component',
			// NOTE: title, body, response, etc are supported!
			title: 'Edit User Data',
			body: 'Modify your data and then press Save.',
			component: modalComponent,
			// Pass abitrary data to the component
			response: async (r: any) => {
				if (r) {
					const res = await axios.post('/api/user/editUser', {
						...r,
						id
					});

					if (res.status === 200) {
						await invalidateAll();
					}
				}
			}
		};
		modalStore.trigger(d);
	}

	// Modal Trigger - Edit avatar
	function modalEditAvatar(): void {
		const modalComponent: ModalComponent = {
			// Pass a reference to your custom component
			ref: ModalEditAvatar,
			// Add your props as key/value pairs
			// props: { background: 'bg-pink-500' },
			// Provide default slot content as a template literal
			slot: '<p>Edit Form</p>'
		};
		const d: ModalSettings = {
			type: 'component',
			// NOTE: title, body, response, etc are supported!
			title: 'Edit Avatar',
			body: 'Upload new Avatar Image und then press Save.',
			component: modalComponent,
			// Pass abitrary data to the component
			response: async (r: { dataURL: string }) => {
				if (r) {
					const formData = new FormData();
					formData.append('dataurl', r.dataURL);

					try {
						const res = await axios({
							method: 'post',
							url: '/api/user/editAvatar',
							data: formData,
							headers: { 'Content-Type': 'multipart/form-data' }
						});

						if (res.status === 200) {
							await invalidateAll();
							const resizedDataUrl = res.data.path;
							avatarSrc = resizedDataUrl;
						}
					} catch (err) {
						console.log(err);
						alert('Error uploading image');
					}
				}
			}
		};
		modalStore.trigger(d);
	}

	// Modal Trigger - Generate User Registation email Token
	function modalTokenUser(): void {
		const modalComponent: ModalComponent = {
			// Pass a reference to your custom component
			ref: ModalTokenUser,
			// Add your props as key/value pairs
			// props: {
			// 	background: 'bg-error-100-800-token',
			// 	buttonTextConfirm: 'bg-error-500'
			// },

			// Provide default slot content as a template literal
			slot: '<p>Edit Form</p>'
		};
		const d: ModalSettings = {
			type: 'component',
			// NOTE: title, body, response, etc are supported!
			title: 'Generate New User Registation token',
			body: 'Add User Email and select User Role & Duration, then press Send.',
			component: modalComponent,

			// Pass abitrary data to the component
			response: (r: any) => {
				if (r) console.log('response:', r);
			}
		};
		modalStore.trigger(d);
	}

	function modalConfirm(): void {
		const d: ModalSettings = {
			type: 'confirm',
			title: 'Please Confirm User Deletion',
			body: 'This cannot be undone. Are you sure you wish to proceed?',
			// TRUE if confirm pressed, FALSE if cancel pressed
			response: (r: boolean) => {
				if (r) console.log('response:', r);
			},
			// Optionally override the button text
			buttonTextCancel: 'Cancel',
			buttonTextConfirm: 'Delete User'
		};
		modalStore.trigger(d);
	}

	//export let open = false;
	export let switchSideBar = false;

	//TODO: Get Roles from allowed user
	let roles: Record<string, boolean> = {
		Admin: true,
		Editor: false,
		User: false,
		Guest: false
	};

	function filter(role: string): void {
		roles[role] = !roles[role];
	}
</script>

<div class="flex mr-1 align-centre mb-2">
	{#if !switchSideBar}
		<!-- mobile and tablet hamburger -->
		<AnimatedHamburger />
	{/if}
	<!-- mobile hamburger -->
	<h1 class="">{$LL.USER_Profile()}</h1>
</div>

<div class="grid overflow-hidden grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1 gap-1">
	<!-- Avatar with user info -->
	<div class="mt-1 flex flex-col gap-2 mx-2 relative items-center justify-center ">
		<Avatar src={avatarSrc ?? '/Default_User.svg'} initials="AV" rounded-none class="w-32" />

		<button on:click={modalEditAvatar} class="badge text-white gradient-primary w-30 absolute top-1"
			>{$LL.USER_Edit_Avatar()}</button
		>

		<div class="badge gradient-secondary mt-1 w-full max-w-xs text-white">
			{$LL.USER_ID()}:<span class="ml-2">{id}</span>
		</div>
		<div class="badge gradient-tertiary w-full max-w-xs text-white">
			{$LL.USER_Role()}:<span class="ml-2">{role}</span>
		</div>
	</div>

	<!-- user fields -->
	<form>
		<label
			>{$LL.USER_Username()}:
			<input bind:value={username} name="username" type="text" readonly class="input" />
		</label>
		<label
			>{$LL.USER_Email()}:
			<input bind:value={email} name="email" type="email" readonly class="input" />
		</label>
		<label
			>{$LL.USER_Password()}:
			<input bind:value={password} name="password" type="password" readonly class="input" />
		</label>
		<div class="flex justify-between my-2">
			<button class="btn btn-sm gradient-secondary md:w-auto text-white" on:click={modalUserForm}>
				<Icon icon="bi:pencil-fill" color="white" width="18" class="mr-1" />{$LL.USER_Edit()}:
			</button>
			<button on:click={modalConfirm} class="btn btn-sm gradient-error text-white"
				><Icon icon="bi:trash3-fill" color="white" width="18" class="mr-1" />Delete User</button
			>
		</div>
	</form>
</div>

<!-- admin area -->
{#if $user?.role === 'Admin'}
	<div class="my-2 gap-2 border-t-2">
		<hr />
		<h2 class="mb-2 text-center md:text-left">Admin Area:</h2>
		<div class="flex justify-between gap-2 flex-col sm:flex-row my-2">
			<button
				class="btn gradient-secondary text-white order-last sm:order-1"
				on:click={() => (showUserList = !showUserList)}
				>{showUserList ? $LL.USER_ListCollapse() : $LL.USER_ListShow()}</button
			>
			<button
				on:click={modalTokenUser}
				class="order-2 text-white sm:order-2 btn btn-base gradient-primary w-30"
				><Icon
					icon="material-symbols:mail"
					color="white"
					width="18"
					class="mr-1"
				/>{$LL.USER_EmailToken()}</button
			>
		</div>

		{#if showUserList}
			<UserList list={data} />
		{/if}
	</div>
{/if}
