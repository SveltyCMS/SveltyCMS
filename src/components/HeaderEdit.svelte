<!-- 
 @file  src/components/HeaderEdit.svelte
 @component
 **HeaderEdit component**
 The HeaderEdit component manages the collection entry header for both "edit" and "view" modes. 
 It provides functionality for toggling sidebar visibility, saving form data, handling modal dialogs for scheduling, 
 and managing language or tab-specific temporary data. The header also adapts to mobile/desktop views 
 and offers options for actions like publishing, deleting, or scheduling entries, while maintaining accessibility and responsive design.

@example
 <HeaderEdit />

 #### Props:
 - `collection` {object} - Collection object

 Features:
 - Sidebar toggle (for mobile/desktop)
 - Collection entry management with mode switching (view/edit)
 - Save form data with validation
 - Modal dialogs for scheduling entries
 - Language and tab-specific temporary data management
 - Responsive UI with adaptive actions for mobile and desktop
 - Role-based permissions handling for actions (publish, delete, etc.)
 - Accessible icons and buttons using ARIA attributes
 - Debounced "Show More" actions for performance optimization
 - Cancel and reload functionality for editing mode
 - Full dark mode support with theme-based styling
-->
<script lang="ts">
	// mport apiRequest for general requests, and entryActions for specific entity actions
	import { apiRequest } from '@utils/apiClient';
	import { deleteCurrentEntry, setEntryStatus, cloneCurrentEntry } from '@utils/entryActions'; // Directly use these specific actions

	// Components
	import ScheduleModal from './ScheduleModal.svelte';
	import TranslationStatus from './TranslationStatus.svelte';
	// Skeleton
	import { getModalStore, getToastStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';
	// Initialize stores at the top level, during component initialization.
	const modalStore = getModalStore();
	const toastStore = getToastStore();

	// Stores
	import { page } from '$app/state';
	import { collection, collectionValue, mode, statusMap } from '@src/stores/collectionStore.svelte';
	import { screenSize } from '@src/stores/screenSizeStore.svelte';
	import { toggleUIElement, uiStateManager } from '@src/stores/UIStore.svelte';
	import { contentLanguage, headerActionButton, tabSet, validationStore } from '@stores/store.svelte';
	// Auth
	import type { User } from '@src/auth/types';
	let user = $derived(page.data.user as User);

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	interface ScheduleResponse {
		date: string;
		action: string;
	}

	// Define StatusType based on statusMap values
	type StatusType = (typeof statusMap)[keyof typeof statusMap];

	interface CollectionData extends Record<string, any> {
		_id?: string;
		status?: StatusType;
		_scheduled?: number;
		createdAt?: number;
		updatedAt?: number;
		createdBy?: string;
		updatedBy?: string;
	}

	// State declarations with proper types
	let previousLanguage = $state<string>(contentLanguage.value);
	let previousTabSet = $state<number>(tabSet.value);
	let tempData = $state<Partial<Record<string, CollectionData>>>({});
	let schedule = $state<string>(
		typeof collectionValue.value?._scheduled === 'number' ? new Date(collectionValue.value._scheduled).toISOString().slice(0, 16) : ''
	);
	let createdAtDate = $state<string>(
		typeof collectionValue.value?.createdAt === 'number' ? new Date(collectionValue.value.createdAt * 1000).toISOString().slice(0, 16) : ''
	);
	let saveLayerStore = $state<() => Promise<void>>(async () => {});
	let showMore = $state<boolean>(false);
	let next = $state<() => Promise<void>>(() => Promise.resolve());

	// Modal Trigger - Schedule
	function openScheduleModal(): void {
		const modalComponent: ModalComponent = {
			ref: ScheduleModal,
			slot: '<p>Edit Form</p>' // Note: This slot content usually overrides ScheduleModal's own content, consider if truly desired.
		};

		const modalSettings: ModalSettings = {
			type: 'component',
			title: m.scheduler_title(),
			body: m.scheduler_body(),
			component: modalComponent,
			response: (r: ScheduleResponse | boolean) => {
				if (typeof r === 'object' && 'date' in r) {
					schedule = r.date;
					if (r.action === 'schedule') {
						const newValue = {
							...collectionValue.value,
							status: statusMap.schedule as StatusType,
							_scheduled: new Date(r.date).getTime()
						};
						collectionValue.set(newValue);
					}
				}
			}
		};
		modalStore.trigger(modalSettings);
	}

	$effect(() => {
		if (tabSet.value !== previousTabSet) {
			tempData[previousLanguage] = collectionValue.value;
			previousTabSet = tabSet.value;
		}
	});

	$effect(() => {
		if (mode.value === 'view') {
			tempData = {};
		}
	});

	$effect(() => {
		if (mode.value === 'edit' || mode.value === 'create') {
			showMore = false;
		}
	});

	$effect(() => {
		next = saveLayerStore;
	});

	// Save form data with validation
	async function saveData() {
		const currentCollection = collection.value;
		if (!currentCollection?._id) {
			// Ensure collection and its ID exist
			toastStore.trigger({
				message: m.save_no_collection_error(),
				background: 'variant-filled-error'
			});
			return;
		}

		if (!validationStore.isValid) {
			console.warn('Save blocked due to validation errors.');
			toastStore.trigger({
				message: m.validation_fix_before_save(),
				background: 'variant-filled-error'
			});
			return;
		}

		const dataToSave = { ...collectionValue.value };
		if (mode.value === 'create') dataToSave.createdBy = user?.username ?? 'system';
		dataToSave.updatedBy = user?.username ?? 'system';

		if (schedule && schedule.trim() !== '') {
			dataToSave._scheduled = new Date(schedule).getTime();
		} else {
			delete dataToSave._scheduled;
		}

		const method = mode.value === 'create' ? 'POST' : 'PATCH';
		const entryId = mode.value === 'edit' ? (dataToSave._id as string) : undefined;

		// Validation for edit mode - ensure we have an entryId
		if (mode.value === 'edit' && !entryId) {
			console.error('No entry ID found for edit operation');
			toastStore.trigger({
				message: 'Cannot update entry: No entry ID found',
				background: 'variant-filled-error'
			});
			return;
		}

		try {
			// Use apiRequest directly for saving, as entryActions covers specific non-save actions.
			await apiRequest(method, currentCollection._id, dataToSave, entryId);

			toastStore.trigger({ message: m.save_success(), background: 'variant-filled-success' });
			mode.set('view');
			toggleUIElement('leftSidebar', screenSize.value === 'LG' ? 'full' : 'collapsed');
		} catch (err) {
			console.error('Failed to save data:', err);
			toastStore.trigger({
				message: (err as Error).message || 'An unexpected error occurred.',
				background: 'variant-filled-error',
				timeout: 3000
			});
		}
	}

	// function to undo the changes made by handleButtonClick
	function handleCancel() {
		mode.set('view');
		toggleUIElement('leftSidebar', screenSize.value === 'LG' ? 'full' : 'collapsed');
	}

	function handleReload() {
		mode.set('edit'); // Keeps it in edit mode, maybe just re-renders
	}
</script>

<header
	class="border-secondary-600-300-token sticky top-0 z-10 flex w-full items-center justify-between bg-white p-2 dark:bg-surface-700"
	class:border-b={!showMore}
>
	<div class="flex items-center justify-start">
		{#if uiStateManager.uiState.value.leftSidebar === 'hidden'}
			<button
				type="button"
				onclick={() => toggleUIElement('leftSidebar', screenSize.value === 'LG' ? 'full' : 'collapsed')}
				aria-label="Toggle Sidebar"
				class="variant-ghost-surface btn-icon mt-1"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</button>
		{/if}

		{#if collection.value}
			<div class="flex {!uiStateManager.uiState.value.leftSidebar ? 'ml-2' : 'ml-1'}">
				{#if collection.value.icon}
					<div class="flex items-center justify-center">
						<iconify-icon icon={collection.value.icon} width="24" class="text-error-500"></iconify-icon>
					</div>
				{/if}
				{#if collection.value.name}
					<div class="ml-2 flex flex-col text-left font-bold">
						<div class="text-sm uppercase">
							{mode.value}:
						</div>
						<div class="text-xs capitalize">
							<span class="uppercase text-tertiary-500 dark:text-primary-500">{collection.value.name}</span>
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<div class="flex items-center justify-end gap-1 sm:gap-2 md:gap-4">
		{#if screenSize.value === 'MD' || screenSize.value === 'SM' || screenSize.value === 'XS'}
			{#if showMore}
				<button type="button" onclick={next} aria-label="Next" class="variant-filled-tertiary btn-icon dark:variant-filled-primary">
					<iconify-icon icon="carbon:next-filled" width="24" class="text-white"></iconify-icon>
					<span class="hidden lg:block">{m.button_next()}</span>
				</button>

				<button
					type="button"
					onclick={() => (showMore = !showMore)}
					aria-label="Hide extra actions"
					class="variant-filled-tertiary btn-icon text-white"
				>
					<iconify-icon icon="material-symbols:filter-list-rounded" width="30"></iconify-icon>
				</button>
			{:else}
				<div class="flex-col items-center justify-center md:flex">
					<TranslationStatus />
				</div>

				{#if ['edit', 'create'].includes(mode.value)}
					<button
						type="button"
						onclick={saveData}
						disabled={collection.value?.permissions?.[user.role]?.write === false}
						class="variant-filled-tertiary btn-icon dark:variant-filled-primary lg:hidden"
						aria-label="Save entry"
					>
						<iconify-icon icon="material-symbols:save" width="24" class="text-white"></iconify-icon>
					</button>
				{/if}
				<button type="button" onclick={() => (showMore = !showMore)} aria-label="Show more actions" class="variant-ghost-surface btn-icon">
					<iconify-icon icon="material-symbols:filter-list-rounded" width="30"></iconify-icon>
				</button>
			{/if}
		{:else}
			<div class="hidden flex-col items-center justify-center md:flex">
				<TranslationStatus />
			</div>
		{/if}

		{#if !headerActionButton.value}
			<button type="button" onclick={handleCancel} aria-label="Cancel" class="variant-ghost-surface btn-icon">
				<iconify-icon icon="material-symbols:close" width="24"></iconify-icon>
			</button>
		{:else}
			<button type="button" onclick={handleReload} aria-label="Reload" class="variant-ghost-surface btn-icon">
				<iconify-icon icon="fa:refresh" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
			</button>
		{/if}
	</div>
</header>

{#if showMore}
	<div class="-mx-2 mb-2 flex flex-col items-center justify-center gap-3 border-b pt-2">
		<div class="flex items-center justify-center gap-3">
			<div class="flex flex-col items-center justify-center">
				<button
					type="button"
					onclick={deleteCurrentEntry}
					disabled={collection.value?.permissions?.[user.role]?.delete === false}
					class="gradient-error gradient-error-hover gradient-error-focus btn-icon"
					aria-label="Delete entry"
				>
					<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon>
				</button>
			</div>

			{#if mode.value == 'edit'}
				{#if collectionValue.value?.status == statusMap.unpublish}
					<div class="flex flex-col items-center justify-center">
						<button
							type="button"
							onclick={() => setEntryStatus('publish')}
							disabled={!(collection.value?.permissions?.[user.role]?.write && collection.value?.permissions?.[user.role]?.create)}
							class="gradient-tertiary gradient-tertiary-hover gradient-tertiary-focus btn-icon"
							aria-label="Publish entry"
						>
							<iconify-icon icon="bi:hand-thumbs-up-fill" width="24"></iconify-icon>
						</button>
					</div>

					<div class="flex flex-col items-center justify-center">
						<button
							type="button"
							onclick={openScheduleModal}
							disabled={!collection.value?.permissions?.[user.role]?.write}
							class="gradient-pink gradient-pink-hover gradient-pink-focus btn-icon"
							aria-label="Schedule entry"
						>
							<iconify-icon icon="bi:clock" width="24"></iconify-icon>
						</button>
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center">
						<button
							type="button"
							onclick={() => setEntryStatus('unpublish')}
							disabled={!collection.value?.permissions?.[user.role]?.write}
							class="gradient-yellow gradient-yellow-hover gradient-yellow-focus btn-icon"
							aria-label="Unpublish entry"
						>
							<iconify-icon icon="bi:pause-circle" width="24"></iconify-icon>
						</button>
					</div>
				{/if}

				<div class="flex flex-col items-center justify-center">
					<button
						type="button"
						onclick={cloneCurrentEntry}
						disabled={!(collection.value?.permissions?.[user.role]?.write && collection.value?.permissions?.[user.role]?.create)}
						aria-label="Clone entry"
						class="gradient-secondary gradient-secondary-hover gradient-secondary-focus btn-icon"
					>
						<iconify-icon icon="bi:clipboard-data-fill" width="24"></iconify-icon>
					</button>
				</div>
			{/if}
		</div>

		<div class="w-full px-4">
			<div class="mt-2 flex w-full flex-col items-start justify-center">
				<p class="mb-1 text-sm">Created At</p>
				<input
					type="datetime-local"
					bind:value={createdAtDate}
					class="variant-filled-surface w-full p-2 text-left text-sm"
					aria-label="Set creation date"
				/>
			</div>

			{#if schedule}
				<div class="mt-2 text-sm text-tertiary-500">
					Will publish on: {new Date(schedule).toLocaleString()}
				</div>
			{/if}

			<div class="mt-2 text-sm">
				<p>Created by: {collectionValue.value?.createdBy || user.username}</p>
				{#if collectionValue.value?.updatedBy}
					<p class="text-tertiary-500">
						Last updated by: {collectionValue.value.updatedBy}
					</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
