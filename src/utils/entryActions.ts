/**
 * @file src/utils/entryActions.ts
 * @description Centralized functions for performing actions on single collection entries.
 */

import { apiRequest, updateStatus } from './apiClient';
// Stores
import { collection, mode, collectionValue } from '@stores/collectionStore.svelte';
// Skeleton
import { getModalStore, getToastStore, type ModalSettings } from '@skeletonlabs/skeleton';
// ParaglideJS
import * as m from '@src/paraglide/messages'; // Assuming you have messages for these actions

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
		body: m.confirm_deletion_body(),
		buttonTextCancel: m.button_cancel(),
		buttonTextConfirm: m.button_confirm(),
		response: async (confirmed: boolean) => {
			if (confirmed) {
				try {
					await apiRequest('DELETE', coll._id, { ids: JSON.stringify([entry._id]) });
					toastStore.trigger({ message: m.entry_deleted_success(), background: 'variant-filled-success' });
					mode.set('view');
					collectionValue.set({}); // Clear the current entry
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

// Changes the status of the currently active entry
export async function setEntryStatus(newStatus: 'publish' | 'unpublish' | 'schedule' | 'deleted' | 'test') {
	// Added 'deleted' and 'test' if they are statuses
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

	try {
		// Use new status endpoint
		await updateStatus(coll._id, entry._id, newStatus);
		collectionValue.update((cv) => ({ ...cv, status: newStatus }));
		toastStore.trigger({
			message: m.entry_status_updated({ status: newStatus }),
			background: 'variant-filled-success'
		});
	} catch (e) {
		toastStore.trigger({ message: m.set_status_error({ error: (e as Error).message }), background: 'variant-filled-error' });
	}
}

// Clones the currently active entry
export async function cloneCurrentEntry() {
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

	try {
		const clonedPayload = { ...entry };
		delete clonedPayload._id; // Ensure new entry gets a new ID
		delete clonedPayload.createdAt; // New entry has new creation date
		delete clonedPayload.updatedAt; // New entry has new update date
		clonedPayload.status = 'unpublish'; // Cloned entries should typically start as unpublished

		await apiRequest('POST', coll._id, clonedPayload);
		toastStore.trigger({ message: m.entry_cloned_success(), background: 'variant-filled-success' });
		mode.set('view'); // Navigate back to view to see the new entry
	} catch (e) {
		toastStore.trigger({ message: m.clone_entry_error({ error: (e as Error).message }), background: 'variant-filled-error' });
	}
}
