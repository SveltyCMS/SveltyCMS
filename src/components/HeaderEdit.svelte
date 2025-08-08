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
	import { saveEntry, deleteCurrentEntry } from '@utils/entryActions'; // Import centralized delete function
	// Types
	import { StatusTypes } from '@src/content/types';
	import ScheduleModal from './collectionDisplay/ScheduleModal.svelte';
	import TranslationStatus from './collectionDisplay/TranslationStatus.svelte';
	import Toggles from './system/inputs/Toggles.svelte';
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
	let isAdmin = $derived(page.data.isAdmin || false);

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

	// Status management using collection status directly
	let isPublish = $derived(() => {
		const currentStatus = collectionValue.value?.status || collection.value?.status || StatusTypes.unpublish;
		console.log('[HeaderEdit] Status Debug:', {
			collectionValueStatus: collectionValue.value?.status,
			collectionStatus: collection.value?.status,
			finalStatus: currentStatus,
			isPublish: currentStatus === StatusTypes.publish,
			StatusTypes
		});
		return currentStatus === StatusTypes.publish;
	});
	let isLoading = $state(false);

	// Handle toggle changes - update collection status directly
	async function handleStatusToggle(newValue: boolean) {
		if (newValue === isPublish || isLoading) {
			console.log('[HeaderEdit] Toggle skipped', { newValue, isPublish, isLoading });
			return false;
		}

		isLoading = true;
		const newStatus = newValue ? StatusTypes.publish : StatusTypes.unpublish;
		console.log('[HeaderEdit] Status toggle clicked - updating to:', newStatus);

		try {
			// If entry exists, update via API
			if (collectionValue.value?._id && collection.value?._id) {
				const result = await updateEntryStatus(String(collection.value._id), String(collectionValue.value._id), newStatus);

				if (result.success) {
					// Update the collection value store
					collectionValue.update((current) => ({ ...current, status: newStatus }));

					toastStore.trigger({
						message: newValue ? 'Entry published successfully.' : 'Entry unpublished successfully.',
						background: 'variant-filled-success'
					});

					console.log('[HeaderEdit] API update successful');
					return true;
				} else {
					toastStore.trigger({
						message: result.error || `Failed to ${newValue ? 'publish' : 'unpublish'} entry`,
						background: 'variant-filled-error'
					});

					console.error('[HeaderEdit] API update failed:', result.error);
					return false;
				}
			} else {
				// New entry - just update local state
				collectionValue.update((current) => ({ ...current, status: newStatus }));
				console.log('[HeaderEdit] Local update for new entry');
				return true;
			}
		} catch (e) {
			const errorMessage = `Error ${newValue ? 'publishing' : 'unpublishing'} entry: ${(e as Error).message}`;
			toastStore.trigger({
				message: errorMessage,
				background: 'variant-filled-error'
			});

			console.error('[HeaderEdit] Toggle error:', e);
			return false;
		} finally {
			isLoading = false;
		}
	}

	// Disable toggle when RightSidebar is active (desktop) or in edit mode if not primary
	const shouldDisableStatusToggle = $derived(
		(mode.value === 'create' && uiStateManager.isRightSidebarVisible.value) ||
			(mode.value === 'edit' && uiStateManager.isRightSidebarVisible.value && screenSize.value === 'LG') ||
			isLoading
	);
	$effect(() => {
		// Only log when HeaderEdit is actually active (not disabled by RightSidebar)
		if (!shouldDisableStatusToggle) {
			console.log('[HeaderEdit] Status Debug (Active):', {
				collectionValueStatus: collectionValue.value?.status,
				collectionStatus: collection.value?.status,
				finalStatus: isPublish ? StatusTypes.publish : StatusTypes.unpublish,
				isPublish: isPublish,
				mode: mode.value,
				screenSize: screenSize.value,
				shouldDisableStatusToggle: shouldDisableStatusToggle
			});
		}
	}); // Modal Trigger - Schedule
	function openScheduleModal(): void {
		const modalComponent: ModalComponent = { ref: ScheduleModal };

		const modalSettings: ModalSettings = {
			type: 'component',
			title: m.scheduler_title(),
			body: m.scheduler_body(),
			component: modalComponent,
			response: (r: ScheduleResponse | boolean) => {
				if (typeof r === 'object' && 'date' in r) {
					schedule = r.date;
					if (r.action === 'schedule') {
						collectionValue.update((cv) => ({
							...cv,
							status: StatusTypes.schedule,
							_scheduled: new Date(r.date).getTime()
						}));
						console.log('[HeaderEdit] Entry scheduled');
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

	// Status Store Effects removed: statusStore is not used, use local status logic only

	// Save form data with validation
	async function saveData() {
		if (!validationStore.isValid) {
			console.warn('[HeaderEdit] Save blocked due to validation errors.');
			toastStore.trigger({
				message: m.validation_fix_before_save(),
				background: 'variant-filled-error'
			});
			return;
		}

		const dataToSave = { ...collectionValue.value };

		// Status rules: Schedule takes precedence, otherwise use current collection status
		if (schedule && schedule.trim() !== '') {
			dataToSave.status = StatusTypes.schedule;
			dataToSave._scheduled = new Date(schedule).getTime();
		} else {
			dataToSave.status = collectionValue.value?.status || collection.value?.status || StatusTypes.unpublish;
			delete dataToSave._scheduled;
		}

		// Set metadata for all saves
		if (mode.value === 'create') {
			dataToSave.createdBy = user?.username ?? 'system';
		}
		dataToSave.updatedBy = user?.username ?? 'system';

		console.log('[HeaderEdit] Saving with status:', dataToSave.status, 'collectionValue.status:', collectionValue.value?.status);

		await saveEntry(dataToSave, toastStore);
		toggleUIElement('leftSidebar', screenSize.value === 'LG' ? 'full' : 'collapsed');
	}

	// function to undo the changes made by handleButtonClick
	function handleCancel() {
		// Clear collectionValue before setting mode to 'view' to prevent auto-draft save
		if (mode.value === 'create') {
			console.log('[HeaderEdit] Cancel in create mode - clearing collectionValue to prevent auto-draft');
			collectionValue.set({});
		}
		mode.set('view');
		toggleUIElement('leftSidebar', screenSize.value === 'LG' ? 'full' : 'collapsed');
	}

	function handleReload() {
		mode.set('edit'); // Keeps it in edit mode, maybe just re-renders
	}

	// Delete confirmation modal - use centralized function
	function openDeleteModal(): void {
		deleteCurrentEntry(modalStore, toastStore, isAdmin);
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
			<!-- Add status toggle to second row on mobile -->
			<div class="flex flex-col items-center justify-center">
				<Toggles
					bind:value={isPublish}
					disabled={shouldDisableStatusToggle || isLoading}
					onChange={handleStatusToggle}
					title={shouldDisableStatusToggle ? 'Status managed by sidebar in create mode' : isPublish ? m.status_publish() : m.status_unpublish()}
					aria-label={isPublish ? m.status_publish() : m.status_unpublish()}
				/>
				<span class="mt-1 text-xs {isPublish ? 'text-primary-500' : 'text-error-500'}">
					{isPublish ? m.status_publish() : m.status_unpublish()}
				</span>
			</div>

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

			<!-- Keep only schedule and clone buttons for edit/create modes -->
			{#if ['edit', 'create'].includes(mode.value)}
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

				<div class="flex flex-col items-center justify-center">
					<button
						type="button"
						onclick={openCloneModal}
						disabled={!(collection.value?.permissions?.[user.role]?.write && collection.value?.permissions?.[user.role]?.create)}
						class="gradient-secondary gradient-secondary-hover gradient-secondary-focus btn-icon"
						aria-label="Clone entry"
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
