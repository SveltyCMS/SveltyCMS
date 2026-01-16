<!-- 
@file src/components/RightSidebar.svelte
@component
**RightSidebar component displaying collection fields, publish options and translation status.**

This component provides a streamlined interface for managing collection entries with:
- Simplified validation logic that relies on centralized validation store
- Clean save functionality without complex field-by-field validation
- Improved user experience with disabled save button when validation fails
- Efficient data handling using store snapshots rather than rebuilding data objects

@example
<RightSidebar />	


#### Props
- `collection` {object} - Collection object containing schema and permissions
- Relies on global stores for validation state and form data

#### Key Features
- **Validation Integration**: Uses `$validationStore.isValid` to control save button state
- **Simplified Save Logic**: Trusts validation store and uses store snapshots for efficiency
- **User Experience**: Provides clear feedback when form has validation errors
- **Permission Handling**: Respects user role permissions for various operations
-->

<script lang="ts">
	import { logger } from '@utils/logger';
	import { toaster } from '@stores/store.svelte';
	import { showScheduleModal } from '@utils/modalState.svelte';
	// SvelteKit imports
	import { page } from '$app/state'; // Svelte 5 uses $app/state
	import { navigationManager } from '@utils/navigationManager';
	import { getLocale } from '@src/paraglide/runtime';

	// Actions and Utils
	import { cloneCurrentEntry, deleteCurrentEntry, saveEntry } from '../utils/entryActions';
	import * as m from '@src/paraglide/messages';

	// Types
	import { StatusTypes } from '@src/content/types';

	// Stores
	import { screenSize } from '@stores/screenSizeStore.svelte';
	import { collection, collectionValue, mode, setCollectionValue } from '@stores/collectionStore.svelte';
	import { saveLayerStore, shouldShowNextButton, validationStore, dataChangeStore } from '@stores/store.svelte';
	import { handleUILayoutToggle, uiStateManager } from '@stores/UIStore.svelte';

	// Components
	import Toggles from './system/inputs/Toggles.svelte';
	import { statusStore } from '@stores/statusStore.svelte';

	// Define a clearer type for the entry data
	type EntryData = Record<string, any>;

	// --- Derived State from Page Data ---
	const user = $derived(page.data.user);
	const isAdmin = $derived((page.data.isAdmin || false) as boolean);

	// --- Local State ---
	// isLoading removed, using statusStore.isLoading

	// Track data changes using the centralized store
	const hasDataChanged = $derived(dataChangeStore.hasChanges);

	// --- Derived State from Stores and Props ---
	const currentMode = $derived(mode.value);
	const currentCollection = $derived(collection.value);
	const currentEntry = $derived(collectionValue.value as EntryData | null); // Use EntryData type
	const isRightSidebarVisible = $derived(uiStateManager.isRightSidebarVisible.value);
	const currentScreenSize = $derived(screenSize.value);
	const isFormValid = $derived(validationStore.isValid);

	// Derive schedule timestamp directly from currentEntry for display
	const scheduleTimestamp = $derived(currentEntry?._scheduled ? Number(currentEntry._scheduled) : null);

	// Helper to get a display-friendly username
	// If the value looks like a UUID, try to get actual username from user object
	function getDisplayName(value: string | undefined | null, fallbackUser?: typeof user): string {
		if (!value) {
			// Try to construct name from user object
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

		// Check if it looks like a UUID (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
		if (isUUID(value)) {
			// It's a UUID, try to get actual name from user object
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

	// Permissions derived from collection schema
	const canWrite = $derived(currentCollection?.permissions?.[user?.role]?.write !== false);
	const canCreate = $derived(currentCollection?.permissions?.[user?.role]?.create !== false);
	const canDelete = $derived(currentCollection?.permissions?.[user?.role]?.delete !== false);

	// Determine current status (local state or collection default)
	// (isPublished removed, using statusStore.isPublish directly)

	// Disable status toggle logic
	const shouldDisableStatusToggle = $derived(
		(currentMode === 'create' && !isRightSidebarVisible) ||
			(currentMode === 'edit' && !isRightSidebarVisible && currentScreenSize !== 'LG') ||
			statusStore.isLoading
	);

	// Formatted dates
	const formatDate = (dateString: string | undefined | null): string => {
		if (!dateString) return '-';
		try {
			return new Date(dateString).toLocaleString(getLocale(), {
				// Use toLocaleString for better format
				year: 'numeric',
				month: 'short',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '-';
		}
	};
	const dates = $derived({
		created: formatDate(currentEntry?.createdAt as string | undefined),
		updated: formatDate(currentEntry?.updatedAt as string | undefined)
	});

	// Visibility of the sidebar itself
	const showSidebar = $derived(['edit', 'create'].includes(currentMode) || canWrite);

	// --- Effects ---

	// Subscribe to saveLayerStore for potential 'next' actions
	let nextAction = $state<(() => void) | null>(null);
	$effect(() => {
		const unsubscribe = saveLayerStore.subscribe((value) => {
			nextAction = value; // Store the function directly
			shouldShowNextButton.set(!!value); // Show button if action exists
		});
		return unsubscribe;
	});

	// --- Event Handlers ---

	const handleCloneEntry = () => cloneCurrentEntry();
	const handleDeleteEntry = () => deleteCurrentEntry(isAdmin);

	async function handleStatusToggle(newValue: boolean): Promise<boolean> {
		return await statusStore.toggleStatus(newValue, 'RightSidebar');
	}

	function openScheduleModal(): void {
		showScheduleModal({
			initialAction: currentEntry?.status === StatusTypes.publish ? 'publish' : 'unpublish',
			onSchedule: (date: Date, action: string) => {
				const timestamp = date.getTime();
				setCollectionValue({
					...currentEntry,
					status: StatusTypes.schedule,
					_scheduled: timestamp
				});
				toaster.success({ description: `Entry scheduled for ${action}.` });
			}
		});
	}

	async function prepareAndSaveEntry() {
		// ✅ FIX 1: Strict validation check before save
		if (!isFormValid) {
			toaster.warning({ description: m.validation_fix_before_save() });
			return;
		}

		// Check if there are any changes using the centralized store
		// Only check for changes in edit mode. In create mode, always attempt to save (even with defaults).
		if (currentMode === 'edit' && !hasDataChanged) {
			// No changes - but still need to reload full list view
			logger.debug('[RightSidebar] No changes detected, returning to list view without save');
			handleUILayoutToggle();

			// Delegate navigation to manager
			await navigationManager.navigateToList();
			return;
		}

		// Get a fresh snapshot of collectionValue to ensure we have the latest widget data
		const dataToSave: EntryData = { ...(currentEntry as EntryData) };

		// ✅ FIXED: Proper if/else for schedule logic
		if (scheduleTimestamp) {
			dataToSave.status = StatusTypes.schedule;
			dataToSave._scheduled = scheduleTimestamp;
		} else {
			dataToSave.status = statusStore.getStatusForSave();
			delete dataToSave._scheduled;
		}

		// Set metadata
		if (currentMode === 'create') {
			// Use the same display name logic to ensure we save readable names
			dataToSave.createdBy = getDisplayName(user?.username, user);
		}
		dataToSave.updatedBy = getDisplayName(user?.username, user);

		if (process.env.NODE_ENV !== 'production') {
			logger.debug('[RightSidebar] Data to save:', dataToSave);
		}

		// ✅ FIX 2: Save entry and let it handle navigation
		const success = await saveEntry(dataToSave);

		if (!success) {
			logger.warn('[RightSidebar] Save failed');
			return;
		}

		// Close sidebars
		handleUILayoutToggle();

		// Delegate navigation and state cleanup to manager
		await navigationManager.navigateToList();
	}
	function saveData() {
		prepareAndSaveEntry();
	}
</script>

{#if showSidebar}
	<div class="flex h-full w-full flex-col justify-between px-3 py-4">
		{#if $shouldShowNextButton && currentMode === 'create' && (currentCollection?.name === 'Menu' || currentCollection?.slug === 'menu')}
			<button type="button" onclick={nextAction} aria-label="Next" class="preset-filled-primary-500 btn w-full gap-2 shadow-lg">
				<iconify-icon icon="carbon:next-filled" width="20" class="font-extrabold text-white"></iconify-icon>
				{m.button_next()}
			</button>
		{/if}
		{#if !($shouldShowNextButton && currentMode === 'create' && (currentCollection?.name === 'Menu' || currentCollection?.slug === 'menu'))}
			<header class="flex flex-col items-center justify-center gap-3">
				<button
					type="button"
					onclick={saveData}
					disabled={!isFormValid || !canWrite}
					class="preset-filled-primary-500 btn w-full gap-2 shadow-lg transition-all duration-200"
					class:opacity-50={!isFormValid || !canWrite}
					class:cursor-not-allowed={!isFormValid || !canWrite}
					aria-label="Save entry"
					title={isFormValid ? 'Save changes' : 'Please fix validation errors before saving'}
				>
					<iconify-icon icon="material-symbols:save" width="20" class="font-extrabold text-white"></iconify-icon>
					{m.button_save()}
				</button>

				<div class="gradient-secondary btn w-full gap-2 shadow-md">
					<Toggles
						value={statusStore.isPublish}
						label={statusStore.isPublish ? m.status_publish() : m.status_unpublish()}
						labelColor={statusStore.isPublish ? 'text-primary-500' : 'text-error-500'}
						iconOn="ic:baseline-check-circle"
						iconOff="material-symbols:close"
						disabled={shouldDisableStatusToggle || statusStore.isLoading}
						onChange={handleStatusToggle}
						title={shouldDisableStatusToggle
							? 'Status managed by header in mobile view'
							: statusStore.isPublish
								? m.status_publish()
								: m.status_unpublish()}
					/>
				</div>

				{#if currentMode === 'edit'}
					<div class="flex w-full flex-col gap-2">
						<button
							type="button"
							onclick={handleCloneEntry}
							disabled={!canCreate}
							class="gradient-secondary gradient-secondary-hover btn w-full gap-2 text-white shadow-md transition-all duration-200"
							aria-label="Clone entry"
						>
							<iconify-icon icon="bi:clipboard-data-fill" width="18"></iconify-icon>
							Clone <span class="font-semibold text-primary-500">{currentCollection?.name}</span>
						</button>

						<button
							type="button"
							onclick={handleDeleteEntry}
							disabled={!canDelete}
							class="preset-filled-error-500 btn w-full gap-2 shadow-md transition-all duration-200 hover:shadow-lg"
							aria-label="Delete entry"
						>
							<iconify-icon icon="icomoon-free:bin" width="18"></iconify-icon>
							{m.button_delete()}
						</button>
					</div>
				{/if}
			</header>

			<main class="mt-6 flex w-full flex-col gap-4 text-left">
				<div class="border-b border-surface-300 pb-2 dark:border-surface-600">
					<h3 class="text-center text-sm font-bold uppercase tracking-wide text-tertiary-500 dark:text-primary-500">
						{m.siedabar_publish_options()}
					</h3>
				</div>

				<div class="space-y-2">
					{#if scheduleTimestamp}
						<p class="text-sm font-medium text-surface-600 dark:text-surface-300">{m.sidebar_will_publish_on()}</p>
					{/if}
					<button
						onclick={openScheduleModal}
						aria-label="Schedule publication"
						class="hover:preset-filled-primary-500-hover preset-filled-surface-500 btn w-full justify-start gap-2 text-left transition-colors duration-200"
					>
						<iconify-icon icon="bi:clock" width="16"></iconify-icon>
						<span class="text-sm text-tertiary-500 dark:text-primary-500">
							{scheduleTimestamp ? new Date(scheduleTimestamp).toLocaleString(getLocale()) : 'Schedule publication...'}
						</span>
					</button>
				</div>

				<div class="space-y-3">
					<!-- Created By -->
					<div class="space-y-1">
						<p class="text-sm font-medium">{m.sidebar_createdby()}</p>
						<div class="preset-filled-surface-500 rounded-lg p-3 text-center">
							<span class="text-sm font-semibold text-tertiary-500 dark:text-primary-500">
								{getDisplayName(currentEntry?.createdBy as string, user)}
							</span>
						</div>
					</div>
					<!-- Updated By -->
					{#if currentEntry?.updatedBy}
						<div class="space-y-1">
							<p class="text-sm font-medium text-surface-600 dark:text-surface-300">Last updated by</p>
							<div class="preset-filled-surface-500 rounded-lg p-3 text-center">
								<span class="text-sm font-semibold text-tertiary-500 dark:text-primary-500">
									{getDisplayName(currentEntry?.updatedBy as string, user)}
								</span>
							</div>
						</div>
					{/if}
				</div>
			</main>

			<footer class="mt-6 border-t border-surface-300 pt-4 dark:border-surface-600">
				<div class="space-y-2">
					<div class="flex items-center justify-between text-xs">
						<span class="font-medium capitalize">Created:</span>
						<span class="font-bold text-tertiary-500 dark:text-primary-500">{dates.created}</span>
					</div>
					<div class="flex items-center justify-between text-xs">
						<span class="font-medium capitalize">Updated:</span>
						<span class="font-bold text-tertiary-500 dark:text-primary-500">{dates.updated}</span>
					</div>
				</div>

				{#if currentMode === 'create'}
					<div class="mt-3 text-center">
						<p class="text-xs text-tertiary-500 dark:text-primary-500">
							{new Date().toLocaleString(getLocale(), {
								year: 'numeric',
								month: 'short',
								day: 'numeric',
								hour: '2-digit',
								minute: '2-digit'
							})}
						</p>
					</div>
				{/if}
			</footer>
		{/if}
	</div>
{/if}
