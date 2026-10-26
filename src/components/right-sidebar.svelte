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
	import { ui } from '@src/stores/ui-store.svelte';
	import { validationStore } from '@src/stores/validation-store.svelte';
	import Button from '@components/ui/button.svelte';
	// Components
	import Toggle from '@components/ui/toggle.svelte';
	import Badge from '@components/ui/badge.svelte';
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
	import { collections } from '@src/stores/collection-store.svelte';
	// Stores
	import { screen } from '@src/stores/screen-size-store.svelte';

	// Utils
	import { logger } from '@utils/logger';
	import { formatDisplayDate } from '@utils/date';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
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
	let user = $derived(page.data.layoutUser ?? page.data.user);
	let isAdmin = $derived(page.data.isAdmin === true);

	let currentMode = $derived(collections.mode);
	let currentCollection = $derived(collections.active);
	let currentEntry = $derived(collections.activeValue as Entry | null);

	let isFormValid = $derived(validationStore.isValid);
	let hasChanges = $derived(collections.hasChanges);

	let canWrite = $derived(currentCollection?.permissions?.[user?.role]?.write !== false);
	let canCreate = $derived(currentCollection?.permissions?.[user?.role]?.create !== false);
	let canDelete = $derived(currentCollection?.permissions?.[user?.role]?.delete !== false);

	let scheduleTimestamp = $derived(
		currentEntry?._scheduled ? Number(currentEntry._scheduled) : null
	);

	// --- Permissions & UI logic ---
	let showSidebar = $derived(['edit', 'create'].includes(currentMode) && canWrite);

	// Theme-aware: show collections in end sidebar?
	const themeCtx = getThemeContext();
	const showCollectionsHere = $derived(
		themeCtx?.features?.layoutRegions?.collections === 'right' ||
			themeCtx?.features?.layoutRegions?.collections === 'both'
	);

	let shouldDisableStatusToggle = $derived(
		(currentMode === 'create' && !ui.isRightSidebarVisible) ||
			(currentMode === 'edit' && !ui.isRightSidebarVisible && !screen.isDesktop) ||
			collections.isStatusLoading
	);

	let isMenuCollection = $derived(
		currentCollection?.name === 'Menu' || currentCollection?.slug === 'menu'
	);

	// --- Next button handling ---
	// Restore logic for MegaMenu wizard support
	let nextAction = $state<(() => void | Promise<void>) | null>(null);

	$effect(() => {
		// Logic: If it's the Menu collection in create mode, we ENABLE the Next button.
		if (isMenuCollection && currentMode === 'create') {
			ui.wizard.shouldShowNextButton = true;
			// If ui.wizard.saveLayerStore is explicitly set (by widget?), use it.
			nextAction = ui.wizard.saveLayerStore;
		} else {
			ui.wizard.shouldShowNextButton = false;
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
		const formatted = formatDisplayDate(dateStr, undefined, {
			year: 'numeric',
			month: 'short',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
		return formatted === 'Invalid Date' ? '-' : formatted;
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
		return await collections.toggleStatus(newValue, 'RightSidebar');
	}

	function openSchedule() {
		showScheduleModal({
			initialAction: currentEntry?.status === StatusTypes.publish ? 'publish' : 'unpublish',
			onSchedule: (date: Date, action: string) => {
				const timestamp = date.getTime();
				collections.activeValue = {
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
				entryPath: (entryData as any).path || undefined
			};

			const res = await fetch('/api/system-jobs', {
				method: 'POST',
				headers: clientJsonHeaders(),
				body: JSON.stringify({
					taskType: 'status-transition',
					payload,
					runAt: new Date(scheduledTs).toISOString()
				})
			});

			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				logger.error('[RightSidebar] Failed to create schedule job:', err);
			} else {
				logger.debug('[RightSidebar] Schedule job created successfully');
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
			dataToSave.status = collections.getStatusForSave();
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
	<div class="flex h-full flex-col gap-4 overflow-y-auto px-2 py-3">
		<!-- Collections tree (when theme moves it to end sidebar) -->
		{#if showCollectionsHere}
			<div class="shrink-0">
				<Collections />
			</div>
			{#if showSidebar}
				<hr class="border-(--admin-border-default)" />
			{/if}
		{/if}

		{#if showSidebar}
			<!-- Special "Next" button for Menu wizard -->
			{#if ui.wizard.shouldShowNextButton && currentMode === 'create' && isMenuCollection}
				<Button variant="tertiary" type="button" onclick={nextAction!} class="w-full gap-2">
					<iconify-icon icon="carbon:next-filled" width="20"></iconify-icon>
					{button_next()}
				</Button>
			{:else}
				<!-- Primary action + status -->
				<section
					class="shrink-0 rounded-xl border border-(--admin-border-default) bg-(--admin-bg-card) p-3 shadow-xs"
				>
					<div class="mb-3 flex items-center justify-between gap-2">
						<div class="min-w-0">
							<p
								class="text-[11px] font-semibold uppercase tracking-wider text-(--admin-text-muted)"
							>
								Status
							</p>
							<p class="mt-0.5 truncate text-xs font-medium text-(--admin-text-body)">
								{hasChanges ? 'Unsaved changes' : 'All changes saved'}
							</p>
						</div>
						<Badge variant={collections.isPublish ? 'success' : 'warning'} size="sm">
							{collections.isPublish ? status_publish() : status_unpublish()}
						</Badge>
					</div>

					<Button
						variant="primary"
						type="button"
						onclick={save}
						disabled={!isFormValid || !canWrite}
						aria-label="Save"
						title={!isFormValid ? 'Fix validation errors before saving' : 'Save changes'}
						class="w-full gap-2"
					>
						<iconify-icon icon="material-symbols:save" width="20"></iconify-icon>
						{button_save()}
					</Button>

					<div
						class="mt-3 rounded-lg border border-(--admin-border-default) bg-(--admin-bg-chip) px-2 py-1.5"
					>
						<Toggle
							value={collections.isPublish}
							label={collections.isPublish ? status_publish() : status_unpublish()}
							labelColor={collections.isPublish
								? 'text-tertiary-500 dark:text-primary-500'
								: 'text-error-500'}
							iconOn="ic:baseline-check-circle"
							iconOff="material-symbols:close"
							disabled={shouldDisableStatusToggle}
							onToggle={toggleStatus}
						/>
					</div>
				</section>

				{#if currentMode === 'edit'}
					<section class="shrink-0 space-y-2" aria-label="Entry actions">
						<Button
							variant="outline"
							type="button"
							onclick={handleClone}
							disabled={!canCreate}
							class="w-full justify-start gap-2"
						>
							<iconify-icon icon="bi:clipboard-data" width="16"></iconify-icon>
							<span class="truncate">Clone {currentCollection?.name}</span>
						</Button>

						<Button
							variant="error"
							type="button"
							onclick={handleDelete}
							disabled={!canDelete}
							class="w-full justify-start gap-2"
						>
							<iconify-icon icon="icomoon-free:bin" width="16"></iconify-icon>
							{button_delete()}
						</Button>
					</section>
				{/if}

				<!-- Publishing -->
				<section class="shrink-0 space-y-2">
					<h3 class="text-[11px] font-semibold uppercase tracking-wider text-(--admin-text-muted)">
						{siedabar_publish_options()}
					</h3>

					{#if scheduleTimestamp}
						<div
							class="rounded-lg border border-(--admin-border-default) bg-(--admin-bg-chip) px-3 py-2"
						>
							<p class="text-xs font-medium text-(--admin-text-muted)">
								{sidebar_will_publish_on()}
							</p>
							<p class="mt-0.5 text-xs font-semibold text-tertiary-500 dark:text-primary-500">
								{formatDisplayDate(scheduleTimestamp)}
							</p>
						</div>
					{/if}

					<Button variant="outline" onclick={openSchedule} class="w-full justify-start gap-2">
						<iconify-icon icon="bi:clock" width="16"></iconify-icon>
						<span class="truncate text-sm font-medium">
							{scheduleTimestamp ? 'Change schedule...' : 'Schedule publication...'}
						</span>
					</Button>

					{#if scheduleTimestamp}
						<Button
							variant="ghost"
							onclick={() => {
								collections.activeValue = {
									...currentEntry!,
									_scheduled: undefined,
									status: StatusTypes.draft
								};
								toast.success('Schedule cancelled');
							}}
							class="w-full justify-start gap-2 text-error-500"
						>
							<iconify-icon icon="material-symbols:cancel" width="16"></iconify-icon>
							<span class="text-sm">Cancel Schedule</span>
						</Button>
					{/if}
				</section>

				<!-- Authorship -->
				<section class="shrink-0 space-y-2">
					<h3 class="text-[11px] font-semibold uppercase tracking-wider text-(--admin-text-muted)">
						Authorship
					</h3>

					<div
						class="divide-y divide-(--admin-border-default) rounded-lg border border-(--admin-border-default) bg-(--admin-bg-card)"
					>
						<div class="flex items-center justify-between gap-2 px-3 py-2">
							<span class="text-xs text-(--admin-text-muted)">{sidebar_createdby()}</span>
							<span class="truncate text-xs font-semibold text-(--admin-text-body)">
								{getDisplayName(currentEntry?.createdBy as string)}
							</span>
						</div>

						{#if currentEntry?.updatedBy}
							<div class="flex items-center justify-between gap-2 px-3 py-2">
								<span class="text-xs text-(--admin-text-muted)">Last updated by</span>
								<span class="truncate text-xs font-semibold text-(--admin-text-body)">
									{getDisplayName(currentEntry?.updatedBy as string)}
								</span>
							</div>
						{/if}
					</div>
				</section>

				<!-- Plugin inspector panels (audit history, verify chain) sit below the
				     entry metadata, next to the timestamp footer. -->
				<Slot name="entry_edit_sidebar" props={{ collection: currentCollection, currentEntry }} />

				<footer class="mt-auto shrink-0 border-t border-(--admin-border-default) pt-3">
					<div class="space-y-1.5 text-xs">
						<div class="flex items-center justify-between gap-2">
							<span class="text-(--admin-text-muted)">Created</span>
							<span class="font-medium text-(--admin-text-body)">{dates.created}</span>
						</div>
						<div class="flex items-center justify-between gap-2">
							<span class="text-(--admin-text-muted)">Updated</span>
							<span class="font-medium text-(--admin-text-body)">{dates.updated}</span>
						</div>
					</div>

					{#if currentMode === 'create'}
						<div class="mt-2 text-center text-xs text-(--admin-text-muted)">
							{formatDisplayDate(Date.now(), undefined, {
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
