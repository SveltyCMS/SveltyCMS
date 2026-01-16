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
	import { toaster } from '@stores/store.svelte';
	import { showScheduleModal, showCloneModal } from '@utils/modalState.svelte';
	import type { User } from '@src/databases/auth/types';
	import { StatusTypes, type StatusType } from '@src/content/types';
	import { createEntry, invalidateCollectionCache } from '@src/utils/apiClient';
	import TranslationStatus from './collectionDisplay/TranslationStatus.svelte';
	import Toggles from './system/inputs/Toggles.svelte';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Modal types import
	// Stores
	import { page } from '$app/state';
	import { navigationManager } from '@utils/navigationManager';
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

	import { statusStore } from '@stores/statusStore.svelte';

	// Create a bindable state for the toggle component (derived from store)
	let publishToggleState = $derived(statusStore.isPublish);

	// Handle toggle changes - delegate to store
	async function handleStatusToggle(newValue: boolean) {
		await statusStore.toggleStatus(newValue, 'HeaderEdit');
	}

	// Disable toggle when RightSidebar is active (desktop) or in edit mode if not primary
	const shouldDisableStatusToggle = $derived.by(() => {
		// Extract boolean values to avoid TypeScript confusion
		const isDesktopActive: boolean = Boolean(isDesktop?.value);
		const isRightSidebarVisible: boolean = Boolean(uiStateManager?.isRightSidebarVisible?.value);
		const isCreateMode: boolean = mode.value === 'create';
		const isEditMode: boolean = mode.value === 'edit';

		return (isCreateMode && isRightSidebarVisible) || (isEditMode && isRightSidebarVisible && isDesktopActive) || statusStore.isLoading;
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

	// Shared save logic for HeaderEdit	// Simplified save logic
	async function prepareAndSaveEntry() {
		if (!isFormValid) {
			logger.warn('[HeaderEdit] Save blocked due to validation errors.');
			toaster.error({ description: m.validation_fix_before_save() });
			return;
		}

		// Only check for changes in edit mode. In create mode, always attempt to save (even with defaults).
		if (mode.value === 'edit' && !dataChangeStore.hasChanges) {
			logger.debug('[HeaderEdit] No changes detected');
			toggleUIElement('leftSidebar', isDesktop.value ? 'full' : 'collapsed');

			// Delegate to NavigationManager
			await navigationManager.navigateToList();
			return;
		}

		// Prepare data
		const dataToSave: Record<string, unknown> = { ...collectionValue.value };

		// Handle status/schedule
		if (schedule && schedule.trim() !== '') {
			dataToSave.status = StatusTypes.schedule;
			dataToSave._scheduled = new Date(schedule).getTime();
		} else {
			dataToSave.status = statusStore.getStatusForSave();
			delete dataToSave._scheduled;
		}

		// Set metadata
		if (mode.value === 'create') {
			dataToSave.createdBy = getDisplayName(user?.username);
		}
		dataToSave.updatedBy = getDisplayName(user?.username);

		// Save entry
		const success = await saveEntry(dataToSave);

		if (!success) {
			logger.warn('[HeaderEdit] Save failed');
			return;
		}

		// Close sidebars
		toggleUIElement('leftSidebar', isDesktop.value ? 'full' : 'collapsed');

		// Delegate navigation and state cleanup to manager
		await navigationManager.navigateToList();
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

		// Hide right sidebar
		toggleUIElement('rightSidebar', 'hidden');

		// Restore left sidebar to appropriate state
		toggleUIElement('leftSidebar', isDesktop.value ? 'full' : 'collapsed');

		// Navigate back to list view
		await navigationManager.navigateToList();
	}

	// Delete confirmation modal - use centralized function
	function openDeleteModal(): void {
		deleteCurrentEntry(isAdmin);
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
					toaster.warning({ description: 'No entry or collection selected.' });
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
						toaster.success({ description: 'Entry cloned successfully.' });
						invalidateCollectionCache(coll._id);
						setMode('view');
					} else {
						toaster.error({ description: result.error || 'Failed to clone entry' });
					}
				} catch (e) {
					toaster.error({ description: `Error cloning entry: ${(e as Error).message}` });
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
	class="border-secondary-700-300 sticky top-0 z-20 flex w-full items-center justify-between overflow-visible bg-white p-2 shadow-sm dark:bg-surface-700"
	class:border-b={!showMore}
>
	<div class="flex items-center justify-start">
		{#if uiStateManager.uiState.value.leftSidebar === 'hidden'}
			<button
				type="button"
				onclick={() => toggleUIElement('leftSidebar', isDesktop.value ? 'full' : 'collapsed')}
				aria-label="Toggle Sidebar"
				class="preset-ghost-surface-500 btn-icon mt-1"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</button>
		{/if}
		<button
			type="button"
			onclick={saveData}
			aria-label="Save"
			class={`btn-icon mt-1 ${
				!isFormValid || !canWrite
					? 'preset-filled-surface-500 cursor-not-allowed opacity-50'
					: 'preset-ghost-surface-500 hover:preset-filled-surface-500'
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
					<span class="uppercase text-tertiary-500 dark:text-primary-500">{collection.value?.name}</span>
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
						class={`preset-filled-tertiary-500 btn-icon dark:preset-filled-primary-500 ` + (!isFormValid || !canWrite ? 'btn:disabled' : 'btn')}
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
					class="preset-filled-tertiary-500 btn-icon text-white"
				>
					<iconify-icon icon="material-symbols:filter-list-rounded" width="30"></iconify-icon>
				</button>
			{:else}
				<div class="flex-col items-center justify-center md:flex">
					<TranslationStatus />
				</div>

				{#if ['edit', 'create'].includes(mode.value)}
					{#if shouldHideNextButton}
						<button
							type="button"
							onclick={next}
							class="preset-filled-primary-500 btn-icon dark:preset-filled-primary-500 lg:hidden"
							aria-label="Next"
						>
							<iconify-icon icon="carbon:next-filled" width="24" class="text-white"></iconify-icon>
						</button>
					{/if}
					{#if !shouldHideNextButton}
						<button
							type="button"
							onclick={saveData}
							class={`preset-filled-tertiary-500 btn-icon dark:preset-filled-primary-500 lg:hidden ` +
								(!isFormValid || !canWrite ? 'btn:disabled' : 'btn')}
							aria-label="Save entry"
							disabled={!isFormValid || !canWrite}
						>
							<iconify-icon icon="material-symbols:save" width="24" class="text-white"></iconify-icon>
						</button>
					{/if}
				{/if}
				<button type="button" onclick={() => (showMore = !showMore)} aria-label="Show more actions" class="preset-ghost-surface-500 btn-icon">
					<iconify-icon icon="material-symbols:filter-list-rounded" width="30"></iconify-icon>
				</button>
			{/if}
		{:else}
			<div class="hidden flex-col items-center justify-center md:flex">
				<TranslationStatus />
			</div>
		{/if}

		{#if !headerActionButton.value}
			<button type="button" onclick={handleCancel} aria-label="Cancel" class="preset-ghost-surface-500 btn-icon">
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
					disabled={shouldDisableStatusToggle || statusStore.isLoading}
					onChange={handleStatusToggle}
					title={shouldDisableStatusToggle
						? 'Status managed by sidebar in create mode'
						: statusStore.isPublish
							? m.status_publish()
							: m.status_unpublish()}
				/>
				<span class="mt-1 text-xs {statusStore.isPublish ? 'text-primary-500' : 'text-error-500'}">
					{statusStore.isPublish ? m.status_publish() : m.status_unpublish()}
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
					class="preset-filled-surface-500 w-full p-2 text-left text-sm"
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
