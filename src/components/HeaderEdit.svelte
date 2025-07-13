<!-- 
 @file  src/components/HeaderEdit.svelte
 @component
 **HeaderEdit component**
 The HeaderEdit component manages the collection entry header for both "edit" and "view" modes. 
 It provides functionality for toggling sidebar visibility, saving form data, handling modal dialogs for scheduling, 
 and managing language or tab-specific temporary data. The header also adapts to mobile/desktop views 
 and offers options for actions like publishing, deleting, or scheduling entries, while maintaining accessibility and responsive design.
 All actions are delegated to the API 
 service layer in `utils/data.ts` for a clean and maintainable implementation.

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
	// API Service
	import { addData, updateData, setStatus } from '@utils/data';

	// Components
	import ScheduleModal from './ScheduleModal.svelte';
	import TranslationStatus from './TranslationStatus.svelte';
	// Skeleton
	import { getModalStore, getToastStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';
	// Stores
	import { page } from '$app/stores';
	import { collection, collectionValue, mode } from '@src/stores/collectionStore.svelte';
	import { screenSize } from '@src/stores/screenSizeStore.svelte';
	import { toggleUIElement, uiStateManager } from '@src/stores/UIStore.svelte';
	import { headerActionButton, validationStore } from '@stores/store.svelte';
	// Auth & Types
	import type { User } from '@src/auth/types';
	import type { ContentTypes } from '@src/types';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// --- Component State ---
	let user: User = $derived(page.data.user as User);
	let showMore = $state<boolean>(false);
	let isLoading = $state<boolean>(false);

	// --- Derived State ---
	let isPublished = $derived(collectionValue.value?.status === 'published');
	let isMobile = $derived(['MD', 'SM', 'XS'].includes(screenSize.value));
	let createdAtDate = $derived(
		collectionValue.value?.createdAt ? new Date(Number(collectionValue.value.createdAt) * 1000).toISOString().slice(0, 16) : ''
	);

	// --- Effects ---
	$effect(() => {
		if (mode.value === 'edit' || mode.value === 'create') {
			showMore = false;
		}
	});

	// --- Action Handlers ---

	async function handleSave() {
		const toastStore = getToastStore();
		if (!validationStore.isValid) {
			toastStore.trigger({ message: 'Please fix validation errors before saving.', background: 'variant-filled-error' });
			return;
		}

		const currentCollectionId = collection.value?._id as keyof ContentTypes;
		if (!currentCollectionId) {
			toastStore.trigger({ message: 'Collection ID is missing.', background: 'variant-filled-error' });
			return;
		}

		isLoading = true;
		try {
			const dataToSave = { ...collectionValue.value };
			if (mode.value === 'create') {
				dataToSave.createdBy = user?.username ?? 'system';
				await addData(currentCollectionId, dataToSave);
				toastStore.trigger({ message: 'Entry created successfully!', background: 'variant-filled-success' });
			} else {
				dataToSave.updatedBy = user?.username ?? 'system';
				await updateData(currentCollectionId, dataToSave);
				toastStore.trigger({ message: 'Entry updated successfully!', background: 'variant-filled-success' });
			}
			mode.set('view');
		} catch (err: any) {
			toastStore.trigger({ message: err.message || 'An unknown error occurred.', background: 'variant-filled-error' });
		} finally {
			isLoading = false;
		}
	}

	async function handleSetStatus(newStatus: 'published' | 'unpublished' | 'deleted' | 'scheduled', scheduleTime?: number) {
		const toastStore = getToastStore();
		const entryId = collectionValue.value?._id;
		const collectionId = collection.value?._id as keyof ContentTypes;

		if (!entryId || !collectionId) {
			toastStore.trigger({ message: 'Cannot set status: ID is missing.', background: 'variant-filled-error' });
			return;
		}

		isLoading = true;
		try {
			await setStatus(collectionId, [entryId], newStatus, scheduleTime);
			// Optimistically update the local state
			collectionValue.update((cv) => (cv ? { ...cv, status: newStatus } : cv));
			toastStore.trigger({ message: `Status updated to ${newStatus}.`, background: 'variant-filled-success' });
		} catch (err: any) {
			toastStore.trigger({ message: err.message || 'Failed to update status.', background: 'variant-filled-error' });
		} finally {
			isLoading = false;
		}
	}

	function openScheduleModal() {
		const modalSettings: ModalSettings = {
			type: 'component',
			component: { ref: ScheduleModal },
			title: 'Scheduler',
			body: 'Set a date and time to schedule this entry.',
			response: (r: { date: string; action: string } | boolean) => {
				if (typeof r === 'object' && r.date && r.action === 'schedule') {
					const scheduleTime = new Date(r.date).getTime();
					handleSetStatus('scheduled', scheduleTime);
				}
			}
		};
		getModalStore().trigger(modalSettings);
	}

	function handleClone() {
		mode.set('create');
		getToastStore().trigger({ message: 'Entry ready to be cloned. Save to create a new copy.', background: 'variant-filled-surface' });
	}

	function handleCancel() {
		mode.set('view');
		toggleUIElement('leftSidebar', screenSize.value === 'LG' ? 'full' : 'collapsed');
	}

	function handleReload() {
		mode.set('edit');
	}
</script>

<header
	class="border-secondary-600-300-token sticky top-0 z-10 flex w-full items-center justify-between bg-white p-2 dark:bg-surface-700"
	class:border-b={!showMore}
>
	<!-- Left Side: Hamburger & Collection Info -->
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
				<div class="ml-2 flex flex-col text-left font-bold">
					<div class="text-sm uppercase">{mode.value}:</div>
					<div class="text-xs capitalize">
						<span class="uppercase text-tertiary-500 dark:text-primary-500">{collection.value.name}</span>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<!-- Right Side: Actions -->
	<div class="flex items-center justify-end gap-1 sm:gap-2 md:gap-4">
		<div class="flex items-center justify-center gap-2">
			<TranslationStatus />
			{#if ['edit', 'create'].includes(mode.value)}
				<button
					type="button"
					onclick={handleSave}
					disabled={isLoading || !validationStore.isValid}
					class="variant-filled-tertiary btn dark:variant-filled-primary"
					class:btn-icon={isMobile}
					class:opacity-50={!validationStore.isValid || isLoading}
					aria-label="Save entry"
				>
					<iconify-icon icon="material-symbols:save" width="24" class="text-white"></iconify-icon>
					{#if !isMobile}
						<span class="ml-1">{isLoading ? 'Saving...' : m.button_save()}</span>
					{/if}
				</button>
			{/if}
		</div>

		{#if isMobile}
			<button
				type="button"
				onclick={() => (showMore = !showMore)}
				aria-label={showMore ? 'Hide extra actions' : 'Show more actions'}
				class="variant-ghost-surface btn-icon"
			>
				<iconify-icon icon="material-symbols:filter-list-rounded" width="30"></iconify-icon>
			</button>
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

<!-- "Show More" Panel for Additional Actions -->
{#if showMore}
	<div class="-mx-2 mb-2 flex flex-col items-center justify-center gap-3 border-b pt-2 dark:border-surface-700">
		<div class="flex items-center justify-center gap-3">
			{#if mode.value === 'edit'}
				<!-- Delete -->
				<button
					type="button"
					onclick={() => handleSetStatus('deleted')}
					disabled={isLoading || collection.value?.permissions?.[user.role]?.delete === false}
					class="gradient-error gradient-error-hover gradient-error-focus btn-icon"
					aria-label="Delete entry"
				>
					<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon>
				</button>

				<!-- Publish / Unpublish -->
				<button
					type="button"
					onclick={() => handleSetStatus(isPublished ? 'unpublished' : 'published')}
					disabled={isLoading || !collection.value?.permissions?.[user.role]?.write}
					class:gradient-yellow={isPublished}
					class:gradient-tertiary={!isPublished}
					class="btn-icon"
					aria-label={isPublished ? 'Unpublish' : 'Publish'}
				>
					<iconify-icon icon={isPublished ? 'bi:pause-circle' : 'bi:hand-thumbs-up-fill'} width="24"></iconify-icon>
				</button>

				<!-- Schedule -->
				<button
					type="button"
					onclick={openScheduleModal}
					disabled={isLoading || !collection.value?.permissions?.[user.role]?.write}
					class="gradient-pink gradient-pink-hover gradient-pink-focus btn-icon"
					aria-label="Schedule entry"
				>
					<iconify-icon icon="bi:clock" width="24"></iconify-icon>
				</button>

				<!-- Clone -->
				<button
					type="button"
					onclick={handleClone}
					disabled={isLoading || !(collection.value?.permissions?.[user.role]?.write && collection.value?.permissions?.[user.role]?.create)}
					aria-label="Clone entry"
					class="gradient-secondary gradient-secondary-hover gradient-secondary-focus btn-icon"
				>
					<iconify-icon icon="bi:clipboard-data-fill" width="24"></iconify-icon>
				</button>
			{/if}
		</div>

		<!-- Info Section -->
		<div class="w-full px-4">
			<div class="mt-2 flex w-full flex-col items-start justify-center">
				<p class="mb-1 text-sm">Created At</p>
				<input type="datetime-local" bind:value={createdAtDate} class="input w-full p-2 text-left text-sm" aria-label="Creation date" readonly />
			</div>
			<div class="mt-2 text-sm">
				<p>Created by: {collectionValue.value?.createdBy || user.username}</p>
				{#if collectionValue.value?.updatedBy}
					<p class="text-tertiary-500">Last updated by {collectionValue.value.updatedBy}</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
