/**
 * @file src/utils/entryActions.ts
 * @description Centralized functions for performing actions on single collection entries.
 */

import { publicEnv } from '@root/config/public';

import { apiRequest, updateStatus, invalidateCollectionCache } from './apiClient';
// Types
import type { StatusType } from '@src/content/types';
import { StatusTypes } from '@src/content/types';

// Stores
import { collection, mode, collectionValue } from '@stores/collectionStore.svelte';

// Skeleton
import { getModalStore, getToastStore, type ModalSettings } from '@skeletonlabs/skeleton';

// ParaglideJS
import * as m from '@src/paraglide/messages';

// Deletes the currently active entry after confirmation
export async function deleteCurrentEntry() {
	const modalStore = getModalStore();
	const toastStore = getToastStore();
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

export async function permanentlyDeleteEntry(entryId: string) {
	const modalStore = getModalStore();
	const toastStore = getToastStore();
	const coll = collection.value;
	if (!entryId || !coll?._id) {
		toastStore.trigger({
			message: 'No entry or collection selected.',
			background: 'variant-filled-warning'
		});
		return;
	}
	// TODO: Get current user role - replace this with proper user role check
	// const userRole = roles.find((role) => role._id === currentUser?.role);
	// if (!userRole?.isAdmin) {
	// 	toastStore.trigger({
	// 		message: 'Only admins can permanently delete archived entries.',
	// 		background: 'variant-filled-error'
	// 	});
	// 	return;
	// }
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

export async function setEntryStatus(newStatus: StatusType) {
	const toastStore = getToastStore();
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
export async function scheduleCurrentEntry(scheduledDate?: Date) {
	const modalStore = getModalStore();
	const toastStore = getToastStore();
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
export async function cloneCurrentEntry() {
	const modalStore = getModalStore();
	const toastStore = getToastStore();
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

export async function saveEntry(entryData: Record<string, unknown>, publish: boolean = false) {
	const toastStore = getToastStore();
	const coll = collection.value;
	if (!entryData._id || !coll?._id) {
		toastStore.trigger({ message: 'No entry or collection selected.', background: 'variant-filled-warning' });
		return;
	}
	try {
		await apiRequest('PATCH', coll._id, entryData, entryData._id);
		if (publish || entryData.status === StatusTypes.clone) {
			const newStatus = coll.status || StatusTypes.publish;
			await updateStatus(coll._id, entryData._id, newStatus);
			collectionValue.update((cv) => ({ ...cv, ...entryData, status: newStatus }));
			toastStore.trigger({
				message: `Entry saved and ${publish ? 'published' : 'status updated to ' + newStatus}.`,
				background: 'variant-filled-success'
			});
		} else {
			collectionValue.update((cv) => ({ ...cv, ...entryData }));
			toastStore.trigger({ message: 'Entry saved.', background: 'variant-filled-success' });
		}
		invalidateCollectionCache(coll._id);
		mode.set('view');
	} catch (e) {
		toastStore.trigger({ message: `Error saving entry: ${(e as Error).message}`, background: 'variant-filled-error' });
	}
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
	const modalStore = getModalStore();
	const toastStore = getToastStore();
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
