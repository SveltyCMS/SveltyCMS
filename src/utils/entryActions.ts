/**
 * @file src/utils/entryActions.ts
 * @description Centralized functions for performing actions on collection entries.
 */

import type { StatusType } from '@src/content/types';
import { StatusTypes } from '@src/content/types';
import { collection, collectionValue, mode } from '@stores/collectionStore.svelte';
import type { ModalStore, ToastStore } from '@skeletonlabs/skeleton';
import { publicEnv } from '@root/config/public';
import {
	batchUpdateEntries,
	createClones,
	updateEntry,
	createEntry,
	invalidateCollectionCache,
	updateEntryStatus,
	deleteEntry,
	batchDeleteEntries
} from './apiClient';
import * as m from '@src/paraglide/messages';
import { createScheduleModal, createCloneModal } from './modalUtils';
import { entryMessages } from './entryActionsMessages';

// Helper function to update entry status
async function updateStatus(collectionId: string, entryId: string, status: string) {
	const result = await updateEntryStatus(collectionId, entryId, status);
	if (!result.success) {
		throw new Error(result.error || 'Failed to update status');
	}
	return result;
}

// Sets the status for one or more entries
export async function setEntriesStatus(
	entryIds: string[],
	status: StatusType,
	onSuccess: () => void,
	toastStore: ToastStore,
	payload: Record<string, unknown> = {}
) {
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

		toastStore.trigger({ message, background: 'variant-filled-success' });
		onSuccess();
	} else {
		toastStore.trigger({
			message: result.error || entryMessages.updateFailed('update'),
			background: 'variant-filled-error'
		});
	}
} // Deletes or archives one or more entries with improved batch delete
export async function deleteEntries(entryIds: string[], isPermanentDelete: boolean, onSuccess: () => void, toastStore: ToastStore) {
	if (!entryIds.length) return;
	const collId = collection.value?._id;
	if (!collId) return;

	const isArchiving = publicEnv.USE_ARCHIVE_ON_DELETE && !isPermanentDelete;

	try {
		if (isArchiving) {
			// Archive entries by updating their status to 'archive'
			const result = await batchUpdateEntries(collId, { ids: entryIds, status: StatusTypes.archive });
			if (result.success) {
				toastStore.trigger({
					message: entryMessages.entriesArchived(entryIds.length),
					background: 'variant-filled-success'
				});
				onSuccess();
			} else {
				toastStore.trigger({
					message: result.error || entryMessages.updateFailed('archive'),
					background: 'variant-filled-error'
				});
			}
		} else {
			// Use batch delete API if available, fallback to individual deletes
			try {
				const result = await batchDeleteEntries(collId, entryIds);
				if (result.success) {
					toastStore.trigger({
						message: entryMessages.entriesDeleted(entryIds.length),
						background: 'variant-filled-success'
					});
					onSuccess();
				} else {
					// Fallback to individual deletes if batch delete fails
					throw new Error('Batch delete not supported, falling back to individual deletes');
				}
			} catch (batchError) {
				// Fallback: delete entries one by one
				console.warn('Batch delete failed, using individual deletes:', batchError);
				await Promise.all(entryIds.map((entryId) => deleteEntry(collId, entryId)));
				toastStore.trigger({
					message: entryMessages.entriesDeleted(entryIds.length),
					background: 'variant-filled-success'
				});
				onSuccess();
			}
		}
	} catch (e) {
		toastStore.trigger({
			message: entryMessages.deleteFailed(isArchiving ? 'archive' : 'delete') + `: ${(e as Error).message}`,
			background: 'variant-filled-error'
		});
	}
}

// Clones one or more entries
export async function cloneEntries(rawEntries: Record<string, unknown>[], onSuccess: () => void, toastStore: ToastStore) {
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
		toastStore.trigger({ message: 'Entries cloned' });
		onSuccess();
	} else {
		toastStore.trigger({ message: result.error || 'Failed to clone entries' });
	}
}

// Saves a new or existing entry
export async function saveEntry(entryData: Record<string, unknown>, toastStore: ToastStore, publish: boolean = false) {
	const collId = collection.value?._id;
	if (!collId) {
		toastStore.trigger({ message: 'Collection not found' });
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
		toastStore.trigger({ message: 'Entry saved' });
		if (result.data) {
			collectionValue.set(result.data as Record<string, unknown>);
		}
		mode.set('view');
		invalidateCollectionCache(collId);
	} else {
		toastStore.trigger({ message: result.error || 'Failed to save entry' });
	}
}

// Deletes the currently active entry after confirmation
export async function deleteCurrentEntry(modalStore: ModalStore, toastStore: ToastStore, isAdmin: boolean = false) {
	const entry = collectionValue.value;
	const coll = collection.value;
	if (!entry?._id || !coll?._id) {
		toastStore.trigger({
			message: m.delete_entry_no_selection_error(),
			background: 'variant-filled-warning'
		});
		return;
	}

	const entryStatus = entry.status || StatusTypes.draft;
	const isArchived = entryStatus === StatusTypes.archive;
	const useArchiving = publicEnv.USE_ARCHIVE_ON_DELETE;

	// Determine what options to show based on rules
	if (!useArchiving) {
		// USE_ARCHIVE_ON_DELETE: false - Always delete directly
		showDeleteConfirmationModal(coll._id, entry._id, 'delete', modalStore, toastStore);
	} else if (isArchived) {
		// Archived entry - only admins can permanently delete
		if (isAdmin) {
			showDeleteConfirmationModal(coll._id, entry._id, 'delete', modalStore, toastStore);
		} else {
			toastStore.trigger({
				message: 'Only administrators can delete archived entries.',
				background: 'variant-filled-warning'
			});
		}
	} else {
		// Active entry (draft, clone, publish, unpublish, test)
		if (isAdmin) {
			// Admin can choose: show both options in one modal
			showAdminChoiceModal(coll._id, entry._id, modalStore, toastStore);
		} else {
			// Non-admin can only archive
			showDeleteConfirmationModal(coll._id, entry._id, 'archive', modalStore, toastStore);
		}
	}
}

// Helper function to show admin choice modal (Archive or Delete options)
function showAdminChoiceModal(collectionId: string, entryId: string, modalStore: ModalStore, toastStore: ToastStore) {
	// First show the archive option
	const archiveModal: ModalSettings = {
		type: 'confirm',
		title: 'Archive Entry',
		body: `
			<div class="space-y-3">
				<p>Do you want to <strong class="text-warning-600">archive</strong> this entry?</p>
				<p class="text-sm text-surface-600 dark:text-surface-400">Archived entries are hidden from view but kept in the database and can be restored later.</p>
			</div>
		`,
		buttonTextCancel: 'Show Delete Option',
		buttonTextConfirm: 'Archive',
		meta: {
			buttonConfirmClasses: 'bg-warning-500 hover:bg-warning-600 text-white'
		},
		response: (confirmed: boolean) => {
			if (confirmed) {
				showDeleteConfirmationModal(collectionId, entryId, 'archive', modalStore, toastStore);
			} else {
				// Show delete option instead
				const deleteModal: ModalSettings = {
					type: 'confirm',
					title: 'Delete Entry Permanently',
					body: `
						<div class="space-y-3">
							<p>Do you want to <strong class="text-error-600">permanently delete</strong> this entry?</p>
							<p class="text-sm text-surface-600 dark:text-surface-400">This will completely remove the entry from the database. This action cannot be undone.</p>
						</div>
					`,
					buttonTextCancel: 'Cancel',
					buttonTextConfirm: 'Delete Permanently',
					meta: {
						buttonConfirmClasses: 'bg-error-500 hover:bg-error-600 text-white'
					},
					response: (deleteConfirmed: boolean) => {
						if (deleteConfirmed) {
							showDeleteConfirmationModal(collectionId, entryId, 'delete', modalStore, toastStore);
						}
					}
				};
				modalStore.trigger(deleteModal);
			}
		}
	};
	modalStore.trigger(archiveModal);
}

// Helper function to show final confirmation modal
function showDeleteConfirmationModal(
	collectionId: string,
	entryId: string,
	action: 'archive' | 'delete',
	modalStore: ModalStore,
	toastStore: ToastStore
) {
	const isArchive = action === 'archive';
	const modalSettings: ModalSettings = {
		type: 'confirm',
		title: `Please Confirm <span class="text-error-500 font-bold">${isArchive ? 'Archiving' : 'Deletion'}</span>`,
		body: isArchive
			? `Are you sure you want to <span class="text-warning-500 font-semibold">archive</span> this entry? Archived items can be restored later.`
			: `Are you sure you want to <span class="text-error-500 font-semibold">delete</span> this entry? This action will remove the entry from the system.`,
		buttonTextCancel: m.button_cancel(),
		buttonTextConfirm: isArchive ? 'Archive' : 'Delete',
		meta: { buttonConfirmClasses: isArchive ? 'bg-warning-500 hover:bg-warning-600 text-white' : 'bg-error-500 hover:bg-error-600 text-white' },
		response: async (confirmed: boolean) => {
			if (confirmed) {
				try {
					if (isArchive) {
						await updateStatus(collectionId, entryId, StatusTypes.archive);
						collectionValue.update((cv) => ({ ...cv, status: StatusTypes.archive }));
						toastStore.trigger({ message: 'Entry archived successfully.', background: 'variant-filled-success' });
					} else {
						await deleteEntry(collectionId, entryId);
						toastStore.trigger({ message: m.entry_deleted_success(), background: 'variant-filled-success' });
					}
					mode.set('view');
					collectionValue.set({});
					invalidateCollectionCache(collectionId);
				} catch (e) {
					toastStore.trigger({
						message: m.delete_entry_error({ error: (e as Error).message }),
						background: 'variant-filled-error'
					});
				}
			}
		}
	};
	modalStore.trigger(modalSettings);
}

export async function permanentlyDeleteEntry(entryId: string, modalStore: ModalStore, toastStore: ToastStore) {
	const coll = collection.value;
	if (!entryId || !coll?._id) {
		toastStore.trigger({
			message: 'No entry or collection selected.',
			background: 'variant-filled-warning'
		});
		return;
	}

	const modalSettings: ModalSettings = {
		type: 'confirm',
		title: 'Confirm Permanent Deletion',
		body: 'This will permanently delete the archived entry from the database. This action cannot be undone.',
		buttonTextCancel: m.button_cancel(),
		buttonTextConfirm: 'Permanently Delete',
		meta: { buttonConfirmClasses: 'bg-error-500 hover:bg-error-600 text-white' },
		response: async (confirmed: boolean) => {
			if (confirmed) {
				try {
					await deleteEntry(coll._id, entryId);
					toastStore.trigger({ message: 'Entry permanently deleted.', background: 'variant-filled-success' });
					invalidateCollectionCache(coll._id);
					mode.set('view');
				} catch (e) {
					toastStore.trigger({
						message: `Error permanently deleting entry: ${(e as Error).message}`,
						background: 'variant-filled-error'
					});
				}
			}
		}
	};
	modalStore.trigger(modalSettings);
}

export async function setEntryStatus(newStatus: StatusType, toastStore: ToastStore) {
	const entry = collectionValue.value;
	const coll = collection.value;
	if (!entry?._id || !coll?._id) {
		toastStore.trigger({
			message: m.set_status_no_selection_error(),
			background: 'variant-filled-warning'
		});
		return;
	}
	if (newStatus === 'draft' || newStatus === 'archive') {
		toastStore.trigger({
			message: `${newStatus} status is reserved for system operations.`,
			background: 'variant-filled-error'
		});
		return;
	}
	try {
		await updateStatus(coll._id, entry._id, newStatus);
		collectionValue.update((cv) => ({ ...cv, status: newStatus }));
		toastStore.trigger({
			message: m.entry_status_updated({ status: newStatus }),
			background: 'variant-filled-success'
		});
	} catch (e) {
		toastStore.trigger({
			message: m.set_status_error({ error: (e as Error).message }),
			background: 'variant-filled-error'
		});
	}
}

// Schedule entry for future publication with improved date picker integration
export async function scheduleCurrentEntry(modalStore: ModalStore, toastStore: ToastStore, scheduledDate?: Date) {
	const entry = collectionValue.value;
	const coll = collection.value;

	if (!entry?._id || !coll?._id) {
		toastStore.trigger({
			message: entryMessages.noEntryForScheduling(),
			background: 'variant-filled-warning'
		});
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
			toastStore.trigger({
				message: entryMessages.entryScheduled(scheduledDate.toLocaleDateString()),
				background: 'variant-filled-success'
			});
		} catch (e) {
			toastStore.trigger({
				message: entryMessages.errorScheduling((e as Error).message),
				background: 'variant-filled-error'
			});
		}
	} else {
		// Use the existing ScheduleModal component
		const modalSettings = createScheduleModal({
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
					toastStore.trigger({
						message: entryMessages.entryScheduled(date.toLocaleDateString()),
						background: 'variant-filled-success'
					});
				} catch (e) {
					toastStore.trigger({
						message: entryMessages.errorScheduling((e as Error).message),
						background: 'variant-filled-error'
					});
				}
			}
		});
		modalStore.trigger(modalSettings);
	}
}

// Clones the currently active entry with improved modal
export async function cloneCurrentEntry(modalStore: ModalStore, toastStore: ToastStore) {
	const entry = collectionValue.value;
	const coll = collection.value;
	if (!entry || !coll?._id) {
		toastStore.trigger({
			message: m.clone_entry_no_selection_error(),
			background: 'variant-filled-warning'
		});
		return;
	}

	const modalSettings = createCloneModal({
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
					toastStore.trigger({
						message: entryMessages.entryCloned(),
						background: 'variant-filled-success'
					});
					invalidateCollectionCache(coll._id);
					mode.set('view');
				} else {
					throw new Error(result.error || 'Failed to create clone');
				}
			} catch (e) {
				toastStore.trigger({
					message: m.clone_entry_error({ error: (e as Error).message }),
					background: 'variant-filled-error'
				});
			}
		}
	});
	modalStore.trigger(modalSettings);
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
export async function saveDraftAndLeave(modalStore: ModalStore, toastStore: ToastStore): Promise<boolean> {
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

						toastStore.trigger({
							message: 'Changes saved as draft.',
							background: 'variant-filled-warning'
						});

						invalidateCollectionCache(coll._id);
						hasUnsavedChanges = false;
						resolve(true); // Allow navigation
					} catch (e) {
						toastStore.trigger({
							message: `Error saving draft: ${(e as Error).message}`,
							background: 'variant-filled-error'
						});
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
