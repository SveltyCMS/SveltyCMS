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
	import { StatusTypes } from '@src/content/types';

	// Stores
	import { page } from '$app/state';
	import { saveLayerStore, shouldShowNextButton, validationStore } from '@stores/store.svelte';
	import { collection, mode, collectionValue } from '@stores/collectionStore.svelte';
	import { handleUILayoutToggle } from '@stores/UIStore.svelte';

	// Utils & Components
	import Toggles from './system/inputs/Toggles.svelte';
	import ScheduleModal from './collectionDisplay/ScheduleModal.svelte';
	import * as m from '@src/paraglide/messages';
	import { getLocale } from '@src/paraglide/runtime';

	// Skeleton
	import { getToastStore, getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalComponent, ModalSettings } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
	const modalStore = getModalStore();

	const { user } = page.data;

	// --- Wrapper functions for event handlers ---
	const handleCloneEntry = () => cloneCurrentEntry(modalStore, toastStore);
	const handleDeleteEntry = () => deleteCurrentEntry(modalStore, toastStore);

	// --- State Management ---
	let isPublish = $state(false);
	let schedule = $state('');

	$effect(() => {
		const cv = collectionValue.value;
		isPublish = cv?.status === StatusTypes.publish;
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
		const modalComponent: ModalComponent = { ref: ScheduleModal };
		const modalSettings: ModalSettings = {
			type: 'component',
			title: 'Scheduler',
			body: 'Set a date and time to schedule this entry.',
			component: modalComponent,
			response: (r: { date: string; action: string } | boolean) => {
				if (typeof r === 'object' && r.date) {
					schedule = r.date;
					if (r.action === 'schedule') {
						collectionValue.update((cv) => ({
							...cv,
							status: StatusTypes.schedule,
							_scheduled: new Date(r.date).getTime()
						}));
					}
				}
			}
		};
		modalStore.trigger(modalSettings);
	}

	function toggleStatus() {
		isPublish = !isPublish;
		collectionValue.update((cv) => ({
			...cv,
			status: isPublish ? StatusTypes.publish : StatusTypes.unpublish,
			updatedAt: new Date()
		}));
	}

	async function saveData() {
		if (!validationStore.isValid) {
			console.warn('Save blocked due to validation errors.');
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

		await saveEntry(dataToSave, toastStore, isPublish);
		handleUILayoutToggle();
	}

	const canWrite = $derived(collection.value?.permissions?.[user.role]?.write !== false);
	const canCreate = $derived(collection.value?.permissions?.[user.role]?.create !== false);
	const canDelete = $derived(collection.value?.permissions?.[user.role]?.delete !== false);
	const showSidebar = $derived(['edit', 'create'].includes(mode.value) || canWrite);
</script>

{#if showSidebar}
	<div class="flex h-full w-full flex-col justify-between px-3 py-4">
		{#if $shouldShowNextButton && mode.value === 'create'}
			<button type="button" onclick={next} aria-label="Next" class="variant-filled-primary btn w-full gap-2 shadow-lg">
				<iconify-icon icon="carbon:next-filled" width="20" class="font-extrabold text-white"></iconify-icon>
				{m.button_next()}
			</button>
		{:else}
			<header class="flex flex-col items-center justify-center gap-3">
				<button
					type="button"
					onclick={saveData}
					disabled={!validationStore.isValid || !canWrite}
					class="variant-filled-primary btn w-full gap-2 shadow-lg transition-all duration-200"
					class:opacity-50={!validationStore.isValid || !canWrite}
					class:cursor-not-allowed={!validationStore.isValid || !canWrite}
					aria-label="Save entry"
					title={validationStore.isValid() ? 'Save changes' : 'Please fix validation errors before saving'}
				>
					<iconify-icon icon="material-symbols:save" width="20" class="font-extrabold text-white"></iconify-icon>
					{m.button_save()}
				</button>

				<div class="gradient-secondary btn w-full gap-2 shadow-md">
					<Toggles
						label={isPublish ? m.status_publish() : m.status_unpublish()}
						labelColor={isPublish ? 'text-primary-500' : 'text-error-500'}
						iconOn="ic:baseline-check-circle"
						iconOff="material-symbols:close"
						bind:value={isPublish}
						onChange={toggleStatus}
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
								{#if user?.username}
									<div class="-ml-1.5">
										{user?.username}
									</div>
								{/if}
							</span>
						</div>
					</div>

					{#if collectionValue.value?.updatedBy}
						<div class="space-y-1">
							<p class="text-sm font-medium text-surface-600 dark:text-surface-300">Last updated by</p>
							<div class="variant-filled-surface rounded-lg p-3 text-center">
								<span class="text-sm font-semibold text-tertiary-500 dark:text-primary-500">
									{#if user?.username}
										<div class="-ml-1.5">
											{user?.username}
										</div>
									{/if}
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
