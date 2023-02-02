<script lang="ts">
	// Skeleton
	import { Avatar } from '@skeletonlabs/skeleton';
	import { Modal, modalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
	import { FileDropzone } from '@skeletonlabs/skeleton';

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';

	// Lucia
	import { getUser } from '@lucia-auth/sveltekit/client';
	const user = getUser();

	//modal to display edit form
	function triggerAlert(): void {
		const alert: ModalSettings = {
			type: 'alert',
			title: 'Upload Image',
			body: 'Upload an Image.',
			image: 'https://i.imgur.com/WOgTG96.gif',

			// Optionally override button text
			buttonTextSubmit: 'Submit',
			buttonTextCancel: 'Cancel'
		};
		modalStore.trigger(alert);
	}

	// make input readonly too modal is in use
	let readonly = true;

	let id = '0';
	let username = $user?.username;
	let firstname = $user?.firstname || undefined;
	let lastmame = $user?.lastname || undefined;
	let email = $user?.email;
	let password = '12345';

	//TODO: All user roles are required
	let newUserRole: 'USER' | 'EDITOR' = 'USER';
	let newUserEmail: string;
</script>

<div>
	<h1 class="mb-2">{$LL.USER_Setting()}</h1>

	<div class="flex justify-start items-start mb-2">
		<button on:click={triggerAlert} class="">
			<Avatar src="https://i.pravatar.cc/" rounded-xl class="w-32 mr-4" />
			<div class="mb-2 font-bold">{$LL.USER_ID()} : {id}</div>
			{#if $user?.role}
				<div class="text-base no-underline">{$user?.role}</div>
			{/if}
		</button>
		<div>
			<label
				>{$LL.USER_Username()}
				<input bind:value={username} name="username" type="text" {readonly} />
			</label>
			<label
				>{$LL.USER_FirstName()}
				<input bind:value={username} name="firstname" type="text" {readonly} />
			</label>
			<label
				>{$LL.USER_LastName()}
				<input bind:value={username} name="lastname" type="text" {readonly} />
			</label>
			<label
				>{$LL.USER_Email()}
				<input bind:value={email} name="email" type="email" {readonly} />
			</label>
			<label
				>{$LL.USER_Password()}
				<input bind:value={password} name="password" type="password" {readonly} />
			</label>
			{#if readonly}
				<button
					on:click={() => {
						readonly = false;
					}}
					class="mt-1 btn btn-sm variant-filled-surface"
				>
					{$LL.USER_Edit()}
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
			<button class="btn variant-filled-tertiary btn-base" type="submit">{$LL.USER_Token()}</button>
		</form>
		<button class="btn variant-filled-tertiary btn-base">{$LL.USER_Delete()}</button>
	{/if}
</div>
