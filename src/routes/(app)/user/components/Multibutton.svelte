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

	// Stores
	import { storeListboxValue } from '@stores/store.svelte';

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
		blocked: boolean;
		expires: Date;
		createdAt: Date;
		updatedAt: Date;
		[key: string]: any;
	}

	type ActionType = 'edit' | 'delete' | 'block' | 'unblock';

	// Popup Combobox
	let listboxValue = $state<ActionType>('edit');
	let {
		selectedRows,
		type = 'user',
		totalUsers = 0,
		currentUser = null
	} = $props<{
		selectedRows: (UserData | TokenData)[];
		type: 'user' | 'token';
		totalUsers?: number;
		currentUser?: { _id: string; [key: string]: any } | null;
	}>();

	// Sync local listboxValue with global store for TableIcons
	$effect(() => {
		storeListboxValue.set(listboxValue);
	});

	// Derived values
	let isDisabled = $derived(selectedRows.length === 0);
	let isMultipleSelected = $derived(selectedRows.length > 1);

	// Check if delete should be disabled for users
	let isDeleteDisabled = $derived(
		type === 'user' &&
			listboxValue === 'delete' &&
			(totalUsers <= 1 ||
				(currentUser && selectedRows.length === 1 && (selectedRows[0] as UserData)._id === currentUser._id && totalUsers === 1) ||
				selectedRows.length >= totalUsers)
	);

	const modalStore = getModalStore();
	const toastStore = getToastStore();

	// Helper function to convert Date to expires format expected by ModalEditToken
	function convertDateToExpiresFormat(expiresDate: Date | string | null): string {
		if (!expiresDate) return '7d'; // Default

		const now = new Date();
		const expires = new Date(expiresDate);
		const diffMs = expires.getTime() - now.getTime();
		const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
		const diffDays = Math.ceil(diffHours / 24);

		// Match the available options in ModalEditToken
		if (diffHours <= 1) return '1h';
		if (diffDays <= 1) return '1d';
		if (diffDays <= 7) return '7d';
		if (diffDays <= 30) return '30d';
		if (diffDays <= 90) return '90d';

		return '90d'; // Max available option
	}

	const Combobox: PopupSettings = {
		event: 'click',
		target: 'Combobox',
		placement: 'bottom-end',
		closeQuery: '.listbox-item'
	};

	// Unified batch endpoints for consistent API design
	const actionConfig = {
		edit: {
			buttonClass: 'gradient-primary',
			hoverClass: 'gradient-primary-hover',
			iconValue: 'bi:pencil-fill',
			modalTitle: () => (type === 'user' ? m.adminarea_title() : m.multibuttontoken_modaltitle()),
			modalBody: () => (type === 'user' ? 'Modify your data and then press Save.' : m.multibuttontoken_modalbody()),
			endpoint: () => {
				if (type === 'user') {
					return '/api/user/updateUserAttributes';
				} else {
					const token = (selectedRows[0] as TokenData)?.token;
					if (!token) {
						throw new Error('No token selected for editing');
					}
					return `/api/token/${token}`;
				}
			},
			method: () => 'PUT',
			toastMessage: () => `${type === 'user' ? 'User' : 'Token'} Updated`,
			toastBackground: 'gradient-primary'
		},
		delete: {
			buttonClass: 'gradient-error',
			hoverClass: 'gradient-error-hover',
			iconValue: 'bi:trash3-fill',
			modalTitle: () => (type === 'user' ? m.usermodalconfirmtitle() : m.multibuttontoken_deletetitle()),
			modalBody: () => `Are you sure you want to delete ${selectedRows.length} ${type}(s)?`,
			endpoint: () => (type === 'user' ? '/api/user/batch' : '/api/token/batch'),
			method: () => 'POST',
			toastMessage: () => `${type === 'user' ? 'Users' : 'Tokens'} Deleted`,
			toastBackground: 'gradient-error'
		},
		block: {
			buttonClass: 'gradient-pink',
			hoverClass: 'gradient-yellow-hover',
			iconValue: 'material-symbols:lock',
			modalTitle: () => (type === 'user' ? 'Please Confirm User Block' : m.multibuttontoken_blocktitle()),
			modalBody: () => `Are you sure you want to block ${selectedRows.length} ${type}(s)?`,
			endpoint: () => (type === 'user' ? '/api/user/batch' : '/api/token/batch'),
			method: () => 'POST',
			toastMessage: () => `${type === 'user' ? 'Users' : 'Tokens'} Blocked`,
			toastBackground: 'gradient-yellow'
		},
		unblock: {
			buttonClass: 'gradient-yellow',
			hoverClass: 'gradient-primary-hover',
			iconValue: 'material-symbols:lock-open',
			modalTitle: () => (type === 'user' ? 'Please Confirm User Unblock' : m.multibuttontoken_unblocktitle()),
			modalBody: () => `Are you sure you want to unblock ${selectedRows.length} ${type}(s)?`,
			endpoint: () => (type === 'user' ? '/api/user/batch' : '/api/token/batch'),
			method: () => 'POST',
			toastMessage: () => `${type === 'user' ? 'Users' : 'Tokens'} Unblocked`,
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

		// Check if delete is disabled for users
		if (action === 'delete' && isDeleteDisabled) {
			showToast('Cannot delete the last user in the system', true);
			return;
		}

		if (action === 'edit' && isMultipleSelected) {
			showToast(`Please select only one ${type} to edit`, true);
			return;
		}

		// Additional validation for token editing
		if (action === 'edit' && type === 'token') {
			const tokenData = selectedRows[0] as TokenData;
			if (!tokenData?.token) {
				showToast('Invalid token data selected', true);
				return;
			}
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
									user_id: (selectedRows[0] as TokenData).user_id,
									expires: convertDateToExpiresFormat((selectedRows[0] as TokenData).expires)
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
					let body: string;

					if (isEdit) {
						// Handle edit operations (single item only)
						if (type === 'user') {
							body = JSON.stringify({
								user_id: (selectedRows[0] as UserData)._id,
								newUserData: r as ModalResponse
							});
						} else {
							// Token edit - use individual endpoint
							body = JSON.stringify({
								newTokenData: r as ModalResponse
							});
						}
					} else {
						// Handle batch operations (delete, block, unblock)
						if (type === 'user') {
							body = JSON.stringify({
								userIds: selectedRows.map((row: UserData | TokenData) => (row as UserData)._id),
								action: action
							});
						} else {
							// Token batch operations
							body = JSON.stringify({
								tokenIds: selectedRows.map((row: UserData | TokenData) => (row as TokenData).token),
								action: action
							});
						}
					}

					const endpoint = config.endpoint();
					const res = await fetch(endpoint, {
						method: config.method(),
						headers: { 'Content-Type': 'application/json' },
						body
					});

					if (!res.ok) {
						// Try to parse error response
						let errorMessage = `Failed to ${action} ${type}`;
						try {
							const errorData = await res.json();
							errorMessage = errorData.message || errorMessage;
						} catch {
							// If JSON parsing fails, use status text
							errorMessage = res.statusText || errorMessage;
						}
						throw new Error(errorMessage);
					}

					const data = await res.json();
					showToast(data.message || config.toastMessage(), false, config.toastBackground);
					await invalidateAll();
				} catch (error) {
					console.error(`Error during action '${action}' for type '${type}':`, error);
					const errorMessage = error instanceof Error ? error.message : `An unknown error occurred.`;
					showToast(errorMessage, true);
				}
			}
		};

		modalStore.trigger(modalSettings);
	}

	let buttonConfig = $derived({
		class: `btn ${actionConfig[listboxValue].buttonClass} rounded-none w-48 justify-between w-full font-semibold uppercase hover:bg-primary-400 ${isDeleteDisabled && listboxValue === 'delete' ? 'opacity-50 cursor-not-allowed' : ''}`,
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
		disabled={isDisabled || (listboxValue === 'delete' && isDeleteDisabled)}
		aria-disabled={isDisabled || (listboxValue === 'delete' && isDeleteDisabled)}
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
				<ListBoxItem bind:group={listboxValue} name="medium" value={action} active="variant-filled-primary" hover={config.hoverClass} role="menuitem">
					{#snippet lead()}
						<iconify-icon icon={config.iconValue} width="20" class="mr-1" role="presentation" aria-hidden="true"></iconify-icon>
					{/snippet}
					{action}
				</ListBoxItem>
			{/if}
		{/each}
	</ListBox>
</div>
