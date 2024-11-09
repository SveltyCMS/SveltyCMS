<!-- 
@files src/components/user/Multibutton.svelte
@description A multibutton component for user management.
-->

<script lang="ts">
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

	// Popup Combobox
	let listboxValue: string = $state('edit');
	let { selectedRows } = $props();

	const Combobox: PopupSettings = {
		event: 'click',
		target: 'Combobox',
		placement: 'bottom-end',
		closeQuery: '.listbox-item'
	};

	function showErrorToast(message: string) {
		const t = {
			message: `<iconify-icon icon="mdi:alert" color="white" width="26" class="mr-1"></iconify-icon> ${message}`,
			background: 'gradient-error',
			timeout: 3000,
			classes: 'border-1 !rounded-md'
		};
		toastStore.trigger(t);
	}

	function showSuccessToast(message: string, background: string = 'gradient-primary') {
		const t = {
			message: `<iconify-icon icon="mdi:check-outline" color="white" width="26" class="mr-1"></iconify-icon> ${message}`,
			background,
			timeout: 3000,
			classes: 'border-1 !rounded-md'
		};
		toastStore.trigger(t);
	}

	// modals
	function modalUserForm(): void {
		if (selectedRows.length === 0) {
			showErrorToast('Please select a user to edit');
			return;
		}

		if (selectedRows.length > 1) {
			showErrorToast('Please select only one user to edit');
			return;
		}

		const modalComponent: ModalComponent = {
			ref: ModalEditForm,
			props: {
				isGivenData: true,
				username: selectedRows[0].data.username,
				email: selectedRows[0].data.email,
				role: selectedRows[0].data.role,
				user_id: selectedRows[0].data._id
			},
			slot: '<p>Edit Form</p>'
		};
		const d: ModalSettings = {
			type: 'component',
			title: 'Edit User Data',
			body: 'Modify your data and then press Save.',
			component: modalComponent,
			response: async (r: any) => {
				if (r) {
					try {
						const res = await fetch('/api/user/updateUserAttributes', {
							method: 'PUT',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								user_id: selectedRows[0].data._id,
								userData: r
							})
						});

						if (res.ok) {
							showSuccessToast('User Updated');
							await invalidateAll();
						} else {
							const data = await res.json();
							showErrorToast(data.message || 'Failed to update user');
						}
					} catch (error) {
						console.error('Error updating user:', error);
						showErrorToast('Failed to update user');
					}
				}
			}
		};
		modalStore.trigger(d);
	}

	async function modalConfirm(action: 'delete' | 'block' | 'unblock'): Promise<void> {
		if (selectedRows.length === 0) {
			showErrorToast(`Please select user(s) to ${action}`);
			return;
		}

		let modalTitle: string;
		let modalBody: string;
		let modalButtonText: string;
		let toastMessage: string;
		let toastBackground: string;
		let endpoint: string;
		let method: string;

		switch (action) {
			case 'delete':
				modalTitle = 'Please Confirm User Deletion';
				modalBody = 'Are you sure you wish to delete this user?';
				modalButtonText = 'Delete User';
				toastMessage = 'User Deleted';
				toastBackground = 'gradient-error';
				endpoint = '/api/user/deleteUsers';
				method = 'DELETE';
				break;
			case 'block':
				modalTitle = 'Please Confirm User Block';
				modalBody = 'Are you sure you wish to block this user?';
				modalButtonText = 'Block User';
				toastMessage = 'User Blocked';
				toastBackground = 'gradient-yellow';
				endpoint = '/api/user/blockUsers';
				method = 'PUT';
				break;
			case 'unblock':
				modalTitle = 'Please Confirm User Unblock';
				modalBody = 'Are you sure you wish to unblock this user?';
				modalButtonText = 'Unblock User';
				toastMessage = 'User Unblocked';
				toastBackground = 'gradient-primary';
				endpoint = '/api/user/unblockUsers';
				method = 'PUT';
				break;
			default:
				throw Error(`Invalid action ${action}`);
		}

		const d: ModalSettings = {
			type: 'confirm',
			title: modalTitle,
			body: modalBody,
			buttonTextConfirm: modalButtonText,

			response: async (r: boolean) => {
				if (!r) return;

				try {
					const user_ids = selectedRows.map((row) => row.data._id);
					const res = await fetch(endpoint, {
						method,
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ user_ids })
					});

					if (res.ok) {
						showSuccessToast(toastMessage, toastBackground);
						await invalidateAll();
					} else {
						const data = await res.json();
						showErrorToast(data.message || `Failed to ${action} user(s)`);
					}
				} catch (error) {
					console.error(`Error ${action}ing user:`, error);
					showErrorToast(`Failed to ${action} user(s)`);
				}
			}
		};

		modalStore.trigger(d);
	}

	const getButtonAndIconValues = (listboxValue: string) => {
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

		return {
			buttonClass: `btn ${buttonClass} rounded-none w-48 justify-between`,
			iconValue
		};
	};

	function handleAction() {
		switch (listboxValue) {
			case 'edit':
				modalUserForm();
				break;
			case 'delete':
				modalConfirm('delete');
				break;
			case 'unblock':
				modalConfirm('unblock');
				break;
			case 'block':
				modalConfirm('block');
				break;
		}
	}
</script>

<!-- Multibutton group-->
<div class="btn-group relative rounded-md text-white">
	<!-- Action button  -->
	<button
		type="button"
		onclick={handleAction}
		class="{getButtonAndIconValues(listboxValue).buttonClass} w-full font-semibold uppercase hover:bg-primary-400"
		disabled={selectedRows.length === 0}
	>
		<iconify-icon icon={getButtonAndIconValues(listboxValue).iconValue} width="20" class="mr-2 text-white"></iconify-icon>
		{listboxValue ?? 'create'}
	</button>

	<span class="border border-white"></span>

	<!-- Dropdown button -->
	<button class="divide-x-2 rounded-r-sm bg-surface-500 hover:!bg-surface-800" use:popup={Combobox}>
		<iconify-icon icon="mdi:chevron-down" width="20" class="text-white"></iconify-icon>
	</button>
</div>

<!-- Dropdown/Listbox -->
<div class="overflow-hiddens card z-10 w-48 rounded-sm bg-surface-500 text-white" data-popup="Combobox">
	<ListBox rounded="rounded-sm" active="variant-filled-primary" hover="hover:bg-surface-300" class="divide-y">
		{#if listboxValue != 'edit'}
			<ListBoxItem bind:group={listboxValue} name="medium" value="edit" active="variant-filled-primary" hover="gradient-primary-hover"
				>{#snippet lead()}
								<iconify-icon icon="bi:pencil-fill" width="20" class="mr-1"></iconify-icon>
							{/snippet}
				Edit
			</ListBoxItem>
		{/if}

		{#if listboxValue != 'delete'}
			<ListBoxItem bind:group={listboxValue} name="medium" value="delete" active="variant-filled-error" hover="gradient-error-hover"
				>{#snippet lead()}
								<iconify-icon icon="bi:trash3-fill" width="20" class="mr-1"></iconify-icon>
							{/snippet}
				Delete
			</ListBoxItem>
		{/if}

		{#if listboxValue != 'unblock'}
			<ListBoxItem bind:group={listboxValue} name="medium" value="unblock" active="bg-yellow-500" hover="gradient-yellow-hover"
				>{#snippet lead()}
								<iconify-icon icon="material-symbols:lock-open" width="20" class="mr-1"></iconify-icon>
							{/snippet}
				Unblock
			</ListBoxItem>
		{/if}

		{#if listboxValue != 'block'}
			<ListBoxItem bind:group={listboxValue} name="medium" value="block" active="bg-pink-700" hover="gradient-pink-hover"
				>{#snippet lead()}
								<iconify-icon icon="material-symbols:lock" width="20" class="mr-1"></iconify-icon>
							{/snippet}
				Block
			</ListBoxItem>
		{/if}
	</ListBox>
</div>
