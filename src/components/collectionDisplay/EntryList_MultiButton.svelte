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
	import { logger } from '@utils/logger';
	import { StatusTypes } from '@src/content/types';
	import { publicEnv } from '@src/stores/globalSettings.svelte';

	// Stores
	import { page } from '$app/state';
	import { storeListboxValue } from '@stores/store.svelte';

	// Skeleton
	import { getModalStore } from '@skeletonlabs/skeleton';

	// Components
	import ScheduleModal from './ScheduleModal.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	// Initialize modal store at component level
	const modalStore = getModalStore();

	// Types
	type ActionType = 'create' | 'archive' | keyof typeof StatusTypes;

	interface ActionConfig {
		label: string;
		gradient: string;
		icon: string;
		textColor: string;
	}

	import type { EntryListMultiButtonProps } from './types';

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
	}: EntryListMultiButtonProps = $props();

	// State
	let dropdownOpen = $state(false);
	let dropdownRef = $state<HTMLElement | null>(null);
	let manualActionSet = $state(false); // Track if user manually selected an action

	// Derived values
	const isAdmin = $derived(page.data?.isAdmin === true);
	const currentAction = $derived(storeListboxValue.value as ActionType);

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
	const buttonMap = $derived.by(() => {
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
	const currentConfig = $derived(buttonMap[String(currentAction)] || buttonMap.create);
	const isMainButtonDisabled = $derived(currentAction !== 'create' && !hasSelections);

	// Get available actions for dropdown (exclude current action)
	const availableActions = $derived(Object.entries(buttonMap).filter(([type]) => type !== currentAction));

	// Helper functions
	function isActionDisabled(actionType: ActionType): boolean {
		return actionType !== 'create' && !hasSelections;
	}

	function closeDropdown(): void {
		dropdownOpen = false;
	}

	function openScheduleModal(): void {
		logger.debug('Opening schedule modal with count:', selectedCount);
		logger.debug('Modal store:', modalStore);

		// Use the component-level modalStore directly
		modalStore.trigger({
			type: 'component',
			component: { ref: ScheduleModal },
			title: 'Schedule Entry',
			meta: {
				initialAction: 'publish'
			},
			response: (result: { date: Date; action: string } | boolean) => {
				if (result && typeof result === 'object' && 'date' in result) {
					logger.debug('Schedule confirmed:', result.date, result.action);
					schedule(result.date.toISOString(), result.action);
				}
			}
		});
	}

	function openPublishModal(): void {
		logger.debug('Opening publish modal with count:', selectedCount);

		modalStore.trigger({
			type: 'confirm',
			title: `Please Confirm <span class="text-primary-500 font-bold">Publication</span>`,
			body: `Are you sure you want to <span class="text-primary-500 font-semibold">change</span> ${selectedCount} ${selectedCount === 1 ? 'entry' : 'entries'} status to <span class="text-primary-500 font-semibold">publish</span>?`,
			buttonTextConfirm: 'Publish',
			response: (confirmed: boolean) => {
				if (confirmed) {
					logger.debug('Publish confirmed');
					publish();
				}
			}
		});
	}

	function openUnpublishModal(): void {
		logger.debug('Opening unpublish modal with count:', selectedCount);

		modalStore.trigger({
			type: 'confirm',
			title: `Please Confirm <span class="text-yellow-500 font-bold">Unpublication</span>`,
			body: `Are you sure you want to <span class="text-yellow-500 font-semibold">change</span> ${selectedCount} ${selectedCount === 1 ? 'entry' : 'entries'} status to <span class="text-yellow-500 font-semibold">unpublish</span>?`,
			buttonTextConfirm: 'Unpublish',
			response: (confirmed: boolean) => {
				if (confirmed) {
					logger.debug('Unpublish confirmed');
					unpublish();
				}
			}
		});
	}

	function openCloneModal(): void {
		logger.debug('Opening clone modal with count:', selectedCount);

		modalStore.trigger({
			type: 'confirm',
			title: m.entrylist_multibutton_clone(),
			body: `Are you sure you want to clone ${selectedCount} ${selectedCount === 1 ? 'entry' : 'entries'}? This will create ${selectedCount === 1 ? 'a duplicate' : 'duplicates'} of the selected ${selectedCount === 1 ? 'entry' : 'entries'}.`,
			buttonTextConfirm: m.entrylist_multibutton_clone(),
			response: (confirmed: boolean) => {
				if (confirmed) {
					logger.debug('Clone confirmed');
					clone();
				}
			}
		});
	}

	// Main button click handler
	function handleMainButtonClick(event: Event): void {
		event.preventDefault();
		event.stopPropagation();

		logger.debug('Main button clicked, action:', currentAction, 'hasSelections:', hasSelections, 'selectedCount:', selectedCount);

		switch (currentAction) {
			case 'create':
				create();
				break;
			case 'publish':
			case StatusTypes.publish:
				openPublishModal();
				break;
			case 'unpublish':
			case StatusTypes.unpublish:
				openUnpublishModal();
				break;
			case 'schedule':
				openScheduleModal();
				break;
			case 'clone':
				openCloneModal();
				break;
			case 'archive':
				deleteAction(false); // Archive mode
				break;
			case 'delete':
			case StatusTypes.delete:
				deleteAction(publicEnv?.USE_ARCHIVE_ON_DELETE && !isAdmin ? false : true);
				break;
			case 'test':
			case StatusTypes.test:
				test();
				break;
			default:
				logger.warn('Unknown action:', currentAction);
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
		manualActionSet = true; // Mark as manually set
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
			manualActionSet = false;
			return;
		}

		// Don't auto-switch if user manually selected an action
		if (manualActionSet) {
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

	// Reset manual flag when selections are cleared
	$effect(() => {
		if (!hasSelections) {
			manualActionSet = false;
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
				{@const disabled = isActionDisabled(actionType as ActionType)}

				<li class={disabled ? 'opacity-50' : ''}>
					<button
						type="button"
						onclick={(e) => handleOptionClick(e, actionType as ActionType)}
						{disabled}
						role="menuitem"
						aria-label={config.label}
						class="group btn relative flex w-full justify-between gap-2 overflow-hidden bg-surface-400 text-white dark:bg-surface-700 {disabled
							? 'cursor-not-allowed'
							: ''}"
					>
						<!-- Gradient overlay that appears on hover -->
						{#if !disabled}
							<div class="absolute inset-0 {config.gradient} opacity-0 transition-opacity duration-200 group-hover:opacity-100"></div>
						{/if}
						<iconify-icon icon={config.icon} width="24" aria-hidden="true" class="pointer-events-none relative z-10"></iconify-icon>
						<span class="pointer-events-none relative z-10 w-full text-left">{config.label}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
