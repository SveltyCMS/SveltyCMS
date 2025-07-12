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
	// Stores
	import { mode, modifyEntry } from '@src/stores/collectionStore.svelte';
	import { handleUILayoutToggle } from '@src/stores/UIStore.svelte';
	import { storeListboxValue } from '@stores/store.svelte';
	// Components
	import ScheduleModal from './ScheduleModal.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';

	type ActionType = 'create' | 'publish' | 'unpublish' | 'schedule' | 'clone' | 'delete' | 'test';

	interface Props {
		isCollectionEmpty?: boolean;
		hasSelections?: boolean; // New prop to track if there are selections
		selectedCount?: number; // Number of selected items
		'on:create'?: () => void;
		'on:publish'?: () => void;
		'on:unpublish'?: () => void;
		'on:schedule'?: () => void;
		'on:clone'?: () => void;
		'on:delete'?: () => void;
		'on:test'?: () => void;
	}

	// Props
	let {
		isCollectionEmpty = false,
		hasSelections = false,
		selectedCount = 0,
		'on:create': onCreate = () => {},
		'on:publish': onPublish = () => {},
		'on:unpublish': onUnpublish = () => {},
		'on:schedule': onSchedule = () => {},
		'on:clone': onClone = () => {},
		'on:delete': onDelete = () => {},
		'on:test': onTest = () => {}
	}: Props = $props();

	// States
	let dropdownOpen = $state(false);
	let actionName = $state('');
	let buttonClass = $state('');
	let iconValue = $state('');

	// Modal Trigger - Schedule
	function openScheduleModal(): void {
		const modalComponent: ModalComponent = {
			ref: ScheduleModal,
			slot: '<p>Schedule Form</p>'
		};
		const modalSettings: ModalSettings = {
			type: 'component',
			title: 'Scheduler',
			body: 'Set a date and time to schedule this entry.',
			component: modalComponent,
			response: (r: boolean) => {
				if (r) {
					console.log('Scheduling successful');
					// Trigger the schedule action
					onSchedule();
				}
			}
		};
		getModalStore().trigger(modalSettings);
	}

	function handleButtonClick(event: Event) {
		event.preventDefault();
		console.log('🔲 Main button clicked! Current action:', storeListboxValue.value, 'hasSelections:', hasSelections);

		if (!modifyEntry.value) {
			console.log('🚫 modifyEntry.value is not available:', modifyEntry.value);
			return;
		}

		console.log('✅ modifyEntry.value is available, proceeding with action:', storeListboxValue.value);
		switch (storeListboxValue.value) {
			case 'create':
				mode.set('create');
				handleUILayoutToggle();
				onCreate();
				break;
			case 'publish':
				mode.set('view');
				modifyEntry.value('published');
				onPublish();
				break;
			case 'unpublish':
				mode.set('view');
				modifyEntry.value('unpublished');
				onUnpublish();
				break;
			case 'schedule':
				mode.set('view');
				openScheduleModal(); // Open the schedule modal instead of directly calling modifyEntry
				break;
			case 'clone':
				mode.set('view');
				modifyEntry.value('cloned');
				onClone();
				break;
			case 'delete':
				console.log('🗑️ DELETE button clicked, hasSelections:', hasSelections, 'selectedCount:', selectedCount);
				console.log('🗑️ modifyEntry.value:', typeof modifyEntry.value, modifyEntry.value);
				mode.set('view');
				try {
					modifyEntry.value('deleted');
					console.log('🗑️ modifyEntry.value("deleted") called successfully');
				} catch (error) {
					console.error('🗑️ Error calling modifyEntry.value("deleted"):', error);
				}
				onDelete();
				break;
			case 'test':
				mode.set('view');
				modifyEntry.value('testing');
				onTest();
				break;
			default:
				break;
		}

		dropdownOpen = false;
	}

	// handleOptionClick for Button Dropdown
	function handleOptionClick(event: Event, value: ActionType): void {
		event.preventDefault();
		console.log('🎯 Option clicked:', {
			value,
			hasSelections,
			selectedCount,
			isDisabled: value !== 'create' && !hasSelections
		});

		// Prevent selecting actions that require selections when none are selected
		if (value !== 'create' && !hasSelections) {
			console.log('🚫 Action blocked - no selections for', value);
			return;
		}

		console.log('✅ Setting listbox value to:', value);
		storeListboxValue.set(value);
		dropdownOpen = false;
	}

	const buttonMap: Record<ActionType, [string, string, string, string]> = {
		create: [m.entrylist_multibutton_create(), 'gradient-tertiary', 'ic:round-plus', 'text-tertiary-500'],
		publish: [m.entrylist_multibutton_publish(), 'gradient-primary', 'bi:hand-thumbs-up-fill', 'text-primary-500'],
		unpublish: [m.entrylist_multibutton_unpublish(), 'gradient-yellow', 'bi:pause-circle', 'text-yellow-500'],
		schedule: [m.entrylist_multibutton_schedule(), 'gradient-pink', 'bi:clock', 'text-pink-500'],
		clone: [m.entrylist_multibutton_clone(), 'gradient-secondary', 'bi:clipboard-data-fill', 'text-secondary-500'],
		delete: [m.button_delete(), 'gradient-error', 'bi:trash3-fill', 'text-error-500'],
		test: [m.entrylist_multibutton_testing(), 'gradient-error', 'icon-park-outline:preview-open', 'text-error-500']
	};

	// Update button display when storeListboxValue changes using root effect
	$effect(() => {
		let [action, buttonStyle, icon] = buttonMap[storeListboxValue.value as ActionType] || ['', '', '', ''];
		actionName = action;
		iconValue = icon;
		buttonClass = `btn ${buttonStyle} rounded-none w-36 justify-between`;
		console.log('🔄 MultiButton state updated:', {
			action: storeListboxValue.value,
			actionName,
			hasSelections,
			selectedCount,
			buttonDisabled: storeListboxValue.value !== 'create' && !hasSelections
		});
	});

	// Smart state management based on collection state and selections
	$effect.root(() => {
		console.log('🧠 Smart state management triggered:', {
			isCollectionEmpty,
			hasSelections,
			currentAction: storeListboxValue.value
		});

		// If collection is empty, always show Create
		if (isCollectionEmpty) {
			console.log('📁 Collection is empty, setting to create');
			storeListboxValue.set('create');
			return;
		}

		// If no selections, default to Create (for adding new entries)
		if (!hasSelections) {
			if (storeListboxValue.value !== 'create') {
				console.log('❌ No selections, switching to create');
				storeListboxValue.set('create');
			}
			return;
		}

		// If has selections but current action is 'create', switch to 'publish'
		// (most common action for selected items)
		if (hasSelections && storeListboxValue.value === 'create') {
			console.log('✅ Has selections, switching from create to publish');
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
				<div class="hidden text-left md:block">
					<span>{actionName}</span>
					{#if hasSelections && selectedCount > 1}
						<span class="text-xs opacity-75">({selectedCount})</span>
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
									<span class="text-xs opacity-75">(select items first)</span>
								{/if}
							</p>
						</button>
					</li>
				{/if}
			{/each}
		</ul>
	{/if}
</div>
