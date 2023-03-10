<script lang="ts">
	import showFieldsStore from '$src/lib/stores/fieldStore';

	// define default button
	let multiButton = 'edit';

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';

	// Popup Tooltips
	let EditSettings: PopupSettings = {
		event: 'hover',
		target: 'EditPopup',
		placement: 'left'
	};
	let DeleteSettings: PopupSettings = {
		event: 'hover',
		target: 'DeletePopup',
		placement: 'left'
	};
	let BlockSettings: PopupSettings = {
		event: 'hover',
		target: 'BlockPopup',
		placement: 'left'
	};
	let UnblockSettings: PopupSettings = {
		event: 'hover',
		target: 'UnblockPopup',
		placement: 'left'
	};

	let multiSelectSettings: PopupSettings = {
		event: 'click', // Set the event as: click | hover | hover-click
		target: 'multiSelect' // Provide a matching 'data-popup' value.
	};

	let listboxValue: string;
	let exampleCombobox: PopupSettings = {
		event: 'click',
		target: 'exampleCombobox',
		placement: 'bottom',
		closeQuery: '.listbox-item'
		// state: (e: any) => console.log('tooltip', e)
	};
</script>

<!-- Combobox -->
<div>
	<button class="btn variant-ghost-surface w-48 justify-between" use:popup={exampleCombobox}>
		<span class="capitalize">{listboxValue ?? 'create'}</span>
		<Icon icon="mdi:chevron-down" width="20" />
	</button>
	<div class="card w-48 shadow-xl overflow-hiddens" data-popup="exampleCombobox">
		<ListBox rounded="rounded-none" active="variant-filled-primary" hover="hover:bg-surface-300">
			{#if listboxValue != 'create'}
				<ListBoxItem
					bind:group={listboxValue}
					name="medium"
					value="create"
					active="!variant-filled-primary"
					hover="hover:bg-gradient-to-br hover:from-primary-700 hover:via-primary-600 hover:to-primary-400"
					><svelte:fragment slot="lead"
						><Icon icon="material-symbols:edit" width="20" class="mr-1" /></svelte:fragment
					>
					Create
				</ListBoxItem>
			{/if}

			{#if listboxValue != 'delete'}
				<ListBoxItem
					bind:group={listboxValue}
					name="medium"
					value="delete"
					active="variant-filled-error"
					hover="hover:bg-gradient-to-br hover:from-error-600 hover:via-error-500 hover:to-error-400"
					><svelte:fragment slot="lead"
						><Icon icon="bi:trash3-fill" width="20" class="mr-1" /></svelte:fragment
					>
					Delete
				</ListBoxItem>
			{/if}

			{#if listboxValue != 'unblock'}
				<ListBoxItem
					bind:group={listboxValue}
					name="medium"
					value="unblock"
					hover="hover:bg-gradient-to-br hover:from-tertiary-600 hover:via-tertiary-500 hover:to-tertiary-400"
					><svelte:fragment slot="lead"
						><Icon icon="material-symbols:lock-open" width="20" class="mr-1" /></svelte:fragment
					>
					Unblock
				</ListBoxItem>
			{/if}

			{#if listboxValue != 'block'}
				<ListBoxItem
					bind:group={listboxValue}
					name="medium"
					value="block"
					hover="hover:bg-gradient-to-br hover:from-pink-700 hover:via-pink-500 hover:to-pink-400"
					><svelte:fragment slot="lead"
						><Icon icon="material-symbols:lock" width="20" class="mr-1" /></svelte:fragment
					>
					Block
				</ListBoxItem>
			{/if}
		</ListBox>
	</div>
</div>

<!-- create/delete/block/unblock
<div class="flex items-center justify-center ">
	
	<div class="relative inline-flex shadow-md hover:shadow-lg focus:shadow-lg" role="group">
		{#if multiButton == 'edit'}
			<button
				use:popup={EditSettings}
				on:click={() => {
					$showFieldsStore.multibutton = true;
				}}
				class="relative flex w-[60px] items-center justify-center rounded-l border-r-2 border-white bg-gradient-to-br from-tertiary-600 via-tertiary-500 to-tertiary-400 px-2 py-2 font-bold text-white md:ml-auto md:w-[150px]"
			>
				
				<div class="card variant-filled-secondary p-4" data-popup="EditPopup">
					Edit User
					<div class="arrow variant-filled-secondary" />
				</div>
				<Icon icon="material-symbols:edit" width="14" class="mr-1" />
				<div class="hidden sm:block text-xs">Edit</div>
			</button>
		{:else if multiButton == 'delete'}
			<button
				use:popup={DeleteSettings}
				on:click={() => {
					$showFieldsStore.multibutton = true;
				}}
				class="relative flex w-[30px] items-center justify-center rounded-l border-r-2 border-white bg-gradient-to-br from-error-600 via-error-500 to-error-300 px-2 py-2 font-bold text-white md:ml-auto md:w-[150px]"
				>
				<div class="card variant-filled-secondary p-4" data-popup="DeletePopup">
					Delete User
					<div class="arrow variant-filled-secondary" />
				</div>
				<Icon icon="bi:trash3-fill" color="white" width="14" />
				<div class="hidden md:block">Delete</div>
			</button>
		{:else if multiButton == 'block'}
			<button
				use:popup={BlockSettings}
				on:click={() => {
					$showFieldsStore.multibutton = true;
				}}
				class="relative flex w-[30px] items-center justify-center rounded-l border-r-2 border-white bg-gradient-to-br from-pink-700 via-pink-500 to-pink-300 px-2 py-2 font-bold text-white md:ml-auto md:w-[150px]"
			>
				
				<div class="card variant-filled-secondary p-4" data-popup="BlockPopup">
					Block User
					<div class="arrow variant-filled-secondary" />
				</div>
				<Icon icon="material-symbols:lock" color="white" width="14" />
				<div class="hidden md:block">Block</div>
			</button>
		{:else if multiButton == 'unblock'}
			<button
				use:popup={UnblockSettings}
				on:click={() => {
					$showFieldsStore.multibutton = true;
				}}
				class="relative flex w-[30px] items-center justify-center rounded-l border-r-2 border-white bg-gradient-to-br from-surface-700 via-surface-500 to-surface-300 px-2 py-2 font-bold text-white md:ml-auto md:w-[150px]"
				>
				<div class="card variant-filled-secondary p-4" data-popup="UnblockPopup">
					Unblock User
					<div class="arrow variant-filled-secondary" />
				</div>

				<Icon icon="material-symbols:lock-open" color="white" width="14" />
				<div class="hidden md:block">Unblock</div>
			</button>
		{/if}

		
		<button
			use:popup={{ menu: 'multiSelect', interactive: true }}
			class="relabsolute  mr-1 inline-block rounded-l-none rounded-r bg-surface-600 px-2 text-xs font-medium uppercase leading-tight text-white transition duration-150 ease-in-out hover:bg-surface-700 focus:bg-surface-700 focus:outline-none focus:ring-0 active:bg-surface-700"
		>
			<Icon icon="mdi:chevron-down" width="20" /></button
		>

		<nav
			class="card list-nav mt-14 mr-1 w-42 bg-surface-600 p-2 shadow-xl dark:border-none dark:bg-surface-300"
			data-popup="multiSelect"
		>
			<ul>
				{#if multiButton != 'edit'}
					<li>
						<button
							class="btn btn-base w-full bg-gradient-to-br from-primary-600 via-primary-500 to-primary-400 font-bold text-white"
						>
							<span><Icon icon="material-symbols:edit" width="14" /></span>
							<span class="font-bold">Edit</span>
						</button>
					</li>
				{/if}
				{#if multiButton != 'delete'}
					<li>
						<button
							class="btn btn-base w-full bg-gradient-to-br from-error-700 via-error-600 to-error-400 font-bold text-white"
						>
							<span><Icon icon="bi:trash3-fill" width="14" /></span>
							<span class="font-bold">Delete</span>
						</button>
					</li>
				{/if}
				{#if multiButton != 'block'}
					<li>
						<button
							class="btn btn-base w-full bg-gradient-to-br from-pink-700 via-pink-500 to-pink-300 font-bold text-white "
						>
							<span><Icon icon="material-symbols:lock" width="14" /></span>
							<span class="font-bold">Block</span>
						</button>
					</li>
				{/if}
				{#if multiButton != 'unblock'}
					<li>
						<button
							class="btn btn-base w-full bg-gradient-to-br from-surface-700 via-surface-500 to-surface-300 font-bold text-white "
						>
							<span><Icon icon="material-symbols:lock-open" width="14" /></span>
							<span class="font-bold">Unblock</span>
						</button>
					</li>
				{/if}
			</ul>
		</nav>
	</div>
</div>
-->
