<!-- 
@file src/components/RightSidebar.svelte
@component
**RightSidebar component, refactored to use the central API service layer.**

This component provides a streamlined interface for managing a single collection entry.
All actions are delegated to `utils/data.ts` for a clean and maintainable implementation.
-->

<script lang="ts">
	// API Service
	import { addData, updateData, setStatus } from '@utils/data';

	// Stores
	import { page } from '$app/stores';
	import { validationStore } from '@stores/store.svelte';
	import { collection, mode, collectionValue } from '@stores/collectionStore.svelte';
	import { toggleUIElement } from '@stores/UIStore.svelte';

	// Utils & Components
	import { convertTimestampToDateString } from '@utils/utils';
	import Toggles from './system/inputs/Toggles.svelte';
	import ScheduleModal from './ScheduleModal.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { getLocale } from '@src/paraglide/runtime';

	// Skeleton
	import { getToastStore, getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';

	// Types
	import type { ContentTypes } from '@src/types';

	// --- Component State ---
	const { user } = page.data;
	let isLoading = $state(false);

	// --- Derived State ---
	let isPublished = $derived(collectionValue.value?.status === 'published');
	let schedule = $derived(
		collectionValue.value?._scheduled ? new Date(Number(collectionValue.value._scheduled)).toISOString().slice(0, 16) : ''
	);
	let dates = $derived({
		created: convertTimestampToDateString(collectionValue.value?.createdAt),
		updated: convertTimestampToDateString(collectionValue.value?.updatedAt)
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
			toggleUIElement('rightSidebar', 'collapsed');
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

	function openScheduleModal(): void {
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

	// --- Derived values for template ---
	const canWrite = $derived(collection.value?.permissions?.[user.role]?.write !== false);
	const canCreate = $derived(collection.value?.permissions?.[user.role]?.create !== false);
	const canDelete = $derived(collection.value?.permissions?.[user.role]?.delete !== false);
	const showSidebar = $derived(['edit', 'create'].includes(mode.value) || canWrite);
</script>

{#if showSidebar}
	<div class="flex h-full w-full flex-col justify-between px-3 py-4">
		<header class="flex flex-col items-center justify-center gap-3">
			<button
				type="button"
				onclick={handleSave}
				disabled={!validationStore.isValid || !canWrite || isLoading}
				class="variant-filled-primary btn w-full gap-2 shadow-lg transition-all duration-200"
				class:opacity-50={!validationStore.isValid || !canWrite || isLoading}
				class:cursor-not-allowed={!validationStore.isValid || !canWrite || isLoading}
				aria-label="Save entry"
				title={validationStore.isValid ? 'Save changes' : 'Please fix validation errors before saving'}
			>
				<iconify-icon icon="material-symbols:save" width="20" class="font-extrabold text-white"></iconify-icon>
				{isLoading ? 'Saving...' : m.button_save()}
			</button>

			<div class="gradient-secondary btn w-full gap-2 shadow-md">
				<Toggles
					label={isPublished ? m.status_published() : m.status_unpublished()}
					labelColor={isPublished ? 'text-primary-500' : 'text-error-500'}
					iconOn="ic:baseline-check-circle"
					iconOff="material-symbols:close"
					bind:value={isPublished}
					onChange={() => handleSetStatus(isPublished ? 'unpublished' : 'published')}
					disabled={isLoading}
				/>
			</div>

			{#if mode.value === 'edit'}
				<div class="flex w-full flex-col gap-2">
					<button
						type="button"
						onclick={handleClone}
						disabled={!canCreate || isLoading}
						class="gradient-secondary gradient-secondary-hover btn w-full gap-2 text-white shadow-md transition-all duration-200"
						aria-label="Clone entry"
					>
						<iconify-icon icon="bi:clipboard-data-fill" width="18"></iconify-icon>
						Clone <span class="font-semibold text-primary-500">{collection.value?.name}</span>
					</button>

					<button
						type="button"
						onclick={() => handleSetStatus('deleted')}
						disabled={!canDelete || isLoading}
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
					<p class="text-sm font-medium text-surface-600 dark:text-surface-300">
						{m.sidebar_will_publish_on()}
					</p>
				{/if}
				<button
					onclick={openScheduleModal}
					disabled={isLoading}
					aria-label="Schedule publication"
					class="hover:variant-filled-primary-hover variant-filled-surface btn w-full justify-start gap-2 text-left transition-colors duration-200"
				>
					<iconify-icon icon="bi:clock" width="16"></iconify-icon>
					<span class="text-sm text-tertiary-500 dark:text-primary-500">
						{schedule ? new Date(schedule).toLocaleString(getLocale()) : 'Schedule publication...'}
					</span>
				</button>
			</div>

			<div class="space-y-2">
				<label for="creation-date-input" class="text-sm font-medium">
					{m.adminarea_createat()}
				</label>
				<input
					id="creation-date-input"
					type="text"
					value={dates.created}
					class="input variant-filled-surface w-full text-sm"
					aria-label="Creation date"
					readonly
				/>
			</div>

			<div class="space-y-3">
				<div class="space-y-1">
					<p class="text-sm font-medium">
						{m.sidebar_createdby()}
					</p>
					<div class="variant-filled-surface rounded-lg p-3 text-center">
						<span class="text-sm font-semibold text-tertiary-500 dark:text-primary-500">
							{collectionValue.value?.createdBy || user.username}
						</span>
					</div>
				</div>

				{#if collectionValue.value?.updatedBy}
					<div class="space-y-1">
						<p class="text-sm font-medium text-surface-600 dark:text-surface-300">Last updated by</p>
						<div class="variant-filled-surface rounded-lg p-3 text-center">
							<span class="text-sm font-semibold text-tertiary-500 dark:text-primary-500">
								{collectionValue.value.updatedBy}
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
		</footer>
	</div>
{/if}