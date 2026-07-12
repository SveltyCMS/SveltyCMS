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
	import type { Token, User } from '@src/databases/auth/types';
	// ParaglideJS
	import {
		multibuttontoken_modalbody,
		multibuttontoken_modaltitle,
		usermodaluser_editbody,
		usermodaluser_edittitle
	} from '@src/paraglide/messages';
	// Stores
	import { app } from '@src/stores/store.svelte.ts';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { modalState } from '@utils/modal.svelte';
	import { showConfirm } from '@utils/modal.svelte';
	// Svelte core
	import { onDestroy, onMount, untrack, tick } from 'svelte';
	import { quintOut } from 'svelte/easing';
	import { scale } from 'svelte/transition';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import ModalEditForm from './modal-edit-form.svelte';
	import ModalEditToken from './modal-edit-token.svelte';

	// 🛡️ REFINED TYPE GUARDS: Prevent collisions between User and Token
	const isUser = (row: any): row is User => {
		return !!row && typeof row === 'object' && '_id' in row && ('username' in row || 'role' in row) && !('token' in row);
	};
	const isToken = (row: any): row is Token => {
		return !!row && typeof row === 'object' && 'token' in row;
	};

	type ActionType = 'edit' | 'delete' | 'block' | 'unblock';

	// Props
	let { selectedRows, type = 'user', totalUsers = 0, currentUser = null, onUpdate = () => {} } = $props();

	// State
	let listboxValue = $state<ActionType>('edit');
	let isDropdownOpen = $state(false);
	let dropdownRef = $state<HTMLElement | null>(null);

	// Sync local listboxValue with global store for TableIcons
	$effect(() => {
		app.listboxValueState = listboxValue;
	});

	// Helper to get identifier for display
	const getDisplayIdentifier = (row: any) => isUser(row) ? row.username : (row as Token).email;

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

	// Smart state detection for block/unblock actions
	const currentBlockState = $derived.by(() => {
		if (safeSelectedRows.length === 0) return null;

		const items = type === 'user' ? safeSelectedRows.filter(isUser) : safeSelectedRows.filter(isToken);
		if (items.length === 0) return null;

		const blockedCount = items.filter((i) => i.blocked).length;
		const unblockedCount = items.filter((i) => !i.blocked).length;

		if (blockedCount === items.length) return 'all-blocked';
		if (unblockedCount === items.length) return 'all-unblocked';
		return 'mixed';
	});

	// Check if a specific action should be disabled for the current selection
	const disabledMap = $derived.by(() => {
		const map: Record<ActionType, boolean> = { edit: false, delete: false, block: false, unblock: false };
		if (safeSelectedRows.length === 0) return { edit: true, delete: true, block: true, unblock: true };

		// 1. Edit: only one row allowed
		map.edit = safeSelectedRows.length !== 1;

		// 2. Delete: depend on selection and total counts
		if (type === 'user') {
			const isSelfSelected = safeSelectedRows.some((r) => isUser(r) && currentUser && r._id === currentUser._id);
			const isLastUser = totalUsers <= 1 || (isSelfSelected && safeSelectedRows.length >= totalUsers);

			// System protection: admins cannot be blocked or deleted via UI (safety first)
			const adminsSelected = safeSelectedRows.some((r) => isUser(r) && (r.role === 'admin' || r.isAdmin));

			map.delete = isLastUser || adminsSelected;

			// Disable block/unblock for admins as well
			if (adminsSelected) {
				map.block = true;
				map.unblock = true;
			}
		}

		// 3. Block/Unblock: depend on current state
		if (map.block === false) {
			map.block = currentBlockState === 'all-blocked';
		}
		if (map.unblock === false) {
			map.unblock = currentBlockState === 'all-unblocked';
		}

		return map;
	});

	// Available actions to show in the UI
	const availableActions: ActionType[] = ['edit', 'delete', 'block', 'unblock'];

	// Actions to show in dropdown
	const filteredActions = $derived.by<ActionType[]>(() => {
		return availableActions.filter((action) => action !== listboxValue);
	});

	// Auto-adjust listboxValue when selection changes to keep it on an enabled action if possible
	$effect(() => {
		if (safeSelectedRows.length > 0 && disabledMap[listboxValue]) {
			untrack(() => {
				// Try to switch to an available action
				if (!disabledMap.edit) listboxValue = 'edit';
				else if (!disabledMap.delete) listboxValue = 'delete';
				else if (!disabledMap.block) listboxValue = 'block';
				else if (!disabledMap.unblock) listboxValue = 'unblock';
			});
		}
	});

	// Helper function to convert Date to expires format expected by ModalEditToken
	function convertDateToExpiresFormat(expiresDate: Date | string | null): string {
		if (!expiresDate) return '2 days';
		const now = new Date();
		const expires = new Date(expiresDate);
		const diffMs = expires.getTime() - now.getTime();
		const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
		const diffDays = Math.ceil(diffHours / 24);

		if (diffHours <= 2) return '2 hrs';
		if (diffHours <= 12) return '12 hrs';
		if (diffDays <= 2) return '2 days';
		if (diffDays <= 7) return '1 week';
		if (diffDays <= 14) return '2 weeks';
		return '1 month';
	}

	// Action Configurations
	interface ActionConfigItem {
		buttonClass: string;
		endpoint: () => string;
		iconValue: string;
		label: string;
		method: () => string;
		modalBody: () => any;
		modalTitle: () => any;
		toastBackground: string;
		toastMessage: () => string;
	}

	const actionConfig = $derived<Record<ActionType, ActionConfigItem>>({
		edit: {
			buttonClass: 'gradient-primary',
			iconValue: 'bi:pencil-fill',
			label: 'Edit',
			modalTitle: () => (type === 'user' ? usermodaluser_edittitle() : multibuttontoken_modaltitle()),
			modalBody: () => (type === 'user' ? usermodaluser_editbody() : multibuttontoken_modalbody()),
			endpoint: () => (type === 'user' ? '/api/user/update-user-attributes' : `/api/token/${(safeSelectedRows[0] as Token).token}`),
			method: () => 'PUT',
			toastMessage: () => `${type === 'user' ? 'User' : 'Token'} Updated`,
			toastBackground: 'gradient-primary'
		},
		delete: {
			buttonClass: 'gradient-error',
			iconValue: 'bi:trash3-fill',
			label: 'Delete',
			modalTitle: () => `Confirm ${type === 'user' ? 'User' : 'Token'} Deletion`,
			modalBody: () => {
				if (safeSelectedRows.length === 1) {
					const row = safeSelectedRows[0];
					const identifier = getDisplayIdentifier(row);
					return `Are you sure you want to delete ${type} <strong>${identifier}</strong>? This action is permanent.`;
				}
				return `Are you sure you want to delete <strong>${safeSelectedRows.length} ${type}s</strong>? This action is permanent.`;
			},
			endpoint: () => (type === 'user' ? '/api/user/batch' : '/api/token/batch'),
			method: () => 'POST',
			toastMessage: () => `${type === 'user' ? 'Users' : 'Tokens'} Deleted`,
			toastBackground: 'preset-filled-success-500'
		},
		block: {
			buttonClass: 'gradient-pink',
			iconValue: 'material-symbols:lock',
			label: 'Block',
			modalTitle: () => `Confirm ${type === 'user' ? 'User' : 'Token'} Block`,
			modalBody: () => {
				if (safeSelectedRows.length === 1) {
					const identifier = getDisplayIdentifier(safeSelectedRows[0]);
					return `Are you sure you want to block the ${type} <span class="text-error-500 font-bold">${identifier}</span>? They will lose access immediately.`;
				}
				return `Are you sure you want to block <span class="text-error-500 font-bold">${safeSelectedRows.length}</span> selected ${type}(s)? They will lose access immediately.`;
			},
			endpoint: () => (type === 'user' ? '/api/user/batch' : '/api/token/batch'),
			method: () => 'POST',
			toastMessage: () => `${type === 'user' ? 'Users' : 'Tokens'} Blocked`,
			toastBackground: 'preset-filled-success-500'
		},
		unblock: {
			buttonClass: 'gradient-yellow',
			iconValue: 'material-symbols:lock-open',
			label: 'Unblock',
			modalTitle: () => `Confirm ${type === 'user' ? 'User' : 'Token'} Unblock`,
			modalBody: () => {
				if (safeSelectedRows.length === 1) {
					const identifier = getDisplayIdentifier(safeSelectedRows[0]);
					return `Are you sure you want to unblock the ${type} <span class="text-success-500 font-bold">${identifier}</span>? This will restore their access.`;
				}
				return `Are you sure you want to unblock <span class="text-success-500 font-bold">${safeSelectedRows.length}</span> selected ${type}(s)? This will restore their access.`;
			},
			endpoint: () => (type === 'user' ? '/api/user/batch' : '/api/token/batch'),
			method: () => 'POST',
			toastMessage: () => `${type === 'user' ? 'Users' : 'Tokens'} Unblocked`,
			toastBackground: 'preset-filled-success-500'
		}
	});

	async function executeBatchAction(action: ActionType, config: ActionConfigItem) {
		try {
			const body =
				type === 'user'
					? { userIds: safeSelectedRows.map((r) => (r as User)._id), action }
					: { tokenIds: safeSelectedRows.map((r) => (r as Token).token), action };

			const res = await fetch(config.endpoint(), {
				method: config.method(),
				headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': page.data.csrfToken },
				body: JSON.stringify(body)
			});

			const data = await res.json();
			if (!res.ok || data.success === false) throw new Error(data.message || 'Operation failed');

			toast.success({ description: data.message || config.toastMessage() });
			onUpdate({ ids: type === 'user' ? (body as any).userIds : (body as any).tokenIds, action, type });
			await invalidateAll();
		} catch (error) {
			toast.error({ description: error instanceof Error ? error.message : 'An error occurred' });
		}
	}

	async function handleAction(action: ActionType) {
		if (isDisabled) return;
		if (disabledMap[action]) {
			const reason = action === 'edit' ? `Please select only one ${type}` : `Action restricted for this selection`;
			toast.warning(reason);
			return;
		}

		const config = actionConfig[action];
		if (action === 'edit') {
			if (type === 'user') {
				const u = safeSelectedRows[0] as User;
				modalState.trigger(ModalEditForm as any, {
					isGivenData: true,
					username: u.username,
					email: u.email,
					role: u.role,
					user_id: u._id,
					title: config.modalTitle()
				});
			} else {
				const t = safeSelectedRows[0] as Token;
				modalState.trigger(
					ModalEditToken as any,
					{
						token: t.token,
						email: t.email,
						role: t.role,
						user_id: t.user_id,
						expires: convertDateToExpiresFormat(t.expires),
						title: config.modalTitle()
					},
					(res: any) => res?.success && onUpdate({ action: 'refresh', type: 'token', ids: [] })
				);
			}
		} else {
			showConfirm({
				title: config.modalTitle(),
				body: config.modalBody(),
				onConfirm: () => executeBatchAction(action, config)
			});
		}
	}

	async function handleOptionClick(action: ActionType) {
		if (disabledMap[action]) {
			return;
		}

		listboxValue = action;
		isDropdownOpen = false;

		// Sync with store for other components (like TableIcons)
		app.listboxValueState = action;

		// 2. Await tick to ensure UI state reflects the change
		await tick();

		// 3. Trigger action
		console.log('Multibutton - triggering handleAction for:', action);
		handleAction(action);
	}

	function handleDropdownKeydown(event: KeyboardEvent) {
		if (!isDropdownOpen) return;
		const items = Array.from(document.querySelectorAll('[role="menu"] button:not(:disabled)')) as HTMLElement[];
		const idx = items.indexOf(document.activeElement as HTMLElement);
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			items[(idx + 1) % items.length].focus();
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			items[(idx - 1 + items.length) % items.length].focus();
		} else if (event.key === 'Escape') {
			isDropdownOpen = false;
		}
	}
</script>

<div class="relative flex items-center" bind:this={dropdownRef}>
	<div
		class="group/main relative flex items-center shadow-xl overflow-visible transition-all duration-200 {!isDisabled ? 'active:scale-95' : ''} rounded-l-full rounded-r-md border border-white/20 {isDropdownOpen ? 'ring-2 ring-primary-500/50' : ''}"
		role="group"
	>
		<!-- Main Action Button -->
		<button
			type="button"
			onclick={() => handleAction(listboxValue)}
			disabled={isDisabled || disabledMap[listboxValue]}
			aria-label="Execute {actionConfig[listboxValue].label} action"
			title="Execute {actionConfig[listboxValue].label} action"
			class="h-10 min-w-30 font-bold transition-all duration-200 {!isDisabled && !disabledMap[listboxValue] ? 'active:scale-95' : 'pointer-events-none opacity-50 grayscale'} {actionConfig[listboxValue].buttonClass} text-white rounded-l-full rounded-r-none px-6 flex items-center justify-center gap-2 border-e border-white/20"
		>
			<iconify-icon icon={actionConfig[listboxValue].iconValue} width="20"></iconify-icon>
			<span class="uppercase tracking-wider">{actionConfig[listboxValue].label}</span>
		</button>

		<!-- Dropdown Toggle -->
		<button
			type="button"
			data-testid="user-bulk-actions-menu"
			onclick={(e) => {
				e.stopPropagation();
				if (!isDisabled) isDropdownOpen = !isDropdownOpen;
			}}
			disabled={isDisabled}
			aria-haspopup="menu"
			aria-expanded={isDropdownOpen}
			aria-label="Toggle bulk actions menu"
			title="Select action"
			class="h-10 w-10 transition-all duration-200 text-white flex items-center justify-center shadow-inner rounded-r-md {!isDisabled ? 'bg-surface-800 hover:bg-surface-700 active:scale-95 cursor-pointer' : 'opacity-50 pointer-events-none'}"
		>
			<iconify-icon icon="mdi:chevron-down" width={24}></iconify-icon>
		</button>

		<!-- Dropdown Menu -->
		{#if isDropdownOpen}
			<div
				class="absolute inset-e-0 top-full z-50 mt-2 w-56 overflow-hidden rounded bg-surface-800 shadow-2xl ring-1 ring-black/20 backdrop-blur-md origin-top-right"
				role="menu"
				transition:scale={{ duration: 150, easing: quintOut, start: 0.95, opacity: 0 }}
				onkeydown={handleDropdownKeydown}
				tabindex="-1"
			>
				<ul class="flex flex-col py-1">
					{#each filteredActions as action (action)}
						{const config = actionConfig[action]}
						{const disabled = disabledMap[action]}
						<li role="none">
							<button
								type="button"
								onclick={(e) => {
									e.preventDefault();
									e.stopPropagation();
									handleOptionClick(action);
								}}
								disabled={disabled}
								aria-label="Select {action} action"
								role="menuitem"
								class="group/item relative flex w-full items-center gap-3 px-4 py-3 text-start text-white transition-all duration-200 hover:bg-white/5 {disabled ? 'opacity-20 cursor-not-allowed grayscale' : ''}"
							>
								<!-- Hover Indicator -->
								{#if !disabled}
									<div class="absolute inset-0 {config.buttonClass} opacity-0 transition-opacity duration-200 group-hover/item:opacity-100"></div>
								{/if}

								<!-- Icon -->
								<div class="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface-700/50 transition-transform {!disabled ? 'group-hover/item:scale-110' : ''}">
									<iconify-icon icon={config.iconValue} width="16"></iconify-icon>
								</div>

								<!-- Label -->
								<div class="relative z-10 flex-1 font-semibold capitalize">{action}</div>

								<!-- Current Selection Indicator -->
								{#if listboxValue === action}
									<iconify-icon icon="mdi:check" width={18} class="relative z-10 text-tertiary-500 dark:text-primary-500"></iconify-icon>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
</div>
