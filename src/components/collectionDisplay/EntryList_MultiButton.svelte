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
	import { publicEnv } from '@root/config/public';

	// Stores
	import { mode, collectionValue } from '@src/stores/collectionStore.svelte';
	import { handleUILayoutToggle } from '@src/stores/UIStore.svelte';
	import { storeListboxValue } from '@stores/store.svelte';
	import { page } from '$app/stores';

	// Components
	import ScheduleModal from './ScheduleModal.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';

	// Initialize the modal store at the top level.
	const modalStore = getModalStore();

	// Access user data from page context
	const user = $derived(page.data?.user);
	const isAdmin = $derived(user?.isAdmin === true);

	type ActionType = 'create' | keyof typeof StatusTypes;

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
		const modalComponent: ModalComponent = { ref: ScheduleModal };
		const modalSettings: ModalSettings = {
			type: 'component',
			title: 'Scheduler',
			body: 'Set a date and time to schedule this entry.',
			component: modalComponent,
			response: (r: { date: string; action: string } | undefined) => {
				if (r) {
					schedule(r.date, r.action);
				}
			}
		};
		modalStore.trigger(modalSettings);
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
			case 'delete':
				openDeleteModal(); // Open colorful confirmation modal
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

	// Enhanced Delete Modal with colorful styling and admin options
	function openDeleteModal(): void {
		const isArchiving = publicEnv.USE_ARCHIVE_ON_DELETE;

		// Check if all selected entries are already archived
		const allEntriesArchived = selectedStatuses.length > 0 && selectedStatuses.every((status) => status === 'archive');

		// For admin users when archiving is enabled
		if (isAdmin && isArchiving) {
			// If all selected entries are already archived, go straight to permanent delete confirmation
			if (allEntriesArchived) {
				openPermanentDeleteConfirmation();
				return;
			}
			// Otherwise, show admin options modal
			openAdminDeleteModal();
			return;
		}

		// Standard modal for non-admin users or when archiving is disabled
		const modalSettings: ModalSettings = {
			type: 'confirm',
			title: isArchiving
				? `Please Confirm <span class="text-warning-500 font-bold">Archiving</span>`
				: `Please Confirm <span class="text-error-500 font-bold">Deletion</span>`,
			body: isArchiving
				? selectedCount === 1
					? `Are you sure you want to <span class="text-warning-500 font-semibold">archive</span> this entry? Archived items can be restored later.`
					: `Are you sure you want to <span class="text-warning-500 font-semibold">archive</span> <span class="text-tertiary-500 font-medium">${selectedCount} entries</span>? Archived items can be restored later.`
				: selectedCount === 1
					? `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> this entry? This action cannot be undone and will permanently remove the entry from the system.`
					: `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> <span class="text-tertiary-500 font-medium">${selectedCount} entries</span>? This action cannot be undone and will permanently remove all selected entries from the system.`,
			buttonTextConfirm: isArchiving ? 'Archive' : 'Delete',
			buttonTextCancel: 'Cancel',
			meta: {
				buttonConfirmClasses: isArchiving ? 'bg-warning-500 hover:bg-warning-600 text-white' : 'bg-error-500 hover:bg-error-600 text-white'
			},
			response: (confirmed: boolean) => {
				if (confirmed) {
					deleteAction(false);
				}
			}
		};
		modalStore.trigger(modalSettings);
	}

	// Admin Delete Modal with options for both archive and permanent delete
	function openAdminDeleteModal(): void {
		const entryText = selectedCount === 1 ? 'entry' : `${selectedCount} entries`;

		const modalSettings: ModalSettings = {
			type: 'confirm',
			title: `<span class="text-primary-500 font-bold">Admin Delete Options</span>`,
			body: `
                <div class="space-y-4">
                    <p class="text-surface-700 dark:text-surface-300 mb-4">
                        As an administrator, you can choose how to handle the selected ${entryText}:
                    </p>
                    <div class="space-y-3">
                        <div class="flex items-center gap-3 p-3 border border-warning-300 rounded-lg bg-warning-50 dark:bg-warning-900/20">
                            <iconify-icon icon="bi:archive-fill" width="20" class="text-warning-600"></iconify-icon>
                            <div>
                                <div class="font-semibold text-warning-700 dark:text-warning-300">Archive ${entryText}</div>
                                <div class="text-sm text-warning-600 dark:text-warning-400">Hide from view but keep in database (can be restored)</div>
                            </div>
                        </div>
                        <div class="flex items-center gap-3 p-3 border border-error-300 rounded-lg bg-error-50 dark:bg-error-900/20">
                            <iconify-icon icon="bi:trash3-fill" width="20" class="text-error-600"></iconify-icon>
                            <div>
                                <div class="font-semibold text-error-700 dark:text-error-300">Permanently Delete ${entryText}</div>
                                <div class="text-sm text-error-600 dark:text-error-400">Remove completely from database (cannot be undone)</div>
                            </div>
                        </div>
                    </div>
                    <p class="text-xs text-surface-500 mt-4">
                        Click "Archive" below to archive the ${entryText}, or "Cancel" to choose permanent deletion.
                    </p>
                </div>
            `,
			buttonTextConfirm: 'Archive',
			buttonTextCancel: 'Permanent Delete',
			meta: {
				buttonConfirmClasses: 'bg-warning-500 hover:bg-warning-600 text-white',
				buttonCancelClasses: 'bg-error-500 hover:bg-error-600 text-white'
			},
			response: (confirmed: boolean) => {
				if (confirmed) {
					// Archive action (default confirm button)
					deleteAction(false);
				} else {
					// Show permanent delete confirmation
					openPermanentDeleteConfirmation();
				}
			}
		};
		modalStore.trigger(modalSettings);
	}

	// Confirmation modal for permanent deletion
	function openPermanentDeleteConfirmation(): void {
		const entryText = selectedCount === 1 ? 'entry' : `${selectedCount} entries`;
		const allEntriesArchived = selectedStatuses.length > 0 && selectedStatuses.every((status) => status === 'archive');

		const modalSettings: ModalSettings = {
			type: 'confirm',
			title: `<span class="text-error-500 font-bold">Confirm Permanent Deletion</span>`,
			body: `
                <div class="space-y-4">
                    <div class="flex items-center gap-3 p-3 border border-error-300 rounded-lg bg-error-50 dark:bg-error-900/20">
                        <iconify-icon icon="bi:exclamation-triangle-fill" width="24" class="text-error-600"></iconify-icon>
                        <div>
                            <div class="font-semibold text-error-700 dark:text-error-300">Warning: This action cannot be undone!</div>
                            <div class="text-sm text-error-600 dark:text-error-400">
                                You are about to permanently delete ${allEntriesArchived ? 'archived' : ''} ${entryText} from the database.
                            </div>
                        </div>
                    </div>
                    <p class="text-surface-700 dark:text-surface-300">
                        This will completely remove the ${entryText} from the system. Unlike archiving, this action is irreversible.
                    </p>
                    ${
											allEntriesArchived
												? `
                        <p class="text-sm text-warning-600 dark:text-warning-400 bg-warning-50 dark:bg-warning-900/20 p-2 rounded">
                            <iconify-icon icon="bi:info-circle-fill" width="16" class="inline mr-1"></iconify-icon>
                            These entries are currently archived. Deleting them will remove them permanently.
                        </p>
                    `
												: ''
										}
                    <p class="text-sm text-surface-600 dark:text-surface-400">
                        Are you absolutely sure you want to proceed with permanent deletion?
                    </p>
                </div>
            `,
			buttonTextConfirm: 'Yes, Permanently Delete',
			buttonTextCancel: 'Cancel',
			meta: {
				buttonConfirmClasses: 'bg-error-500 hover:bg-error-600 text-white'
			},
			response: (confirmed: boolean) => {
				if (confirmed) {
					deleteAction(true);
				}
			}
		};
		modalStore.trigger(modalSettings);
	} // Enhanced Publish Modal with colorful styling
	function openPublishModal(): void {
		const modalSettings: ModalSettings = {
			type: 'confirm',
			title: `Please Confirm <span class="text-primary-500 font-bold">Publication</span>`,
			body:
				selectedCount === 1
					? `Are you sure you want to <span class="text-primary-500 font-semibold">publish</span> this entry? This will make it visible to the public.`
					: `Are you sure you want to <span class="text-primary-500 font-semibold">publish</span> <span class="text-tertiary-500 font-medium">${selectedCount} entries</span>? This will make all selected entries visible to the public.`,
			buttonTextConfirm: 'Publish',
			buttonTextCancel: 'Cancel',
			meta: { buttonConfirmClasses: 'bg-primary-500 hover:bg-primary-600 text-white' },
			response: (confirmed: boolean) => {
				if (confirmed) {
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
			title: `Please Confirm <span class="text-yellow-500 font-bold">Unpublication</span>`,
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
			title: `Please Confirm <span class="text-secondary-500 font-bold">Cloning</span>`,
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

	const buttonMap: Record<string, [string, string, string, string]> = {
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
	<!-- View Deleted Toggle -->
	<button
		class="variant-ghost-surface btn mr-2 flex items-center gap-2"
		onclick={() => (showDeleted = !showDeleted)}
		title={showDeleted ? 'View active entries' : 'View archived entries'}
	>
		<iconify-icon icon={showDeleted ? 'bi:eye-slash-fill' : 'bi:archive-fill'} width="20"></iconify-icon>
		<span class="hidden sm:inline">{showDeleted ? 'Active' : 'Archive'}</span>
	</button>
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
