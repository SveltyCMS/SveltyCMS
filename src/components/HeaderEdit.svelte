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
	import { logger } from '@utils/logger';
	import { untrack } from 'svelte';
	import { deleteCurrentEntry, saveEntry } from '@utils/entryActions';
	// Types
	import { getModalStore } from '@utils/modalUtils';
	import type { User } from '@src/databases/auth/types';
	import { StatusTypes, type StatusType } from '@src/content/types';
	import { createEntry, invalidateCollectionCache, updateEntryStatus } from '@src/utils/apiClient';
	import { showCloneModal, showScheduleModal } from '@utils/modalUtils';
	import { showToast } from '@utils/toast';
	import TranslationStatus from './collectionDisplay/TranslationStatus.svelte';
	import Toggles from './system/inputs/Toggles.svelte';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Modal types import
	// Stores
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { collection, collectionValue, mode, setCollectionValue, setMode } from '@src/stores/collectionStore.svelte';
	import { isDesktop, screenSize } from '@src/stores/screenSizeStore.svelte';
	import { toggleUIElement, uiStateManager } from '@src/stores/UIStore.svelte';
	import { contentLanguage, headerActionButton, shouldShowNextButton, tabSet, validationStore, dataChangeStore } from '@stores/store.svelte';

	const user = $derived(page.data.user as User);
	const isAdmin = $derived(page.data.isAdmin || false);

	// ✅ Create reactive derived state for form validity
	const isFormValid = $derived(validationStore.isValid);

	// 🔍 DEBUG: Log validation state changes
	$effect(() => {
		if (mode.value === 'create' || mode.value === 'edit') {
			logger.debug('[HeaderEdit] Validation state:', {
				isValid: isFormValid,
				errors: validationStore.errors,
				mode: mode.value
			});
		}
	});

	interface CollectionData extends Record<string, unknown> {
		_id?: string;
		status?: StatusType;
		_scheduled?: number;
		createdAt?: number;
		updatedAt?: number;
		createdBy?: string;
		updatedBy?: string;
	}

	// State declarations with proper types
	const previousLanguage = $state<string>(contentLanguage.value);
	let previousTabSet = $state<number>(tabSet.value);
	let tempData = $state<Partial<Record<string, CollectionData>>>({});
	const schedule = $state<string>(
		typeof (collectionValue.value as CollectionData)?._scheduled === 'number' && (collectionValue.value as CollectionData)._scheduled !== undefined
			? new Date((collectionValue.value as CollectionData)._scheduled!).toISOString().slice(0, 16)
			: ''
	);
	let createdAtDate = $state<string>(
		typeof (collectionValue.value as CollectionData)?.createdAt === 'number' && (collectionValue.value as CollectionData).createdAt !== undefined
			? new Date((collectionValue.value as CollectionData).createdAt! * 1000).toISOString().slice(0, 16)
			: ''
	);
	let showMore = $state<boolean>(false);

	function getIsPublish(): boolean {
		const status: StatusType =
			((collectionValue.value as CollectionData)?.status as StatusType) || (collection.value?.status as StatusType) || StatusTypes.unpublish;
		return status === StatusTypes.publish;
	}
	const isPublish = $derived.by(getIsPublish);

	// Create a bindable state for the toggle component
	let publishToggleState = $derived(isPublish);
	let isLoading = $state(false);

	// Handle toggle changes - update collection status directly
	async function handleStatusToggle(newValue: boolean) {
		if (newValue === isPublish || isLoading) {
			return false;
		}
		const newStatus: StatusType = newValue ? StatusTypes.publish : StatusTypes.unpublish;
		isLoading = true;

		try {
			// If entry exists, update via API
			if ((collectionValue.value as CollectionData)?._id && collection.value?._id) {
				const result = await updateEntryStatus(String(collection.value._id), String((collectionValue.value as CollectionData)._id), newStatus);

				if (result.success) {
					// Update the collection value store
					setCollectionValue({ ...collectionValue.value, status: newStatus });

					showToast(newValue ? 'Entry published successfully.' : 'Entry unpublished successfully.', 'success');

					return true;
				} else {
					showToast(result.error || `Failed to ${newValue ? 'publish' : 'unpublish'} entry`, 'error');

					return false;
				}
			} else {
				// New entry - just update local state
				setCollectionValue({ ...collectionValue.value, status: newStatus });
				return true;
			}
		} catch (e) {
			const errorMessage = `Error ${newValue ? 'publishing' : 'unpublishing'} entry: ${(e as Error).message}`;
			showToast(errorMessage, 'error');

			return false;
		} finally {
			isLoading = false;
		}
	}

	// Disable toggle when RightSidebar is active (desktop) or in edit mode if not primary
	const shouldDisableStatusToggle = $derived.by(() => {
		// Extract boolean values to avoid TypeScript confusion
		const isDesktopActive: boolean = Boolean(isDesktop?.value);
		const isRightSidebarVisible: boolean = Boolean(uiStateManager?.isRightSidebarVisible?.value);
		const isCreateMode: boolean = mode.value === 'create';
		const isEditMode: boolean = mode.value === 'edit';

		return (isCreateMode && isRightSidebarVisible) || (isEditMode && isRightSidebarVisible && isDesktopActive) || isLoading;
	});

	// Debug logging - only log when needed, wrapped to prevent infinite loops
	let lastLoggedStatus = $state<string | undefined>(undefined);
	$effect(() => {
		// Only log when HeaderEdit is actually active (not disabled by RightSidebar)
		if (!shouldDisableStatusToggle) {
			const currentStatus = (collectionValue.value as CollectionData)?.status;
			if (currentStatus !== lastLoggedStatus) {
				untrack(() => {
					lastLoggedStatus = currentStatus;
				});
			}
		}
	});

	function openScheduleModal(): void {
		showScheduleModal({
			onSchedule: (date: Date) => {
				setCollectionValue({
					...collectionValue.value,
					status: StatusTypes.schedule,
					_scheduled: date.getTime()
				});
			}
		});
	}

	$effect(() => {
		if (tabSet.value !== previousTabSet) {
			untrack(() => {
				tempData[previousLanguage] = collectionValue.value as Record<string, unknown>;
				previousTabSet = tabSet.value;
			});
		}
	});

	$effect(() => {
		if (mode.value === 'view') {
			untrack(() => {
				tempData = {};
			});
		}
	});

	$effect(() => {
		if (mode.value === 'edit' || mode.value === 'create') {
			untrack(() => {
				showMore = false;
			});
		}
	}); // Status Store Effects removed: statusStore is not used, use local status logic only

	// Shared save logic for HeaderEdit and RightSidebar
	async function prepareAndSaveEntry() {
		// ✅ FIX 1: Strict validation check before save
		if (!isFormValid) {
			logger.warn('[HeaderEdit] Save blocked due to validation errors.');
			showToast(m.validation_fix_before_save(), 'error');
			return;
		}

		// Check if there are any changes using the centralized store
		if (!dataChangeStore.hasChanges) {
			// No changes - but still need to reload full list view
			logger.debug('[HeaderEdit] No changes detected, returning to list view without save');
			toggleUIElement('leftSidebar', isDesktop.value ? 'full' : 'collapsed');
			dataChangeStore.reset();

			// ✅ Navigate back to list view with full data reload
			// Remove ?edit= and ?create= parameters to trigger SSR reload of full entry list
			const currentPath = page.url.pathname; // pathname excludes query parameters
			logger.debug('[HeaderEdit] No changes - Navigating to:', currentPath, 'from:', page.url.href);
			await goto(currentPath, { invalidateAll: true });

			// Update mode after navigation
			setMode('view');
			return;
		}

		// Get a fresh snapshot of collectionValue to ensure we have the latest widget data
		const dataToSave: Record<string, unknown> = { ...collectionValue.value };

		// Status rules: Schedule takes precedence, otherwise use current collection status
		if (schedule && schedule.trim() !== '') {
			dataToSave.status = StatusTypes.schedule;
			dataToSave._scheduled = new Date(schedule).getTime();
		} else {
			dataToSave.status = (collectionValue.value as CollectionData)?.status || collection.value?.status || StatusTypes.unpublish;
			delete dataToSave._scheduled;
		}

		// Set metadata for all saves
		if (mode.value === 'create') {
			dataToSave.createdBy = getDisplayName(user?.username, user);
		}
		dataToSave.updatedBy = getDisplayName(user?.username, user);

		if (process.env.NODE_ENV !== 'production') {
			logger.debug(
				'[HeaderEdit] Saving with status:',
				dataToSave.status,
				'collectionValue.status:',
				(collectionValue.value as CollectionData)?.status
			);
		}

		// ✅ FIX 2: Save entry and let it handle navigation
		await saveEntry(dataToSave);

		// Close sidebars
		toggleUIElement('leftSidebar', isDesktop.value ? 'full' : 'collapsed');

		// Reset change tracking
		dataChangeStore.reset();

		// ✅ FIX 3: Navigate to list view (saveEntry already called invalidateAll)
		// This ensures the entry list refreshes with the new data
		const currentPath = page.url.pathname;
		logger.debug('[HeaderEdit] Save complete - Navigating to:', currentPath);
		await goto(currentPath, { invalidateAll: true, replaceState: false });

		logger.debug('[Save] Navigated back to list view with refreshed data');
	} // Save form data with validation
	async function saveData() {
		await prepareAndSaveEntry();
	}

	// Permission and UI derived values
	const canWrite = $derived(collection.value?.permissions?.[user.role]?.write !== false);

	// Helper to get a display-friendly username
	function getDisplayName(value: string | undefined | null, fallbackUser?: typeof user): string {
		if (!value) {
			if (fallbackUser) {
				if (fallbackUser.username && !isUUID(fallbackUser.username)) {
					return fallbackUser.username;
				}
				if (fallbackUser.firstName || fallbackUser.lastName) {
					return [fallbackUser.firstName, fallbackUser.lastName].filter(Boolean).join(' ');
				}
				if (fallbackUser.email) {
					return fallbackUser.email.split('@')[0];
				}
			}
			return 'system';
		}

		if (isUUID(value)) {
			if (fallbackUser) {
				if (fallbackUser.username && !isUUID(fallbackUser.username)) {
					return fallbackUser.username;
				}
				if (fallbackUser.firstName || fallbackUser.lastName) {
					return [fallbackUser.firstName, fallbackUser.lastName].filter(Boolean).join(' ');
				}
				if (fallbackUser.email) {
					return fallbackUser.email.split('@')[0];
				}
			}
			return 'system';
		}
		return value;
	}

	function isUUID(value: string): boolean {
		const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
		return uuidPattern.test(value);
	}

	const canDelete = $derived(collection.value?.permissions?.[user.role]?.delete !== false);

	// function to undo the changes made by handleButtonClick
	async function handleCancel() {
		// Dispatch cancel event to prevent auto-save draft
		const cancelEvent = new CustomEvent('cancelEdit', {
			bubbles: true,
			detail: { cancelledAt: new Date().toISOString() }
		});
		document.dispatchEvent(cancelEvent);

		// Clear collectionValue before setting mode to 'view' to prevent auto-draft save
		if (mode.value === 'create') {
			setCollectionValue({});
		}

		// Reset change tracking
		dataChangeStore.reset();

		// Hide right sidebar
		toggleUIElement('rightSidebar', 'hidden');

		// Restore left sidebar to appropriate state
		toggleUIElement('leftSidebar', isDesktop.value ? 'full' : 'collapsed');

		// ✅ Navigate back to list view with full data reload
		// Remove ?edit= and ?create= parameters to trigger SSR reload of full entry list
		const currentPath = page.url.pathname; // pathname excludes query parameters
		logger.debug('[HeaderEdit] Cancel - Navigating to:', currentPath, 'from:', page.url.href);
		await goto(currentPath, { invalidateAll: true });

		// Update mode after navigation
		setMode('view');

		logger.debug('[Cancel] Navigated back to list view with full data');
	}

	// Delete confirmation modal - use centralized function
	function openDeleteModal(): void {
		deleteCurrentEntry(getModalStore(), isAdmin);
	} // Next button handler for menu creation workflow
	function next(): void {
		logger.debug('[HeaderEdit] Next button clicked');
		// Add your next logic here
	}

	// Clone confirmation modal
	function openCloneModal(): void {
		showCloneModal({
			count: 1,
			onConfirm: async () => {
				const entry = collectionValue.value as Record<string, unknown>;
				const coll = collection.value;
				if (!entry || !coll?._id) {
					showToast('No entry or collection selected.', 'warning');
					return;
				}
				try {
					const clonedPayload = JSON.parse(JSON.stringify(entry));
					// Remove unique identifiers and timestamps
					delete clonedPayload._id;
					delete clonedPayload.createdAt;
					delete clonedPayload.updatedAt;
					// Set clone status and reference to original
					clonedPayload.status = StatusTypes.draft;
					clonedPayload.clonedFrom = entry._id;
					const result = await createEntry(coll._id, clonedPayload);
					if (result.success) {
						showToast('Entry cloned successfully.', 'success');
						invalidateCollectionCache(coll._id);
						setMode('view');
					} else {
						showToast(result.error || 'Failed to clone entry', 'error');
					}
				} catch (e) {
					showToast(`Error cloning entry: ${(e as Error).message}`, 'error');
				}
			}
		});
	}

	// Derived variable for complex Next button visibility condition
	const shouldHideNextButton = $derived(
		shouldShowNextButton.value && mode.value === 'create' && (collection.value?.name === 'Menu' || collection.value?.slug === 'menu')
	);
</script>

<header
	class="border-secondary-600-300-token sticky top-0 z-20 flex w-full items-center justify-between overflow-visible bg-white p-2 shadow-sm dark:bg-surface-700"
	class:border-b={!showMore}
>
	<div class="flex items-center justify-start">
		{#if uiStateManager.uiState.value.leftSidebar === 'hidden'}
			<button
				type="button"
				onclick={() => toggleUIElement('leftSidebar', isDesktop.value ? 'full' : 'collapsed')}
				aria-label="Toggle Sidebar"
				class="variant-ghost-surface btn-icon mt-1"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</button>
		{/if}
		<button
			type="button"
			onclick={saveData}
			aria-label="Save"
			class={`btn-icon mt-1 ${
				!isFormValid || !canWrite ? 'variant-filled-surface cursor-not-allowed opacity-50' : 'variant-ghost-surface hover:variant-filled-surface'
			}`}
			disabled={!isFormValid || !canWrite}
		>
			<div class="flex items-center justify-center">
				<iconify-icon icon={collection.value?.icon} width="24" class="text-error-500"></iconify-icon>
			</div>
		</button>
		{#if collection.value?.name && mode.value !== 'view'}
			<div class="ml-2 flex flex-col text-left font-bold">
				<div class="text-sm uppercase">
					{mode.value}:
				</div>
				<div class="text-sm capitalize">
					<span class="uppercase text-primary-500 dark:text-tertiary-500">{collection.value?.name}</span>
				</div>
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
						class={`variant-filled-tertiary btn-icon dark:variant-filled-primary ` + (!isFormValid || !canWrite ? 'btn:disabled' : 'btn')}
						disabled={!isFormValid || !canWrite}
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
					{#if shouldHideNextButton}
						<button type="button" onclick={next} class="variant-filled-primary btn-icon dark:variant-filled-primary lg:hidden" aria-label="Next">
							<iconify-icon icon="carbon:next-filled" width="24" class="text-white"></iconify-icon>
						</button>
					{/if}
					{#if !shouldHideNextButton}
						<button
							type="button"
							onclick={saveData}
							class={`variant-filled-tertiary btn-icon dark:variant-filled-primary lg:hidden ` + (!isFormValid || !canWrite ? 'btn:disabled' : 'btn')}
							aria-label="Save entry"
							disabled={!isFormValid || !canWrite}
						>
							<iconify-icon icon="material-symbols:save" width="24" class="text-white"></iconify-icon>
						</button>
					{/if}
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
		{/if}
	</div>
</header>

{#if showMore}
	<div class="-mx-2 mb-2 flex flex-col items-center justify-center gap-3 border-b pt-2">
		<div class="flex items-center justify-center gap-3">
			<!-- Add status toggle to second row on mobile -->
			<div class="flex flex-col items-center justify-center">
				<Toggles
					bind:value={publishToggleState}
					disabled={shouldDisableStatusToggle || isLoading}
					onChange={handleStatusToggle}
					title={shouldDisableStatusToggle ? 'Status managed by sidebar in create mode' : isPublish ? m.status_publish() : m.status_unpublish()}
				/>
				<span class="mt-1 text-xs {isPublish ? 'text-primary-500' : 'text-error-500'}">
					{isPublish ? m.status_publish() : m.status_unpublish()}
				</span>
			</div>

			<div class="flex flex-col items-center justify-center">
				<button
					type="button"
					onclick={openDeleteModal}
					disabled={!canDelete}
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
						disabled={!canWrite}
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
				<p>Created by: {getDisplayName(collectionValue.value?.createdBy as string, user)}</p>
				{#if collectionValue.value?.updatedBy}
					<p class="text-tertiary-500">
						Last updated by: {getDisplayName(collectionValue.value.updatedBy as string, user)}
					</p>
				{/if}
			</div>
		</div>
	</div>
{/if}
