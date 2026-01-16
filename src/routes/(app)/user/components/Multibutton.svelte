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

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import { storeListboxValue } from '@stores/store.svelte';

	// Skeleton
	import { Menu } from '@skeletonlabs/skeleton-svelte';
	import { toaster } from '@stores/store.svelte';
	// Use modalState directly
	import { modalState, showConfirm } from '@utils/modalState.svelte';

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
	// Listbox value is single string in logic, wrapped in array for component
	let listboxValue = $state<ActionType>('edit');
	const { selectedRows, type = 'user', totalUsers = 0, currentUser = null, onTokenUpdate = () => {} } = $props();

	// Sync local listboxValue with global store for TableIcons
	$effect(() => {
		storeListboxValue.set(listboxValue);
	});

	// Normalize selection to a safe array
	const safeSelectedRows = $derived(Array.isArray(selectedRows) ? (selectedRows.filter(Boolean) as Array<User | Token>) : []);

	// Derived values
	const isDisabled = $derived(safeSelectedRows.length === 0);
	const isMultipleSelected = $derived(safeSelectedRows.length > 1);

	// Smart state detection for block/unblock actions
	const blockState = $derived(() => {
		if (safeSelectedRows.length === 0) return null;

		if (type === 'user') {
			const users = safeSelectedRows.filter(isUser);
			if (users.length === 0) return null;
			const blockedCount = users.filter((user: User) => user.blocked).length;
			const unblockedCount = users.filter((user: User) => !user.blocked).length;

			if (blockedCount === users.length) return 'all-blocked';
			if (unblockedCount === users.length) return 'all-unblocked';
			return 'mixed';
		} else {
			const tokens = safeSelectedRows.filter(isToken);
			if (tokens.length === 0) return null;
			const blockedCount = tokens.filter((token: Token) => token.blocked).length;
			const unblockedCount = tokens.filter((token: Token) => !token.blocked).length;

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
			toastBackground: 'preset-filled-success-500'
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
			toastBackground: 'preset-filled-success-500'
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
			toastBackground: 'preset-filled-success-500'
		}
	});

	async function executeBatchAction(action: ActionType, config: any) {
		try {
			let body: string;
			// Handle batch operations (delete, block, unblock)
			if (type === 'user') {
				body = JSON.stringify({
					userIds: safeSelectedRows.filter(isUser).map((row: User) => row._id),
					action: action
				});
			} else {
				// Token batch operations
				body = JSON.stringify({
					tokenIds: safeSelectedRows.filter(isToken).map((row: Token) => row.token),
					action: action
				});
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

			toaster.success({ description: toastMessage });

			// Dispatch token update event for parent component to handle local state updates
			if (type === 'token' && (action === 'block' || action === 'unblock' || action === 'delete')) {
				onTokenUpdate({
					tokenIds: safeSelectedRows.filter(isToken).map((row: Token) => row.token),
					action: action
				});
			}

			await invalidateAll();
		} catch (error) {
			logger.error(`Error during action '${action}' for type '${type}':`, error);
			const errorMessage = error instanceof Error ? error.message : `An unknown error occurred.`;
			toaster.error({ description: errorMessage });
		}
	}

	async function handleAction(action: ActionType) {
		if (isDisabled) {
			toaster.error({ description: `Please select ${type}(s) to ${action}` });
			return;
		}

		// Check if delete is disabled for users
		if (action === 'delete' && isDeleteDisabled) {
			toaster.error({ description: 'Cannot delete the last user in the system' });
			return;
		}

		if (action === 'edit' && isMultipleSelected) {
			toaster.error({ description: `Please select only one ${type} to edit` });
			return;
		}

		// Check if action is available (shouldn't happen with smart UI, but good safeguard)
		if (!availableActions.includes(action)) {
			const currentBlockState = blockState;
			if (currentBlockState() === 'all-blocked' && action === 'block') {
				toaster.warning({ description: 'All selected items are already blocked' });
				return;
			} else if (currentBlockState() === 'all-unblocked' && action === 'unblock') {
				toaster.warning({ description: 'All selected items are already unblocked' });
				return;
			}
		}

		// Additional validation for token editing
		if (action === 'edit' && type === 'token') {
			const tokenData = isToken(safeSelectedRows[0]) ? safeSelectedRows[0] : undefined;
			if (!tokenData?.token) {
				toaster.error({ description: 'Invalid token data selected' });
				return;
			}
		}

		const config = actionConfig[action];
		const isEdit = action === 'edit';

		if (isEdit) {
			// Component Dialog
			if (type === 'user') {
				modalState.trigger(ModalEditForm as any, {
					isGivenData: true,
					username: isUser(safeSelectedRows[0]) ? ((safeSelectedRows[0] as User).username ?? null) : null,
					email: safeSelectedRows[0].email,
					role: safeSelectedRows[0].role,
					user_id: (safeSelectedRows[0] as User)._id,
					title: config.modalTitle(),
					body: config.modalBody() // Pass body if ModalEditForm supports it
				});
			} else {
				modalState.trigger(ModalEditToken as any, {
					token: (safeSelectedRows[0] as Token).token,
					email: safeSelectedRows[0].email,
					role: safeSelectedRows[0].role,
					user_id: (safeSelectedRows[0] as Token).user_id,
					expires: convertDateToExpiresFormat((safeSelectedRows[0] as Token).expires),
					title: config.modalTitle(),
					body: config.modalBody(),
					onClose: (res: any) => {
						if (res && res.success) {
							onTokenUpdate();
						}
					}
				});
			}
		} else {
			// Confirm Dialog
			showConfirm({
				title: config.modalTitle(),
				body: config.modalBody(),
				onConfirm: async () => {
					await executeBatchAction(action, config);
					modalState.close();
				}
			});
		}
	}

	const buttonConfig = $derived({
		class: `btn bg-surface-500 hover:${actionConfig[listboxValue].buttonClass} rounded-none w-48 justify-between w-full font-semibold uppercase ${isDeleteDisabled && listboxValue === 'delete' ? 'opacity-50 cursor-not-allowed' : ''}`,
		icon: actionConfig[listboxValue].iconValue
	});
</script>

<!-- Multibutton group-->
<div class=" relative rounded-md text-white" role="group" aria-label="{type} management actions">
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
	<Menu>
		<Menu.Trigger>
			<button aria-label="Open actions menu" class="divide-x-2 rounded-r-sm bg-surface-500 hover:bg-surface-800!">
				<iconify-icon icon="mdi:chevron-down" width="20" class="text-white" role="presentation" aria-hidden="true"></iconify-icon>
			</button>
		</Menu.Trigger>
		<Menu.Content class="z-10 w-48 rounded-sm bg-surface-500 text-black divide-y">
			{#each filteredActions as action (action)}
				{@const actionKey = action as ActionType}
				{@const config = actionConfig[actionKey]}
				<Menu.Item
					value={action}
					class="w-full text-left px-4 py-2 hover:bg-surface-700 hover:text-white flex items-center cursor-pointer"
					onclick={() => handleAction(action as ActionType)}
				>
					<iconify-icon icon={config.iconValue} width="20" class="mr-1" role="presentation" aria-hidden="true"></iconify-icon>
					{action}
				</Menu.Item>
			{/each}
		</Menu.Content>
	</Menu>
</div>
