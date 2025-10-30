<!--
@file src/components/collectionDisplay/EntryList_MultiButton.svelte
@component
**EntryList_MultiButton component for creating, publishing, unpublishing, scheduling, cloning, deleting and testing entries.**

@example
<EntryList_MultiButton
  {isCollectionEmpty}
  {hasSelections}
  {selectedCount}
  bind:showDeleted
  {create}
  {publish}
  {unpublish}
  {schedule}
  {clone}
  delete={deleteAction}
  {test}
/>

### Props
- `isCollectionEmpty` {boolean} - Indicates if the collection is empty
- `hasSelections` {boolean} - Indicates if there are selected entries
- `selectedCount` {number} - Number of selected entries
- `showDeleted` {boolean} - Bindable prop to show deleted entries
- `create` {function} - Callback to create a new entry
- `publish` {function} - Callback to publish selected entries
- `unpublish` {function} - Callback to unpublish selected entries
- `schedule` {function} - Callback to schedule publish/unpublish
- `clone` {function} - Callback to clone selected entries
- `delete` {function} - Callback to delete/archive selected entries
- `test` {function} - Callback to test selected entries		

### Features
- Dynamic main button based on selection state
- Dropdown menu for additional actions
- Role-based action availability
- Configurable actions based on environment settings

-->

<script lang="ts">
	import { StatusTypes } from '@src/content/types';
	import { publicEnv } from '@src/stores/globalSettings.svelte';

	// Stores
	import { page } from '$app/state';
	import { storeListboxValue } from '@stores/store.svelte';
	// Components
	import { showCloneModal, showScheduleModal, showStatusChangeConfirm } from '@utils/modalUtils';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	// Types
	type ActionType = 'create' | 'archive' | keyof typeof StatusTypes;

	interface ActionConfig {
		label: string;
		gradient: string;
		icon: string;
		textColor: string;
	}

	interface Props {
		isCollectionEmpty?: boolean;
		hasSelections?: boolean;
		selectedCount?: number;
		showDeleted?: boolean;
		create: () => void;
		publish: () => void;
		unpublish: () => void;
		schedule: (date: string, action: string) => void;
		clone: () => void;
		delete: (permanent: boolean) => void;
		test: () => void;
	}

	// Props
	let {
		isCollectionEmpty = false,
		hasSelections = false,
		selectedCount = 0,
		showDeleted = $bindable(false),
		create,
		publish,
		unpublish,
		schedule,
		clone,
		delete: deleteAction,
		test
	}: Props = $props();

	// State
	let dropdownOpen = $state(false);
	let dropdownRef = $state<HTMLElement | null>(null);

	// Derived values
	let isAdmin = $derived(page.data?.isAdmin === true);
	let currentAction = $derived(storeListboxValue.value as ActionType);

	// Action configurations
	const BASE_ACTIONS: Record<string, ActionConfig> = {
		create: {
			label: m.entrylist_multibutton_create(),
			gradient: 'gradient-tertiary',
			icon: 'ic:round-plus',
			textColor: 'text-tertiary-500'
		},
		publish: {
			label: m.entrylist_multibutton_publish(),
			gradient: 'gradient-primary',
			icon: 'bi:hand-thumbs-up-fill',
			textColor: 'text-primary-500'
		},
		unpublish: {
			label: m.entrylist_multibutton_unpublish(),
			gradient: 'gradient-yellow',
			icon: 'bi:pause-circle',
			textColor: 'text-yellow-500'
		},
		schedule: {
			label: m.entrylist_multibutton_schedule(),
			gradient: 'gradient-pink',
			icon: 'bi:clock',
			textColor: 'text-pink-500'
		},
		clone: {
			label: m.entrylist_multibutton_clone(),
			gradient: 'gradient-secondary',
			icon: 'bi:clipboard-data-fill',
			textColor: 'text-secondary-500'
		},
		test: {
			label: m.entrylist_multibutton_testing(),
			gradient: 'gradient-error',
			icon: 'icon-park-outline:preview-open',
			textColor: 'text-error-500'
		}
	};

	// Dynamic button map based on config and user role
	let buttonMap = $derived.by<Record<string, ActionConfig>>(() => {
		const actions = { ...BASE_ACTIONS };

		// Handle delete/archive based on configuration
		if (publicEnv?.USE_ARCHIVE_ON_DELETE) {
			if (isAdmin) {
				// Admins see both archive and delete
				actions.archive = {
					label: 'Archive',
					gradient: 'gradient-warning',
					icon: 'bi:archive-fill',
					textColor: 'text-warning-500'
				};
				actions.delete = {
					label: m.button_delete(),
					gradient: 'gradient-error',
					icon: 'bi:trash3-fill',
					textColor: 'text-error-500'
				};
			} else {
				// Non-admins only see archive (labeled as "Delete")
				actions.delete = {
					label: 'Archive',
					gradient: 'gradient-warning',
					icon: 'bi:archive-fill',
					textColor: 'text-warning-500'
				};
			}
		} else {
			// Everyone sees delete when archiving is disabled
			actions.delete = {
				label: m.button_delete(),
				gradient: 'gradient-error',
				icon: 'bi:trash3-fill',
				textColor: 'text-error-500'
			};
		}

		return actions;
	});

	// Current button state
	let currentConfig = $derived(buttonMap[currentAction] || buttonMap.create);
	let isMainButtonDisabled = $derived(currentAction !== 'create' && !hasSelections);

	// Get available actions for dropdown (exclude current action)
	let availableActions = $derived(Object.entries(buttonMap).filter(([type]) => type !== currentAction));

	// Helper functions
	function isActionDisabled(actionType: string): boolean {
		return actionType !== 'create' && !hasSelections;
	}

	function closeDropdown(): void {
		dropdownOpen = false;
	}

	function openScheduleModal(): void {
		showScheduleModal({
			onSchedule: (date: Date, action: string) => {
				schedule(date.toISOString(), action);
			}
		});
	}

	function openPublishModal(): void {
		showStatusChangeConfirm({
			status: StatusTypes.publish,
			count: selectedCount,
			onConfirm: publish
		});
	}

	function openUnpublishModal(): void {
		showStatusChangeConfirm({
			status: StatusTypes.unpublish,
			count: selectedCount,
			onConfirm: unpublish
		});
	}

	function openCloneModal(): void {
		showCloneModal({
			count: selectedCount,
			onConfirm: clone
		});
	}

	// Main button click handler
	function handleMainButtonClick(event: Event): void {
		event.preventDefault();

		switch (currentAction) {
			case 'create':
				create();
				break;
			case StatusTypes.publish:
				openPublishModal();
				break;
			case StatusTypes.unpublish:
				openUnpublishModal();
				break;
			case StatusTypes.schedule:
				openScheduleModal();
				break;
			case StatusTypes.clone:
				openCloneModal();
				break;
			case 'archive':
				deleteAction(false); // Archive mode
				break;
			case StatusTypes.delete:
				deleteAction(publicEnv?.USE_ARCHIVE_ON_DELETE && !isAdmin ? false : true);
				break;
			case StatusTypes.test:
				test();
				break;
		}

		closeDropdown();
	}

	// Dropdown option click handler
	function handleOptionClick(event: Event, actionType: ActionType): void {
		event.preventDefault();

		// Prevent selecting actions that require selections
		if (isActionDisabled(actionType)) {
			return;
		}

		storeListboxValue.set(actionType);
		closeDropdown();
	}

	// Toggle dropdown
	function toggleDropdown(event: Event): void {
		event.preventDefault();
		event.stopPropagation();
		dropdownOpen = !dropdownOpen;
	}

	// Click outside handler
	function handleClickOutside(event: MouseEvent): void {
		const target = event.target as HTMLElement;
		if (dropdownRef && !dropdownRef.contains(target)) {
			closeDropdown();
		}
	}

	// Smart state management based on collection state
	$effect(() => {
		// If collection is empty, always show Create
		if (isCollectionEmpty) {
			storeListboxValue.set('create');
			return;
		}

		// If no selections, default to Create
		if (!hasSelections) {
			if (currentAction !== 'create') {
				storeListboxValue.set('create');
			}
			return;
		}

		// If has selections but current action is 'create', switch to 'publish'
		if (hasSelections && currentAction === 'create') {
			storeListboxValue.set('publish');
		}
	});

	// Click outside listener
	$effect(() => {
		if (dropdownOpen) {
			document.addEventListener('click', handleClickOutside);
			return () => document.removeEventListener('click', handleClickOutside);
		}
	});
</script>

<!-- Multi-button group -->
<div class="relative z-20 mt-1 flex items-center font-medium text-white" bind:this={dropdownRef}>
	<div class="variant-filled-token btn-group flex overflow-hidden rounded-l-full rounded-r-md rtl:rounded rtl:rounded-r-full">
		<!-- Main action button -->
		<button
			type="button"
			class="btn w-[60px] rounded-l-full md:w-auto rtl:rotate-180 {currentConfig.gradient}"
			onclick={handleMainButtonClick}
			disabled={isMainButtonDisabled}
			aria-label={currentConfig.label}
		>
			<span class="grid grid-cols-[24px_auto] items-center gap-2 rtl:rotate-180">
				<iconify-icon icon={currentConfig.icon} width="24" class="text-white" aria-hidden="true"></iconify-icon>
				<div class="hidden h-6 text-left md:flex md:flex-col md:justify-center">
					<div class="leading-tight">{currentConfig.label}</div>
					{#if hasSelections && selectedCount > 0 && currentAction !== 'create'}
						<div class="text-center text-xs leading-tight">
							({selectedCount}
							{selectedCount === 1 ? 'item' : 'items'})
						</div>
					{/if}
				</div>
			</span>
		</button>

		<!-- Divider -->
		<div class="border-l-[3px] border-black dark:border-white"></div>

		<!-- Dropdown toggle button -->
		<button
			type="button"
			class="flex w-[42px] items-center justify-center rounded-r-md bg-surface-400 transition-colors hover:bg-surface-500 dark:bg-surface-600 dark:hover:bg-surface-500"
			aria-label="Toggle actions menu"
			aria-expanded={dropdownOpen}
			aria-controls="actions-dropdown"
			onclick={toggleDropdown}
		>
			<iconify-icon
				icon="mdi:chevron-down"
				width="24"
				class="text-white transition-transform duration-200 {dropdownOpen ? 'rotate-180' : ''}"
				aria-hidden="true"
			></iconify-icon>
		</button>
	</div>

	<!-- Dropdown menu -->
	{#if dropdownOpen}
		<ul
			id="actions-dropdown"
			class="absolute right-2 top-full z-50 mt-1 max-h-[300px] divide-y divide-white overflow-y-auto rounded bg-surface-400 shadow-lg dark:bg-surface-700 rtl:left-2 rtl:right-auto"
			role="menu"
			transition:scale={{ duration: 200, easing: quintOut, start: 0.95, opacity: 0 }}
		>
			{#each availableActions as [actionType, config] (actionType)}
				{@const disabled = isActionDisabled(actionType)}

				<li class="hover:text-white {disabled ? 'opacity-50' : ''}">
					<button
						type="button"
						onclick={(e) => handleOptionClick(e, actionType as ActionType)}
						{disabled}
						role="menuitem"
						aria-label={config.label}
						class="btn flex w-full justify-between gap-2 bg-surface-400 hover:{config.gradient} dark:bg-surface-700 dark:hover:{config.gradient} {disabled
							? 'cursor-not-allowed'
							: ''}"
					>
						<iconify-icon icon={config.icon} width="24" aria-hidden="true"></iconify-icon>
						<span class="w-full text-left">{config.label}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
