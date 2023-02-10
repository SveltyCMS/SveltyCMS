<!-- <script lang="ts">
	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';

	import type { PageData } from '../$types';

	export let list: PageData;

	const listOfUsers = JSON.parse(list.user);
	console.log(listOfUsers);
</script>

<div class="">
	{#each listOfUsers as user}
		<div>
			<span>{$LL.USER_Username()}: {user.username} {user.role} {user.email}</span> - (edit/delete/role)
		</div>
	{/each}
</div> -->
<script lang="ts">
	//skelton
	import { Modal, modalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
	import ModalEditForm from '../ModalEditForm.svelte';
	import { menu } from '@skeletonlabs/skeleton';

	import ToolTip from '$src/components/ToolTip.svelte';

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

	function modalConfirm(): void {
		const d: ModalSettings = {
			type: 'confirm',
			title: 'Please Confirm User Deletion',
			body: 'Are you sure you wish to proceed?',
			response: (r: boolean) => {
				if (r) console.log('response:', r);
			}
		};
		modalStore.trigger(d);
	}

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';

	import type { PageData } from '../$types';

	export let list: PageData;

	const listOfUsers = JSON.parse(list.user);
	console.log(listOfUsers);

	// State to keep track of whether the modal is open or not
	let showModal = false;

	// State to keep track of the selected user
	let selectedUser: any;

	// define Multifuntion default button
	let multiButton = 'edit';
</script>

<h4 class="mb-2">List of Users:</h4>
<table>
	<thead class="bg-surface-600 rounded-t border-b-2">
		<!-- TODO: Grab variable Data -->
		<tr class="divide-x-2">
			<th class="px-2">Username</th>
			<th class="px-2">Role</th>
			<th class="px-2">Email</th>
			<th class="px-2">Last Access</th>
			<th class="px-2">First Access</th>
			<th class="px-2">Actions</th>
		</tr>
	</thead>
	<tbody>
		{#each listOfUsers as user}
			<tr class="divide-x-2">
				<td class="px-2">{user.username}</td>
				<td class="px-2">{user.role}</td>
				<td class="px-2">{user.email}</td>
				<td class="px-2">Add Last Access</td>
				<td class="px-2">Add First Access</td>
				<td>
					<button on:click={modalUserForm}>Edit</button>
					<button on:click={modalConfirm}>Delete</button>
				</td>
			</tr>
		{/each}
	</tbody>
</table>

<!-- create/delete/block/unblock -->
<div class="flex items-center justify-center">
	<!-- the actual buttons -->
	<div class="inline-flex shadow-md hover:shadow-lg focus:shadow-lg" role="group">
		{#if multiButton == 'edit'}
			<button
				on:click={modalUserForm}
				class="relative flex w-[30px] items-center justify-center rounded-l border-r-2 border-white bg-gradient-to-br from-tertiary-600 via-tertiary-500 to-tertiary-400 px-2 py-2 font-bold text-white md:ml-auto md:w-[150px]"
			>
				<ToolTip text="edit" position="bottom" class="bg-surface-500 text-black dark:text-white" />
				<Icon icon="material-symbols:edit" width="20" class="mr-1" />
				<div class="hidden md:block">Edit</div>
			</button>
		{:else if multiButton == 'delete'}
			<button
				on:click={modalConfirm}
				class="relative flex w-[30px] items-center justify-center rounded-l border-r-2 border-white bg-gradient-to-br from-error-600 via-error-500 to-error-300 px-2 py-2 font-bold text-white md:ml-auto md:w-[150px]"
				><ToolTip
					text="Delete User"
					position="bottom"
					class="bg-surface-500 text-black dark:text-white"
				/>
				<Icon icon="bi:trash3-fill" color="white" width="20" class="mr-1" />
				<div class="hidden md:block">Delete</div>
			</button>
		{:else if multiButton == 'block'}
			<button
				class="relative flex w-[30px] items-center justify-center rounded-l border-r-2 border-white bg-gradient-to-br from-pink-700 via-pink-500 to-pink-300 px-2 py-2 font-bold text-white md:ml-auto md:w-[150px]"
				><ToolTip
					text="Block User"
					position="bottom"
					class="bg-surface-500 text-black dark:text-white"
				/>
				<Icon icon="material-symbols:lock" color="white" width="20" class="mr-1" />
				<div class="hidden md:block">Block</div>
			</button>
		{:else if multiButton == 'unblock'}
			<button
				class="relative flex w-[30px] items-center justify-center rounded-l border-r-2 border-white bg-gradient-to-br from-surface-700 via-surface-500 to-surface-300 px-2 py-2 font-bold text-white md:ml-auto md:w-[150px]"
				><ToolTip
					text="Unblock User"
					position="bottom"
					class="bg-surface-500 text-black dark:text-white"
				/>
				<Icon icon="material-symbols:lock-open" color="white" width="20" class="mr-1" />
				<div class="hidden md:block">Unblock</div>
			</button>
		{/if}

		<!-- Dropdown selection -->
		<button
			use:menu={{ menu: 'multiSelect', interactive: true }}
			class="relative mr-1 inline-block rounded-l-none rounded-r bg-surface-600 px-2 text-xs font-medium uppercase leading-tight text-white transition duration-150 ease-in-out hover:bg-surface-700 focus:bg-surface-700 focus:outline-none focus:ring-0 active:bg-surface-700"
		>
			<Icon icon="mdi:chevron-down" width="20" /></button
		>

		<nav
			class="card list-nav mt-14 mr-1 w-42 bg-surface-600 p-2 shadow-xl dark:border-none dark:bg-surface-300"
			data-menu="multiSelect"
		>
			<ul>
				{#if multiButton != 'edit'}
					<li>
						<button
							class="btn btn-base w-full bg-gradient-to-br from-primary-600 via-primary-500 to-primary-400 font-bold text-white"
						>
							<span><Icon icon="material-symbols:edit" width="20" /></span>
							<span class="font-bold">Edit</span>
						</button>
					</li>{/if}
				{#if multiButton != 'delete'}
					<li>
						<button
							class="btn btn-base w-full bg-gradient-to-br from-error-700 via-error-600 to-error-400 font-bold text-white"
						>
							<span><Icon icon="bi:trash3-fill" width="20" /></span>
							<span class="font-bold">Delete</span>
						</button>
					</li>
				{/if}
				{#if multiButton != 'block'}
					<li>
						<button
							class="btn btn-base w-full bg-gradient-to-br from-pink-700 via-pink-500 to-pink-300 font-bold text-white "
						>
							<span><Icon icon="material-symbols:lock" width="20" /></span>
							<span class="font-bold">Block</span>
						</button>
					</li>
				{/if}
				{#if multiButton != 'unblock'}
					<li>
						<button
							class="btn btn-base w-full bg-gradient-to-br from-surface-700 via-surface-500 to-surface-300 font-bold text-white "
						>
							<span><Icon icon="material-symbols:lock-open" width="20" /></span>
							<span class="font-bold">Unblock</span>
						</button>
					</li>
				{/if}
			</ul>
		</nav>
	</div>
</div>
