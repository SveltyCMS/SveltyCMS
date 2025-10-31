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

import type { ToastStore } from '@skeletonlabs/skeleton';
import { collection, collectionValue, mode, setCollectionValue } from '@src/stores/collectionStore.svelte';
import { updateEntryStatus } from '@src/utils/apiClient';
import { showToast } from '@utils/toast';

import { logger } from '@utils/logger';

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

// Get the initial status based on mode and collection/entry data
function getInitialStatus(): boolean {
	const cv = collectionValue.value;
	const collectionStatus = collection.value?.status;

	// For create mode: use collection default, fallback to unpublish
	if (mode.value === 'create') {
		const defaultStatus = collectionStatus || 'unpublish';
		return defaultStatus === 'publish';
	} else {
		// For edit mode: use entry status, fallback to collection status, then unpublish
		const entryStatus = cv?.status || collectionStatus || 'unpublish';
		return entryStatus === 'publish';
	}
}

// Derived status that updates when collection/entry data changes
const derivedStatus = $derived(() => {
	return getInitialStatus();
});

// Centralized status store
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
	// Initialize or reset status based on collection/entry data
	initializeStatus() {
		const initialStatus = getInitialStatus();
		logger.trace('[StatusStore] Initializing status:', {
			initialStatus,
			mode: mode.value,
			collectionStatus: collection.value?.status,
			entryStatus: collectionValue.value?.status
		});

		statusState.isPublish = initialStatus;
		statusState.hasUserToggled = false;
		statusState.isLoading = false;
	},

	// Sync status with derived status (only if user hasn't manually toggled)
	syncWithDerived() {
		const currentDerived = derivedStatus;
		if (!statusState.hasUserToggled && statusState.isPublish !== currentDerived) {
			statusState.isPublish = currentDerived;
			logger.trace('[StatusStore] Syncing with derived status:', {
				newStatus: statusState.isPublish,
				mode: mode.value,
				collectionStatus: collection.value?.status,
				entryStatus: collectionValue.value?.status
			});
		}
	},

	// Handle user status toggle
	async toggleStatus(newValue: boolean, _toastStore: ToastStore, componentName: string): Promise<boolean> {
		if (newValue === statusState.isPublish || statusState.isLoading) {
			logger.trace(`[StatusStore] Toggle skipped from ${componentName}`, {
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

		const newStatus = newValue ? 'publish' : 'unpublish';
		logger.debug(`[StatusStore] Status toggle from ${componentName} - updating to:`, newStatus);

		try {
			// If entry exists, update via API
			if (collectionValue.value?._id && collection.value?._id) {
				const result = await updateEntryStatus(String(collection.value._id), String(collectionValue.value._id), newStatus);

				if (result.success) {
					// Update the collection value store
					setCollectionValue({ ...collectionValue.value, status: newStatus });

					showToast(newValue ? 'Entry published successfully.' : 'Entry unpublished successfully.', 'success');

					logger.debug(`[StatusStore] API update successful from ${componentName}`);
					return true;
				} else {
					// Revert on API failure
					statusState.isPublish = previousValue;
					statusState.hasUserToggled = false;

					showToast(result.error || `Failed to ${newValue ? 'publish' : 'unpublish'} entry`, 'error');

					logger.error(`[StatusStore] API update failed from ${componentName}:`, result.error);
					return false;
				}
			} else {
				// New entry - just update local state
				setCollectionValue({ ...collectionValue.value, status: newStatus });
				logger.debug(`[StatusStore] Local update for new entry from ${componentName}`);
				return true;
			}
		} catch (e) {
			// Revert on error
			statusState.isPublish = previousValue;
			statusState.hasUserToggled = false;

			const errorMessage = `Error ${newValue ? 'publishing' : 'unpublishing'} entry: ${(e as Error).message}`;
			showToast(errorMessage, 'error');

			logger.error(`[StatusStore] Toggle error from ${componentName}:`, e);
			return false;
		} finally {
			statusState.isLoading = false;
		}
	},

	// Get current status for saving
	getStatusForSave(): StatusType {
		return statusState.isPublish ? 'publish' : 'unpublish';
	},

	// Reset user toggle flag (used when switching entries/modes)
	resetUserToggled() {
		statusState.hasUserToggled = false;
		logger.trace('[StatusStore] Reset user toggled flag');
	},

	// Force set status (for external updates like scheduling)
	setStatus(isPublish: boolean, hasUserToggled = true) {
		statusState.isPublish = isPublish;
		statusState.hasUserToggled = hasUserToggled;
		logger.debug('[StatusStore] Status forced to:', isPublish, 'userToggled:', hasUserToggled);
	}
};
