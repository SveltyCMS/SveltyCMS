/**
 * @file src/stores/statusStore.svelte.ts
 * @description Centralized status management store for collection entries
 *
 * Features:
 * - Default status is 'unpublish'
 * - Collection-defined status overrides default for new entries
 * - User can toggle status anytime (saves user's last defined state)
 * - Shared between HeaderEdit and RightSidebar
 * - Centralized status toggle actions
 */

import { StatusTypes } from '@src/content/types';
import type { StatusType } from '@src/content/types';
import { collection, collectionValue, mode } from '@src/stores/collectionStore.svelte';
import { updateEntryStatus } from '@src/utils/apiClient';
import type { ToastStore } from '@skeletonlabs/skeleton';

// Status state management
const statusState = $state<{
	isPublish: boolean;
	hasUserToggled: boolean;
	isLoading: boolean;
}>({
	isPublish: false,
	hasUserToggled: false,
	isLoading: false
});

/**
 * Get the initial status based on mode and collection/entry data
 */
function getInitialStatus(): boolean {
	const cv = collectionValue.value;
	const collectionStatus = collection.value?.status;

	// For create mode: use collection default, fallback to unpublish
	if (mode.value === 'create') {
		const defaultStatus = collectionStatus || StatusTypes.unpublish;
		return defaultStatus === StatusTypes.publish;
	} else {
		// For edit mode: use entry status, fallback to collection status, then unpublish
		const entryStatus = cv?.status || collectionStatus || StatusTypes.unpublish;
		return entryStatus === StatusTypes.publish;
	}
}

/**
 * Derived status that updates when collection/entry data changes
 */
const derivedStatus = $derived(() => {
	return getInitialStatus();
});

/**
 * Centralized status store
 */
export const statusStore = {
	// Getters
	get isPublish() {
		return statusState.isPublish;
	},
	get hasUserToggled() {
		return statusState.hasUserToggled;
	},
	get isLoading() {
		return statusState.isLoading;
	},
	get derivedStatus() {
		return derivedStatus;
	},

	// Actions
	/**
	 * Initialize or reset status based on collection/entry data
	 */
	initializeStatus() {
		const initialStatus = getInitialStatus();
		console.log('[StatusStore] Initializing status:', {
			initialStatus,
			mode: mode.value,
			collectionStatus: collection.value?.status,
			entryStatus: collectionValue.value?.status
		});

		statusState.isPublish = initialStatus;
		statusState.hasUserToggled = false;
		statusState.isLoading = false;
	},

	/**
	 * Sync status with derived status (only if user hasn't manually toggled)
	 */
	syncWithDerived() {
		const currentDerived = derivedStatus;
		if (!statusState.hasUserToggled && statusState.isPublish !== currentDerived) {
			statusState.isPublish = currentDerived;
			console.log('[StatusStore] Syncing with derived status:', {
				newStatus: statusState.isPublish,
				mode: mode.value,
				collectionStatus: collection.value?.status,
				entryStatus: collectionValue.value?.status
			});
		}
	},

	/**
	 * Handle user status toggle
	 */
	async toggleStatus(newValue: boolean, toastStore: ToastStore, componentName: string): Promise<boolean> {
		if (newValue === statusState.isPublish || statusState.isLoading) {
			console.log(`[StatusStore] Toggle skipped from ${componentName}`, {
				newValue,
				currentValue: statusState.isPublish,
				isLoading: statusState.isLoading
			});
			return false;
		}

		statusState.isLoading = true;
		statusState.hasUserToggled = true;
		const previousValue = statusState.isPublish;
		statusState.isPublish = newValue;

		const newStatus = newValue ? StatusTypes.publish : StatusTypes.unpublish;
		console.log(`[StatusStore] Status toggle from ${componentName} - updating to:`, newStatus);

		try {
			// If entry exists, update via API
			if (collectionValue.value?._id && collection.value?._id) {
				const result = await updateEntryStatus(String(collection.value._id), String(collectionValue.value._id), newStatus);

				if (result.success) {
					// Update the collection value store
					collectionValue.update((current) => ({ ...current, status: newStatus }));

					toastStore.trigger({
						message: newValue ? 'Entry published successfully.' : 'Entry unpublished successfully.',
						background: 'variant-filled-success'
					});

					console.log(`[StatusStore] API update successful from ${componentName}`);
					return true;
				} else {
					// Revert on API failure
					statusState.isPublish = previousValue;
					statusState.hasUserToggled = false;

					toastStore.trigger({
						message: result.error || `Failed to ${newValue ? 'publish' : 'unpublish'} entry`,
						background: 'variant-filled-error'
					});

					console.error(`[StatusStore] API update failed from ${componentName}:`, result.error);
					return false;
				}
			} else {
				// New entry - just update local state
				collectionValue.update((current) => ({ ...current, status: newStatus }));
				console.log(`[StatusStore] Local update for new entry from ${componentName}`);
				return true;
			}
		} catch (e) {
			// Revert on error
			statusState.isPublish = previousValue;
			statusState.hasUserToggled = false;

			const errorMessage = `Error ${newValue ? 'publishing' : 'unpublishing'} entry: ${(e as Error).message}`;
			toastStore.trigger({
				message: errorMessage,
				background: 'variant-filled-error'
			});

			console.error(`[StatusStore] Toggle error from ${componentName}:`, e);
			return false;
		} finally {
			statusState.isLoading = false;
		}
	},

	/**
	 * Get current status for saving
	 */
	getStatusForSave(): StatusType {
		return statusState.isPublish ? StatusTypes.publish : StatusTypes.unpublish;
	},

	/**
	 * Reset user toggle flag (used when switching entries/modes)
	 */
	resetUserToggled() {
		statusState.hasUserToggled = false;
		console.log('[StatusStore] Reset user toggled flag');
	},

	/**
	 * Force set status (for external updates like scheduling)
	 */
	setStatus(isPublish: boolean, hasUserToggled = true) {
		statusState.isPublish = isPublish;
		statusState.hasUserToggled = hasUserToggled;
		console.log('[StatusStore] Status forced to:', isPublish, 'userToggled:', hasUserToggled);
	}
};
