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
	// Using iconify-icon web component
	import { onMount, onDestroy } from 'svelte';
	import { scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { invalidateAll } from '$app/navigation';
	import { logger } from '@utils/logger';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import { storeListboxValue } from '@stores/store.svelte.ts';

	// Skeleton & Utils
	import { toaster } from '@stores/store.svelte.ts';
	import { modalState } from '@utils/modalState.svelte';
	import { showConfirm } from '@utils/modalUtils';

	import ModalEditForm from './ModalEditForm.svelte';
	import ModalEditToken from './ModalEditToken.svelte';
	import type { User, Token } from '@src/databases/auth/types';

	const isUser = (row: unknown): row is User => {
		return !!row && typeof row === 'object' && '_id' in row;
	};
	const isToken = (row: unknown): row is Token => {
		return !!row && typeof row === 'object' && 'token' in row;
	};

	type ActionType = 'edit' | 'delete' | 'block' | 'unblock';

	// Props
	let { selectedRows, type = 'user', totalUsers = 0, currentUser = null, onUpdate = () => {} } = $props();

	// State
	let listboxValue = $state<ActionType>('edit');
	let isDropdownOpen = $state(false);
	let hoveredAction = $state<ActionType | null>(null);
	let dropdownRef = $state<HTMLElement | null>(null);

	// Sync local listboxValue with global store for TableIcons
	$effect(() => {
		storeListboxValue.set(listboxValue);
	});

	// Handle click outside to close dropdown
	function handleClickOutside(event: MouseEvent) {
		if (isDropdownOpen && dropdownRef && !dropdownRef.contains(event.target as Node)) {
			isDropdownOpen = false;
		}
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
	});

	onDestroy(() => {
		document.removeEventListener('click', handleClickOutside);
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
	const availableActions = $derived.by<ActionType[]>(() => {
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

	// Actions to show in dropdown
	const filteredActions = $derived.by<ActionType[]>(() => {
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
	interface ActionConfigItem {
		buttonClass: string;
		hoverClass: string;
		iconValue: string;
		label: string;
		modalTitle: () => any;
		modalBody: () => any;
		endpoint: () => string;
		method: () => string;
		toastMessage: () => string;
		toastBackground: string;
	}

	const actionConfig = $derived<Record<ActionType, ActionConfigItem>>({
		edit: {
			buttonClass: 'gradient-primary',
			hoverClass: 'gradient-primary-hover',
			iconValue: 'bi:pencil-fill',
			label: 'Edit',
			modalTitle: () => (type === 'user' ? m.usermodaluser_edittitle() : m.multibuttontoken_modaltitle()),
			modalBody: () => (type === 'user' ? m.usermodaluser_editbody() : m.multibuttontoken_modalbody()),
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
			label: 'Delete',
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
			label: 'Block',
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
			label: 'Unblock',
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

			// Dispatch update event for parent component to handle local state updates
			if (action === 'block' || action === 'unblock' || action === 'delete') {
				const ids =
					type === 'user'
						? safeSelectedRows.filter(isUser).map((row: User) => row._id)
						: safeSelectedRows.filter(isToken).map((row: Token) => row.token);

				onUpdate({
					ids,
					action: action,
					type
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
				modalState.trigger(
					ModalEditToken as any,
					{
						token: (safeSelectedRows[0] as Token).token,
						email: safeSelectedRows[0].email,
						role: safeSelectedRows[0].role,
						user_id: (safeSelectedRows[0] as Token).user_id,
						expires: convertDateToExpiresFormat((safeSelectedRows[0] as Token).expires),
						title: config.modalTitle(),
						body: config.modalBody()
					},
					(res: any) => {
						if (res && res.success) {
							onUpdate({
								action: 'refresh',
								type: 'token',
								ids: []
							});
						}
					}
				);
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

	function toggleDropdown(e: MouseEvent) {
		e.stopPropagation();
		if (isDisabled) return;
		isDropdownOpen = !isDropdownOpen;
		if (isDropdownOpen) {
			// Focus first item next tick
			setTimeout(() => {
				const firstBtn = document.querySelector('[role="menu"] button') as HTMLElement;
				firstBtn?.focus();
			}, 0);
		}
	}

	function handleOptionClick(event: Event, action: ActionType) {
		event.preventDefault();
		event.stopPropagation();
		listboxValue = action;
		isDropdownOpen = false;
		handleAction(action);
	}

	function handleDropdownKeydown(event: KeyboardEvent) {
		if (!isDropdownOpen) return;

		const menuItems = document.querySelectorAll('[role="menu"] button');
		const currentIndex = Array.from(menuItems).indexOf(document.activeElement as HTMLElement);

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				const nextIndex = (currentIndex + 1) % menuItems.length;
				(menuItems[nextIndex] as HTMLElement).focus();
				break;
			case 'ArrowUp':
				event.preventDefault();
				const prevIndex = (currentIndex - 1 + menuItems.length) % menuItems.length;
				(menuItems[prevIndex] as HTMLElement).focus();
				break;
			case 'Escape':
				event.preventDefault();
				isDropdownOpen = false;
				(dropdownRef?.querySelector('[aria-haspopup="menu"]') as HTMLElement)?.focus();
				break;
			case 'Tab':
				isDropdownOpen = false;
				break;
		}
	}
</script>

<!-- Multi-button group -->
<div class="relative flex items-center" bind:this={dropdownRef}>
	<div
		class="group/main relative flex items-center shadow-xl overflow-visible transition-all duration-200 {!isDisabled
			? 'active:scale-95 cursor-pointer'
			: ''} rounded-l-full rounded-r-md border border-white/20 {isDropdownOpen ? 'ring-2 ring-primary-500/50' : ''}"
		role="group"
	>
		<!-- Main Action Button -->
		<button
			type="button"
			onclick={() => handleAction(listboxValue)}
			disabled={isDisabled || (listboxValue === 'delete' && isDeleteDisabled)}
			class="h-[40px] min-w-[120px] font-bold transition-all duration-200
				{!isDisabled ? 'active:scale-95' : 'pointer-events-none opacity-50 grayscale'} 
				{actionConfig[listboxValue].buttonClass} text-white
				rounded-l-full rounded-r-none px-6 flex items-center justify-center gap-2 border-r border-white/20"
			aria-label="{listboxValue} selected items"
		>
			<iconify-icon icon={actionConfig[listboxValue].iconValue} width="20"></iconify-icon>
			<span class="uppercase tracking-wider">{listboxValue}</span>
		</button>

		<!-- Dropdown Toggle -->
		<button
			type="button"
			onclick={toggleDropdown}
			disabled={isDisabled}
			class="h-[40px] w-[40px] transition-all duration-200 text-white flex items-center justify-center shadow-inner rounded-r-md
				{!isDisabled ? 'bg-surface-800 hover:bg-surface-700 active:scale-95 cursor-pointer' : 'bg-surface-800 opacity-50 pointer-events-none'}"
			aria-haspopup="menu"
			aria-expanded={isDropdownOpen}
			aria-label="Toggle actions menu"
		>
			<iconify-icon icon="mdi:chevron-down" width="24"></iconify-icon>
		</button>

		<!-- Dropdown Menu -->
		{#if isDropdownOpen}
			<div
				class="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl bg-surface-800 shadow-2xl ring-1 ring-black/20 backdrop-blur-md origin-top-right"
				role="menu"
				aria-label="Available actions"
				transition:scale={{ duration: 150, easing: quintOut, start: 0.95, opacity: 0 }}
				onkeydown={handleDropdownKeydown}
				tabindex="-1"
			>
				<ul class="flex flex-col py-1">
					{#each filteredActions as action}
						{@const config = actionConfig[action]}
						<li role="none">
							<button
								type="button"
								onclick={(e) => handleOptionClick(e, action)}
								onmouseenter={() => (hoveredAction = action)}
								onmouseleave={() => (hoveredAction = null)}
								onfocus={() => (hoveredAction = action)}
								onblur={() => (hoveredAction = null)}
								role="menuitem"
								class="group/item relative flex w-full items-center gap-3 px-4 py-3 text-left text-white transition-all duration-200 hover:bg-white/5"
							>
								<!-- Hover Gradient Indicator - Full Background -->
								<div class="absolute inset-0 {config.buttonClass} opacity-0 transition-opacity duration-200 group-hover/item:opacity-100"></div>

								<!-- Icon -->
								<div
									class="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface-700/50 transition-transform group-hover/item:scale-110"
								>
									<iconify-icon icon={config.iconValue} width="16"></iconify-icon>
								</div>

								<!-- Label -->
								<div class="relative z-10 flex-1">
									<div class="font-semibold capitalize">{action}</div>
								</div>

								<!-- Check Indicator or Chevron -->
								{#if hoveredAction === action}
									<iconify-icon icon="mdi:chevron-right" width="18" class="relative z-10 text-white"></iconify-icon>
								{:else if listboxValue === action}
									<iconify-icon icon="mdi:check" width="18" class="relative z-10 text-primary-500"></iconify-icon>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
</div>
