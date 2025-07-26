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
	import { saveEntry } from '@utils/entryActions'; // Only import what's actually used
	// Types
	import { StatusTypes } from '@src/content/types';
	import ScheduleModal from './collectionDisplay/ScheduleModal.svelte';
	import TranslationStatus from './collectionDisplay/TranslationStatus.svelte';
	import { getModalStore, getToastStore } from '@skeletonlabs/skeleton';
	import { invalidateCollectionCache, batchUpdateEntries, updateEntryStatus, createEntry } from '@src/utils/apiClient';
	import { publicEnv } from '@root/config/public';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Get store instances
	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Modal types import
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';

	// Stores
	import { page } from '$app/state';
	import { collection, collectionValue, mode, statusMap } from '@src/stores/collectionStore.svelte';
	import { screenSize } from '@src/stores/screenSizeStore.svelte';
	import { toggleUIElement, uiStateManager } from '@src/stores/UIStore.svelte';
	import { contentLanguage, headerActionButton, tabSet, validationStore } from '@stores/store.svelte';

	// Types
	import type { User } from '@src/auth/types';
	import type { StatusType } from '@src/content/types';
	let user = $derived(page.data.user as User);

	interface ScheduleResponse {
		date: string;
		action: string;
	}

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
	let showMore = $state<boolean>(false);

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
							status: StatusTypes.schedule,
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

	// Save form data with validation
	async function saveData() {
		if (!validationStore.isValid) {
			console.warn('Save blocked due to validation errors.');
			toastStore.trigger({
				message: m.validation_fix_before_save(),
				background: 'variant-filled-error'
			});
			return;
		}

		const dataToSave = { ...collectionValue.value };

		// Set metadata for all saves
		if (mode.value === 'create') {
			dataToSave.createdBy = user?.username ?? 'system';
		}
		dataToSave.updatedBy = user?.username ?? 'system';

		// Handle scheduling if set
		if (schedule && schedule.trim() !== '') {
			dataToSave._scheduled = new Date(schedule).getTime();
		} else {
			delete dataToSave._scheduled;
		}

		await saveEntry(dataToSave, toastStore);
		toggleUIElement('leftSidebar', screenSize.value === 'LG' ? 'full' : 'collapsed');
	}

	// function to undo the changes made by handleButtonClick
	function handleCancel() {
		mode.set('view');
		toggleUIElement('leftSidebar', screenSize.value === 'LG' ? 'full' : 'collapsed');
	}

	function handleReload() {
		mode.set('edit'); // Keeps it in edit mode, maybe just re-renders
	}

	// Delete confirmation modal
	function openDeleteModal(): void {
		const isArchiving = publicEnv.USE_ARCHIVE_ON_DELETE;

		const modalSettings: ModalSettings = {
			type: 'confirm',
			title: `Please Confirm <span class="text-error-500 font-bold">${isArchiving ? 'Archiving' : 'Deletion'}</span>`,
			body: isArchiving
				? `Are you sure you want to <span class="text-warning-500 font-semibold">archive</span> this entry? Archived items can be restored later.`
				: `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> this entry? This action will remove the entry from the system.`,
			buttonTextConfirm: isArchiving ? 'Archive' : 'Delete',
			buttonTextCancel: 'Cancel',
			meta: {
				buttonConfirmClasses: isArchiving ? 'bg-warning-500 hover:bg-warning-600 text-white' : 'bg-error-500 hover:bg-error-600 text-white'
			},
			response: async (confirmed: boolean) => {
				if (confirmed) {
					const entry = collectionValue.value;
					const coll = collection.value;
					if (!entry?._id || !coll?._id) {
						toastStore.trigger({
							message: 'No entry or collection selected.',
							background: 'variant-filled-warning'
						});
						return;
					}

					try {
						const targetStatus = isArchiving ? StatusTypes.archive : StatusTypes.delete;
						const result = await batchUpdateEntries(coll._id, {
							ids: [entry._id],
							status: targetStatus
						});

						if (result.success) {
							toastStore.trigger({
								message: isArchiving ? 'Entry archived successfully.' : 'Entry deleted successfully.',
								background: 'variant-filled-success'
							});
							mode.set('view');
							collectionValue.set({});
							invalidateCollectionCache(coll._id);
						} else {
							toastStore.trigger({
								message: result.error || `Failed to ${isArchiving ? 'archive' : 'delete'} entry`,
								background: 'variant-filled-error'
							});
						}
					} catch (e) {
						toastStore.trigger({
							message: `Error ${isArchiving ? 'archiving' : 'deleting'} entry: ${(e as Error).message}`,
							background: 'variant-filled-error'
						});
					}
				}
			}
		};
		modalStore.trigger(modalSettings);
	}

	// Publish confirmation modal
	function openPublishModal(): void {
		const modalSettings: ModalSettings = {
			type: 'confirm',
			title: `Please Confirm <span class="text-primary-500 font-bold">Publication</span>`,
			body: `Are you sure you want to <span class="text-primary-500 font-semibold">publish</span> this entry? This will make it visible to the public.`,
			buttonTextConfirm: 'Publish',
			buttonTextCancel: 'Cancel',
			meta: {
				buttonConfirmClasses: 'bg-primary-500 hover:bg-primary-600 text-white'
			},
			response: async (confirmed: boolean) => {
				if (confirmed) {
					const entry = collectionValue.value;
					const coll = collection.value;
					if (!entry?._id || !coll?._id) {
						toastStore.trigger({
							message: 'No entry or collection selected.',
							background: 'variant-filled-warning'
						});
						return;
					}

					try {
						const result = await updateEntryStatus(String(coll._id), String(entry._id), StatusTypes.publish);
						if (result.success) {
							collectionValue.update((cv) => ({ ...cv, status: StatusTypes.publish }));
							toastStore.trigger({
								message: 'Entry published successfully.',
								background: 'variant-filled-success'
							});
						} else {
							toastStore.trigger({
								message: result.error || 'Failed to publish entry',
								background: 'variant-filled-error'
							});
						}
					} catch (e) {
						toastStore.trigger({
							message: `Error publishing entry: ${(e as Error).message}`,
							background: 'variant-filled-error'
						});
					}
				}
			}
		};
		modalStore.trigger(modalSettings);
	}

	// Unpublish confirmation modal
	function openUnpublishModal(): void {
		const modalSettings: ModalSettings = {
			type: 'confirm',
			title: `Please Confirm <span class="text-yellow-500 font-bold">Unpublication</span>`,
			body: `Are you sure you want to <span class="text-yellow-500 font-semibold">unpublish</span> this entry? This will hide it from the public.`,
			buttonTextConfirm: 'Unpublish',
			buttonTextCancel: 'Cancel',
			meta: {
				buttonConfirmClasses: 'bg-yellow-500 hover:bg-yellow-600 text-white'
			},
			response: async (confirmed: boolean) => {
				if (confirmed) {
					const entry = collectionValue.value;
					const coll = collection.value;
					if (!entry?._id || !coll?._id) {
						toastStore.trigger({
							message: 'No entry or collection selected.',
							background: 'variant-filled-warning'
						});
						return;
					}

					try {
						const result = await updateEntryStatus(String(coll._id), String(entry._id), StatusTypes.unpublish);
						if (result.success) {
							collectionValue.update((cv) => ({ ...cv, status: StatusTypes.unpublish }));
							toastStore.trigger({
								message: 'Entry unpublished successfully.',
								background: 'variant-filled-success'
							});
						} else {
							toastStore.trigger({
								message: result.error || 'Failed to unpublish entry',
								background: 'variant-filled-error'
							});
						}
					} catch (e) {
						toastStore.trigger({
							message: `Error unpublishing entry: ${(e as Error).message}`,
							background: 'variant-filled-error'
						});
					}
				}
			}
		};
		modalStore.trigger(modalSettings);
	}

	// Clone confirmation modal
	function openCloneModal(): void {
		const modalSettings: ModalSettings = {
			type: 'confirm',
			title: `Please Confirm <span class="text-secondary-500 font-bold">Cloning</span>`,
			body: `Are you sure you want to <span class="text-secondary-500 font-semibold">clone</span> this entry? This will create a duplicate copy.`,
			buttonTextConfirm: 'Clone',
			buttonTextCancel: 'Cancel',
			meta: {
				buttonConfirmClasses: 'bg-secondary-500 hover:bg-secondary-600 text-white'
			},
			response: async (confirmed: boolean) => {
				if (confirmed) {
					const entry = collectionValue.value;
					const coll = collection.value;
					if (!entry || !coll?._id) {
						toastStore.trigger({
							message: 'No entry or collection selected.',
							background: 'variant-filled-warning'
						});
						return;
					}

					try {
						// Create a deep copy of the entry with all its data
						const clonedPayload = JSON.parse(JSON.stringify(entry));

						// Remove unique identifiers and timestamps
						delete clonedPayload._id;
						delete clonedPayload.createdAt;
						delete clonedPayload.updatedAt;

						// Set clone status and reference to original
						clonedPayload.status = StatusTypes.clone;
						clonedPayload.clonedFrom = entry._id;

						const result = await createEntry(coll._id, clonedPayload);
						if (result.success) {
							toastStore.trigger({
								message: 'Entry cloned successfully.',
								background: 'variant-filled-success'
							});
							invalidateCollectionCache(coll._id);
							mode.set('view');
						} else {
							toastStore.trigger({
								message: result.error || 'Failed to clone entry',
								background: 'variant-filled-error'
							});
						}
					} catch (e) {
						toastStore.trigger({
							message: `Error cloning entry: ${(e as Error).message}`,
							background: 'variant-filled-error'
						});
					}
				}
			}
		};
		modalStore.trigger(modalSettings);
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
						<div class="text-sm capitalize">
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
				{#if ['edit', 'create'].includes(mode.value)}
					<button
						type="button"
						onclick={saveData}
						aria-label="Save"
						class="variant-filled-tertiary btn-icon dark:variant-filled-primary"
						disabled={!validationStore.isValid || collection.value?.permissions?.[user.role]?.write === false}
					>
						<iconify-icon icon="material-symbols:save" width="24" class="text-white"></iconify-icon>
						<span class="hidden lg:block">{m.button_save()}</span>
					</button>
				{/if}

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
					onclick={openDeleteModal}
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
							onclick={openPublishModal}
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
							onclick={openUnpublishModal}
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
						onclick={openCloneModal}
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
