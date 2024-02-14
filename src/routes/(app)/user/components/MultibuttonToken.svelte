<script lang="ts">
	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';
	import { getToastStore, getModalStore } from '@skeletonlabs/skeleton';

	const modalStore = getModalStore();
	const toastStore = getToastStore();

	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
	import ModalEditForm from './ModalEditForm.svelte';
	import { invalidateAll } from '$app/navigation';
	import ModalEditToken from './ModalEditToken.svelte';

	// Popup Combobox
	let listboxValue: string = 'edit';
	export let selectedRows;

	let Combobox: PopupSettings = {
		event: 'click',
		target: 'Combobox',
		placement: 'bottom-end',
		closeQuery: '.listbox-item'
		//state: (e: any) => console.log('tooltip', e)
	};

	// modals
	function modalUserForm(): void {
		if (selectedRows.length === 0) return; // Trigger the toast
		const t = {
			message: '<iconify-icon icon="mdi:check-outline" color="white" width="26" class="mr-1"></iconify-icon> User Data Updated',
			// Provide any utility or variant background style:
			background: 'gradient-tertiary',
			timeout: 3000,
			// Add your custom classes here:
			classes: 'border-1 !rounded-md'
		};
		toastStore.trigger(t);

		// console.log('No user selected');
		//console.log(selectedRows[0].data);

		const modalComponent: ModalComponent = {
			// Pass a reference to your custom component
			ref: ModalEditToken,
			// Add your props as key/value pairs
			props: {
				token: selectedRows[0].data.token,
				email: selectedRows[0].data.email,
				role: selectedRows[0].data.role,
				userId: selectedRows[0].data.userID
			},
			// Provide default slot content as a template literal
			slot: '<p>Edit Form</p>'
		};
		const d: ModalSettings = {
			type: 'component',
			// NOTE: title, body, response, etc are supported!
			title: m.multibuttontoken_modaltitle(),
			body: m.multibuttontoken_modalbody(),
			component: modalComponent,
			// Pass abitrary data to the component
			response: async (r: any) => {
				if (r) {
					const res = await fetch('/api/user/editToken', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ ...r })
					});

					if (res.status === 200) {
						await invalidateAll();
					}
				}
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
				modalTitle = m.multibuttontoken_deletetitle();
				modalBody = m.multibuttontoken_deletebody();
				modalButtonText = m.multibuttontoken_deletebutton();
				break;
			case 'block':
				modalTitle = m.multibuttontoken_blocktitle();
				modalBody = m.multibuttontoken_blockbody();
				modalButtonText = m.multibuttontoken_blockbutton();
				break;
			case 'unblock':
				modalTitle = m.multibuttontoken_unblocktitle();
				modalBody = m.multibuttontoken_unblockbody();
				modalButtonText = m.multibuttontoken_unblockbutton();
				break;
			default:
				throw new Error(`Invalid action ${action}`);
		}

		//console.log('entered');

		const d: ModalSettings = {
			type: 'confirm',

			// Data
			title: modalTitle,
			body: modalBody,
			buttonTextConfirm: modalButtonText,

			//TODO : Add corresponding buttonPositive color
			// modalClasses: '!bg-gradient-to-br from-error-700 via-error-500 to-error-300',

			// TRUE if confirm pressed, FALSE if cancel pressed
			response: async (r: boolean) => {
				if (!r) return;
				const endpoint = action === 'delete' ? 'deleteTokens' : '';
				const res = await fetch(`/api/user/${endpoint}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(selectedRows.map((row: any) => row.data))
				});

				if (res.status === 200) {
					await invalidateAll();
					// close
				}
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
		class="{getButtonAndIconValues(listboxValue, 'edit').buttonClass} font-semibold uppercase hover:bg-primary-400"
	>
		<iconify-icon icon={getButtonAndIconValues(listboxValue, 'edit').iconValue} width="20" class="mr-2 text-white" />
		{listboxValue ?? 'create'}
	</button>

	<span class="border border-white" />

	<!-- Dropdown button -->
	<button class="divide-x-2 rounded-r-sm bg-surface-500 hover:!bg-surface-800" use:popup={Combobox}>
		<iconify-icon icon="mdi:chevron-down" width="20" class="text-white" />
	</button>
</div>
<!-- Dropdown/Listbox -->
<div class="overflow-hiddens card z-10 w-48 rounded-sm bg-surface-500 text-white" data-popup="Combobox">
	<ListBox rounded="rounded-sm" active="variant-filled-primary" hover="hover:bg-surface-300" class="divide-y">
		{#if listboxValue != 'edit'}
			<ListBoxItem bind:group={listboxValue} name="medium" value="edit" active="variant-filled-primary" hover="gradient-primary-hover"
				><svelte:fragment slot="lead"><iconify-icon icon="bi:pencil-fill" width="20" class="mr-1" /></svelte:fragment>
				{m.multibuttonedit()}
			</ListBoxItem>
		{/if}

		{#if listboxValue != 'delete'}
			<ListBoxItem bind:group={listboxValue} name="medium" value="delete" active="variant-filled-error" hover="gradient-error-hover"
				><svelte:fragment slot="lead"><iconify-icon icon="bi:trash3-fill" width="20" class="mr-1" /></svelte:fragment>

				{m.multibuttondelete()}
			</ListBoxItem>
		{/if}
	</ListBox>
</div>
