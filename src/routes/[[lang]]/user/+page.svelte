<script lang="ts">
	// Skeleton
	import { Avatar } from '@skeletonlabs/skeleton';
	import { Modal, modalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
	import ModalEditForm from './ModalEditForm.svelte';
	import ModalEditAvatar from './ModalEditAvatar.svelte';

	import UserList from './UserList/UserList.svelte';
	import type { PageData } from './$types';

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	export let data: PageData;

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
	let showUserList: boolean = false;

	// show/hide Left Sidebar
	import AnimatedHamburger from '$src/components/AnimatedHamburger.svelte';

	export let toggleLeftSideBar = true;
	export let open = false;
	export let onClickHambuger = (): void => {
		open = !open;
		toggleLeftSideBar = !toggleLeftSideBar;
	};

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
	<!-- mobile hamburger -->
	<AnimatedHamburger {open} {onClickHambuger} />
	<h1 class="">{$LL.USER_Profile()}</h1>
</div>

<!-- todo: restict max width -->
<div class="grid overflow-hidden grid-cols-1 grid-rows-2 md:grid-cols-2 md:grid-rows-1 gap-1">
	<!-- Avatar with user info -->
	<div class="mt-1 flex flex-col gap-2 mx-2 relative items-center justify-center ">
		<Avatar src={avatarSrc ?? '/Default_User.svg'} initials="AV" rounded-none class="w-32" />

		<button
			on:click={modalEditAvatar}
			class="badge variant-filled-primary w-30 text-black absolute top-1"
			>{$LL.USER_Edit_Avatar()}</button
		>

		<div class="badge variant-filled-secondary mt-1 w-full max-w-xs">
			{$LL.USER_ID()}:<span class="ml-2">{id}</span>
		</div>
		<div class="badge variant-filled-tertiary w-full max-w-xs">
			{$LL.USER_Role()}:<span class="ml-2">{role}</span>
		</div>
	</div>

	<!-- user fields -->
	<div class="">
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

		<button class="btn btn-sm variant-filled-surface mt-2 w-full md:w-auto" on:click={modalUserForm}
			>{$LL.USER_Edit()}:</button
		>
	</div>
</div>

<!-- admin area -->
{#if $user?.role === 'ADMIN'}
	<div class="my-1 ">
		<hr />
		<h2 class="mb-2">Admin Area</h2>
		{#if showUserList}
			<UserList list={data} />
		{/if}
		<button
			class="btn variant-filled-secondary btn-sm"
			on:click={() => (showUserList = !showUserList)}
			>{showUserList ? $LL.USER_ListCollapse() : $LL.USER_ListShow()}</button
		>
		{#if !showUserList}
			<div class="mt-3">{$LL.USER_Generate()}:</div>
			<form method="post" action="?/generateToken" use:enhance>
				<div class="group relative z-0 mb-6 w-56">
					<input
						bind:value={newUserEmail}
						type="email"
						name="newUserEmail"
						placeholder=" Enter New User Email"
						required
						class="input"
					/>
				</div>

				<!-- <div>
					<label>
						<input type="radio" bind:group={newUserRole} name="role" value={'USER'} /> User
					</label>
					<label>
						<input type="radio" bind:group={newUserRole} name="role" value={'EDITOR'} /> Editor
					</label>
				</div> -->

				<div class="flex gap-2">
					<div class="">Assign Role:</div>
					<div class="flex-auto">
						<!-- TODO:  bind:value={formData.role}  -->
						<div class="flex space-x-2">
							{#each Object.keys(roles) as r}
								<span
									class="chip {roles[r] ? 'variant-filled-tertiary' : 'variant-ghost-secondary'}"
									on:click={() => {
										filter(r);
									}}
									on:keypress
								>
									{#if roles[r]}<span><Icon icon="fa:check" /></span>{/if}
									<span class="capitalize">{r}</span>
								</span>
							{/each}
						</div>
					</div>
				</div>
			</form>
			<!-- <button class="btn variant-filled-tertiary btn-base">Delete User</button> -->
		{/if}
	</div>
{/if}
