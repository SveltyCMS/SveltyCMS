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
	import type { CollectionEntry } from '@src/content/types';
	import { StatusTypes } from '@src/content/types';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { collection, collectionValue, mode, setCollectionValue, setMode } from '@src/stores/collectionStore.svelte';
	import { screen } from '@src/stores/screenSizeStore.svelte';
	import { ui } from '@src/stores/UIStore.svelte';
	import { createEntry, invalidateCollectionCache } from '@src/utils/apiClient';
	import { statusStore } from '@stores/statusStore.svelte';
	import { app, dataChangeStore, validationStore } from '@stores/store.svelte';
	import { deleteCurrentEntry, saveEntry } from '@utils/entryActions';
	// --- Derived from page & stores ---
	import { logger } from '@utils/logger';
	import { showCloneModal, showScheduleModal } from '@utils/modalUtils';
	import { navigationManager } from '@utils/navigationManager';
	import { showToast } from '@utils/toast';
	import { untrack } from 'svelte';
	// Modal types import
	// Stores
	import { page } from '$app/state';
	import TranslationStatus from './collectionDisplay/TranslationStatus.svelte';
	import Toggles from './system/inputs/Toggles.svelte';

	// --- Derived from page & stores ---
	let user = $derived(page.data.user);
	let isAdmin = $derived(page.data.isAdmin === true);

	let currentMode = $derived(mode.value);
	let currentCollection = $derived(collection.value);
	let currentEntry = $derived(collectionValue.value as CollectionEntry | null);

	let isDesktop = $derived(screen.isDesktop);

	let isFormValid = $derived(validationStore.isValid);
	let hasChanges = $derived(dataChangeStore.hasChanges);

	let canWrite = $derived(currentCollection?.permissions?.[user?.role]?.write !== false);
	let canCreate = $derived(currentCollection?.permissions?.[user?.role]?.create !== false);
	let canDelete = $derived(currentCollection?.permissions?.[user?.role]?.delete !== false);

	// --- Local mutable state ---
	let showMore = $state(false);
	let previousLanguage = $state(app.contentLanguage);
	let previousTabSet = $state(app.tabSetState);
	let tempData = $state<Record<string, CollectionEntry>>({});

	// Schedule (not used in current logic – kept if needed later)
	let scheduleTimestamp = $derived(currentEntry?._scheduled ? Number(currentEntry._scheduled) : null);

	// Status toggle state & disable logic
	let publishToggle = $derived(statusStore.isPublish);
	let disableStatusToggle = $derived(
		(currentMode === 'create' && ui.isRightSidebarVisible) ||
			(currentMode === 'edit' && ui.isRightSidebarVisible && isDesktop) ||
			statusStore.isLoading
	);

	// Next button visibility (menu wizard)
	let showNextButton = $derived(
		app.shouldShowNextButton && currentMode === 'create' && (currentCollection?.name === 'Menu' || currentCollection?.slug === 'menu')
	);

	// --- Effects ---
	$effect(() => {
		if (app.tabSetState !== previousTabSet) {
			untrack(() => {
				tempData[previousLanguage] = { ...currentEntry };
				previousTabSet = app.tabSetState;
			});
		}
	});

	$effect(() => {
		if (currentMode === 'view') {
			untrack(() => (tempData = {}));
		}
	});

	$effect(() => {
		if (['edit', 'create'].includes(currentMode)) {
			untrack(() => (showMore = false));
		}
	});

	// --- Helpers ---
	function isUUID(str: string): boolean {
		return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
	}

	function getDisplayName(value?: string | null): string {
		if (!value || isUUID(value)) {
			if (user?.username && !isUUID(user.username)) return user.username;
			if (user?.firstName || user?.lastName) return [user.firstName, user.lastName].filter(Boolean).join(' ');
			if (user?.email) return user.email.split('@')[0];
			return 'system';
		}
		return value;
	}

	// --- Actions ---
	async function toggleStatus(newValue: boolean): Promise<void> {
		await statusStore.toggleStatus(newValue, 'HeaderEdit');
	}

	function openSchedule(): void {
		showScheduleModal({
			onSchedule: (date: Date) => {
				setCollectionValue({
					...currentEntry!,
					status: StatusTypes.schedule,
					_scheduled: date.getTime()
				});
			}
		});
	}

	async function save(): Promise<void> {
		if (!isFormValid) {
			showToast(m.validation_fix_before_save(), 'warning');
			return;
		}

		if (currentMode === 'edit' && !hasChanges) {
			logger.debug('[HeaderEdit] No changes – returning to list');
			await navigationManager.navigateToList();
			return;
		}

		const dataToSave = { ...currentEntry! };

		// Use status from store
		dataToSave.status = statusStore.getStatusForSave();
		if (scheduleTimestamp) {
			dataToSave._scheduled = scheduleTimestamp;
		} else {
			delete dataToSave._scheduled;
		}

		// Metadata
		if (currentMode === 'create') {
			dataToSave.createdBy = getDisplayName(user?.username);
		}
		dataToSave.updatedBy = getDisplayName(user?.username);

		const success = await saveEntry(dataToSave);
		if (!success) return;

		await navigationManager.navigateToList();
	}

	function cancel(): void {
		document.dispatchEvent(new CustomEvent('cancelEdit', { bubbles: true }));
		setCollectionValue({});
		ui.toggle('rightSidebar', 'hidden');
		ui.toggle('leftSidebar', isDesktop ? 'full' : 'collapsed');
		ui.toggle('pageheader', 'hidden');
		navigationManager.navigateToList();
	}

	function openDelete(): void {
		deleteCurrentEntry(isAdmin);
	}

	function openClone(): void {
		showCloneModal({
			count: 1,
			onConfirm: async () => {
				if (!(currentEntry && currentCollection?._id)) {
					showToast('No entry or collection selected.', 'warning');
					return;
				}
				const payload = { ...currentEntry };
				delete payload._id;
				delete payload.createdAt;
				delete payload.updatedAt;
				payload.status = StatusTypes.draft;
				payload.clonedFrom = currentEntry._id;

				const result = await createEntry(currentCollection._id, payload);
				if (result.success) {
					showToast('Entry cloned successfully.', 'success');
					invalidateCollectionCache(currentCollection._id);
					setMode('view');
				} else {
					showToast(result.error || 'Failed to clone', 'error');
				}
			}
		});
	}

	// Menu wizard next action
	function next(): void {
		logger.debug('[HeaderEdit] Next clicked');
		if (app.saveLayerStore) {
			app.saveLayerStore();
		} else {
			// Fallback if needed
			save();
		}
	}
</script>

<header
	class="border-secondary-600-300-token sticky top-0 z-20 flex w-full items-center justify-between border-b bg-white px-2 py-1 shadow-sm dark:bg-surface-700 h-14"
	class:border-b-0={showMore}
>
	<div class="flex items-center gap-2 flex-1 min-w-0">
		{#if ui.state.leftSidebar === 'hidden'}
			<button
				onclick={() => ui.toggle('leftSidebar', isDesktop ? 'full' : 'collapsed')}
				aria-label="Toggle sidebar"
				class="btn-icon preset-outlined-surface-500 shrink-0"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</button>
		{/if}

		<div class="shrink-0 flex items-center ml-2">
			<iconify-icon icon={currentCollection?.icon ?? 'mdi:file-document'} width="24" class="text-error-500"></iconify-icon>
		</div>

		{#if currentCollection?.name && currentMode !== 'view'}
			<div class="ml-2 flex-1 min-w-0">
				<div class="text-xs uppercase opacity-70 dark:opacity-100 dark:text-white leading-none">{currentMode}</div>
				<div class="text-sm font-bold capitalize truncate leading-tight">
					<span class="text-tertiary-500 dark:text-primary-500">{currentCollection.name}</span>
				</div>
			</div>
		{/if}
	</div>

	<div class="flex items-center gap-2 shrink-0">
		<!-- Mobile & Tablet: Translation + Save/Next + More -->
		{#if !isDesktop}
			{#if showMore}
				<TranslationStatus />
				{#if ['edit', 'create'].includes(currentMode)}
					<button
						onclick={save}
						disabled={!isFormValid || !canWrite}
						class="btn-icon preset-filled-tertiary-500 dark:preset-filled-primary-500"
						class:opacity-50={!isFormValid || !canWrite}
						aria-label="Save"
					>
						<iconify-icon icon="material-symbols:save" width="24"></iconify-icon>
					</button>
				{/if}
				<button onclick={() => (showMore = false)} class="btn-icon preset-filled-tertiary-500" aria-label="Show less">
					<iconify-icon icon="material-symbols:filter-list-rounded" width="30"></iconify-icon>
				</button>
			{:else}
				<TranslationStatus />

				{#if ['edit', 'create'].includes(currentMode)}
					{#if showNextButton}
						<button onclick={next} class="btn-icon preset-filled-primary-500" aria-label="Next">
							<iconify-icon icon="carbon:next-filled" width="24"></iconify-icon>
						</button>
					{:else}
						<button
							onclick={save}
							disabled={!isFormValid || !canWrite}
							class="btn-icon preset-filled-tertiary-500 dark:preset-filled-primary-500"
							class:opacity-50={!isFormValid || !canWrite}
							aria-label="Save"
						>
							<iconify-icon icon="material-symbols:save" width="24"></iconify-icon>
						</button>
					{/if}
				{/if}

				<button onclick={() => (showMore = true)} class="btn-icon preset-outlined-surface-500" aria-label="Show more">
					<iconify-icon icon="material-symbols:filter-list-rounded" width="30"></iconify-icon>
				</button>
			{/if}
		{:else}
			<!-- Desktop: Translation status visible by default -->
			<TranslationStatus />
		{/if}

		{#if !app.headerActionButton}
			<button onclick={cancel} class="btn-icon preset-outlined-surface-500" aria-label="Cancel">
				<iconify-icon icon="material-symbols:close" width="24"></iconify-icon>
			</button>
		{/if}
	</div>
</header>

{#if showMore}
	<div class="-mx-2 mb-2 flex flex-col gap-2 border-b px-4 pt-2 pb-2 text-center">
		<div class="flex justify-center gap-6">
			<!-- Status Toggle -->
			<div class="flex flex-col items-center">
				<Toggles value={publishToggle} disabled={disableStatusToggle} onChange={toggleStatus} />
				<span class="mt-1 text-xs" class:text-primary-500={publishToggle} class:text-error-500={!publishToggle}>
					{publishToggle ? m.status_publish() : m.status_unpublish()}
				</span>
			</div>

			<!-- Delete -->
			<div class="flex flex-col items-center">
				<button onclick={openDelete} disabled={!canDelete} class="btn-icon gradient-error" aria-label="Delete">
					<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon>
				</button>
			</div>

			{#if ['edit', 'create'].includes(currentMode)}
				<!-- Schedule -->
				<div class="flex flex-col items-center">
					<button onclick={openSchedule} disabled={!canWrite} class="btn-icon gradient-pink" aria-label="Schedule">
						<iconify-icon icon="bi:clock" width="24"></iconify-icon>
					</button>
				</div>

				<!-- Clone -->
				<div class="flex flex-col items-center">
					<button onclick={openClone} disabled={!canWrite || !canCreate} class="btn-icon gradient-secondary" aria-label="Clone">
						<iconify-icon icon="bi:clipboard-data-fill" width="24"></iconify-icon>
					</button>
				</div>
			{/if}
		</div>
		<!-- User -->
		<div class="space-y-1 text-xs">
			<p>Created by: <span class="text-tertiary-500 dark:text-primary-500 font-bold">{getDisplayName(currentEntry?.createdBy)}</span></p>
			{#if currentEntry?.updatedBy}
				<p class="text-tertiary-500 dark:text-primary-400">Last updated by: {getDisplayName(currentEntry?.updatedBy)}</p>
			{/if}
			{#if scheduleTimestamp}
				<p class="text-tertiary-500 dark:text-primary-400">Will publish on: {new Date(scheduleTimestamp).toLocaleString()}</p>
			{/if}
		</div>
	</div>
{/if}
