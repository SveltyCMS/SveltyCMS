<!--
@files src/components/collectionDisplay/EntryList_MultiButton.svelte
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

	// Config
	import { publicEnv } from '@src/stores/globalSettings';

	// Stores
	import { page } from '$app/state';
	import { storeListboxValue } from '@stores/store.svelte';
	// Components
	import { showCloneModal, showScheduleModal, showStatusChangeConfirm } from '@utils/modalUtils';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Access user data from page context
	const user = $derived(page.data?.user);
	const isAdmin = $derived(page.data?.isAdmin === true);

	type ActionType = 'create' | 'archive' | keyof typeof StatusTypes;

	// Props
	let {
		isCollectionEmpty = false,
		hasSelections = false,
		selectedCount = 0,
		selectedStatuses = [],
		showDeleted = $bindable(false),
		create = () => {},
		publish = () => {},
		unpublish = () => {},
		schedule = (date: string, action: string) => {},
		clone = () => {},
		delete: deleteAction = (isPermanent?: boolean) => {},
		test = () => {}
	} = $props<{
		isCollectionEmpty?: boolean;
		hasSelections?: boolean;
		selectedCount?: number;
		selectedStatuses?: string[];
		showDeleted?: boolean;
		create: () => void;
		publish: () => void;
		unpublish: () => void;
		schedule: (date: string, action: string) => void;
		clone: () => void;
		delete: (isPermanent?: boolean) => void;
		test: () => void;
	}>();

	// States
	let dropdownOpen = $state(false);
	let actionName = $state('');
	let buttonClass = $state('');
	let iconValue = $state('');

	// Modal Trigger - Schedule
	function openScheduleModal(): void {
		showScheduleModal({
			onSchedule: (date: Date, action: string) => {
				schedule(date.toISOString(), action);
			}
		});
	}

	// his function only calls the event handlers that the parent component (`EntryList.svelte`) listens for
	function handleButtonClick(event: Event) {
		event.preventDefault();

		// This function now only calls the parent's event handlers.
		switch (storeListboxValue.value) {
			case 'create':
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
			case 'clone':
				openCloneModal(); // Open colorful confirmation modal
				break;
			case 'archive':
				// Call parent's delete function with archive mode
				deleteAction(false); // false = archive
				break;
			case 'delete':
				// Call parent's delete function with permanent delete mode
				deleteAction(true); // true = permanent delete
				break;
			case 'test':
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

	// Enhanced Publish Modal with colorful styling
	function openPublishModal(): void {
		showStatusChangeConfirm({
			status: StatusTypes.publish,
			count: selectedCount,
			onConfirm: () => publish()
		});
	}

	// Enhanced Unpublish Modal with colorful styling
	function openUnpublishModal(): void {
		showStatusChangeConfirm({
			status: StatusTypes.unpublish,
			count: selectedCount,
			onConfirm: () => unpublish()
		});
	}

	// Enhanced Clone Modal with colorful styling
	function openCloneModal(): void {
		showCloneModal({
			count: selectedCount,
			onConfirm: () => clone()
		});
	}

	// Dynamic buttonMap based on configuration and user role
	const buttonMap = $derived(
		(() => {
			const baseMap: Record<string, [string, string, string, string]> = {
				create: [m.entrylist_multibutton_create(), 'gradient-tertiary', 'ic:round-plus', 'text-tertiary-500'],
				publish: [m.entrylist_multibutton_publish(), 'gradient-primary', 'bi:hand-thumbs-up-fill', 'text-primary-500'],
				unpublish: [m.entrylist_multibutton_unpublish(), 'gradient-yellow', 'bi:pause-circle', 'text-yellow-500'],
				schedule: [m.entrylist_multibutton_schedule(), 'gradient-pink', 'bi:clock', 'text-pink-500'],
				clone: [m.entrylist_multibutton_clone(), 'gradient-secondary', 'bi:clipboard-data-fill', 'text-secondary-500'],
				test: [m.entrylist_multibutton_testing(), 'gradient-error', 'icon-park-outline:preview-open', 'text-error-500']
			};

			// Handle delete/archive options based on configuration and user role
			if (publicEnv.USE_ARCHIVE_ON_DELETE) {
				// When archiving is enabled
				if (isAdmin) {
					// Admins see both archive and delete options
					baseMap.archive = ['Archive', 'gradient-warning', 'bi:archive-fill', 'text-warning-500'];
					baseMap.delete = [m.button_delete(), 'gradient-error', 'bi:trash3-fill', 'text-error-500'];
				} else {
					// Non-admin users only see archive option (labeled as "Delete" for UX)
					baseMap.delete = ['Archive', 'gradient-warning', 'bi:archive-fill', 'text-warning-500'];
				}
			} else {
				// When archiving is disabled, everyone sees delete
				baseMap.delete = [m.button_delete(), 'gradient-error', 'bi:trash3-fill', 'text-error-500'];
			}
			return baseMap;
		})()
	);

	// Update button display when storeListboxValue changes using root effect
	$effect(() => {
		const [action, buttonStyle, icon] = buttonMap[storeListboxValue.value as ActionType] || ['', '', '', ''];
		actionName = action;
		iconValue = icon;
		buttonClass = `btn ${buttonStyle} rounded-none w-36 justify-between`;
	});

	// Smart state management based on collection state and selections
	$effect(() => {
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
<div class="relative z-20 mt-1 flex items-center font-medium text-white">
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
					{#if hasSelections && selectedCount > 0 && storeListboxValue.value !== 'create'}
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
							<iconify-icon icon={icon as string} width="24" class=""></iconify-icon>
							<p class="w-full">
								{label}
							</p>
						</button>
					</li>
				{/if}
			{/each}
		</ul>
	{/if}
</div>
