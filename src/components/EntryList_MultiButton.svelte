<!--
@files src/components/EntryList_MultiButton.svelte
@component
**EntryList_MultiButton component for creating, publishing, unpublishing, scheduling, cloning, deleting and testing entries.**

```tsx
<EntryList_MultiButton />
```

#### Props
- `isCollectionEmpty` {boolean} - Boolean value indicating whether the collection is empty
- `on:create` {function} - Function to call when the create button is clicked
- `on:publish` {function} - Function to call when the publish button is clicked
- `on:unpublish` {function} - Function to call when the unpublish button is clicked
- `on:schedule` {function} - Function to call when the schedule button is clicked
- `on:clone` {function} - Function to call when the clone button is clicked
- `on:delete` {function} - Function to call when the delete button is clicked
- `on:test` {function} - Function to call when the test button is clicked
-->

<script lang="ts">
	// Types
	import { StatusTypes } from '@src/content/types';

	// Stores
	import { mode, collectionValue } from '@src/stores/collectionStore.svelte';
	import { handleUILayoutToggle } from '@src/stores/UIStore.svelte';
	import { storeListboxValue } from '@stores/store.svelte';

	// Components
	import ScheduleModal from './ScheduleModal.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';

	// Initialize the modal store at the top level.
	const modalStore = getModalStore();

	type ActionType = 'create' | keyof typeof StatusTypes;

	interface Props {
		isCollectionEmpty?: boolean;
		hasSelections?: boolean;
		selectedCount?: number;
		create?: () => void;
		publish?: () => void;
		unpublish?: () => void;
		schedule?: () => void;
		clone?: () => void;
		delete?: () => void;
		test?: () => void;
	}

	// Props
	let {
		isCollectionEmpty = false,
		hasSelections = false,
		selectedCount = 0,
		create = () => {},
		publish = () => {},
		unpublish = () => {},
		schedule = () => {},
		clone = () => {},
		delete: deleteAction = () => {}, // 'delete' is a reserved keyword
		test = () => {}
	}: Props = $props();

	// States
	let dropdownOpen = $state(false);
	let actionName = $state('');
	let buttonClass = $state('');
	let iconValue = $state('');

	// Modal Trigger - Schedule
	function openScheduleModal(): void {
		const modalComponent: ModalComponent = { ref: ScheduleModal };
		const modalSettings: ModalSettings = {
			type: 'component',
			title: 'Scheduler',
			body: 'Set a date and time to schedule this entry.',
			component: modalComponent,
			response: (r: boolean) => {
				if (r) schedule();
			}
		};
		// Use the initialized `modalStore` constant.
		modalStore.trigger(modalSettings);
	}

	// his function only calls the event handlers that the parent component (`EntryList.svelte`) listens for
	function handleButtonClick(event: Event) {
		event.preventDefault();

		// This function now only calls the parent's event handlers.
		switch (storeListboxValue.value) {
			case 'create':
				// Initialize empty entry - status will be set by HeaderEdit save logic
				collectionValue.set({});
				mode.set('create');
				handleUILayoutToggle();
				create();
				break;
			case StatusTypes.publish:
				openPublishModal(); // Open colorful confirmation modal
				break;
			case StatusTypes.unpublish:
				openUnpublishModal(); // Open colorful confirmation modal
				break;
			case StatusTypes.schedule:
				openScheduleModal(); // Open the modal, which will call onSchedule.
				break;
			case StatusTypes.clone:
				openCloneModal(); // Open colorful confirmation modal
				break;
			case StatusTypes.delete:
				openDeleteModal(); // Open colorful confirmation modal
				break;
			case StatusTypes.test:
				test(); // Emit the 'test' event.
				break;
		}
		dropdownOpen = false;
	}

	// handleOptionClick for Button Dropdown
	function handleOptionClick(event: Event, value: ActionType): void {
		event.preventDefault();
		// Prevent selecting actions that require selections when none are selected
		if (value !== 'create' && !hasSelections) {
			return;
		}

		// Set the action for the main button
		storeListboxValue.set(value);

		// No immediate action needed - let the user click the main button to trigger the action
		dropdownOpen = false;
	}

	// Enhanced Delete Modal with colorful styling
	function openDeleteModal(): void {
		const modalSettings: ModalSettings = {
			type: 'confirm',
			title: `Please Confirm Entry <span class="text-error-500 font-bold">Deletion</span>`,
			body:
				selectedCount === 1
					? `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> this entry? This action cannot be undone and will permanently remove the entry from the system.`
					: `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> <span class="text-tertiary-500 font-medium">${selectedCount} entries</span>? This action cannot be undone and will permanently remove all selected entries from the system.`,
			buttonTextConfirm: 'Delete',
			buttonTextCancel: 'Cancel',
			meta: { buttonConfirmClasses: 'bg-error-500 hover:bg-error-600 text-white' },
			response: (confirmed: boolean) => {
				if (confirmed) {
					deleteAction();
				}
			}
		};
		modalStore.trigger(modalSettings);
	}

	// Enhanced Publish Modal with colorful styling
	function openPublishModal(): void {
		const modalSettings: ModalSettings = {
			type: 'confirm',
			title: `Please Confirm Entry <span class="text-primary-500 font-bold">Publication</span>`,
			body:
				selectedCount === 1
					? `Are you sure you want to <span class="text-primary-500 font-semibold">publish</span> this entry? This will make it visible to the public.`
					: `Are you sure you want to <span class="text-primary-500 font-semibold">publish</span> <span class="text-tertiary-500 font-medium">${selectedCount} entries</span>? This will make all selected entries visible to the public.`,
			buttonTextConfirm: 'Publish',
			buttonTextCancel: 'Cancel',
			meta: { buttonConfirmClasses: 'bg-primary-500 hover:bg-primary-600 text-white' },
			response: (confirmed: boolean) => {
				if (confirmed) {
					console.log('MultiButton publish modal confirmed, calling publish function...');
					// Call publish but prevent the EntryList modal from showing
					publish();
				}
			}
		};
		modalStore.trigger(modalSettings);
	}

	// Enhanced Unpublish Modal with colorful styling
	function openUnpublishModal(): void {
		const modalSettings: ModalSettings = {
			type: 'confirm',
			title: `Please Confirm Entry <span class="text-yellow-500 font-bold">Unpublication</span>`,
			body:
				selectedCount === 1
					? `Are you sure you want to <span class="text-yellow-500 font-semibold">unpublish</span> this entry? This will hide it from the public.`
					: `Are you sure you want to <span class="text-yellow-500 font-semibold">unpublish</span> <span class="text-tertiary-500 font-medium">${selectedCount} entries</span>? This will hide all selected entries from the public.`,
			buttonTextConfirm: 'Unpublish',
			buttonTextCancel: 'Cancel',
			meta: { buttonConfirmClasses: 'bg-yellow-500 hover:bg-yellow-600 text-white' },
			response: (confirmed: boolean) => {
				if (confirmed) {
					unpublish();
				}
			}
		};
		modalStore.trigger(modalSettings);
	}

	// Enhanced Clone Modal with colorful styling
	function openCloneModal(): void {
		const modalSettings: ModalSettings = {
			type: 'confirm',
			title: `Please Confirm Entry <span class="text-secondary-500 font-bold">Cloning</span>`,
			body:
				selectedCount === 1
					? `Are you sure you want to <span class="text-secondary-500 font-semibold">clone</span> this entry? This will create a duplicate copy.`
					: `Are you sure you want to <span class="text-secondary-500 font-semibold">clone</span> <span class="text-tertiary-500 font-medium">${selectedCount} entries</span>? This will create duplicate copies of all selected entries.`,
			buttonTextConfirm: 'Clone',
			buttonTextCancel: 'Cancel',
			meta: { buttonConfirmClasses: 'bg-secondary-500 hover:bg-secondary-600 text-white' },
			response: (confirmed: boolean) => {
				if (confirmed) {
					clone();
				}
			}
		};
		modalStore.trigger(modalSettings);
	}

	const buttonMap: Record<ActionType, [string, string, string, string]> = {
		create: [m.entrylist_multibutton_create(), 'gradient-tertiary', 'ic:round-plus', 'text-tertiary-500'],
		publish: [m.entrylist_multibutton_publish(), 'gradient-primary', 'bi:hand-thumbs-up-fill', 'text-primary-500'],
		unpublish: [m.entrylist_multibutton_unpublish(), 'gradient-yellow', 'bi:pause-circle', 'text-yellow-500'],
		schedule: [m.entrylist_multibutton_schedule(), 'gradient-pink', 'bi:clock', 'text-pink-500'],
		clone: [m.entrylist_multibutton_clone(), 'gradient-secondary', 'bi:clipboard-data-fill', 'text-secondary-500'],
		delete: [m.button_delete(), 'gradient-error', 'bi:trash3-fill', 'text-error-500'],
		test: [m.entrylist_multibutton_testing(), 'gradient-error', 'icon-park-outline:preview-open', 'text-error-500'],
		draft: [m.entrylist_multibutton_draft ? m.entrylist_multibutton_draft() : 'Draft', 'gradient-gray', 'bi:pencil', 'text-gray-500']
	};

	// Update button display when storeListboxValue changes using root effect
	$effect(() => {
		const [action, buttonStyle, icon] = buttonMap[storeListboxValue.value as ActionType] || ['', '', '', ''];
		actionName = action;
		iconValue = icon;
		buttonClass = `btn ${buttonStyle} rounded-none w-36 justify-between`;
	});

	// Smart state management based on collection state and selections
	$effect.root(() => {
		// If collection is empty, always show Create
		if (isCollectionEmpty) {
			storeListboxValue.set('create');
			return;
		}

		// If no selections, default to Create (for adding new entries)
		if (!hasSelections) {
			if (storeListboxValue.value !== 'create') {
				storeListboxValue.set('create');
			}
			return;
		}

		// If has selections but current action is 'create', switch to 'publish'
		if (hasSelections && storeListboxValue.value === 'create') {
			storeListboxValue.set('publish');
		}
	});
</script>

<!-- Multibutton group-->
<div class="relative z-20 mt-1 font-medium text-white">
	<div class="variant-filled-token btn-group flex overflow-hidden rounded-l-full rounded-r-md rtl:rounded rtl:rounded-r-full">
		<!-- Left button -->
		<button
			type="button"
			class={`w-[60px] md:w-auto rtl:rotate-180 ${buttonClass} rounded-l-full`}
			onclick={handleButtonClick}
			disabled={storeListboxValue.value !== 'create' && !hasSelections}
		>
			<span class="grid grid-cols-[24px_auto] items-center gap-2 rtl:rotate-180">
				<iconify-icon icon={iconValue} width="24" class="text-white"></iconify-icon>
				<div class="hidden h-6 text-left md:flex md:flex-col md:justify-center">
					<div class="leading-tight">{actionName}</div>
					{#if hasSelections && selectedCount > 0}
						<div class="text-center text-xs leading-tight">
							({selectedCount}
							{selectedCount === 1 ? 'item' : 'items'})
						</div>
					{/if}
				</div>
			</span>
		</button>

		<!-- White line -->
		<div class="border-l-[3px] border-white"></div>

		<!-- Dropdown button -->
		<button
			type="button"
			class="flex w-[42px] items-center justify-center rounded-r-md bg-surface-400 dark:bg-surface-600"
			aria-label="Toggle dropdown"
			onclick={(e) => {
				e.preventDefault();
				dropdownOpen = !dropdownOpen;
			}}
		>
			<iconify-icon icon="mdi:chevron-down" width="24" class="text-white"></iconify-icon>
		</button>
	</div>

	{#if dropdownOpen}
		<ul
			class="drops absolute right-2 top-full z-50 mt-1 max-h-[300px] divide-y divide-white overflow-y-auto rounded bg-surface-400 dark:bg-surface-700 rtl:left-2 rtl:right-auto"
		>
			{#each Object.entries(buttonMap) as [type, [label, gradient, icon]]}
				{#if storeListboxValue.value !== type}
					{@const isDisabled = type !== 'create' && !hasSelections}
					<li class={`hover:text-white gradient-${gradient}-hover gradient-${gradient}-focus ${isDisabled ? 'opacity-50' : ''}`}>
						<button
							type="button"
							onclick={(e) => handleOptionClick(e, type as ActionType)}
							aria-label={label}
							disabled={isDisabled}
							class={`btn flex w-full justify-between gap-2 gradient-${gradient} ${gradient}-hover ${gradient}-focus ${isDisabled ? 'cursor-not-allowed' : ''}`}
						>
							<iconify-icon {icon} width="24" class=""></iconify-icon>
							<p class="w-full">
								{label}
								{#if type !== 'create' && !hasSelections}
									<span class="text-xs opacity-75"></span>
								{:else if type !== 'create' && hasSelections && selectedCount > 1}
									<span class="text-xs opacity-75">({selectedCount} items)</span>
								{/if}
							</p>
						</button>
					</li>
				{/if}
			{/each}
		</ul>
	{/if}
</div>
