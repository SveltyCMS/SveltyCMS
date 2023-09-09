<script lang="ts">
	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';
	import { getModalStore } from '@skeletonlabs/skeleton';

	const modalStore = getModalStore();

	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
	import ModalEditForm from './ModalEditForm.svelte';

	// Popup Combobox
	let listboxValue: string = 'edit';

	let Combobox: PopupSettings = {
		event: 'click',
		target: 'Combobox',
		placement: 'bottom-end',
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
				buttonClass = 'gradient-primary';
				iconValue = 'bi:pencil-fill';
				break;
			case 'delete':
				buttonClass = 'gradient-error';
				iconValue = 'bi:trash3-fill';
				break;
			case 'unblock':
				buttonClass = 'gradient-yellow';
				iconValue = 'material-symbols:lock-open';
				break;
			case 'block':
				buttonClass = 'gradient-pink';
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

<!-- Multibutton group-->
<div class="btn-group relative rounded-md text-white">
	<!-- Action button  -->

	<button
		type="button"
		on:click={() => {
			getButtonAndIconValues(listboxValue, listboxValue);
		}}
		class="{getButtonAndIconValues(listboxValue)
			.buttonClass} hover:bg-primary-400 font-semibold uppercase"
	>
		<iconify-icon
			icon={getButtonAndIconValues(listboxValue).iconValue}
			width="20"
			class="mr-2 text-white"
		/>
		{listboxValue ?? 'create'}
	</button>

	<span class="border border-white" />

	<!-- Dropdown button -->
	<button class="bg-surface-500 hover:!bg-surface-800 divide-x-2 rounded-r-sm" use:popup={Combobox}>
		<iconify-icon icon="mdi:chevron-down" width="20" class="text-white" />
	</button>
</div>
<!-- Dropdown/Listbox -->
<div
	class="card bg-surface-500 overflow-hiddens z-10 w-48 rounded-sm text-white"
	data-popup="Combobox"
>
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
				hover="gradient-primary-hover"
				><svelte:fragment slot="lead"
					><iconify-icon icon="bi:pencil-fill" width="20" class="mr-1" /></svelte:fragment
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
				hover="gradient-error-hover"
				><svelte:fragment slot="lead"
					><iconify-icon icon="bi:trash3-fill" width="20" class="mr-1" /></svelte:fragment
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
				hover="gradient-yellow-hover"
				><svelte:fragment slot="lead"
					><iconify-icon
						icon="material-symbols:lock-open"
						width="20"
						class="mr-1"
					/></svelte:fragment
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
				hover="gradient-pink-hover"
				><svelte:fragment slot="lead"
					><iconify-icon icon="material-symbols:lock" width="20" class="mr-1" /></svelte:fragment
				>
				Block
			</ListBoxItem>
		{/if}
	</ListBox>
</div>
