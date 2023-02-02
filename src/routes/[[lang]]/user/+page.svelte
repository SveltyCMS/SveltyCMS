<script lang="ts">
	import { Avatar } from '@skeletonlabs/skeleton';
	import { Modal, modalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
	import { FileDropzone } from '@skeletonlabs/skeleton';

	// Lucia
	import { getUser } from '@lucia-auth/sveltekit/client';
	const user = getUser();

	function triggerAlert(): void {
		const alert: ModalSettings = {
			type: 'alert',
			title: 'Upload Image',
			body: 'Upload an Image.',
			image: 'https://i.imgur.com/WOgTG96.gif',
			// Optionally override buttont text
			buttonTextSubmit: 'Submit',
			buttonTextCancel: 'Cancel'
		};
		modalStore.trigger(alert);
	}

	// TODO Only ADMIN user need to generate from /user a token

	//import { auth } from '@lucia-auth/';

	// const authenticateUser = async (email: string, password: string) => {
	// 	try {
	// 		await auth.authenticateUser('email', email, password);
	// 	} catch {
	// 		// error (invalid provider id or password, etc)
	// 	}
	// };

	let id = '0';
	let username = $user?.username;
	let firstname = $user?.firstname || undefined;
	let lastmame = $user?.lastname || undefined;
	let email = $user?.email;
	let password = '12345';

	let readonly = true;
</script>

<div>
	<h1 class="mb-2">User Settings</h1>

	<div class="flex justify-start items-start mb-2">
		<button on:click={triggerAlert} class="">
			<Avatar src="https://i.pravatar.cc/" rounded-xl class="w-32 mr-4" />
			<div class="mb-2 font-bold">User ID: {id}</div>
			{#if $user?.role}
				<div class="text-base no-underline">{$user?.role}</div>
			{/if}
		</button>
		<div>
			<label
				>Username:
				<input bind:value={username} name="username" type="text" {readonly} />
			</label>
			<label
				>First Name:
				<input bind:value={username} name="firstname" type="text" {readonly} />
			</label>
			<label
				>Last Name:
				<input bind:value={username} name="lastname" type="text" {readonly} />
			</label>
			<label
				>Email:
				<input bind:value={email} name="email" type="email" {readonly} />
			</label>
			<label
				>Password:
				<input bind:value={password} name="password" type="password" {readonly} />
			</label>
			{#if readonly}
				<button
					on:click={() => {
						readonly = false;
					}}
					class="mt-1 btn btn-sm variant-filled-surface"
				>
					Edit User settings
				</button>
			{:else}
				<button
					on:click={() => {
						readonly = true;
					}}
					class="mt-1 btn btn-sm variant-filled-primary"
				>
					Save
				</button>
			{/if}
		</div>
	</div>
	{#if $user?.role === 'ADMIN'}
		<button class="btn variant-filled-secondary btn-base">Show UserList</button>
		<div class="mt-3">Generate new User Registions token</div>
		<button class="btn variant-filled-tertiary btn-base">Generate new Token</button>
		<button class="btn variant-filled-tertiary btn-base">Delete User</button>
	{/if}
</div>
