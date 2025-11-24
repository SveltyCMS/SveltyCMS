<!-- 
@files src/components/user/Multibutton.svelte
@component
**A unified multibutton component for managing users and tokens**

Manages actions (edit, delete, block, unblock) with debounced submissions.

@Example
<Multibutton bind:selectedRows={selectedRows} type="user" />

#### Props
- `selectedRows` {array} - Array of selected rows (User | Token)
- `type` {"user" | "token"} - Type of data to manage (default: 'user')
-->

<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { logger } from '@utils/logger';
	import { createEventDispatcher } from 'svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import { storeListboxValue } from '@stores/store.svelte';

	// Skeleton
	import type { ModalComponent, ModalSettings, PopupSettings } from '@skeletonlabs/skeleton-svelte';
	import { ListBox, ListBoxItem, popup } from '@skeletonlabs/skeleton-svelte';
	import { showModal } from '@utils/modalUtils';
	import { showToast } from '@utils/toast';
	import ModalEditForm from './ModalEditForm.svelte';
	import ModalEditToken from './ModalEditToken.svelte';
	import type { User, Token } from '@src/databases/auth/types';

	const isUser = (row: unknown): row is User => {
		if (!row || typeof row !== 'object') return false;
		return '_id' in row && !('token' in row);
	};
	const isToken = (row: unknown): row is Token => {
		if (!row || typeof row !== 'object') return false;
		return 'token' in row;
	};

	type ActionType = 'edit' | 'delete' | 'block' | 'unblock';

	// Popup Combobox
	let listboxValue = $state<ActionType>('edit');
	const {
		selectedRows,
		type = 'user',
		totalUsers = 0,
		currentUser = null
	} = $props<{
		selectedRows: (User | Token)[];
		type: 'user' | 'token';
		totalUsers?: number;
		currentUser?: { _id: string; [key: string]: unknown } | null;
	}>();

	// Sync local listboxValue with global store for TableIcons
	$effect(() => {
		storeListboxValue.set(listboxValue);
	});

	// Normalize selection to a safe array
	const safeSelectedRows = $derived<Array<User | Token>>(Array.isArray(selectedRows) ? (selectedRows.filter(Boolean) as Array<User | Token>) : []);

	// Derived values
	const isDisabled = $derived(safeSelectedRows.length === 0);
	const isMultipleSelected = $derived(safeSelectedRows.length > 1);

	// Smart state detection for block/unblock actions
	const blockState = $derived(() => {
		if (safeSelectedRows.length === 0) return null;

		if (type === 'user') {
			const users = safeSelectedRows.filter(isUser);
			if (users.length === 0) return null;
			const blockedCount = users.filter((user) => user.blocked).length;
			const unblockedCount = users.filter((user) => !user.blocked).length;

			if (blockedCount === users.length) return 'all-blocked';
			if (unblockedCount === users.length) return 'all-unblocked';
			return 'mixed';
		} else {
			const tokens = safeSelectedRows.filter(isToken);
			if (tokens.length === 0) return null;
			const blockedCount = tokens.filter((token) => token.blocked).length;
			const unblockedCount = tokens.filter((token) => !token.blocked).length;

			if (blockedCount === tokens.length) return 'all-blocked';
			if (unblockedCount === tokens.length) return 'all-unblocked';
			return 'mixed';
		}
	});

	// Available actions based on current state
	const availableActions = $derived.by(() => {
		const baseActions: ActionType[] = ['edit', 'delete'];
		const currentBlockState = blockState;

		if (currentBlockState() === 'all-blocked') {
			return [...baseActions, 'unblock'];
		} else if (currentBlockState() === 'all-unblocked') {
			return [...baseActions, 'block'];
		} else if (currentBlockState() === 'mixed') {
			return [...baseActions, 'block', 'unblock'];
		}

		return baseActions;
	});

	// Always provide an array for the template to iterate over
	const filteredActions = $derived.by(() => {
		const actions = Array.isArray(availableActions) ? availableActions : [];
		return actions.filter((action) => action !== listboxValue);
	});

	// Auto-adjust listboxValue when selection changes
	$effect(() => {
		if (safeSelectedRows.length > 0 && !availableActions.includes(listboxValue)) {
			const currentBlockState = blockState;
			// If current action is not available, switch to the most appropriate one
			if (currentBlockState() === 'all-blocked' && listboxValue === 'block') {
				listboxValue = 'unblock';
			} else if (currentBlockState() === 'all-unblocked' && listboxValue === 'unblock') {
				listboxValue = 'block';
			} else if (!availableActions.includes(listboxValue)) {
				listboxValue = 'edit'; // Default fallback
			}
		}
	});

	// Check if delete should be disabled for users
	const isDeleteDisabled = $derived(
		type === 'user' &&
			listboxValue === 'delete' &&
			(totalUsers <= 1 ||
				(currentUser &&
					safeSelectedRows.length === 1 &&
					isUser(safeSelectedRows[0]) &&
					(safeSelectedRows[0] as User)._id === currentUser._id &&
					totalUsers === 1) ||
				safeSelectedRows.length >= totalUsers)
	);

	// Use showToast for notifications
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
	const actionConfig = $derived({
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
					const firstRow = safeSelectedRows[0];
					if (isToken(firstRow)) {
						return `/api/token/${firstRow.token}`;
					}
					throw new Error('No token selected for editing');
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
					if (safeSelectedRows.length === 1) {
						const user = safeSelectedRows[0];
						if (isUser(user)) {
							return `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> user <span class="text-tertiary-500 font-medium">${user.email}</span>? This action cannot be undone and will permanently remove the user from the system.`;
						}
						return '';
					} else {
						return `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> <span class="text-tertiary-500 font-medium">${safeSelectedRows.length} users</span>? This action cannot be undone and will permanently remove all selected users from the system.`;
					}
				} else {
					if (safeSelectedRows.length === 1) {
						const token = safeSelectedRows[0];
						if (isToken(token)) {
							return `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> token for <span class="text-tertiary-500 font-medium">${token.email}</span>? This action cannot be undone and will permanently remove the token from the system.`;
						}
						return '';
					} else {
						return `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> <span class="text-tertiary-500 font-medium">${safeSelectedRows.length} tokens</span>? This action cannot be undone and will permanently remove all selected tokens from the system.`;
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
					if (safeSelectedRows.length === 1) {
						const user = safeSelectedRows[0];
						if (isUser(user)) {
							return `Are you sure you want to <span class="text-error-500 font-semibold">block</span> user <span class="text-tertiary-500 font-medium">${user.email}</span>? This will prevent them from accessing the system.`;
						}
						return '';
					} else {
						return `Are you sure you want to <span class="text-error-500 font-semibold">block</span> <span class="text-tertiary-500 font-medium">${safeSelectedRows.length} users</span>? This will prevent them from accessing the system.`;
					}
				} else {
					// Token blocking with enhanced styling
					if (safeSelectedRows.length === 1) {
						const token = safeSelectedRows[0];
						if (isToken(token)) {
							return `Are you sure you want to <span class="text-error-500 font-semibold">block</span> token for <span class="text-tertiary-500 font-medium">${token.email}</span>? This will prevent the token from being used.`;
						}
						return '';
					} else {
						return `Are you sure you want to <span class="text-error-500 font-semibold">block</span> <span class="text-tertiary-500 font-medium">${safeSelectedRows.length} tokens</span>? This will prevent them from being used.`;
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
					if (safeSelectedRows.length === 1) {
						const user = safeSelectedRows[0];
						if (isUser(user)) {
							return `Are you sure you want to <span class="text-success-500 font-semibold">unblock</span> user <span class="text-tertiary-500 font-medium">${user.email}</span>? This will allow them to access the system again.`;
						}
						return '';
					} else {
						return `Are you sure you want to <span class="text-success-500 font-semibold">unblock</span> <span class="text-tertiary-500 font-medium">${safeSelectedRows.length} users</span>? This will allow them to access the system again.`;
					}
				} else {
					// Token unblocking with enhanced styling
					if (safeSelectedRows.length === 1) {
						const token = safeSelectedRows[0];
						if (isToken(token)) {
							return `Are you sure you want to <span class="text-success-500 font-semibold">unblock</span> token for <span class="text-tertiary-500 font-medium">${token.email}</span>? This will allow the token to be used again.`;
						}
						return '';
					} else {
						return `Are you sure you want to <span class="text-success-500 font-semibold">unblock</span> <span class="text-tertiary-500 font-medium">${safeSelectedRows.length} tokens</span>? This will allow them to be used again.`;
					}
				}
			},
			endpoint: () => (type === 'user' ? '/api/user/batch' : '/api/token/batch'),
			method: () => 'POST',
			toastMessage: () => `${type === 'user' ? 'Users' : 'Tokens'} Unblocked`,
			toastBackground: 'variant-filled-success'
		}
	});

	interface ModalResponse {
		username?: string;
		email?: string;
		role?: string;
		token?: string;
		user_id?: string;
		_changes?: string[];
	}

	async function handleAction(action: ActionType) {
		if (isDisabled) {
			showToast(`Please select ${type}(s) to ${action}`, 'error');
			return;
		}

		// Check if delete is disabled for users
		if (action === 'delete' && isDeleteDisabled) {
			showToast('Cannot delete the last user in the system', 'error');
			return;
		}

		if (action === 'edit' && isMultipleSelected) {
			showToast(`Please select only one ${type} to edit`, 'error');
			return;
		}

		// Check if action is available (shouldn't happen with smart UI, but good safeguard)
		if (!availableActions.includes(action)) {
			const currentBlockState = blockState;
			if (currentBlockState() === 'all-blocked' && action === 'block') {
				showToast('All selected items are already blocked', 'warning');
				return;
			} else if (currentBlockState() === 'all-unblocked' && action === 'unblock') {
				showToast('All selected items are already unblocked', 'warning');
				return;
			}
		}

		// Additional validation for token editing
		if (action === 'edit' && type === 'token') {
			const tokenData = isToken(safeSelectedRows[0]) ? safeSelectedRows[0] : undefined;
			if (!tokenData?.token) {
				showToast('Invalid token data selected', 'error');
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
									username: isUser(safeSelectedRows[0]) ? ((safeSelectedRows[0] as User).username ?? null) : null,
									email: safeSelectedRows[0].email,
									role: safeSelectedRows[0].role,
									user_id: (safeSelectedRows[0] as User)._id
								}
							: {
									token: (safeSelectedRows[0] as Token).token,
									email: safeSelectedRows[0].email,
									role: safeSelectedRows[0].role,
									user_id: (safeSelectedRows[0] as Token).user_id,
									expires: convertDateToExpiresFormat((safeSelectedRows[0] as Token).expires)
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
								user_id: (safeSelectedRows[0] as User)._id,
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
								userIds: safeSelectedRows.filter(isUser).map((row) => row._id),
								action: action
							});
						} else {
							// Token batch operations
							body = JSON.stringify({
								tokenIds: safeSelectedRows.filter(isToken).map((row) => row.token),
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
						const changes = (r as ModalResponse)._changes;
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

					showToast(toastMessage, 'success');

					// Dispatch token update event for parent component to handle local state updates
					if (type === 'token' && (action === 'block' || action === 'unblock' || action === 'delete')) {
						dispatch('tokenUpdate', {
							tokenIds: safeSelectedRows.filter(isToken).map((row) => row.token),
							action: action
						});
					}

					await invalidateAll();
				} catch (error) {
					logger.error(`Error during action '${action}' for type '${type}':`, error);
					const errorMessage = error instanceof Error ? error.message : `An unknown error occurred.`;
					showToast(errorMessage, 'error');
				}
			}
		};

		showModal(modalSettings);
	}

	const buttonConfig = $derived({
		class: `btn bg-surface-500 hover:${actionConfig[listboxValue].buttonClass} rounded-none w-48 justify-between w-full font-semibold uppercase ${isDeleteDisabled && listboxValue === 'delete' ? 'opacity-50 cursor-not-allowed' : ''}`,
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
	>
		<iconify-icon icon="mdi:chevron-down" width="20" class="text-white" role="presentation" aria-hidden="true"></iconify-icon>
	</button>
</div>

<!-- Dropdown/Listbox -->
<div class="overflow-hiddens card z-10 w-48 rounded-sm bg-surface-500 text-white" data-popup="Combobox" role="menu" aria-label="Available actions">
	<ListBox rounded="rounded-sm" active="variant-filled-primary" hover="hover:bg-surface-700" class="divide-y">
		{#each filteredActions as action (action)}
			{@const actionKey = action as ActionType}
			{@const config = actionConfig[actionKey]}
			<ListBoxItem
				bind:group={listboxValue}
				name="medium"
				value={action}
				active="variant-filled-primary"
				hover="hover:bg-surface-700"
				role="menuitem"
			>
				{#snippet lead()}
					<iconify-icon icon={config.iconValue} width="20" class="mr-1" role="presentation" aria-hidden="true"></iconify-icon>
				{/snippet}
				{action}
			</ListBoxItem>
		{/each}
	</ListBox>
</div>
