/**
 * @file src/utils/entryActions.ts
 * @description Centralized functions for performing actions on collection entries.
 */

import type { StatusType } from '@src/content/types';
import { collection, collectionValue, mode } from '@stores/collectionStore.svelte';
import type { ModalStore, ToastStore } from '@skeletonlabs/skeleton';
import { batchUpdateEntries, batchDeleteEntries, createClones, updateEntry, createEntry, invalidateCollectionCache } from './apiClient';
import * as m from '@src/paraglide/messages';

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
		toastStore.trigger({ message: `Entries updated to ${status}` });
		onSuccess();
	} else {
		toastStore.trigger({ message: result.error || 'Failed to update entries' });
	}
}

// Deletes or archives one or more entries
export async function deleteEntries(entryIds: string[], isPermanentDelete: boolean, onSuccess: () => void, toastStore: ToastStore) {
	if (!entryIds.length) return;
	const collId = collection.value?._id;
	if (!collId) return;

	const isArchiving = publicEnv.USE_ARCHIVE_ON_DELETE && !isPermanentDelete;
	const actionText = isArchiving ? 'archived' : 'permanently deleted';

	const result = await batchDeleteEntries(collId, entryIds, isPermanentDelete);
	if (result.success) {
		toastStore.trigger({ message: `Entries ${actionText}` });
		onSuccess();
	} else {
		toastStore.trigger({ message: result.error || `Failed to ${actionText.slice(0, -1)} entries` });
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
	const payload = { ...entryData, status: publish ? 'published' : 'draft' };

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
export async function deleteCurrentEntry(modalStore: ModalStore, toastStore: ToastStore) {
	const entry = collectionValue.value;
	const coll = collection.value;
	if (!entry?._id || !coll?._id) {
		toastStore.trigger({
			message: m.delete_entry_no_selection_error(),
			background: 'variant-filled-warning'
		});
		return;
	}
	const modalSettings: ModalSettings = {
		type: 'confirm',
		title: m.confirm_deletion_title(),
		body: publicEnv.USE_ARCHIVE_ON_DELETE
			? 'This will archive the entry. Only admins can permanently delete archived entries.'
			: 'This will permanently delete the entry. This action cannot be undone.',
		buttonTextCancel: m.button_cancel(),
		buttonTextConfirm: publicEnv.USE_ARCHIVE_ON_DELETE ? 'Archive' : 'Delete',
		meta: { buttonConfirmClasses: 'bg-error-500 hover:bg-error-600 text-white' },
		response: async (confirmed: boolean) => {
			if (confirmed) {
				try {
					if (publicEnv.USE_ARCHIVE_ON_DELETE) {
						await updateStatus(coll._id, entry._id, StatusTypes.archive);
						collectionValue.update((cv) => ({ ...cv, status: StatusTypes.archive }));
						toastStore.trigger({ message: 'Entry archived successfully.', background: 'variant-filled-success' });
					} else {
						await apiRequest('DELETE', coll._id, { ids: JSON.stringify([entry._id]) });
						toastStore.trigger({ message: m.entry_deleted_success(), background: 'variant-filled-success' });
					}
					mode.set('view');
					collectionValue.set({});
					invalidateCollectionCache(coll._id);
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
					await apiRequest('DELETE', coll._id, { ids: JSON.stringify([entryId]) });
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

// Schedule entry for future publication
export async function scheduleCurrentEntry(modalStore: ModalStore, toastStore: ToastStore, scheduledDate?: Date) {
	const entry = collectionValue.value;
	const coll = collection.value;

	if (!entry?._id || !coll?._id) {
		toastStore.trigger({
			message: 'No entry selected for scheduling.',
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
				message: `Entry scheduled for ${scheduledDate.toLocaleDateString()}`,
				background: 'variant-filled-success'
			});
		} catch (e) {
			toastStore.trigger({
				message: `Error scheduling entry: ${(e as Error).message}`,
				background: 'variant-filled-error'
			});
		}
	} else {
		// Show modal for date selection
		const modalSettings: ModalSettings = {
			type: 'confirm',
			title: 'Schedule Entry',
			body: 'Set this entry to be published at a scheduled time. Status will be changed to "schedule".',
			buttonTextCancel: m.button_cancel(),
			buttonTextConfirm: 'Schedule',
			meta: { buttonConfirmClasses: 'bg-pink-500 hover:bg-pink-600 text-white' },
			response: async (confirmed: boolean) => {
				if (confirmed) {
					try {
						await updateStatus(coll._id, entry._id, StatusTypes.schedule);
						collectionValue.update((cv) => ({ ...cv, status: StatusTypes.schedule }));
						toastStore.trigger({
							message: 'Entry status changed to scheduled.',
							background: 'variant-filled-success'
						});
					} catch (e) {
						toastStore.trigger({
							message: `Error scheduling entry: ${(e as Error).message}`,
							background: 'variant-filled-error'
						});
					}
				}
			}
		};
		modalStore.trigger(modalSettings);
	}
}

// Clones the currently active entry
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
	const modalSettings: ModalSettings = {
		type: 'confirm',
		title: m.entrylist_multibutton_clone(),
		body: m.clone_entry_body(),
		buttonTextCancel: m.button_cancel(),
		buttonTextConfirm: m.entrylist_multibutton_clone(),
		meta: { buttonConfirmClasses: 'bg-secondary-500 hover:bg-secondary-600 text-white' },
		response: async (confirmed: boolean) => {
			if (confirmed) {
				try {
					// Create a deep copy of the entry with all its data
					const clonedPayload = JSON.parse(JSON.stringify(entry));

					// Remove unique identifiers and timestamps
					delete clonedPayload._id;
					delete clonedPayload.createdAt;
					delete clonedPayload.updatedAt;

					// Set clone status and reference to original
					clonedPayload.status = StatusTypes.clone; // Use 'clone' not 'cloned'
					clonedPayload.clonedFrom = entry._id;

					console.log('Cloning entry with payload:', clonedPayload);

					await apiRequest('POST', coll._id, clonedPayload);
					toastStore.trigger({ message: m.entry_cloned_success(), background: 'variant-filled-success' });
					invalidateCollectionCache(coll._id);
					mode.set('view');
				} catch (e) {
					toastStore.trigger({
						message: m.clone_entry_error({ error: (e as Error).message }),
						background: 'variant-filled-error'
					});
				}
			}
		}
	};
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
							await apiRequest('PATCH', coll._id, draftData, entry._id);
							await updateStatus(coll._id, entry._id, StatusTypes.draft);
						} else {
							// Create new entry with draft status
							draftData.status = StatusTypes.draft;
							await apiRequest('POST', coll._id, draftData);
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
