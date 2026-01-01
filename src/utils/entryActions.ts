/**
 * @file src/utils/entryActions.ts
 * @description Centralized functions for performing actions on collection entries.
 */

import type { StatusType } from '@src/content/types';
import { StatusTypes } from '@src/content/types';
import { publicEnv } from '@src/stores/globalSettings.svelte';

// ParaglideJS
import * as m from '@src/paraglide/messages';
import { collection, collectionValue, setCollectionValue, setMode } from '@stores/collectionStore.svelte';
import { toaster } from '@stores/store.svelte';
import { logger } from './logger';
import {
	batchDeleteEntries,
	batchUpdateEntries,
	createClones,
	createEntry,
	deleteEntry,
	invalidateCollectionCache,
	updateEntry,
	updateEntryStatus
} from './apiClient';
import { entryMessages } from './entryActionsMessages';
import { showConfirm, showScheduleModal, showCloneModal } from './modalState.svelte';
// Helper function to update entry status
async function updateStatus(collectionId: string, entryId: string, status: string) {
	const result = await updateEntryStatus(collectionId, entryId, status);
	if (!result.success) {
		throw new Error(result.error || 'Failed to update status');
	}
	return result;
}

// Sets the status for one or more entries
export async function setEntriesStatus(entryIds: string[], status: StatusType, onSuccess: () => void, payload: Record<string, unknown> = {}) {
	if (!entryIds.length) return;
	const collId = collection.value?._id;
	if (!collId) return;

	const result = await batchUpdateEntries(collId, { ids: entryIds, status, ...payload });
	if (result.success) {
		// Use centralized messaging
		const count = entryIds.length;
		let message: string;

		switch (status) {
			case StatusTypes.archive:
				message = entryMessages.entriesArchived(count);
				break;
			case StatusTypes.publish:
				message = entryMessages.entriesPublished(count);
				break;
			case StatusTypes.unpublish:
				message = entryMessages.entriesUnpublished(count);
				break;
			case StatusTypes.draft:
				message = entryMessages.entriesUpdated(count, StatusTypes.draft);
				break;
			default:
				message = entryMessages.entriesUpdated(count, status);
		}

		toaster.success({ description: message });
		onSuccess();
	} else {
		toaster.error({ description: result.error || entryMessages.updateFailed('update') });
	}
} // Deletes or archives one or more entries with improved batch delete
export async function deleteEntries(entryIds: string[], isPermanentDelete: boolean, onSuccess: () => void) {
	if (!entryIds.length) return;
	const collId = collection.value?._id;
	if (!collId) return;

	const isArchiving = publicEnv.USE_ARCHIVE_ON_DELETE && !isPermanentDelete;

	try {
		if (isArchiving) {
			// Archive entries by updating their status to 'archive'
			const result = await batchUpdateEntries(collId, { ids: entryIds, status: StatusTypes.archive });
			if (result.success) {
				toaster.success({ description: entryMessages.entriesArchived(entryIds.length) });
				onSuccess();
			} else {
				toaster.error({ description: result.error || entryMessages.updateFailed(StatusTypes.archive) });
			}
		} else {
			// Use batch delete API if available, fallback to individual deletes
			try {
				const result = await batchDeleteEntries(collId, entryIds);
				if (result.success) {
					toaster.success({ description: entryMessages.entriesDeleted(entryIds.length) });
					onSuccess();
				} else {
					// Fallback to individual deletes if batch delete fails
					throw new Error('Batch delete not supported, falling back to individual deletes');
				}
			} catch (batchError) {
				// Fallback: delete entries one by one
				logger.warn('Batch delete failed, using individual deletes:', batchError);
				await Promise.all(entryIds.map((entryId) => deleteEntry(collId, entryId)));
				toaster.success({ description: entryMessages.entriesDeleted(entryIds.length) });
				onSuccess();
			}
		}
	} catch (e) {
		toaster.error({ description: entryMessages.deleteFailed(isArchiving ? StatusTypes.archive : StatusTypes.delete) + `: ${(e as Error).message}` });
	}
}

// Clones one or more entries
export async function cloneEntries(rawEntries: Record<string, unknown>[], onSuccess: () => void) {
	if (!rawEntries.length) return;
	const collId = collection.value?._id;
	if (!collId) return;

	const entriesToClone = rawEntries.map((entry) => {
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const { _id, createdAt, updatedAt, ...rest } = entry;
		return { ...rest, clonedFrom: _id };
	});

	const result = await createClones(collId, entriesToClone);
	if (result.success) {
		toaster.success({ description: 'Entries cloned' });
		onSuccess();
	} else {
		toaster.error({ description: result.error || 'Failed to clone entries' });
	}
}

// Saves a new or existing entry
export async function saveEntry(entryData: Record<string, unknown>, publish: boolean = false): Promise<boolean> {
	const collId = collection.value?._id;
	if (!collId) {
		toaster.warning({ description: 'Collection not found' });
		return false;
	}

	const entryId = entryData._id as string | undefined;

	// Preserve user's chosen status unless explicitly publishing
	const payload = { ...entryData };
	if (publish) {
		payload.status = StatusTypes.publish;
	} else if (!payload.status) {
		// Use collection's default status if no status is specified (new entries)
		payload.status = collection.value?.status || StatusTypes.draft;
	}
	// Otherwise preserve the existing status from entryData

	const result = entryId ? await updateEntry(collId, entryId, payload) : await createEntry(collId, payload);

	if (result.success) {
		toaster.success({ description: 'Entry saved' });
		if (result.data) {
			setCollectionValue(result.data as Record<string, unknown>);
		}
		// setMode('view'); // Handled by caller to ensure proper navigation flow
		invalidateCollectionCache(collId);

		// Trigger SvelteKit SSR reload - Handled by caller via goto(..., { invalidateAll: true })
		// await invalidateAll();

		// Clear client-side cache in EntryList component
		if (typeof document !== 'undefined') {
			document.dispatchEvent(
				new CustomEvent('clearEntryListCache', {
					detail: { reason: 'entry-saved', collectionId: collId }
				})
			);
		}
		return true;
	} else {
		toaster.error({ description: result.error || 'Failed to save entry' });
		return false;
	}
}

// Deletes the currently active entry after confirmation
export async function deleteCurrentEntry(isAdmin: boolean = false) {
	const entry = collectionValue.value;
	const coll = collection.value;
	if (!entry?._id || !coll?._id) {
		toaster.warning({ description: m.delete_entry_no_selection_error() });
		return;
	}

	// Type assertions after null check
	const collectionId = coll._id as string;
	const entryId = entry._id as string;

	const entryStatus: StatusType = (entry.status as StatusType) || StatusTypes.draft;
	const isArchived = entryStatus === StatusTypes.archive;
	const useArchiving = publicEnv.USE_ARCHIVE_ON_DELETE;

	// Determine what options to show based on rules
	if (!useArchiving) {
		// USE_ARCHIVE_ON_DELETE: false - Always delete directly
		showDeleteConfirmationModal(collectionId, entryId, StatusTypes.delete);
	} else if (isArchived) {
		// Archived entry - only admins can permanently delete
		if (isAdmin) {
			showDeleteConfirmationModal(collectionId, entryId, StatusTypes.delete);
		} else {
			toaster.warning({ description: 'Only administrators can delete archived entries.' });
		}
	} else {
		// Active entry (draft, clone, publish, unpublish, test)
		if (isAdmin) {
			// Admin can choose: show both options in one modal
			showAdminChoiceModal(collectionId, entryId);
		} else {
			// Non-admin can only archive
			showDeleteConfirmationModal(collectionId, entryId, StatusTypes.archive);
		}
	}
}

// Helper function to show admin choice modal (Archive or Delete options)
function showAdminChoiceModal(collectionId: string, entryId: string) {
	// First show archive option with Cancel leading to delete option
	showConfirm({
		title: 'Archive Entry',
		body: `
			<div class="space-y-3">
				<p>Do you want to <strong class="text-warning-600">archive</strong> this entry?</p>
				<p class="text-sm text-surface-600 dark:text-surface-400">Archived entries are hidden from view but kept in the database and can be restored later.</p>
			</div>
		`,
		confirmText: 'Archive',
		cancelText: 'Show Delete Option',
		onConfirm: () => showDeleteConfirmationModal(collectionId, entryId, StatusTypes.archive),
		onCancel: () =>
			showConfirm({
				title: 'Delete Entry Permanently',
				body: `
					<div class="space-y-3">
						<p>Do you want to <strong class="text-error-600">permanently delete</strong> this entry?</p>
						<p class="text-sm text-surface-600 dark:text-surface-400">This will completely remove the entry from the database. This action cannot be undone.</p>
					</div>
				`,
				confirmText: 'Delete Permanently',
				onConfirm: () => showDeleteConfirmationModal(collectionId, entryId, StatusTypes.delete)
			})
	});
}

// Helper function to show final confirmation modal
function showDeleteConfirmationModal(collectionId: string, entryId: string, action: typeof StatusTypes.archive | typeof StatusTypes.delete) {
	const isArchive = action === StatusTypes.archive;
	showConfirm({
		title: `Please Confirm <span class="text-error-500 font-bold">${isArchive ? 'Archiving' : 'Deletion'}</span>`,
		body: isArchive
			? `Are you sure you want to <span class="text-warning-500 font-semibold">archive</span> this entry? Archived items can be restored later.`
			: `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> this entry? This action will remove the entry from the system.`,
		confirmText: isArchive ? 'Archive' : 'Delete',
		cancelText: m.button_cancel(),
		onConfirm: async () => {
			try {
				if (isArchive) {
					await updateStatus(collectionId, entryId, StatusTypes.archive);
					setCollectionValue({ ...collectionValue.value, status: StatusTypes.archive });
					toaster.success({ description: 'Entry archived successfully.' });
				} else {
					await deleteEntry(collectionId, entryId);
					toaster.success({ description: m.entry_deleted_success() });
				}
				setMode('view');
				setCollectionValue({});
				invalidateCollectionCache(collectionId);
			} catch (e) {
				toaster.error({ description: m.delete_entry_error({ error: (e as Error).message }) });
			}
		}
	});
}

export async function permanentlyDeleteEntry(entryId: string) {
	const coll = collection.value;
	if (!coll?._id) {
		toaster.warning({ description: m.clone_entry_no_selection_error() });
		return;
	}

	const collectionId = coll._id as string;

	showConfirm({
		title: 'Confirm Permanent Deletion',
		body: 'This will permanently delete the archived entry from the database. This action cannot be undone.',
		confirmText: 'Permanently Delete',
		onConfirm: async () => {
			try {
				await deleteEntry(collectionId, entryId);
				toaster.success({ description: 'Entry permanently deleted.' });
				invalidateCollectionCache(collectionId);
				setMode('view');
			} catch (e) {
				toaster.error({ description: `Error permanently deleting entry: ${(e as Error).message}` });
			}
		}
	});
}

export async function setEntryStatus(newStatus: StatusType) {
	const entry = collectionValue.value;
	const coll = collection.value;
	if (!entry?._id || !coll?._id) {
		toaster.warning({ description: m.set_status_no_selection_error() });
		return;
	}

	const collectionId = coll._id as string;
	const entryId = entry._id as string;

	if (newStatus === 'draft' || newStatus === StatusTypes.archive) {
		toaster.error({ description: `${newStatus} status is reserved for system operations.` });
		return;
	}
	try {
		await updateStatus(collectionId, entryId, newStatus);
		setCollectionValue({ ...collectionValue.value, status: newStatus });
		toaster.success({ description: m.entry_status_updated({ status: newStatus }) });
	} catch (e) {
		toaster.error({ description: m.set_status_error({ error: (e as Error).message }) });
	}
}

// Schedule entry for future publication with improved date picker integration
export async function scheduleCurrentEntry(scheduledDate?: Date) {
	const entry = collectionValue.value;
	const coll = collection.value;

	if (!entry?._id || !coll?._id) {
		toaster.warning({ description: entryMessages.noEntryForScheduling() });
		return;
	}

	const collectionId = coll._id as string;
	const entryId = entry._id as string;

	if (scheduledDate) {
		// If date is provided, directly schedule
		try {
			// 'scheduled' is not a valid StatusType, use 'publish' or 'draft' as needed
			await updateStatus(collectionId, entryId, StatusTypes.publish);
			setCollectionValue({
				...collectionValue.value,
				status: StatusTypes.publish,
				scheduledDate: scheduledDate.toISOString()
			});
			toaster.success({ description: entryMessages.entryScheduled(scheduledDate.toLocaleDateString()) });
		} catch (e) {
			toaster.error({ description: entryMessages.errorScheduling((e as Error).message) });
		}
	} else {
		// Show the schedule modal via helper
		showScheduleModal({
			initialAction: StatusTypes.publish,
			onSchedule: async (date: Date, action: string) => {
				try {
					await updateStatus(collectionId, entryId, StatusTypes.publish);
					setCollectionValue({
						...collectionValue.value,
						status: StatusTypes.publish,
						scheduledDate: date.toISOString(),
						scheduledAction: action
					});
					toaster.success({ description: entryMessages.entryScheduled(date.toLocaleDateString()) });
				} catch (e) {
					toaster.error({ description: entryMessages.errorScheduling((e as Error).message) });
				}
			}
		});
	}
}

// Clones the currently active entry with improved modal
export async function cloneCurrentEntry() {
	const entry = collectionValue.value;
	const coll = collection.value;
	if (!entry || !coll?._id) {
		toaster.warning({ description: m.clone_entry_no_selection_error() });
		return;
	}

	const collectionId = coll._id as string;

	showCloneModal({
		count: 1,
		onConfirm: async () => {
			try {
				// Create a deep copy of the entry with all its data
				const clonedPayload = JSON.parse(JSON.stringify(entry));

				// Remove unique identifiers and timestamps
				delete clonedPayload._id;
				delete clonedPayload.createdAt;
				delete clonedPayload.updatedAt;

				// Set clone status and reference to original
				clonedPayload.status = StatusTypes.draft;
				clonedPayload.clonedFrom = entry._id;

				logger.debug('Cloning entry with payload:', clonedPayload);

				const result = await createEntry(collectionId, clonedPayload);
				if (result.success) {
					toaster.success({ description: entryMessages.entryCloned() });
					invalidateCollectionCache(collectionId);
					setMode('view');
				} else {
					throw new Error(result.error || 'Failed to create clone');
				}
			} catch (e) {
				toaster.error({ description: m.clone_entry_error({ error: (e as Error).message }) });
			}
		}
	});
}

// Auto-draft functionality for unsaved changes
let hasUnsavedChanges = false;

// Initialize editing mode
export function startEditing() {
	hasUnsavedChanges = false;
}

// Mark that changes have been made
export function markAsChanged() {
	hasUnsavedChanges = true;
}

// Check if there are unsaved changes
export function getHasUnsavedChanges(): boolean {
	return hasUnsavedChanges;
}

// Save current data as draft when user tries to leave
export async function saveDraftAndLeave(): Promise<boolean> {
	const entry = collectionValue.value;
	const coll = collection.value;

	if (!hasUnsavedChanges || !entry || !coll?._id) {
		return true; // Allow navigation if no unsaved changes
	}

	const collectionId = coll._id as string;

	return new Promise((resolve) => {
		showConfirm({
			title: 'Unsaved Changes',
			body: 'You have unsaved changes. Do you want to save them as a draft before leaving?',
			confirmText: 'Save as Draft and Leave',
			cancelText: 'Stay and Continue Editing',
			onConfirm: async () => {
				// Save as draft and allow navigation
				try {
					const draftData = { ...entry };

					if (entry._id) {
						// Update existing entry with draft status
						const entryId = entry._id as string;
						const result = await updateEntry(collectionId, entryId, draftData);
						if (!result.success) {
							throw new Error(result.error || 'Failed to update entry');
						}
						await updateStatus(collectionId, entryId, StatusTypes.draft);
					} else {
						// Create new entry with draft status
						draftData.status = StatusTypes.draft;
						const result = await createEntry(collectionId, draftData);
						if (!result.success) {
							throw new Error(result.error || 'Failed to create entry');
						}
					}

					toaster.warning({ description: 'Changes saved as draft.' });

					invalidateCollectionCache(collectionId);
					hasUnsavedChanges = false;
					resolve(true); // Allow navigation
				} catch (e) {
					toaster.error({ description: `Error saving draft: ${(e as Error).message}` });
					resolve(false); // Prevent navigation due to error
				}
			},
			onCancel: () => {
				// User chose to stay and continue editing
				resolve(false); // Prevent navigation
			}
		});
	});
}

// Reset the unsaved changes state
export function resetUnsavedChanges() {
	hasUnsavedChanges = false;
}
