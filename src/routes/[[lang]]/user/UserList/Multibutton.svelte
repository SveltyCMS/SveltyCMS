<script lang="ts">
	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';
	import { modalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
	import ModalEditForm from '../ModalEditForm.svelte';

	// Popup Combobox
	let listboxValue: string = 'edit';
	let Combobox: PopupSettings = {
		event: 'click',
		target: 'Combobox',
		placement: 'bottom',
		closeQuery: '.listbox-item'
		//state: (e: any) => console.log('tooltip', e)
	};

	// modals
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

	function modalConfirm(action: 'delete' | 'block' | 'unblock'): void {
		let modalTitle: string;
		let modalBody: string;
		let modalButtonText: string;

		switch (action) {
			case 'delete':
				modalTitle = 'Please Confirm User Deletion';
				modalBody = 'Are you sure you wish to delete this user?';
				modalButtonText = 'Delete User';
				break;
			case 'block':
				modalTitle = 'Please Confirm User Block';
				modalBody = 'Are you sure you wish to block this user?';
				modalButtonText = 'Block User';
				break;
			case 'unblock':
				modalTitle = 'Please Confirm User Unblock';
				modalBody = 'Are you sure you wish to unblock this user?';
				modalButtonText = 'Unblock User';
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
			case 'edit':
				buttonClass = 'bg-gradient-to-br from-primary-700 via-primary-700 to-primary-300';
				iconValue = 'material-symbols:edit';
				break;
			case 'delete':
				buttonClass = 'bg-gradient-to-br from-error-700 via-error-500 to-error-300';
				iconValue = 'bi:trash3-fill';
				break;
			case 'unblock':
				buttonClass = 'bg-gradient-to-br from-yellow-700 via-yellow-500 to-yellow-200';
				iconValue = 'material-symbols:lock-open';
				break;
			case 'block':
				buttonClass = 'bg-gradient-to-br from-pink-700 via-pink-600 to-pink-300';
				iconValue = 'material-symbols:lock';
				break;
			default:
				buttonClass = 'variant-filled';
				iconValue = 'material-symbols:edit';
				break;
		}

		// edit user
		if (action === 'edit') {
			modalUserForm();
		}
		// delete user
		else if (action === 'delete') {
			modalConfirm('delete');
		}
		// unblock user
		else if (action === 'unblock') {
			modalConfirm('unblock');
		}
		// block user
		else if (action === 'block') {
			modalConfirm('block');
		}

		return {
			buttonClass: `btn ${buttonClass} rounded-none w-48 justify-between`,
			iconValue
		};
	};
</script>

<!-- Multibuttongroup-->
<div class="btn-group rounded-md relative text-white">
	<!-- Action button  -->

	<button
		type="button"
		on:click={() => {
			getButtonAndIconValues(listboxValue, listboxValue);
		}}
		class="{getButtonAndIconValues(listboxValue)
			.buttonClass} hover:bg-primary-400 uppercase font-semibold "
	>
		<Icon
			icon={getButtonAndIconValues(listboxValue).iconValue}
			width="20"
			class="text-white mr-2"
		/>
		{listboxValue ?? 'create'}
	</button>

	<span class="border border-white" />

	<!-- Dropdown button -->
	<button class="bg-surface-500 rounded-r-sm divide-x-2" use:popup={Combobox}>
		<Icon icon="mdi:chevron-down" width="20" class="text-white" />
	</button>
</div>
<!-- Dropdown/Listbox -->
<div class="card w-48 shadow-xl overflow-hiddens rounded-sm" data-popup="Combobox">
	<ListBox
		rounded="rounded-sm"
		active="variant-filled-primary"
		hover="hover:bg-surface-300"
		class="divide-y"
	>
		{#if listboxValue != 'edit'}
			<ListBoxItem
				bind:group={listboxValue}
				name="medium"
				value="edit"
				active="variant-filled-primary"
				hover="hover:bg-gradient-to-br hover:from-primary-700 hover:via-primary-600 hover:to-primary-300"
				><svelte:fragment slot="lead"
					><Icon icon="material-symbols:edit" width="20" class="mr-1" /></svelte:fragment
				>
				Edit
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
				active="bg-yellow-500"
				hover="hover:bg-gradient-to-br hover:from-yellow-700 hover:via-yellow-500 hover:to-yellow-200"
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
				active="bg-pink-700"
				hover="hover:bg-gradient-to-br hover:from-pink-700 hover:via-pink-600 hover:to-pink-300"
				><svelte:fragment slot="lead"
					><Icon icon="material-symbols:lock" width="20" class="mr-1" /></svelte:fragment
				>
				Block
			</ListBoxItem>
		{/if}
	</ListBox>
</div>
