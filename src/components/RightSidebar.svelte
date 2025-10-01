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
	// Correctly import the new, direct action handlers
	import { cloneCurrentEntry, deleteCurrentEntry, saveEntry } from '../utils/entryActions';

	// Import StatusTypes for centralized status management
	import type { StatusType } from '@src/content/types';
	import { StatusTypes } from '@src/content/types';
	// Stores
	import { page } from '$app/state';
	import { screenSize } from '@src/stores/screenSizeStore.svelte';
	import { collection, collectionValue, mode } from '@stores/collectionStore.svelte';
	import { saveLayerStore, shouldShowNextButton, validationStore } from '@stores/store.svelte';
	import { handleUILayoutToggle, uiStateManager } from '@stores/UIStore.svelte';
	// Utils & Components
	import * as m from '@src/paraglide/messages';
	import { getLocale } from '@src/paraglide/runtime';
	import { showScheduleModal } from '@utils/modalUtils';
	import Toggles from './system/inputs/Toggles.svelte';
	// Skeleton
	import { getModalStore } from '@skeletonlabs/skeleton';
	import { showToast } from '@utils/toast';
	const modalStore = getModalStore();

	const { user } = page.data;
	const isAdmin = page.data.isAdmin || false;

	// --- Wrapper functions for event handlers ---
	const handleCloneEntry = () => cloneCurrentEntry();
	const handleDeleteEntry = () => deleteCurrentEntry(modalStore, isAdmin);

	// --- Status Management using collection status directly  ---
	function getIsPublish(): boolean {
		const status = collectionValue.value?.status ?? collection.value?.status ?? StatusTypes.unpublish;
		return status === StatusTypes.publish;
	}
	let isLoading = $state(false);

	// Handle toggle changes - update collection status directly
	async function handleStatusToggle(newValue: boolean) {
		const isPublish = getIsPublish();
		if (newValue === isPublish || isLoading) {
			if (process.env.NODE_ENV !== 'production') {
				console.log('[RightSidebar] Toggle skipped', { newValue, isPublish, isLoading });
			}
			return false;
		}

		isLoading = true;
		const newStatus: StatusType = newValue ? StatusTypes.publish : StatusTypes.unpublish;
		if (process.env.NODE_ENV !== 'production') {
			console.log('[RightSidebar] Status toggle clicked - updating to:', newStatus);
		}

		try {
			// If entry exists, update via API
			if (collectionValue.value?._id && collection.value?._id) {
				const { updateEntryStatus } = await import('@src/utils/apiClient');
				const result = await updateEntryStatus(String(collection.value._id), String(collectionValue.value._id), newStatus);

				if (result.success) {
					// Update the collection value store
					collectionValue.update((current) => ({ ...current, status: newStatus }));

					showToast(newValue ? 'Entry published successfully.' : 'Entry unpublished successfully.', 'success');

					if (process.env.NODE_ENV !== 'production') {
						console.log('[RightSidebar] API update successful');
					}
					return true;
				} else {
					showToast(result.error || `Failed to ${newValue ? StatusTypes.publish : StatusTypes.unpublish} entry`, 'error');

					console.error('[RightSidebar] API update failed:', result.error);
					return false;
				}
			} else {
				// New entry - just update local state
				collectionValue.update((current) => ({ ...current, status: newStatus }));
				if (process.env.NODE_ENV !== 'production') {
					console.log('[RightSidebar] Local update for new entry');
				}
				return true;
			}
		} catch (e) {
			const errorMessage = `Error ${newValue ? StatusTypes.publish : StatusTypes.unpublish} entry: ${(e as Error).message}`;
			showToast(errorMessage, 'error');

			console.error('[RightSidebar] Toggle error:', e);
			return false;
		} finally {
			isLoading = false;
		}
	}

	const shouldDisableStatusToggle = $derived(
		(mode.value === 'create' && !uiStateManager.isRightSidebarVisible.value) ||
			(mode.value === 'edit' && !uiStateManager.isRightSidebarVisible.value && screenSize.value !== 'LG') ||
			isLoading
	);

	let schedule = $state('');

	// Handle schedule updates
	$effect(() => {
		const cv = collectionValue.value;
		schedule = cv?._scheduled ? new Date(Number(cv._scheduled)).toISOString().slice(0, 16) : '';
	});
	let dates = $derived({
		created: collectionValue.value?.createdAt
			? new Date(String(collectionValue.value.createdAt)).toLocaleDateString(getLocale(), {
					year: 'numeric',
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit'
				})
			: '-',
		updated: collectionValue.value?.updatedAt
			? new Date(String(collectionValue.value.updatedAt)).toLocaleDateString(getLocale(), {
					year: 'numeric',
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit'
				})
			: '-'
	});

	let next = $state(() => {});
	$effect(() => {
		const unsub = saveLayerStore.subscribe((value) => {
			next = value;
			shouldShowNextButton.set(false);
		});
		return unsub;
	});

	function openScheduleModal(): void {
		showScheduleModal({
			onSchedule: (date: Date, action: string) => {
				schedule = date.toISOString();
				if (action === StatusTypes.schedule) {
					collectionValue.update((cv) => ({
						...cv,
						status: StatusTypes.schedule,
						_scheduled: date.getTime()
					}));
					if (process.env.NODE_ENV !== 'production') {
						console.log('[RightSidebar] Entry scheduled');
					}
				}
			}
		});
	}

	// Shared save logic for HeaderEdit and RightSidebar
	function prepareAndSaveEntry() {
		if (!validationStore.isValid) {
			console.warn('[RightSidebar] Save blocked due to validation errors.');
			showToast(m.validation_fix_before_save(), 'error');
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
		if (process.env.NODE_ENV !== 'production') {
			console.log('[RightSidebar] Saving with status:', dataToSave.status, 'collectionValue.status:', collectionValue.value?.status);
		}
		saveEntry(dataToSave);
		handleUILayoutToggle();
	}

	async function saveData() {
		prepareAndSaveEntry();
	}

	const canWrite = $derived(collection.value?.permissions?.[user.role]?.write !== false);
	const canCreate = $derived(collection.value?.permissions?.[user.role]?.create !== false);
	const canDelete = $derived(collection.value?.permissions?.[user.role]?.delete !== false);
	const showSidebar = $derived(['edit', 'create'].includes(mode.value) || canWrite);
</script>

{#if showSidebar}
	<div class="flex h-full w-full flex-col justify-between px-3 py-4">
		{#if $shouldShowNextButton && mode.value === 'create' && (collection.value?.name === 'Menu' || collection.value?.slug === 'menu')}
			<button type="button" onclick={next} aria-label="Next" class="variant-filled-primary btn w-full gap-2 shadow-lg">
				<iconify-icon icon="carbon:next-filled" width="20" class="font-extrabold text-white"></iconify-icon>
				{m.button_next()}
			</button>
		{/if}
		{#if !($shouldShowNextButton && mode.value === 'create' && (collection.value?.name === 'Menu' || collection.value?.slug === 'menu'))}
			<header class="flex flex-col items-center justify-center gap-3">
				<button
					type="button"
					onclick={saveData}
					disabled={!validationStore.isValid || !canWrite}
					class="variant-filled-primary btn w-full gap-2 shadow-lg transition-all duration-200"
					class:opacity-50={!validationStore.isValid || !canWrite}
					class:cursor-not-allowed={!validationStore.isValid || !canWrite}
					aria-label="Save entry"
					title={validationStore.isValid ? 'Save changes' : 'Please fix validation errors before saving'}
				>
					<iconify-icon icon="material-symbols:save" width="20" class="font-extrabold text-white"></iconify-icon>
					{m.button_save()}
				</button>

				<div class="gradient-secondary btn w-full gap-2 shadow-md">
					<Toggles
						value={getIsPublish()}
						label={getIsPublish() ? m.status_publish() : m.status_unpublish()}
						labelColor={getIsPublish() ? 'text-primary-500' : 'text-error-500'}
						iconOn="ic:baseline-check-circle"
						iconOff="material-symbols:close"
						disabled={shouldDisableStatusToggle || isLoading}
						onChange={handleStatusToggle}
						title={shouldDisableStatusToggle ? 'Status managed by header in mobile view' : getIsPublish() ? m.status_publish() : m.status_unpublish()}
					/>
				</div>

				{#if mode.value === 'edit'}
					<div class="flex w-full flex-col gap-2">
						<button
							type="button"
							onclick={handleCloneEntry}
							disabled={!canCreate}
							class="gradient-secondary gradient-secondary-hover btn w-full gap-2 text-white shadow-md transition-all duration-200"
							aria-label="Clone entry"
						>
							<iconify-icon icon="bi:clipboard-data-fill" width="18"></iconify-icon>
							Clone <span class="font-semibold text-primary-500">{collection.value?.name}</span>
						</button>

						<button
							type="button"
							onclick={handleDeleteEntry}
							disabled={!canDelete}
							class="variant-filled-error btn w-full gap-2 shadow-md transition-all duration-200 hover:shadow-lg"
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
					{#if schedule}
						<p class="text-sm font-medium text-surface-600 dark:text-surface-300">{m.sidebar_will_publish_on()}</p>
					{/if}
					<button
						onclick={openScheduleModal}
						aria-label="Schedule publication"
						class="hover:variant-filled-primary-hover variant-filled-surface btn w-full justify-start gap-2 text-left transition-colors duration-200"
					>
						<iconify-icon icon="bi:clock" width="16"></iconify-icon>
						<span class="text-sm text-tertiary-500 dark:text-primary-500">
							{schedule ? new Date(schedule).toLocaleString(getLocale()) : 'Schedule publication...'}
						</span>
					</button>
				</div>

				<div class="space-y-3">
					<div class="space-y-1">
						<p class="text-sm font-medium">{m.sidebar_createdby()}</p>
						<div class="variant-filled-surface rounded-lg p-3 text-center">
							<span class="text-sm font-semibold text-tertiary-500 dark:text-primary-500">
								{collectionValue.value?.createdBy || user?.username || 'system'}
							</span>
						</div>
					</div>

					{#if collectionValue.value?.updatedBy}
						<div class="space-y-1">
							<p class="text-sm font-medium text-surface-600 dark:text-surface-300">Last updated by</p>
							<div class="variant-filled-surface rounded-lg p-3 text-center">
								<span class="text-sm font-semibold text-tertiary-500 dark:text-primary-500">
									{collectionValue.value.updatedBy || user?.username || 'system'}
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

				{#if mode.value === 'create'}
					<div class="mt-3 text-center">
						<p class="text-xs text-surface-500">
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
