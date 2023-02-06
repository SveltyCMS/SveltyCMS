<script lang="ts">
	import { Avatar } from '@skeletonlabs/skeleton';
	import { Modal, modalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
	import ModalEditForm from './ModalEditForm.svelte';
	import ModalEditAvatar from './ModalEditAvatar.svelte';

	// Lucia
	import { page } from '$app/stores';
	import { getUser, handleSession } from '@lucia-auth/sveltekit/client';
	import { enhance } from '$app/forms';

	handleSession(page);
	const user = getUser();

	function modalUserForm(): void {
		const modalComponent: ModalComponent = {
			// Pass a reference to your custom component
			ref: ModalEditForm,
			// Add your props as key/value pairs
			props: { background: 'bg-red-500' },
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
			response: (r: any) => {
				if (r) console.log('response:', r);
			},

			meta: { foo: 'bar', fizz: 'buzz', fn: ModalEditForm }
		};
		modalStore.trigger(d);
	}

	function modalEditAvatar(): void {
		const modalComponent: ModalComponent = {
			// Pass a reference to your custom component
			ref: ModalEditAvatar,
			// Add your props as key/value pairs
			props: { background: 'bg-red-500' },
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
			response: (r: any) => {
				if (r) console.log('response:', r);
			},

			meta: { foo: 'bar', fizz: 'buzz', fn: ModalEditAvatar }
		};
		modalStore.trigger(d);
	}

	let username = $user?.username;
	let id = $user?.userId;
	let role = $user?.role;
	let email = $user?.email;
	let password = 'Hashed neews convert';
	let newUserEmail: string;
	let newUserRole: 'USER' | 'EDITOR' = 'USER';

	let avatarEdit = true;
	let avatarSrc = $user?.avatar;
</script>

<div class="">
	<h1 class="mb-2">User Settings</h1>

	<div class="flex justify-start mb-2">
		<div class="mt-1 flex flex-col gap-2 mx-2 relative  items-center justify-center">
			<Avatar src={avatarSrc ?? '/Default_User.svg'} initials="AV" rounded-none class="w-32" />

			<button
				on:click={modalEditAvatar}
				class="badge variant-filled-primary w-20 text-black absolute top-1">Edit Avatar</button
			>

			<div class="badge variant-filled-secondary mt-1 w-full">
				User ID:<span class="ml-2">{id}</span>
			</div>
			<div class="badge variant-filled-tertiary w-full">Role:<span class="ml-2">{role}</span></div>
		</div>
		<div>
			<label
				>Username:
				<input bind:value={username} name="username" type="text" readonly />
			</label>
			<label
				>Email:
				<input bind:value={email} name="email" type="email" readonly />
			</label>
			<label
				>Password:
				<input bind:value={password} name="password" type="password" readonly />
			</label>

			<button class="btn btn-sm variant-filled-surface mt-2" on:click={modalUserForm}
				>Edit user data</button
			>
		</div>
	</div>

	<hr />
	<br />
	{#if $user?.role === 'ADMIN'}
		<a href="/user/userList">
			<button class="btn variant-filled-secondary btn-sm">Show User List</button>
		</a>

		<div class="mt-3">Generate new User Registions token</div>
		<form method="post" action="?/generateToken" use:enhance>
			<input bind:value={newUserEmail} name="newUserEmail" type="email" required />
			<div>
				<label>
					<input type="radio" bind:group={newUserRole} name="role" value={'USER'} /> User
				</label>
				<label>
					<input type="radio" bind:group={newUserRole} name="role" value={'EDITOR'} /> Editor
				</label>
			</div>
			<button class="btn variant-filled-tertiary btn-base" type="submit">Generate new Token</button>
		</form>
		<button class="btn variant-filled-tertiary btn-base">Delete User</button>
	{/if}
</div>
