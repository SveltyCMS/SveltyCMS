/**
 * @file src/stores/statusStore.svelte.ts
 * @description Centralized status logic for collection entries.
 * simplifies status management by deriving state directly from collectionValue.
 */

import { collection, collectionValue, setCollectionValue } from '@src/stores/collectionStore.svelte';
import { updateEntryStatus } from '@src/utils/apiClient';
import { toaster } from '@stores/store.svelte';
import type { StatusType } from '@src/content/types';
import { StatusTypes } from '@src/content/types';
import { logger } from '@utils/logger';

// Only track transient UI state
const statusState = $state({
	isLoading: false,
	lastToggleTime: 0
});

/**
 * Helper to determine if entry is published
 * Single source of truth: collectionValue.status
 */
function getIsPublish(): boolean {
	const cv = collectionValue.value;

	// 1. If we have an entry with explicit status, use it
	if (cv?.status) {
		return cv.status === StatusTypes.publish;
	}

	// 2. Fall back to collection default status
	const collectionStatus = collection.value?.status;
	const defaultStatus = collectionStatus || StatusTypes.unpublish;
	return defaultStatus === StatusTypes.publish;
}

// Reactively derive the publish state
const isPublish = $derived.by(getIsPublish);

/**
 * Get current status as StatusType enum
 */
function getCurrentStatus(): StatusType {
	const cv = collectionValue.value;

	if (cv?.status) {
		return cv.status as StatusType;
	}

	const collectionStatus = collection.value?.status;
	return (collectionStatus || StatusTypes.unpublish) as StatusType;
}

export const statusStore = {
	/**
	 * Check if current entry is published
	 */
	get isPublish() {
		return isPublish;
	},

	/**
	 * Check if status operation is in progress
	 */
	get isLoading() {
		return statusState.isLoading;
	},

	/**
	 * Get current status value
	 */
	get currentStatus(): StatusType {
		return getCurrentStatus();
	},

	/**
	 * Toggle entry status between publish/unpublish
	 *
	 * @param newValue - true for publish, false for unpublish
	 * @param componentName - Name of calling component (for logging)
	 * @returns Promise<boolean> - true if successful
	 */
	async toggleStatus(newValue: boolean, componentName: string = 'Component'): Promise<boolean> {
		// Prevent redundant toggles
		if (newValue === isPublish) {
			logger.debug(`[StatusStore] Status already ${newValue ? 'published' : 'unpublished'}`);
			return true;
		}

		// Prevent concurrent toggles
		if (statusState.isLoading) {
			logger.warn('[StatusStore] Status toggle already in progress');
			return false;
		}

		// Throttle rapid toggles (prevent double-click issues)
		const now = Date.now();
		if (now - statusState.lastToggleTime < 500) {
			logger.debug('[StatusStore] Throttling rapid status toggle');
			return false;
		}

		statusState.isLoading = true;
		statusState.lastToggleTime = now;

		const newStatus = newValue ? StatusTypes.publish : StatusTypes.unpublish;
		logger.debug(`[StatusStore] Toggling status to ${newStatus} (from ${componentName})`);

		try {
			// Case 1: Entry exists - update via API
			if (collectionValue.value?._id && collection.value?._id) {
				const result = await updateEntryStatus(String(collection.value._id), String(collectionValue.value._id), newStatus);

				if (result.success) {
					// Update local state
					setCollectionValue({
						...collectionValue.value,
						status: newStatus,
						// Clear schedule when manually toggling
						_scheduled: undefined
					});

					toaster.success({ description: newValue ? 'Entry published successfully' : 'Entry unpublished successfully' });
					return true;
				} else {
					toaster.error({ description: result.error || `Failed to ${newStatus} entry` });
					return false;
				}
			}
			// Case 2: New entry (no ID yet) - update local state only
			else {
				setCollectionValue({
					...collectionValue.value,
					status: newStatus
				});

				logger.debug(`[StatusStore] Status set to ${newStatus} (unsaved entry)`);
				return true;
			}
		} catch (e) {
			const error = e as Error;
			toaster.error({ description: `Error updating status: ${error.message}` });
			logger.error(`[StatusStore] Error in ${componentName}:`, error);
			return false;
		} finally {
			statusState.isLoading = false;
		}
	},

	/**
	 * Get status value for save operations
	 * Useful when preparing data to send to API
	 */
	getStatusForSave(): StatusType {
		return getCurrentStatus();
	},

	/**
	 * Set status directly (without API call)
	 * Use for initialization or when status is set as part of larger save
	 */
	setStatusLocal(status: StatusType): void {
		logger.debug(`[StatusStore] Setting status locally to ${status}`);
		setCollectionValue({
			...collectionValue.value,
			status
		});
	},

	/**
	 * Check if entry is in a specific status
	 */
	hasStatus(status: StatusType): boolean {
		return getCurrentStatus() === status;
	},

	/**
	 * Check if entry is scheduled
	 */
	get isScheduled(): boolean {
		return getCurrentStatus() === StatusTypes.schedule && !!collectionValue.value?._scheduled;
	}
};
