<!--
@file src/components/end-sidebar.svelte
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
	import Button from '@components/ui/button.svelte';
	// Components
	import Toggle from '@components/ui/toggle.svelte';
	import { StatusTypes } from '@src/content/types';
	// ParaglideJs
	import {
		button_delete,
		button_next,
		button_save,
		sidebar_createdby,
		sidebar_will_publish_on,
		siedabar_publish_options,
		status_publish,
		status_unpublish,
		validation_fix_before_save
	} from '@src/paraglide/messages';
	import { getLocale } from '@src/paraglide/runtime';
	import { collection, collectionValue, mode } from '@src/stores/collection-store.svelte';
	// Stores
	import { screen } from '@src/stores/screen-size-store.svelte';
	import { statusStore } from '@src/stores/status-store.svelte';
	import { app, dataChangeStore, validationStore } from '@src/stores/store.svelte';
	import { ui } from '@src/stores/ui-store.svelte';

	// Utils
	import { logger } from '@utils/logger';
	import { showScheduleModal } from '@utils/modal.svelte';
	import { navigationManager } from '@utils/navigation';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { page } from '$app/state';
	import Slot from '@src/components/system/slot.svelte';
	import Collections from '@src/components/collections.svelte';
	import { getThemeContext } from '@components/ui/theme-context.svelte';
	// Utils
	import { cloneCurrentEntry, deleteCurrentEntry, saveEntry } from '../utils/entry-actions';

	interface Entry {
		_scheduled?: string | number | Date;
		createdAt?: string;
		createdBy?: string;
		status?: string;
		updatedAt?: string;
		updatedBy?: string;
	}

	// --- Derived from page & stores ---
	let user = $derived(page.data.user);
	let isAdmin = $derived(page.data.isAdmin === true);

	let currentMode = $derived(mode.value);
	let currentCollection = $derived(collection.value);
	let currentEntry = $derived(collectionValue.value as Entry | null);

	let isFormValid = $derived(validationStore.isValid);
	let hasChanges = $derived(dataChangeStore.hasChanges);

	let canWrite = $derived(currentCollection?.permissions?.[user?.role]?.write !== false);
	let canCreate = $derived(currentCollection?.permissions?.[user?.role]?.create !== false);
	let canDelete = $derived(currentCollection?.permissions?.[user?.role]?.delete !== false);

	let scheduleTimestamp = $derived(currentEntry?._scheduled ? Number(currentEntry._scheduled) : null);

	// --- Permissions & UI logic ---
	let showSidebar = $derived(['edit', 'create'].includes(currentMode) && canWrite);

	// Theme-aware: show collections in end sidebar?
	const themeCtx = getThemeContext();
	const showCollectionsHere = $derived(
		(themeCtx?.features?.layoutRegions?.collections === 'right' ||
		 themeCtx?.features?.layoutRegions?.collections === 'both')
	);

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
		if (!value) {
			return 'system';
		}

		if (isUUID(value)) {
			// If it matches the current user's ID, show their details
			if (user && user._id === value) {
				if (user.username && !isUUID(user.username)) {
					return user.username;
				}
				if (user.firstName || user.lastName) {
					return [user.firstName, user.lastName].filter(Boolean).join(' ');
				}
				if (user.email) {
					return user.email.split('@')[0];
				}
			}
			// UUID fallback: show truncated ID instead of raw UUID for non-current users
			if (isUUID(value) && user && user._id !== value) {
				return `User ${value.substring(0, 8)}...`;
			}
		}

		return value;
	}

	function formatDate(dateStr: string | undefined | null): string {
		if (!dateStr) {
			return '-';
		}
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
				toast.success(`Entry scheduled for ${action}.`);
			}
		});
	}

	// Creates a job in svelty_jobs for scheduled publishing
	async function createScheduleJob(entryData: Record<string, unknown>, scheduledTs: number) {
		try {
			const payload = {
				collectionId: currentCollection?._id as string,
				entryId: entryData._id as string,
				targetStatus: entryData._scheduledAction || StatusTypes.publish,
				entryPath: (entryData as any).path || undefined,
			};

			const res = await fetch('/api/system-jobs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					taskType: 'status-transition',
					payload,
					runAt: new Date(scheduledTs).toISOString(),
				}),
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				logger.error('[RightSidebar] Failed to create schedule job:', err);
			} else {
				logger.info('[RightSidebar] Schedule job created successfully');
			}
		} catch (err) {
			logger.error('[RightSidebar] Error creating schedule job:', err);
		}
	}

	async function save() {
		if (!isFormValid) {
			toast.warning(validation_fix_before_save());
			return;
		}

		// In edit mode: no changes → just navigate back
		if (currentMode === 'edit' && !hasChanges) {
			logger.debug('[RightSidebar] No changes – navigating to list');
			ui.forceUpdate();
			await navigationManager.toList();
			return;
		}

		// Prepare data
		const dataToSave = { ...currentEntry! };

		if (scheduleTimestamp) {
			dataToSave.status = StatusTypes.schedule;
			dataToSave._scheduled = scheduleTimestamp;
		} else {
			dataToSave.status = statusStore.getStatusForSave();
			dataToSave._scheduled = undefined;
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
		if (!success) {
			return;
		}

		// If scheduling, create a svelty_jobs record
		if (dataToSave.status === StatusTypes.schedule && scheduleTimestamp) {
			await createScheduleJob(dataToSave, scheduleTimestamp);
		}

		ui.forceUpdate();
		await navigationManager.toList();
	}
</script>

{#if showSidebar || showCollectionsHere}
	<div class="flex h-full flex-col justify-between px-3 py-4">
		<!-- Collections tree (when theme moves it to end sidebar) -->
		{#if showCollectionsHere}
			<div class="mb-3">
				<Collections />
			</div>
			{#if showSidebar}
				<hr class="my-2 border-surface-200 dark:border-surface-700" />
			{/if}
		{/if}

		{#if showSidebar}
		<!-- Special "Next" button for Menu wizard -->
		{#if app.shouldShowNextButton && currentMode === 'create' && isMenuCollection}
			<Button variant="tertiary" type="button" onclick={nextAction!} class="dark: w-full gap-2 shadow-lg">
				<iconify-icon icon="carbon:next-filled" width="20"></iconify-icon>
				{button_next()}
			</Button>
		{:else}
			<!-- Main actions -->
			<header class="flex flex-col gap-3">
				<Button variant="tertiary"
					type="button"
					onclick={save}
					disabled={!isFormValid || !canWrite}
					aria-label="Save"
					title={!isFormValid ? 'Fix validation errors before saving' : 'Save changes'}
				 class="dark: w-full gap-2 shadow-lg transition-all">
					<iconify-icon icon="material-symbols:save" width="20"></iconify-icon>
					{button_save()}
				</Button>

				<div class="gradient-secondary w-full gap-2 rounded p-2 shadow-md">
					<Toggle
						value={statusStore.isPublish}
						label={statusStore.isPublish ? status_publish() : status_unpublish()}
						labelColor={statusStore.isPublish ? 'text-tertiary-500 dark:text-primary-500' : 'text-error-500'}
						iconOn="ic:baseline-check-circle"
						iconOff="material-symbols:close"
						disabled={shouldDisableStatusToggle}
						onToggle={toggleStatus}
					/>
				</div>

				{#if currentMode === 'edit'}
					<div class="flex w-full flex-col gap-2">
						<Button variant="outline"
							type="button"
							onclick={handleClone}
							disabled={!canCreate}
						 class="gradient-secondary gradient-secondary-hover w-full gap-2 text-white shadow-md">
							<iconify-icon icon="bi:clipboard-data-fill" width="18"></iconify-icon>
							Clone <span class="font-semibold text-tertiary-500 dark:text-primary-500">{currentCollection?.name}</span>
						</Button>

						<Button variant="error" type="button" onclick={handleDelete} disabled={!canDelete} class="w-full gap-2 shadow-md">
							<iconify-icon icon="icomoon-free:bin" width="18"></iconify-icon>
							{button_delete()}
						</Button>
					</div>
				{/if}
			</header>

			<Slot name="entry_edit_sidebar" props={{ collection, currentEntry }} />

			<main class="mt-6 flex w-full flex-col gap-4 text-start">
				<div class="border-b border-surface-300 pb-2 dark:border-surface-600">
					<h3 class="text-center text-sm font-bold uppercase tracking-wide text-tertiary-500 dark:text-primary-500">{siedabar_publish_options()}</h3>
				</div>

				<div class="space-y-2">
						{#if scheduleTimestamp}
							<p class="text-sm font-medium text-surface-600 dark:text-surface-300">{sidebar_will_publish_on()}</p>
							<p class="text-xs font-semibold text-tertiary-500 dark:text-primary-500">
								{new Date(scheduleTimestamp).toLocaleString(getLocale())}
							</p>
						{/if}
						<Button variant="surface"
							onclick={openSchedule}
						 class="hover: w-full justify-start gap-2 text-start">
							<iconify-icon icon="bi:clock" width="16"></iconify-icon>
							<span class="text-sm text-tertiary-500 dark:text-primary-500">
								{scheduleTimestamp ? 'Change schedule...' : 'Schedule publication...'}
							</span>
						</Button>
						{#if scheduleTimestamp}
							<Button variant="error"
								onclick={() => {
									collectionValue.value = { ...currentEntry!, _scheduled: undefined, status: StatusTypes.draft };
									toast.success('Schedule cancelled');
								}}
							 class="w-full justify-start gap-2 text-start text-sm">
								<iconify-icon icon="material-symbols:cancel" width="16"></iconify-icon>
								<span>Cancel Schedule</span>
							</Button>
						{/if}
				</div>

				<div class="space-y-3">
					<div class="space-y-1">
						<p class="text-sm font-medium">{sidebar_createdby()}</p>
						<div class="preset-filled-surface-500 rounded p-1.5 text-center">
							<span class="text-sm font-semibold text-tertiary-500 dark:text-primary-500"> {getDisplayName(currentEntry?.createdBy as string)} </span>
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
		{/if}
	</div>
{/if}
