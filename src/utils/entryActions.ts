/**
 * @file src/utils/entryActions.ts
 * @description Centralized functions for performing actions on collection entries.
 */

import { publicEnv } from '@root/config/public';
import type { ModalSettings, ModalStore } from '@skeletonlabs/skeleton';
import type { StatusType } from '@src/content/types';
import { StatusTypes } from '@src/content/types';

// ParaglideJS
import * as m from '@src/paraglide/messages';
import { collection, collectionValue, mode } from '@stores/collectionStore.svelte';
import { showToast } from '@utils/toast';
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
import { showCloneModal, showConfirm, showScheduleModal } from './modalUtils';

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
			case 'test':
				message = entryMessages.entriesSetToTest(count);
				break;
			case StatusTypes.schedule:
				message = entryMessages.entriesScheduled(count);
				break;
			default:
				message = entryMessages.entriesUpdated(count, status);
		}

		showToast(message, 'success');
		onSuccess();
	} else {
		showToast(result.error || entryMessages.updateFailed('update'), 'error');
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
				showToast(entryMessages.entriesArchived(entryIds.length), 'success');
				onSuccess();
			} else {
				showToast(result.error || entryMessages.updateFailed('archive'), 'error');
			}
		} else {
			// Use batch delete API if available, fallback to individual deletes
			try {
				const result = await batchDeleteEntries(collId, entryIds);
				if (result.success) {
					showToast(entryMessages.entriesDeleted(entryIds.length), 'success');
					onSuccess();
				} else {
					// Fallback to individual deletes if batch delete fails
					throw new Error('Batch delete not supported, falling back to individual deletes');
				}
			} catch (batchError) {
				// Fallback: delete entries one by one
				console.warn('Batch delete failed, using individual deletes:', batchError);
				await Promise.all(entryIds.map((entryId) => deleteEntry(collId, entryId)));
				showToast(entryMessages.entriesDeleted(entryIds.length), 'success');
				onSuccess();
			}
		}
	} catch (e) {
		showToast(entryMessages.deleteFailed(isArchiving ? 'archive' : 'delete') + `: ${(e as Error).message}`, 'error');
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
		showToast('Entries cloned', 'success');
		onSuccess();
	} else {
		showToast(result.error || 'Failed to clone entries', 'error');
	}
}

// Saves a new or existing entry
export async function saveEntry(entryData: Record<string, unknown>, publish: boolean = false) {
	const collId = collection.value?._id;
	if (!collId) {
		showToast('Collection not found', 'warning');
		return;
	}

	const entryId = entryData._id as string | undefined;

	// Preserve user's chosen status unless explicitly publishing
	const payload = { ...entryData };
	if (publish) {
		payload.status = 'publish';
	} else if (!payload.status) {
		// Use collection's default status if no status is specified (new entries)
		payload.status = collection.value?.status || 'draft';
	}
	// Otherwise preserve the existing status from entryData

	const result = entryId ? await updateEntry(collId, entryId, payload) : await createEntry(collId, payload);

	if (result.success) {
		showToast('Entry saved', 'success');
		if (result.data) {
			collectionValue.set(result.data as Record<string, unknown>);
		}
		mode.set('view');
		invalidateCollectionCache(collId);
	} else {
		showToast(result.error || 'Failed to save entry', 'error');
	}
}

// Deletes the currently active entry after confirmation
export async function deleteCurrentEntry(_modalStore: ModalStore, isAdmin: boolean = false) {
	const entry = collectionValue.value;
	const coll = collection.value;
	if (!entry?._id || !coll?._id) {
		showToast(m.delete_entry_no_selection_error(), 'warning');
		return;
	}

	const entryStatus = entry.status || StatusTypes.draft;
	const isArchived = entryStatus === StatusTypes.archive;
	const useArchiving = publicEnv.USE_ARCHIVE_ON_DELETE;

	// Determine what options to show based on rules
	if (!useArchiving) {
		// USE_ARCHIVE_ON_DELETE: false - Always delete directly
		showDeleteConfirmationModal(coll._id, entry._id, 'delete');
	} else if (isArchived) {
		// Archived entry - only admins can permanently delete
		if (isAdmin) {
			showDeleteConfirmationModal(coll._id, entry._id, 'delete');
		} else {
			showToast('Only administrators can delete archived entries.', 'warning');
		}
	} else {
		// Active entry (draft, clone, publish, unpublish, test)
		if (isAdmin) {
			// Admin can choose: show both options in one modal
			showAdminChoiceModal(coll._id, entry._id);
		} else {
			// Non-admin can only archive
			showDeleteConfirmationModal(coll._id, entry._id, 'archive');
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
		confirmClasses: 'bg-warning-500 hover:bg-warning-600 text-white',
		onConfirm: () => showDeleteConfirmationModal(collectionId, entryId, 'archive'),
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
				confirmClasses: 'bg-error-500 hover:bg-error-600 text-white',
				onConfirm: () => showDeleteConfirmationModal(collectionId, entryId, 'delete')
			})
	});
}

// Helper function to show final confirmation modal
function showDeleteConfirmationModal(collectionId: string, entryId: string, action: 'archive' | 'delete') {
	const isArchive = action === 'archive';
	showConfirm({
		title: `Please Confirm <span class="text-error-500 font-bold">${isArchive ? 'Archiving' : 'Deletion'}</span>`,
		body: isArchive
			? `Are you sure you want to <span class="text-warning-500 font-semibold">archive</span> this entry? Archived items can be restored later.`
			: `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> this entry? This action will remove the entry from the system.`,
		confirmText: isArchive ? 'Archive' : 'Delete',
		cancelText: m.button_cancel(),
		confirmClasses: isArchive ? 'bg-warning-500 hover:bg-warning-600 text-white' : 'bg-error-500 hover:bg-error-600 text-white',
		onConfirm: async () => {
			try {
				if (isArchive) {
					await updateStatus(collectionId, entryId, StatusTypes.archive);
					collectionValue.update((cv) => ({ ...cv, status: StatusTypes.archive }));
					showToast('Entry archived successfully.', 'success');
				} else {
					await deleteEntry(collectionId, entryId);
					showToast(m.entry_deleted_success(), 'success');
				}
				mode.set('view');
				collectionValue.set({});
				invalidateCollectionCache(collectionId);
			} catch (e) {
				showToast(m.delete_entry_error({ error: (e as Error).message }), 'error');
			}
		}
	});
}

export async function permanentlyDeleteEntry(entryId: string) {
	const coll = collection.value;
	if (!coll?._id) {
		showToast(m.clone_entry_no_selection_error(), 'warning');
		return;
	}

	showConfirm({
		title: 'Confirm Permanent Deletion',
		body: 'This will permanently delete the archived entry from the database. This action cannot be undone.',
		confirmText: 'Permanently Delete',
		confirmClasses: 'bg-error-500 hover:bg-error-600 text-white',
		onConfirm: async () => {
			try {
				await deleteEntry(coll._id, entryId);
				showToast('Entry permanently deleted.', 'success');
				invalidateCollectionCache(coll._id);
				mode.set('view');
			} catch (e) {
				showToast(`Error permanently deleting entry: ${(e as Error).message}`, 'error');
			}
		}
	});
}

export async function setEntryStatus(newStatus: StatusType) {
	const entry = collectionValue.value;
	const coll = collection.value;
	if (!entry?._id || !coll?._id) {
		showToast(m.set_status_no_selection_error(), 'warning');
		return;
	}
	if (newStatus === 'draft' || newStatus === 'archive') {
		showToast(`${newStatus} status is reserved for system operations.`, 'error');
		return;
	}
	try {
		await updateStatus(coll._id, entry._id, newStatus);
		collectionValue.update((cv) => ({ ...cv, status: newStatus }));
		showToast(m.entry_status_updated({ status: newStatus }), 'success');
	} catch (e) {
		showToast(m.set_status_error({ error: (e as Error).message }), 'error');
	}
}

// Schedule entry for future publication with improved date picker integration
export async function scheduleCurrentEntry(_modalStore: ModalStore, scheduledDate?: Date) {
	const entry = collectionValue.value;
	const coll = collection.value;

	if (!entry?._id || !coll?._id) {
		showToast(entryMessages.noEntryForScheduling(), 'warning');
		return;
	}

	if (scheduledDate) {
		// If date is provided, directly schedule
		try {
			await updateStatus(coll._id, entry._id, StatusTypes.schedule);
			// Update entry with scheduled date if your API supports it
			collectionValue.update((cv) => ({
				...cv,
				status: StatusTypes.schedule,
				scheduledDate: scheduledDate.toISOString()
			}));
			showToast(entryMessages.entryScheduled(scheduledDate.toLocaleDateString()), 'success');
		} catch (e) {
			showToast(entryMessages.errorScheduling((e as Error).message), 'error');
		}
	} else {
		// Show the schedule modal via helper
		showScheduleModal({
			initialAction: 'publish',
			onSchedule: async (date: Date, action: string) => {
				try {
					await updateStatus(coll._id, entry._id, StatusTypes.schedule);
					collectionValue.update((cv) => ({
						...cv,
						status: StatusTypes.schedule,
						scheduledDate: date.toISOString(),
						scheduledAction: action
					}));
					showToast(entryMessages.entryScheduled(date.toLocaleDateString()), 'success');
				} catch (e) {
					showToast(entryMessages.errorScheduling((e as Error).message), 'error');
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
		showToast(m.clone_entry_no_selection_error(), 'warning');
		return;
	}

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
				clonedPayload.status = StatusTypes.clone;
				clonedPayload.clonedFrom = entry._id;

				console.log('Cloning entry with payload:', clonedPayload);

				const result = await createEntry(coll._id, clonedPayload);
				if (result.success) {
					showToast(entryMessages.entryCloned(), 'success');
					invalidateCollectionCache(coll._id);
					mode.set('view');
				} else {
					throw new Error(result.error || 'Failed to create clone');
				}
			} catch (e) {
				showToast(m.clone_entry_error({ error: (e as Error).message }), 'error');
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
export async function saveDraftAndLeave(modalStore: ModalStore): Promise<boolean> {
	const entry = collectionValue.value;
	const coll = collection.value;

	if (!hasUnsavedChanges || !entry || !coll?._id) {
		return true; // Allow navigation if no unsaved changes
	}

	return new Promise((resolve) => {
		const modalSettings: ModalSettings = {
			type: 'confirm',
			title: 'Unsaved Changes',
			body: 'You have unsaved changes. Do you want to save them as a draft before leaving?',
			buttonTextCancel: 'Stay and Continue Editing',
			buttonTextConfirm: 'Save as Draft and Leave',
			meta: {
				buttonConfirmClasses: 'bg-warning-500 hover:bg-warning-600 text-white',
				buttonCancelClasses: 'bg-primary-500 hover:bg-primary-600 text-white'
			},
			response: async (confirmed: boolean) => {
				if (confirmed) {
					// Save as draft and allow navigation
					try {
						const draftData = { ...entry };

						if (entry._id) {
							// Update existing entry with draft status
							const result = await updateEntry(coll._id, entry._id, draftData);
							if (!result.success) {
								throw new Error(result.error || 'Failed to update entry');
							}
							await updateStatus(coll._id, entry._id, StatusTypes.draft);
						} else {
							// Create new entry with draft status
							draftData.status = StatusTypes.draft;
							const result = await createEntry(coll._id, draftData);
							if (!result.success) {
								throw new Error(result.error || 'Failed to create entry');
							}
						}

						showToast('Changes saved as draft.', 'warning');

						invalidateCollectionCache(coll._id);
						hasUnsavedChanges = false;
						resolve(true); // Allow navigation
					} catch (e) {
						showToast(`Error saving draft: ${(e as Error).message}`, 'error');
						resolve(false); // Prevent navigation due to error
					}
				} else {
					// User chose to stay and continue editing
					resolve(false); // Prevent navigation
				}
			}
		};
		modalStore.trigger(modalSettings);
	});
}

// Reset the unsaved changes state
export function resetUnsavedChanges() {
	hasUnsavedChanges = false;
}
