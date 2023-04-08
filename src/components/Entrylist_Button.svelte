<script lang="ts">
	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';
	import { modalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';

	// popupCombobox
	let listboxValue: string = 'create';

	let popupCombobox: PopupSettings = {
		event: 'click',
		target: 'Combobox',
		placement: 'bottom-end',
		closeQuery: '.listbox-item'
		//state: (e: any) => console.log('tooltip', e)
	};

	// modals
	function modalConfirm(
		action: 'create' | 'publish' | 'unpublish' | 'schedule' | 'clone' | 'delete'
	): void {
		let modalTitle: string;
		let modalBody: string;
		let modalButtonText: string;

		switch (action) {
			case 'create':
				modalTitle = 'Please Confirm Content Create';
				modalBody = 'Are you sure you wish to Create this content?';
				modalButtonText = 'Create';
				break;
			case 'publish':
				modalTitle = 'Please Confirm Content Publish';
				modalBody = 'Are you sure you wish to Publish this content?';
				modalButtonText = 'Publish';
				break;
			case 'unpublish':
				modalTitle = 'Please Confirm Content Unpublish';
				modalBody = 'Are you sure you wish to Unpublish this content?';
				modalButtonText = 'Unpublish';
				break;
			case 'schedule':
				modalTitle = 'Please Confirm Content Schedule';
				modalBody = 'Are you sure you wish to Schedule this content?';
				modalButtonText = 'Schedule';
				break;
			case 'clone':
				modalTitle = 'Please Confirm Content Clone';
				modalBody = 'Are you sure you wish to delete this user?';
				modalButtonText = 'Clone';
				break;
			case 'delete':
				modalTitle = 'Please Confirm Content Deletion';
				modalBody = 'Are you sure you wish to delete this user?';
				modalButtonText = 'Delete';
				break;
			default:
				throw new Error(`Invalid action ${action}`);
		}

		const d: ModalSettings = {
			type: 'confirm',

			// Data
			title: modalTitle,
			body: modalBody,
			buttonTextConfirm: modalButtonText,

			//TODO : Add corresponding buttonPositive color
			// modalClasses: '!bg-gradient-to-br from-error-700 via-error-500 to-error-300',

			// TRUE if confirm pressed, FALSE if cancel pressed
			response: (r: boolean) => {
				if (r) console.log(`User ${action} confirmed`);
			}
		};

		modalStore.trigger(d);
	}

	const getButtonAndIconValues = (listboxValue: string, action: string) => {
		let buttonClass = '';
		let iconValue = '';

		switch (listboxValue) {
			case 'create':
				buttonClass = 'gradient-primary';
				iconValue = 'ic:round-plus';
				break;
			case 'publish':
				buttonClass = 'gradient-tertiary';
				iconValue = 'bi:hand-thumbs-up-fill';
				break;
			case 'unpublish':
				buttonClass = 'gradient-yellow';
				iconValue = 'bi:pause-circle';
				break;
			case 'schedule':
				buttonClass = 'gradient-pink';
				iconValue = 'bi:clock';
				break;
			case 'clone':
				buttonClass = 'gradient-secondary';
				iconValue = 'bi:clipboard-data-fill';
				break;
			case 'delete':
				buttonClass = 'gradient-error';
				iconValue = 'bi:trash3-fill';
				break;
			default:
				buttonClass = '';
				iconValue = '';
				break;
		}
		// create
		if (action === 'create') {
			modalConfirm('create');
		}
		// publish
		else if (action === 'publish') {
			modalConfirm('publish');
		}
		// unpublish
		else if (action === 'unpublish') {
			modalConfirm('unpublish');
		}
		// schedule
		else if (action === 'schedule') {
			modalConfirm('schedule');
		}
		// clone
		else if (action === 'clone') {
			modalConfirm('clone');
		}
		// delete user
		else if (action === 'delete') {
			modalConfirm('delete');
		}

		return {
			buttonClass: `btn ${buttonClass} rounded-none w-48 justify-between`,
			iconValue
		};
	};
</script>

<!-- Multibuttongroup-->
<div class="btn-group rounded-l-full !rounded-r-md relative text-white w-28">
	<!-- Action button  -->
	<button
		type="button"
		on:click={() => {
			getButtonAndIconValues(listboxValue, listboxValue);
		}}
		class="{getButtonAndIconValues(listboxValue, listboxValue)
			.buttonClass} hover:bg-primary-400 uppercase font-semibold"
	>
		<iconify-icon
			icon={getButtonAndIconValues(listboxValue, listboxValue).iconValue}
			width="20"
			class="text-white sm:mr-2"
		/>
		<div class="hidden sm:block">{listboxValue ?? 'create'}</div>
	</button>

	<span class="border border-white" />

	<!-- Dropdown button -->
	<button
		class="bg-surface-500 !rounded-r-md divide-x-2"
		use:popup={popupCombobox}
		style="position: relative;"
	>
		<iconify-icon icon="mdi:chevron-down" width="20" class="text-white" />
	</button>
</div>
<!-- Dropdown/Listbox -->
<div class="card w-48 shadow-xl overflow-hiddens rounded-sm" data-popup="popupCombobox">
	<ListBox
		rounded="rounded-sm"
		active="variant-filled-primary"
		hover="hover:bg-surface-300"
		class="divide-y"
	>
		{#if listboxValue != 'create'}
			<ListBoxItem
				bind:group={listboxValue}
				name="medium"
				value="create"
				active="variant-filled-primary"
				hover="hover:bg-gradient-to-br hover:from-primary-700 hover:via-primary-600 hover:to-primary-300"
				><svelte:fragment slot="lead"
					><iconify-icon icon="material-symbols:edit" width="20" class="mr-1" /></svelte:fragment
				>
				Create
			</ListBoxItem>
		{/if}

		{#if listboxValue != 'publish'}
			<ListBoxItem
				bind:group={listboxValue}
				name="medium"
				value="publish"
				active="bg-yellow-500"
				hover="gradient-tertiary-hover"
				><svelte:fragment slot="lead"
					><iconify-icon icon="bi:hand-thumbs-up-fill" width="20" class="mr-1" /></svelte:fragment
				>
				Publish
			</ListBoxItem>
		{/if}

		{#if listboxValue != 'unpublish'}
			<ListBoxItem
				bind:group={listboxValue}
				name="medium"
				value="unpublish"
				active="bg-yellow-500"
				hover="hover:bg-gradient-to-br hover:from-yellow-700 hover:via-yellow-500 hover:to-yellow-200"
				><svelte:fragment slot="lead"
					><iconify-icon icon="bi:pause-circle" width="20" class="mr-1" /></svelte:fragment
				>
				Unpublish
			</ListBoxItem>
		{/if}

		{#if listboxValue != 'schedule'}
			<ListBoxItem
				bind:group={listboxValue}
				name="medium"
				value="schedule"
				active="bg-pink-700"
				hover="hover:bg-gradient-to-br hover:from-pink-700 hover:via-pink-600 hover:to-pink-300"
				><svelte:fragment slot="lead"
					><iconify-icon icon="bi:clock" width="20" class="mr-1" /></svelte:fragment
				>
				Schedule
			</ListBoxItem>
		{/if}

		{#if listboxValue != 'clone'}
			<ListBoxItem
				bind:group={listboxValue}
				name="medium"
				value="clone"
				active="variant-filled-error"
				hover="hover:bg-gradient-to-br hover:from-error-600 hover:via-error-500 hover:to-error-300"
				><svelte:fragment slot="lead"
					><iconify-icon icon="bi:clipboard-data-fill" width="20" class="mr-1" /></svelte:fragment
				>
				Clone
			</ListBoxItem>
		{/if}

		{#if listboxValue != 'delete'}
			<ListBoxItem
				bind:group={listboxValue}
				name="medium"
				value="delete"
				active="variant-filled-error"
				hover="hover:bg-gradient-to-br hover:from-error-600 hover:via-error-500 hover:to-error-300"
				><svelte:fragment slot="lead"
					><iconify-icon icon="bi:trash3-fill" width="20" class="mr-1" /></svelte:fragment
				>
				Delete
			</ListBoxItem>
		{/if}
	</ListBox>
</div>
