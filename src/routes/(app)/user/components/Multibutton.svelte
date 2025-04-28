<!-- 
@files src/components/user/Multibutton.svelte
@component
**A unified multibutton component for managing users and tokens**

Manages actions (edit, delete, block, unblock) with debounced submissions.

@Example
<Multibutton bind:selectedRows={selectedRows} type="user" />

#### Props
- `selectedRows` {array} - Array of selected rows (UserData | TokenData)
- `type` {"user" | "token"} - Type of data to manage (default: 'user')
-->

<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';
	import { getToastStore, getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
	import ModalEditForm from './ModalEditForm.svelte';
	import ModalEditToken from './ModalEditToken.svelte';

	interface UserData {
		_id: string;
		username: string;
		email: string;
		role: string;
	}

	interface TokenData {
		token: string;
		email: string;
		role: string;
		user_id: string;
	}

	type ActionType = 'edit' | 'delete' | 'block' | 'unblock';

	// Popup Combobox
	let listboxValue = $state<ActionType>('edit');
	let { selectedRows, type = 'user' } = $props<{
		selectedRows: (UserData | TokenData)[];
		type: 'user' | 'token';
	}>();

	// Derived values
	let isDisabled = $derived(selectedRows.length === 0);
	let isMultipleSelected = $derived(selectedRows.length > 1);

	const modalStore = getModalStore();
	const toastStore = getToastStore();

	const Combobox: PopupSettings = {
		event: 'click',
		target: 'Combobox',
		placement: 'bottom-end',
		closeQuery: '.listbox-item'
	};

	const actionConfig = {
		edit: {
			buttonClass: 'gradient-primary',
			iconValue: 'bi:pencil-fill',
			modalTitle: () => (type === 'user' ? m.adminarea_title() : m.multibuttontoken_modaltitle()),
			modalBody: () => (type === 'user' ? 'Modify your data and then press Save.' : m.multibuttontoken_modalbody()),
			endpoint: () => (type === 'user' ? '/api/user/updateUserAttributes' : '?/editToken'),
			method: () => (type === 'user' ? 'PUT' : 'POST'),
			toastMessage: () => `${type === 'user' ? 'User' : 'Token'} Updated`,
			toastBackground: 'gradient-primary'
		},
		delete: {
			buttonClass: 'gradient-error',
			iconValue: 'bi:trash3-fill',
			modalTitle: () => (type === 'user' ? 'Please Confirm User Deletion' : m.multibuttontoken_deletetitle()),
			modalBody: () => (type === 'user' ? 'Are you sure you wish to delete this user?' : m.multibuttontoken_deletebody()),
			endpoint: () => (type === 'user' ? '/api/user/deleteUsers' : '/api/user/deleteTokens'),
			method: () => 'DELETE',
			toastMessage: () => `${type === 'user' ? 'User' : 'Token'} Deleted`,
			toastBackground: 'gradient-error'
		},
		block: {
			buttonClass: 'gradient-pink',
			iconValue: 'material-symbols:lock',
			modalTitle: () => (type === 'user' ? 'Please Confirm User Block' : m.multibuttontoken_blocktitle()),
			modalBody: () => (type === 'user' ? 'Are you sure you wish to block this user?' : m.multibuttontoken_blockbody()),
			endpoint: () => (type === 'user' ? '/api/user/blockUsers' : '?/blockToken'),
			method: () => (type === 'user' ? 'PUT' : 'POST'),
			toastMessage: () => `${type === 'user' ? 'User' : 'Token'} Blocked`,
			toastBackground: 'gradient-yellow'
		},
		unblock: {
			buttonClass: 'gradient-yellow',
			iconValue: 'material-symbols:lock-open',
			modalTitle: () => (type === 'user' ? 'Please Confirm User Unblock' : m.multibuttontoken_unblocktitle()),
			modalBody: () => (type === 'user' ? 'Are you sure you wish to unblock this user?' : m.multibuttontoken_unblockbody()),
			endpoint: () => (type === 'user' ? '/api/user/unblockUsers' : '?/unblockToken'),
			method: () => (type === 'user' ? 'PUT' : 'POST'),
			toastMessage: () => `${type === 'user' ? 'User' : 'Token'} Unblocked`,
			toastBackground: 'gradient-primary'
		}
	} as const;

	interface ModalResponse {
		username?: string;
		email?: string;
		role?: string;
		token?: string;
		user_id?: string;
	}

	function showToast(message: string, isError = false, background = 'gradient-primary') {
		toastStore.trigger({
			message: `<iconify-icon icon="${isError ? 'mdi:alert' : 'mdi:check-outline'}" color="white" width="26" class="mr-1"></iconify-icon> ${message}`,
			background: isError ? 'gradient-error' : background,
			timeout: 3000,
			classes: 'border-1 !rounded-md'
		});
	}

	async function handleAction(action: ActionType) {
		if (isDisabled) {
			showToast(`Please select ${type}(s) to ${action}`, true);
			return;
		}

		if (action === 'edit' && isMultipleSelected) {
			showToast(`Please select only one ${type} to edit`, true);
			return;
		}

		const config = actionConfig[action];
		const isEdit = action === 'edit';

		const modalComponent = isEdit
			? ({
					ref: type === 'user' ? ModalEditForm : ModalEditToken,
					props:
						type === 'user'
							? {
									isGivenData: true,
									username: (selectedRows[0] as UserData).username,
									email: selectedRows[0].email,
									role: selectedRows[0].role,
									user_id: (selectedRows[0] as UserData)._id
								}
							: {
									token: (selectedRows[0] as TokenData).token,
									email: selectedRows[0].email,
									role: selectedRows[0].role,
									user_id: (selectedRows[0] as TokenData).user_id
								},
					slot: '<p>Edit Form</p>'
				} as ModalComponent)
			: undefined;

		const modalSettings: ModalSettings = {
			type: isEdit ? 'component' : 'confirm',
			title: config.modalTitle(),
			body: config.modalBody(),
			...(isEdit && { component: modalComponent }),
			response: async (r: ModalResponse | boolean) => {
				if (!r) return;

				try {
					const body =
						type === 'user'
							? JSON.stringify(
									isEdit
										? { user_id: (selectedRows[0] as UserData)._id, userData: r as ModalResponse }
										: { user_ids: selectedRows.map((row: UserData) => row._id) }
								)
							: JSON.stringify(
									isEdit
										? (r as ModalResponse) // Type assertion since r is ModalResponse for edit
										: selectedRows.map((row: TokenData) => ({
												token: row.token,
												email: row.email,
												role: row.role,
												user_id: row.user_id
											}))
								);

					const res = await fetch(config.endpoint(), {
						method: config.method(),
						headers: { 'Content-Type': 'application/json' },
						body
					});

					if (res.ok) {
						showToast(config.toastMessage(), false, config.toastBackground);
						await invalidateAll();
					} else {
						const data = await res.json();
						showToast(data.message || `Failed to ${action} ${type}`, true);
					}
				} catch (error) {
					console.error(`Error ${action}ing ${type}:`, error);
					showToast(`Failed to ${action} ${type}`, true);
				}
			}
		};

		modalStore.trigger(modalSettings);
	}

	let buttonConfig = $derived({
		class: `btn ${actionConfig[listboxValue].buttonClass} rounded-none w-48 justify-between w-full font-semibold uppercase hover:bg-primary-400`,
		icon: actionConfig[listboxValue].iconValue
	});
</script>

<!-- Multibutton group-->
<div class="btn-group relative rounded-md text-white" role="group" aria-label="{type} management actions">
	<!-- Action button  -->
	<button
		type="button"
		onclick={() => handleAction(listboxValue)}
		class={buttonConfig.class}
		aria-label={`${listboxValue} selected ${type}s`}
		disabled={isDisabled}
		aria-disabled={isDisabled}
	>
		<iconify-icon icon={buttonConfig.icon} width="20" class="mr-2 text-white" role="presentation" aria-hidden="true"></iconify-icon>
		<span>{listboxValue}</span>
	</button>

	<span class="border border-white" aria-hidden="true"></span>

	<!-- Dropdown button -->
	<button
		use:popup={Combobox}
		aria-label="Open actions menu"
		aria-haspopup="true"
		aria-expanded="false"
		class="divide-x-2 rounded-r-sm bg-surface-500 hover:!bg-surface-800"
		disabled={isDisabled}
		aria-disabled={isDisabled}
	>
		<iconify-icon icon="mdi:chevron-down" width="20" class="text-white" role="presentation" aria-hidden="true"></iconify-icon>
	</button>
</div>

<!-- Dropdown/Listbox -->
<div class="overflow-hiddens card z-10 w-48 rounded-sm bg-surface-500 text-white" data-popup="Combobox" role="menu" aria-label="Available actions">
	<ListBox rounded="rounded-sm" active="variant-filled-primary" hover="hover:bg-surface-300" class="divide-y">
		{#each Object.entries(actionConfig) as [action, config]}
			{#if action !== listboxValue}
				<ListBoxItem
					bind:group={listboxValue}
					name="medium"
					value={action}
					active="variant-filled-primary"
					hover="gradient-primary-hover"
					role="menuitem"
				>
					{#snippet lead()}
						<iconify-icon icon={config.iconValue} width="20" class="mr-1" role="presentation" aria-hidden="true"></iconify-icon>
					{/snippet}
					{action}
				</ListBoxItem>
			{/if}
		{/each}
	</ListBox>
</div>
