<!--
@file src/components/RightSidebar.svelte
@component RightSidebar – Collection entry management (save, status, schedule, metadata)

@features
- Centralized validation & change tracking
- Save with proper validation guard
- Status toggle with loading state
- Schedule publication modal
- Clone/delete with permission checks
- Clean display of created/updated metadata
-->

<script lang="ts">
	import { page } from '$app/state';
	import { navigationManager } from '@utils/navigationManager';
	import { getLocale } from '@src/paraglide/runtime';
	// Utils
	import { cloneCurrentEntry, deleteCurrentEntry, saveEntry } from '../utils/entryActions';
	import { showScheduleModal } from '@utils/modalUtils';
	import { showToast } from '@utils/toast';
	// ParaglideJs
	import * as m from '@src/paraglide/messages';

	import { StatusTypes } from '@src/content/types';
	// Stores
	import { screen } from '@stores/screenSizeStore.svelte';
	import { collection, collectionValue, mode } from '@stores/collectionStore.svelte';
	import { app, validationStore, dataChangeStore } from '@stores/store.svelte';
	import { ui } from '@stores/UIStore.svelte';
	import { statusStore } from '@stores/statusStore.svelte';
	// Components
	import Toggles from './system/inputs/Toggles.svelte';
	// System Logger
	import { logger } from '@utils/logger';

	// --- Derived from page & stores ---
	let user = $derived(page.data.user);
	let isAdmin = $derived(page.data.isAdmin === true);

	let currentMode = $derived(mode.value);
	let currentCollection = $derived(collection.value);
	let currentEntry = $derived(collectionValue.value as Record<string, any> | null);

	let isFormValid = $derived(validationStore.isValid);
	let hasChanges = $derived(dataChangeStore.hasChanges);

	let canWrite = $derived(currentCollection?.permissions?.[user?.role]?.write !== false);
	let canCreate = $derived(currentCollection?.permissions?.[user?.role]?.create !== false);
	let canDelete = $derived(currentCollection?.permissions?.[user?.role]?.delete !== false);

	let scheduleTimestamp = $derived(currentEntry?._scheduled ? Number(currentEntry._scheduled) : null);

	// --- Permissions & UI logic ---
	let showSidebar = $derived(['edit', 'create'].includes(currentMode) && canWrite);

	let shouldDisableStatusToggle = $derived(
		(currentMode === 'create' && !ui.isRightSidebarVisible) ||
			(currentMode === 'edit' && !ui.isRightSidebarVisible && !screen.isDesktop) ||
			statusStore.isLoading
	);

	let isMenuCollection = $derived(currentCollection?.name === 'Menu' || currentCollection?.slug === 'menu');

	// --- Next button handling ---
	// Restore logic for MegaMenu wizard support
	let nextAction = $state<(() => void | Promise<void>) | null>(null);

	$effect(() => {
		// Logic: If it's the Menu collection in create mode, we ENABLE the Next button.
		if (isMenuCollection && currentMode === 'create') {
			app.shouldShowNextButton = true;
			// If app.saveLayerStore is explicitly set (by widget?), use it.
			nextAction = app.saveLayerStore;
		} else {
			app.shouldShowNextButton = false;
			nextAction = null;
		}
	});

	// --- Helpers ---
	function isUUID(str: string): boolean {
		// Support both standard UUIDs (with dashes) and dashless UUIDs (32 hex chars)
		return /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(str);
	}

	function getDisplayName(value: string | undefined | null): string {
		if (!value) return 'system';

		if (isUUID(value)) {
			// If it matches the current user's ID, show their details
			if (user && user._id === value) {
				if (user.username && !isUUID(user.username)) return user.username;
				if (user.firstName || user.lastName) return [user.firstName, user.lastName].filter(Boolean).join(' ');
				if (user.email) return user.email.split('@')[0];
			}
			// TODO: Add lookup for other users if needed (requires a user store or API call)
			// For now, if it's a UUID and not the current user, it falls back to showing the UUID relative to the context,
			// or we could show "User ..."
			// But returning the raw UUID is better than "system".
		}

		return value;
	}

	function formatDate(dateStr: string | undefined | null): string {
		if (!dateStr) return '-';
		try {
			return new Date(dateStr).toLocaleString(getLocale(), {
				year: 'numeric',
				month: 'short',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '-';
		}
	}

	let dates = $derived({
		created: formatDate(currentEntry?.createdAt as string),
		updated: formatDate(currentEntry?.updatedAt as string)
	});

	// --- Actions ---
	function handleClone() {
		cloneCurrentEntry();
	}

	function handleDelete() {
		deleteCurrentEntry(isAdmin);
	}

	async function toggleStatus(newValue: boolean): Promise<boolean> {
		return await statusStore.toggleStatus(newValue, 'RightSidebar');
	}

	function openSchedule() {
		showScheduleModal({
			initialAction: currentEntry?.status === StatusTypes.publish ? 'publish' : 'unpublish',
			onSchedule: (date: Date, action: string) => {
				const timestamp = date.getTime();
				collectionValue.value = {
					...currentEntry!,
					status: StatusTypes.schedule,
					_scheduled: timestamp
				};
				showToast(`Entry scheduled for ${action}.`, 'success');
			}
		});
	}

	async function save() {
		if (!isFormValid) {
			showToast(m.validation_fix_before_save(), 'warning');
			return;
		}

		// In edit mode: no changes → just navigate back
		if (currentMode === 'edit' && !hasChanges) {
			logger.debug('[RightSidebar] No changes – navigating to list');
			ui.forceUpdate();
			await navigationManager.navigateToList();
			return;
		}

		// Prepare data
		const dataToSave = { ...currentEntry! };

		if (scheduleTimestamp) {
			dataToSave.status = StatusTypes.schedule;
			dataToSave._scheduled = scheduleTimestamp;
		} else {
			dataToSave.status = statusStore.getStatusForSave();
			delete dataToSave._scheduled;
		}

		// Metadata
		if (currentMode === 'create') {
			dataToSave.createdBy = getDisplayName(user?.username);
		}
		dataToSave.updatedBy = getDisplayName(user?.username);

		if (process.env.NODE_ENV !== 'production') {
			logger.debug('[RightSidebar] Saving entry:', dataToSave);
		}

		const success = await saveEntry(dataToSave);
		if (!success) return;

		ui.forceUpdate();
		await navigationManager.navigateToList();
	}
</script>

{#if showSidebar}
	<div class="flex h-full flex-col justify-between px-3 py-4">
		<!-- Special "Next" button for Menu wizard -->
		{#if app.shouldShowNextButton && currentMode === 'create' && isMenuCollection}
			<button type="button" onclick={nextAction!} class="btn preset-filled-primary-500 w-full gap-2 shadow-lg">
				<iconify-icon icon="carbon:next-filled" width="20"></iconify-icon>
				{m.button_next()}
			</button>
		{:else}
			<!-- Main actions -->
			<header class="flex flex-col gap-3">
				<button
					type="button"
					onclick={save}
					disabled={!isFormValid || !canWrite}
					class="btn preset-filled-primary-500 w-full gap-2 shadow-lg transition-all"
					class:opacity-50={!isFormValid || !canWrite}
					class:cursor-not-allowed={!isFormValid || !canWrite}
					aria-label="Save"
					title={!isFormValid ? 'Fix validation errors before saving' : 'Save changes'}
				>
					<iconify-icon icon="material-symbols:save" width="20"></iconify-icon>
					{m.button_save()}
				</button>

				<div class="btn gradient-secondary w-full gap-2 shadow-md">
					<Toggles
						value={statusStore.isPublish}
						label={statusStore.isPublish ? m.status_publish() : m.status_unpublish()}
						labelColor={statusStore.isPublish ? 'text-primary-500' : 'text-error-500'}
						iconOn="ic:baseline-check-circle"
						iconOff="material-symbols:close"
						disabled={shouldDisableStatusToggle}
						onChange={toggleStatus}
					/>
				</div>

				{#if currentMode === 'edit'}
					<div class="flex w-full flex-col gap-2">
						<button
							type="button"
							onclick={handleClone}
							disabled={!canCreate}
							class="btn gradient-secondary gradient-secondary-hover w-full gap-2 text-white shadow-md"
						>
							<iconify-icon icon="bi:clipboard-data-fill" width="18"></iconify-icon>
							Clone <span class="font-semibold text-primary-500">{currentCollection?.name}</span>
						</button>

						<button type="button" onclick={handleDelete} disabled={!canDelete} class="btn preset-filled-error-500 w-full gap-2 shadow-md">
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
						<p class="text-sm font-medium text-surface-600 dark:text-surface-300">
							{m.sidebar_will_publish_on()}
						</p>
					{/if}
					<button
						onclick={openSchedule}
						class="btn preset-filled-surface-500 hover:preset-filled-primary-500-hover w-full justify-start gap-2 text-left transition-colors"
					>
						<iconify-icon icon="bi:clock" width="16"></iconify-icon>
						<span class="text-sm text-tertiary-500 dark:text-primary-500">
							{scheduleTimestamp ? new Date(scheduleTimestamp).toLocaleString(getLocale()) : 'Schedule publication...'}
						</span>
					</button>
				</div>

				<div class="space-y-3">
					<div class="space-y-1">
						<p class="text-sm font-medium">{m.sidebar_createdby()}</p>
						<div class="preset-filled-surface-500 rounded p-1.5 text-center">
							<span class="text-sm font-semibold text-tertiary-500 dark:text-primary-500">
								{getDisplayName(currentEntry?.createdBy as string)}
							</span>
						</div>
					</div>

					{#if currentEntry?.updatedBy}
						<div class="space-y-1">
							<p class="text-sm font-medium text-surface-600 dark:text-surface-300">Last updated by</p>
							<div class="preset-filled-surface-500 rounded p-1.5 text-center">
								<span class="text-sm font-semibold text-tertiary-500 dark:text-primary-500">
									{getDisplayName(currentEntry?.updatedBy as string)}
								</span>
							</div>
						</div>
					{/if}
				</div>
			</main>

			<footer class="mt-6 border-t border-surface-300 pt-4 dark:border-surface-600">
				<div class="space-y-2 text-xs">
					<div class="flex items-center justify-between">
						<span class="font-medium capitalize">Created:</span>
						<span class="font-bold text-tertiary-500 dark:text-primary-500">{dates.created}</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="font-medium capitalize">Updated:</span>
						<span class="font-bold text-tertiary-500 dark:text-primary-500">{dates.updated}</span>
					</div>
				</div>

				{#if currentMode === 'create'}
					<div class="mt-3 text-center text-xs text-tertiary-500 dark:text-primary-500">
						{new Date().toLocaleString(getLocale(), {
							year: 'numeric',
							month: 'short',
							day: 'numeric',
							hour: '2-digit',
							minute: '2-digit'
						})}
					</div>
				{/if}
			</footer>
		{/if}
	</div>
{/if}
