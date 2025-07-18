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
	import { createEventDispatcher } from 'svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import { storeListboxValue } from '@stores/store.svelte';

	// Skeleton
	import type { ModalComponent, ModalSettings, PopupSettings } from '@skeletonlabs/skeleton';
	import { getModalStore, getToastStore, ListBox, ListBoxItem, popup } from '@skeletonlabs/skeleton';
	import ModalEditForm from './ModalEditForm.svelte';
	import ModalEditToken from './ModalEditToken.svelte';

	interface UserData {
		_id: string;
		username: string;
		email: string;
		role: string;
		blocked: boolean;
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

	// Smart state detection for block/unblock actions
	let blockState = $derived(() => {
		if (selectedRows.length === 0) return null;

		if (type === 'user') {
			const users = selectedRows as UserData[];
			const blockedCount = users.filter((user) => user.blocked).length;
			const unblockedCount = users.filter((user) => !user.blocked).length;

			if (blockedCount === users.length) return 'all-blocked';
			if (unblockedCount === users.length) return 'all-unblocked';
			return 'mixed';
		} else {
			const tokens = selectedRows as TokenData[];
			const blockedCount = tokens.filter((token) => token.blocked).length;
			const unblockedCount = tokens.filter((token) => !token.blocked).length;

			if (blockedCount === tokens.length) return 'all-blocked';
			if (unblockedCount === tokens.length) return 'all-unblocked';
			return 'mixed';
		}
	});

	// Available actions based on current state
	let availableActions = $derived(() => {
		const baseActions: ActionType[] = ['edit', 'delete'];
		const currentBlockState = blockState();

		if (currentBlockState === 'all-blocked') {
			return [...baseActions, 'unblock'];
		} else if (currentBlockState === 'all-unblocked') {
			return [...baseActions, 'block'];
		} else if (currentBlockState === 'mixed') {
			return [...baseActions, 'block', 'unblock'];
		}

		return baseActions;
	});

	// Auto-adjust listboxValue when selection changes
	$effect(() => {
		if (selectedRows.length > 0 && !availableActions().includes(listboxValue)) {
			const currentBlockState = blockState();
			// If current action is not available, switch to the most appropriate one
			if (currentBlockState === 'all-blocked' && listboxValue === 'block') {
				listboxValue = 'unblock';
			} else if (currentBlockState === 'all-unblocked' && listboxValue === 'unblock') {
				listboxValue = 'block';
			} else if (!availableActions().includes(listboxValue)) {
				listboxValue = 'edit'; // Default fallback
			}
		}
	});

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
	const dispatch = createEventDispatcher();

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
			modalTitle: () => {
				if (type === 'user') {
					return `Please Confirm User <span class="text-error-500 font-bold">Deletion</span>`;
				}
				return `Please Confirm Token <span class="text-error-500 font-bold">Deletion</span>`;
			},
			modalBody: () => {
				if (type === 'user') {
					if (selectedRows.length === 1) {
						const user = selectedRows[0] as UserData;
						return `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> user <span class="text-tertiary-500 font-medium">${user.email}</span>? This action cannot be undone and will permanently remove the user from the system.`;
					} else {
						return `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> <span class="text-tertiary-500 font-medium">${selectedRows.length} users</span>? This action cannot be undone and will permanently remove all selected users from the system.`;
					}
				} else {
					if (selectedRows.length === 1) {
						const token = selectedRows[0] as TokenData;
						return `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> token for <span class="text-tertiary-500 font-medium">${token.email}</span>? This action cannot be undone and will permanently remove the token from the system.`;
					} else {
						return `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> <span class="text-tertiary-500 font-medium">${selectedRows.length} tokens</span>? This action cannot be undone and will permanently remove all selected tokens from the system.`;
					}
				}
			},
			endpoint: () => (type === 'user' ? '/api/user/batch' : '/api/token/batch'),
			method: () => 'POST',
			toastMessage: () => `${type === 'user' ? 'Users' : 'Tokens'} Deleted`,
			toastBackground: 'variant-filled-success'
		},
		block: {
			buttonClass: 'gradient-pink',
			hoverClass: 'gradient-yellow-hover',
			iconValue: 'material-symbols:lock',
			modalTitle: () => {
				if (type === 'user') {
					return `Please Confirm User <span class="text-error-500 font-bold">Block</span>`;
				}
				return `Please Confirm Token <span class="text-error-500 font-bold">Block</span>`;
			},
			modalBody: () => {
				if (type === 'user') {
					if (selectedRows.length === 1) {
						const user = selectedRows[0] as UserData;
						return `Are you sure you want to <span class="text-error-500 font-semibold">block</span> user <span class="text-tertiary-500 font-medium">${user.email}</span>? This will prevent them from accessing the system.`;
					} else {
						return `Are you sure you want to <span class="text-error-500 font-semibold">block</span> <span class="text-tertiary-500 font-medium">${selectedRows.length} users</span>? This will prevent them from accessing the system.`;
					}
				} else {
					// Token blocking with enhanced styling
					if (selectedRows.length === 1) {
						const token = selectedRows[0] as TokenData;
						return `Are you sure you want to <span class="text-error-500 font-semibold">block</span> token for <span class="text-tertiary-500 font-medium">${token.email}</span>? This will prevent the token from being used.`;
					} else {
						return `Are you sure you want to <span class="text-error-500 font-semibold">block</span> <span class="text-tertiary-500 font-medium">${selectedRows.length} tokens</span>? This will prevent them from being used.`;
					}
				}
			},
			endpoint: () => (type === 'user' ? '/api/user/batch' : '/api/token/batch'),
			method: () => 'POST',
			toastMessage: () => `${type === 'user' ? 'Users' : 'Tokens'} Blocked`,
			toastBackground: 'variant-filled-success'
		},
		unblock: {
			buttonClass: 'gradient-yellow',
			hoverClass: 'gradient-primary-hover',
			iconValue: 'material-symbols:lock-open',
			modalTitle: () => {
				if (type === 'user') {
					return `Please Confirm User <span class="text-success-500 font-bold">Unblock</span>`;
				}
				return `Please Confirm Token <span class="text-success-500 font-bold">Unblock</span>`;
			},
			modalBody: () => {
				if (type === 'user') {
					if (selectedRows.length === 1) {
						const user = selectedRows[0] as UserData;
						return `Are you sure you want to <span class="text-success-500 font-semibold">unblock</span> user <span class="text-tertiary-500 font-medium">${user.email}</span>? This will allow them to access the system again.`;
					} else {
						return `Are you sure you want to <span class="text-success-500 font-semibold">unblock</span> <span class="text-tertiary-500 font-medium">${selectedRows.length} users</span>? This will allow them to access the system again.`;
					}
				} else {
					// Token unblocking with enhanced styling
					if (selectedRows.length === 1) {
						const token = selectedRows[0] as TokenData;
						return `Are you sure you want to <span class="text-success-500 font-semibold">unblock</span> token for <span class="text-tertiary-500 font-medium">${token.email}</span>? This will allow the token to be used again.`;
					} else {
						return `Are you sure you want to <span class="text-success-500 font-semibold">unblock</span> <span class="text-tertiary-500 font-medium">${selectedRows.length} tokens</span>? This will allow them to be used again.`;
					}
				}
			},
			endpoint: () => (type === 'user' ? '/api/user/batch' : '/api/token/batch'),
			method: () => 'POST',
			toastMessage: () => `${type === 'user' ? 'Users' : 'Tokens'} Unblocked`,
			toastBackground: 'variant-filled-success'
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

		// Check if action is available (shouldn't happen with smart UI, but good safeguard)
		if (!availableActions().includes(action)) {
			const currentBlockState = blockState();
			if (currentBlockState === 'all-blocked' && action === 'block') {
				showToast('All selected items are already blocked', true);
				return;
			} else if (currentBlockState === 'all-unblocked' && action === 'unblock') {
				showToast('All selected items are already unblocked', true);
				return;
			}
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
			buttonTextConfirm: isEdit ? 'Save' : action.toUpperCase(),
			buttonTextCancel: 'Cancel',
			// Custom button styling based on action
			...(action === 'delete' && {
				buttonTextConfirm: 'Delete',
				meta: { buttonConfirmClasses: 'bg-error-500 hover:bg-error-600 text-white' }
			}),
			...(action === 'block' && {
				buttonTextConfirm: 'Block',
				meta: { buttonConfirmClasses: 'bg-pink-500 hover:bg-pink-600 text-white' }
			}),
			...(action === 'unblock' && {
				buttonTextConfirm: 'Unblock',
				meta: { buttonConfirmClasses: 'variant-filled-warning' }
			}),
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

					// Generate smart toast message based on what actually changed
					let toastMessage = data.message || config.toastMessage();

					if (isEdit && type === 'user' && r && typeof r === 'object' && '_changes' in r) {
						const changes = (r as any)._changes as string[];
						if (changes && changes.length > 0) {
							const changeDescriptions = changes.map((change) => {
								if (change === 'username') return 'username updated';
								if (change === 'password') return 'password updated';
								if (change.startsWith('role (')) return change.replace('role (', 'role changed from ').replace(')', '');
								return change;
							});

							if (changeDescriptions.length === 1) {
								toastMessage = `User ${changeDescriptions[0]}.`;
							} else if (changeDescriptions.length === 2) {
								toastMessage = `User ${changeDescriptions[0]} and ${changeDescriptions[1]}.`;
							} else {
								toastMessage = `User updated: ${changeDescriptions.join(', ')}.`;
							}
						}
					}

					showToast(toastMessage, false, config.toastBackground);

					// Dispatch token update event for parent component to handle local state updates
					if (type === 'token' && (action === 'block' || action === 'unblock')) {
						dispatch('tokenUpdate', {
							tokenIds: selectedRows.map((row: UserData | TokenData) => (row as TokenData).token),
							action: action
						});
					}

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
		{#each availableActions().filter((action) => action !== listboxValue) as action}
			{@const actionKey = action as ActionType}
			<ListBoxItem
				bind:group={listboxValue}
				name="medium"
				value={action}
				active="variant-filled-primary"
				hover={actionConfig[actionKey].hoverClass}
				role="menuitem"
			>
				{#snippet lead()}
					<iconify-icon icon={actionConfig[actionKey].iconValue} width="20" class="mr-1" role="presentation" aria-hidden="true"></iconify-icon>
				{/snippet}
				{action}
			</ListBoxItem>
		{/each}
	</ListBox>
</div>
