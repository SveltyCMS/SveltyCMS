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
	import ScheduleModal from './ScheduleModal.svelte';

	// Utils (Using your new v4 compatible manager)
	import { modalState, showConfirm } from '@utils/modalState.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Transitions (Standard Svelte transitions still work great)
	import { scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	import type { EntryListMultiButtonProps } from '@src/content/types';

	// Types
	type ActionType = 'create' | 'archive' | keyof typeof StatusTypes;

	interface ActionConfig {
		label: string;
		gradient: string;
		icon: string;
		textColor: string;
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
	}: EntryListMultiButtonProps = $props();

	// --- STATE MANAGEMENT (UPDATED FOR SVELTE 5) ---
	let dropdownOpen = $state(false);
	let dropdownRef = $state<HTMLElement | null>(null);
	let manualActionSet = $state(false);

	const isAdmin = $derived(page.data?.isAdmin === true);
	const currentAction = $derived(storeListboxValue.value as ActionType);

	// --- CONFIGURATION ---
	const BASE_ACTIONS: Record<string, ActionConfig> = {
		create: { label: m.entrylist_multibutton_create(), gradient: 'gradient-tertiary', icon: 'ic:round-plus', textColor: 'text-tertiary-500' },
		publish: {
			label: m.entrylist_multibutton_publish(),
			gradient: 'gradient-primary',
			icon: 'bi:hand-thumbs-up-fill',
			textColor: 'text-primary-500'
		},
		unpublish: { label: m.entrylist_multibutton_unpublish(), gradient: 'gradient-yellow', icon: 'bi:pause-circle', textColor: 'text-yellow-500' },
		schedule: { label: m.entrylist_multibutton_schedule(), gradient: 'gradient-pink', icon: 'bi:clock', textColor: 'text-pink-500' },
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
				actions.archive = { label: 'Archive', gradient: 'gradient-warning', icon: 'bi:archive-fill', textColor: 'text-warning-500' };
				actions.delete = { label: m.button_delete(), gradient: 'gradient-error', icon: 'bi:trash3-fill', textColor: 'text-error-500' };
			} else {
				actions.delete = { label: 'Archive', gradient: 'gradient-warning', icon: 'bi:archive-fill', textColor: 'text-warning-500' };
			}
		} else {
			actions.delete = { label: m.button_delete(), gradient: 'gradient-error', icon: 'bi:trash3-fill', textColor: 'text-error-500' };
		}
		return actions;
	});

	// Current button state
	const currentConfig = $derived(buttonMap[String(currentAction)] || buttonMap.create);
	const isMainButtonDisabled = $derived(currentAction !== 'create' && !hasSelections);
	const availableActions = $derived(Object.entries(buttonMap).filter(([type]) => type !== currentAction));

	// --- ACTIONS ---
	function isActionDisabled(actionType: ActionType): boolean {
		return actionType !== 'create' && !hasSelections;
	}

	function closeDropdown(): void {
		dropdownOpen = false;
	}

	function toggleDropdown(event: Event): void {
		event.preventDefault();
		event.stopPropagation();
		dropdownOpen = !dropdownOpen;
	}

	// --- MODAL TRIGGERS ---
	function openScheduleModal(): void {
		modalState.trigger(ScheduleModal, { initialAction: 'publish' }, (result: any) => {
			if (result && result.date) schedule(result.date.toISOString(), result.action);
		});
	}

	function openPublishModal(): void {
		showConfirm({
			title: 'Please Confirm Publication',
			body: `Are you sure you want to change ${selectedCount} ${selectedCount === 1 ? 'entry' : 'entries'} status to publish?`,
			onConfirm: () => publish()
		});
	}

	function openUnpublishModal(): void {
		showConfirm({
			title: 'Please Confirm Unpublication',
			body: `Are you sure you want to change ${selectedCount} ${selectedCount === 1 ? 'entry' : 'entries'} status to unpublish?`,
			onConfirm: () => unpublish()
		});
	}

	function openCloneModal(): void {
		showConfirm({
			title: m.entrylist_multibutton_clone(),
			body: `Are you sure you want to clone ${selectedCount} ${selectedCount === 1 ? 'entry' : 'entries'}?`,
			confirmText: 'Clone',
			onConfirm: () => clone()
		});
	}

	function handleMainButtonClick(event: Event): void {
		event.preventDefault();
		event.stopPropagation();
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
				deleteAction(false);
				break;
			case 'delete':
			case StatusTypes.delete:
				deleteAction(publicEnv?.USE_ARCHIVE_ON_DELETE && !isAdmin ? false : true);
				break;
			case 'test':
			case StatusTypes.test:
				test();
				break;
		}
		closeDropdown();
	}

	function handleOptionClick(event: Event, actionType: ActionType): void {
		event.preventDefault();
		if (isActionDisabled(actionType)) return;
		storeListboxValue.set(actionType);
		manualActionSet = true;
		closeDropdown();
	}

	// --- EFFECTS ---

	// 1. Click Outside Handler
	$effect(() => {
		if (!dropdownOpen) return;

		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			if (dropdownRef && !dropdownRef.contains(target)) {
				closeDropdown();
			}
		};

		// Small delay to prevent immediate closing if the click that opened it bubbles up
		setTimeout(() => {
			document.addEventListener('click', handleClickOutside);
		}, 0);

		return () => document.removeEventListener('click', handleClickOutside);
	});

	// 2. Smart Selection Logic
	$effect(() => {
		if (isCollectionEmpty) {
			storeListboxValue.set('create');
			manualActionSet = false;
			return;
		}
		if (manualActionSet) return;

		if (!hasSelections) {
			if (currentAction !== 'create') storeListboxValue.set('create');
			return;
		}
		if (hasSelections && currentAction === 'create') {
			storeListboxValue.set('publish');
		}
	});

	$effect(() => {
		if (!hasSelections) manualActionSet = false;
	});
</script>

<div class="relative z-20 mt-1 flex items-center font-medium text-white" bind:this={dropdownRef}>
	<div class="preset-filled-token flex overflow-hidden rounded-l-full rounded-r-md rtl:rounded rtl:rounded-r-full shadow-sm">
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
						<div class="text-center text-xs leading-tight opacity-90">
							({selectedCount}
							{selectedCount === 1 ? 'item' : 'items'})
						</div>
					{/if}
				</div>
			</span>
		</button>

		<div class="border-l-[3px] border-black/20 dark:border-white/20"></div>

		<button
			type="button"
			class="flex w-[42px] items-center justify-center bg-surface-400 transition-colors hover:bg-surface-500 dark:bg-surface-600 dark:hover:bg-surface-500"
			aria-label="Toggle actions menu"
			aria-expanded={dropdownOpen}
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

	{#if dropdownOpen}
		<ul
			class="absolute right-0 top-full z-50 mt-1 min-w-[200px] overflow-hidden rounded bg-surface-400 shadow-xl dark:bg-surface-700 rtl:left-0 rtl:right-auto"
			role="menu"
			transition:scale={{ duration: 200, easing: quintOut, start: 0.95, opacity: 0 }}
		>
			{#each availableActions as [actionType, config] (actionType)}
				{@const disabled = isActionDisabled(actionType as ActionType)}

				<li class="border-b border-white/10 last:border-0 {disabled ? 'opacity-50' : ''}">
					<button
						type="button"
						onclick={(e) => handleOptionClick(e, actionType as ActionType)}
						{disabled}
						role="menuitem"
						class="group relative flex w-full items-center gap-3 px-4 py-3 text-left text-white transition-colors hover:bg-surface-500 {disabled
							? 'cursor-not-allowed'
							: 'cursor-pointer'}"
					>
						{#if !disabled}
							<div class="absolute inset-0 {config.gradient} opacity-0 transition-opacity duration-200 group-hover:opacity-100"></div>
						{/if}

						<iconify-icon icon={config.icon} width="20" class="relative z-10"></iconify-icon>
						<span class="relative z-10">{config.label}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
