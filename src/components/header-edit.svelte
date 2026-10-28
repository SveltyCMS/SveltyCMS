<!--
@file src/components/header-edit.svelte
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
	import { ui } from '@src/stores/ui-store.svelte';
	import { contentLanguage } from '@src/stores/locale-store.svelte';
	import { validationStore } from '@src/stores/validation-store.svelte';
	import Button from '@components/ui/button.svelte';
	import TranslationStatus from '@src/components/collection-display/translation-status.svelte';
	import Toggle from '@components/ui/toggle.svelte';
	import { formatDateTime } from '@utils/format-date';
	import type { CollectionEntry } from '@src/content/types';
	import { StatusTypes } from '@src/content/types';
	// ParaglideJS
	import {
		form_required,
		status_publish,
		status_unpublish,
		validation_fix_before_save
	} from '@src/paraglide/messages';
	import { setCollectionValue, collections } from '@src/stores/collection-store.svelte';
	import { modeTransitionGuard } from '@src/stores/mode-transition-guard.svelte';
	import { screen } from '@src/stores/screen-size-store.svelte';
	import { createEntry, invalidateCollectionCache } from '@utils/api';
	import { deleteCurrentEntry, saveEntry } from '@utils/entry-actions';
	import { getFieldName } from '@utils/schema/field-utils';
	// --- Derived from page & stores ---
	import { logger } from '@utils/logger';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
	import { showCloneModal, showScheduleModal } from '@utils/modal.svelte';
	import { navigationManager } from '@utils/navigation';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { untrack } from 'svelte';
	// Modal types import
	// Stores
	import { page } from '$app/state';
	import Slot from '@src/components/system/slot.svelte';

	// --- Derived from page & stores ---
	let user = $derived(page.data.layoutUser ?? page.data.user);
	let isAdmin = $derived(page.data.isAdmin === true);

	let currentMode = $derived(collections.mode);
	let currentCollection = $derived(collections.active);
	let currentEntry = $derived(collections.activeValue as CollectionEntry | null);

	let isDesktop = $derived(screen.isDesktop);

	let isFormValid = $derived(validationStore.isValid);
	let hasChanges = $derived(collections.hasChanges);

	let canWrite = $derived(currentCollection?.permissions?.[user?.role]?.write !== false);
	let canCreate = $derived(currentCollection?.permissions?.[user?.role]?.create !== false);
	let canDelete = $derived(currentCollection?.permissions?.[user?.role]?.delete !== false);

	// --- Local mutable state ---
	let showMore = $state(false);
	let previousLanguage = $state(contentLanguage.value);
	let previousTabSet = $state(ui.wizard.tabSetState);
	let tempData = $state<Record<string, CollectionEntry>>({});

	// Schedule (not used in current logic – kept if needed later)
	let scheduleTimestamp = $derived(
		currentEntry?._scheduled ? Number(currentEntry._scheduled) : null
	);

	// Status toggle state & disable logic
	let publishToggle = $derived(collections.isPublish);
	let disableStatusToggle = $derived(
		(currentMode === 'create' && ui.isRightSidebarVisible) ||
			(currentMode === 'edit' && ui.isRightSidebarVisible && isDesktop) ||
			collections.isStatusLoading
	);

	// Next button visibility (menu wizard)
	let showNextButton = $derived(
		ui.wizard.shouldShowNextButton &&
			currentMode === 'create' &&
			(currentCollection?.name === 'Menu' || currentCollection?.slug === 'menu')
	);

	// --- Effects ---
	$effect(() => {
		if (ui.wizard.tabSetState !== previousTabSet) {
			untrack(() => {
				tempData[previousLanguage] = { ...currentEntry };
				previousTabSet = ui.wizard.tabSetState;
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

	function getDisplayName(value: string | null | undefined = undefined): string {
		if (!value || isUUID(value)) {
			if (user?.username && !isUUID(user.username)) {
				return user.username;
			}
			if (user?.firstName || user?.lastName) {
				return [user.firstName, user.lastName].filter(Boolean).join(' ');
			}
			if (user?.email) {
				return user.email.split('@')[0];
			}
			return 'system';
		}
		return value;
	}

	// --- Actions ---
	async function toggleStatus(newValue: boolean): Promise<void> {
		await collections.toggleStatus(newValue, 'HeaderEdit');
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

	// Creates a job in svelty_jobs for scheduled publishing
	async function createScheduleJob(entryData: Record<string, unknown>, scheduledTs: number) {
		try {
			const payload = {
				collectionId: currentCollection?._id as string,
				entryId: entryData._id as string,
				targetStatus: (entryData._scheduledAction as string) || StatusTypes.publish,
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
				logger.error('[HeaderEdit] Failed to create schedule job:', err);
			} else {
				logger.debug('[HeaderEdit] Schedule job created successfully');
			}
		} catch (err) {
			logger.error('[HeaderEdit] Error creating schedule job:', err);
		}
	}

	function getFieldLabel(key: string): string {
		if (!key) return '';
		const fields = (currentCollection?.fields || []) as any[];

		function findField(list: any[], target: string): any {
			for (const f of list) {
				if (!f || typeof f !== 'object') continue;
				if (f.db_fieldName === target || f.name === target || f.label === target) {
					return f;
				}
				if (f.label && getFieldName(f, false) === target) {
					return f;
				}
				if (f.fields && Array.isArray(f.fields)) {
					const child = findField(f.fields, target);
					if (child) return child;
				}
			}
			return null;
		}

		// Direct match
		const direct = findField(fields, key);
		if (direct?.label) {
			return typeof direct.label === 'string' ? direct.label : String(direct.label);
		}

		// Nested dot notation match (e.g., "seo.title")
		if (key.includes('.')) {
			const parts = key.split('.');
			const parentField = findField(fields, parts[0]);
			if (parentField?.fields && Array.isArray(parentField.fields)) {
				const childField = findField(parentField.fields, parts.slice(1).join('.'));
				if (childField?.label) {
					const pLabel = parentField.label || parts[0];
					const cLabel = childField.label;
					return `${pLabel} (${cLabel})`;
				}
			}
			if (parentField?.label) {
				const humanChild = parts
					.slice(1)
					.map((p) => p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))
					.join(' ');
				return `${parentField.label} (${humanChild})`;
			}
		}

		// Fallback: convert snake_case/camelCase to Title Case
		return key
			.replace(/[._]/g, ' ')
			.replace(/([a-z])([A-Z])/g, '$1 $2')
			.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	async function focusInvalidField(key: string): Promise<void> {
		// If edit tab is inactive, switch to tab 0
		const editTab = document.querySelector(
			'button[role="tab"][data-value="0"]'
		) as HTMLElement | null;
		if (editTab && editTab.getAttribute('aria-selected') !== 'true') {
			editTab.click();
			await new Promise((r) => requestAnimationFrame(r));
		}

		const escapeCss = (s: string) =>
			typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
				? CSS.escape(s)
				: s.replace(/([ #;?%&,.+*~':"!^$[\]()=>|/@])/g, '\\$1');

		const safeKey = escapeCss(key);
		const lastPart = key.includes('.') ? escapeCss(key.split('.').pop()!) : safeKey;
		const firstPart = key.includes('.') ? escapeCss(key.split('.')[0]!) : safeKey;

		const selectors = [
			`#${safeKey}`,
			`[name="${safeKey}"]`,
			`[data-fieldname="${safeKey}"]`,
			`[data-field-name="${safeKey}"]`,
			`#field-container-${safeKey}`,
			`[data-field-name="${firstPart}"]`,
			`#field-container-${firstPart}`,
			`[name="${lastPart}"]`,
			`#${lastPart}`
		];

		let targetEl: HTMLElement | null = document.getElementById(key);

		if (!targetEl) {
			for (const sel of selectors) {
				const found = document.querySelector<HTMLElement>(sel);
				if (found) {
					targetEl = found;
					break;
				}
			}
		}

		if (targetEl) {
			if (
				!['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(targetEl.tagName) &&
				!targetEl.hasAttribute('contenteditable')
			) {
				const focusable = targetEl.querySelector<HTMLElement>(
					'input:not([type="hidden"]), textarea, select, [contenteditable="true"], button, [tabindex="0"]'
				);
				if (focusable) {
					targetEl = focusable;
				}
			}

			targetEl.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
			if (typeof targetEl.focus === 'function') {
				targetEl.focus();
			}
		}
	}

	async function save(): Promise<void> {
		if (!isFormValid) {
			const errorKeys = Object.keys(validationStore.errors || {}).filter(
				(k) => validationStore.errors[k]
			);
			if (errorKeys.length > 0) {
				const labels = Array.from(new Set(errorKeys.map(getFieldLabel)));
				toast.warning(`${validation_fix_before_save()} (${labels.join(', ')})`);
				await focusInvalidField(errorKeys[0]);
			} else {
				toast.warning(validation_fix_before_save());
			}
			return;
		}

		if (currentMode === 'edit' && !hasChanges) {
			toast.info('No changes to save');
			await navigationManager.toList();
			return;
		}

		const dataToSave = { ...currentEntry! };

		// Set status: schedule if timestamp present, otherwise use store status
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

		const success = await saveEntry(dataToSave);
		if (!success) {
			return;
		}

		// If scheduling, create a svelty_jobs record
		if (dataToSave.status === StatusTypes.schedule && scheduleTimestamp) {
			await createScheduleJob(dataToSave, scheduleTimestamp);
		}

		await navigationManager.toList();
	}

	function cancel(): void {
		document.dispatchEvent(new CustomEvent('cancelEdit', { bubbles: true }));
		setCollectionValue({});
		// Route transition, not a layout preference: write the shell state directly
		// so `rightSidebarTouched` is not poisoned for the next edit session.
		ui.state.rightSidebar = 'hidden';
		ui.state.leftSidebar = isDesktop ? 'full' : 'collapsed';
		ui.state.pageheader = 'hidden';
		ui.state.pagefooter = 'hidden';
		navigationManager.toList();
	}

	function openDelete(): void {
		deleteCurrentEntry(isAdmin);
	}

	function openClone(): void {
		showCloneModal({
			count: 1,
			onConfirm: async () => {
				if (!(currentEntry && currentCollection?._id)) {
					toast.warning('No entry or collection selected.');
					return;
				}
				const payload = { ...currentEntry };
				payload._id = undefined;
				payload.createdAt = undefined;
				payload.updatedAt = undefined;
				payload.status = StatusTypes.draft;
				payload.clonedFrom = currentEntry._id;

				const result = await createEntry(currentCollection._id, payload);
				if (result.success) {
					toast.success('Entry cloned successfully.');
					invalidateCollectionCache(currentCollection._id);
					modeTransitionGuard.setMode('view');
				} else {
					toast.error(result.error || 'Failed to clone');
				}
			}
		});
	}

	// Menu wizard next action
	function next(): void {
		logger.debug('[HeaderEdit] Next clicked');
		if (ui.wizard.saveLayerStore) {
			ui.wizard.saveLayerStore();
		} else {
			// Fallback if needed
			save();
		}
	}
</script>

<header
	class="border-(--admin-border-default) sticky top-0 z-20 flex w-full items-center justify-between border-b bg-white px-2 py-1 shadow-sm dark:bg-surface-700 h-14 {ui
		.state.leftSidebar !== 'hidden'
		? 'md:ps-7'
		: ''}"
	class:border-b-0={showMore}
>
	<div class="flex items-center gap-2 flex-1 min-w-0">
		{#if ui.state.leftSidebar === 'hidden'}
			<Button
				variant="outline"
				onclick={() => ui.toggle('leftSidebar', isDesktop ? 'full' : 'collapsed')}
				aria-label="Toggle sidebar"
				class="p-0! min-w-0 shrink-0"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</Button>
		{/if}

		<div class="shrink-0 flex items-center ms-2">
			<iconify-icon
				icon={currentCollection?.icon ?? 'mdi:file-document'}
				width="24"
				class="text-error-500"
			></iconify-icon>
		</div>

		{#if currentCollection?.name && currentMode !== 'view'}
			<div class="ms-2 flex-1 min-w-0">
				<div class="text-xs uppercase opacity-70 dark:opacity-100 dark:text-white leading-none">
					{currentMode}
				</div>
				<div class="text-sm font-bold capitalize truncate leading-tight">
					<span class="text-tertiary-500 dark:text-primary-500">{currentCollection.name}</span>
				</div>
			</div>
		{/if}
	</div>

	{#if ['edit', 'create'].includes(currentMode)}
		<div class="pointer-events-none absolute inset-x-0 flex items-center justify-center">
			<span class="whitespace-nowrap text-xs text-error-500 font-medium">
				{form_required()}
			</span>
		</div>
	{/if}

	<div class="flex items-center gap-2 shrink-0">
		{#if !isDesktop}
			{#if showMore}
				<TranslationStatus />
				{#if ['edit', 'create'].includes(currentMode)}
					<Button
						variant="tertiary"
						onclick={save}
						disabled={!isFormValid || !canWrite}
						aria-label="Save"
						class="p-0! min-w-0"
					>
						<iconify-icon icon="material-symbols:save" width="24"></iconify-icon>
					</Button>
				{/if}
				<Button
					variant="tertiary"
					onclick={() => (showMore = false)}
					aria-label="Show less"
					class="p-0! min-w-0"
				>
					<iconify-icon icon="material-symbols:filter-list-rounded" width="30"></iconify-icon>
				</Button>
			{:else}
				<TranslationStatus />

				{#if ['edit', 'create'].includes(currentMode)}
					{#if showNextButton}
						<Button variant="tertiary" onclick={next} aria-label="Next" class="p-0! min-w-0">
							<iconify-icon icon="carbon:next-filled" width="24"></iconify-icon>
						</Button>
					{:else}
						<Button
							variant="tertiary"
							onclick={save}
							disabled={!isFormValid || !canWrite}
							aria-label="Save"
							class="p-0! min-w-0"
						>
							<iconify-icon icon="material-symbols:save" width="24"></iconify-icon>
						</Button>
					{/if}
				{/if}

				<Button
					variant="outline"
					onclick={() => (showMore = true)}
					aria-label="Show more"
					class="p-0! min-w-0"
				>
					<iconify-icon icon="material-symbols:filter-list-rounded" width="30"></iconify-icon>
				</Button>
			{/if}
		{:else}
			<!-- Desktop: Translation status visible by default -->
			<TranslationStatus />
		{/if}

		{#if !ui.wizard.headerActionButton}
			<Button variant="outline" onclick={cancel} aria-label="Cancel" class="p-0! min-w-0">
				<iconify-icon icon="material-symbols:close" width="24"></iconify-icon>
			</Button>
		{/if}
	</div>
</header>

{#if showMore}
	<div class="-mx-2 mb-2 flex flex-col gap-2 border-b px-4 pt-2 pb-2 text-center">
		<div class="flex justify-center gap-6">
			<!-- Status Toggle -->
			<div class="flex flex-col items-center">
				<Toggle value={publishToggle} disabled={disableStatusToggle} onToggle={toggleStatus} />
				<span
					class="mt-1 text-xs"
					class:text-tertiary-500={publishToggle}
					class:dark:text-primary-500={publishToggle}
					class:text-error-500={!publishToggle}
				>
					{publishToggle ? status_publish() : status_unpublish()}
				</span>
			</div>

			<!-- Delete -->
			<div class="flex flex-col items-center">
				<Button
					variant="ghost"
					onclick={openDelete}
					disabled={!canDelete}
					aria-label="Delete"
					class="p-0! min-w-0 gradient-error"
				>
					<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon>
				</Button>
			</div>

			{#if ['edit', 'create'].includes(currentMode)}
				<!-- Schedule -->
				<div class="flex flex-col items-center">
					<Button
						variant="ghost"
						onclick={openSchedule}
						disabled={!canWrite}
						aria-label="Schedule"
						class="p-0! min-w-0 gradient-pink"
					>
						<iconify-icon icon="bi:clock" width="24"></iconify-icon>
					</Button>
				</div>

				<!-- Clone -->
				<div class="flex flex-col items-center">
					<Button
						variant="ghost"
						onclick={openClone}
						disabled={!canWrite || !canCreate}
						aria-label="Clone"
						class="p-0! min-w-0 gradient-secondary"
					>
						<iconify-icon icon="bi:clipboard-data-fill" width="24"></iconify-icon>
					</Button>
				</div>
			{/if}
		</div>

		<Slot name="entry_edit_header" props={{ collection: currentCollection, currentEntry }} />

		<!-- User -->
		<div class="space-y-1 text-xs">
			<p>
				Created by: <span class="text-tertiary-500 dark:text-primary-500 font-bold"
					>{getDisplayName(currentEntry?.createdBy)}</span
				>
			</p>
			{#if currentEntry?.updatedBy}
				<p class="text-tertiary-500 dark:text-primary-500">
					Last updated by: {getDisplayName(currentEntry?.updatedBy)}
				</p>
			{/if}
			{#if scheduleTimestamp}
				<p class="text-tertiary-500 dark:text-primary-500">
					Will publish on: {formatDateTime(scheduleTimestamp)}
				</p>
			{/if}
		</div>
	</div>
{/if}
