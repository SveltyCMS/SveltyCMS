/**
 * @file src/utils/statusToggle.ts
 * @description Utility functions for status toggle operations
 *
 * This module provides functions for toggling entry status between publish and unpublish.
 * It includes functions for getting initial publish status and toggling entry status.
 */

import type { StatusType } from '@src/content/types';

export interface StatusToggleOptions {
	collectionId: string;
	currentStatus: StatusType;
	entryId?: string;
	onError?: (error: string) => void;
	onSuccess?: (newStatus: StatusType) => void;
}

/**
 * Toggle entry status between publish/unpublish
 */
export async function toggleEntryStatus(options: StatusToggleOptions): Promise<{
	success: boolean;
	newStatus?: StatusType;
	error?: string;
}> {
	const { collectionId, entryId, currentStatus, onSuccess, onError } = options;

	const newStatus = currentStatus === 'publish' ? 'unpublish' : 'publish';

	if (entryId) {
		try {
			const { updateEntryStatus } = await import('@src/utils/api-client');
			const result = await updateEntryStatus(collectionId, entryId, newStatus);

			if (result.success) {
				onSuccess?.(newStatus);
				return { success: true, newStatus };
			}
			onError?.(result.error || `Failed to ${newStatus === 'publish' ? 'publish' : 'unpublish'} entry`);
			return { success: false, error: result.error };
		} catch (e) {
			const error = `Error ${newStatus === 'publish' ? 'publishing' : 'unpublishing'} entry: ${(e as Error).message}`;
			onError?.(error);
			return { success: false, error };
		}
	} else {
		// New entry - no API call needed
		onSuccess?.(newStatus);
		return { success: true, newStatus };
	}
}

/**
 * Get initial publish status based on mode and collection/entry status
 */
export function getInitialPublishStatus(mode: string, collectionStatus?: StatusType, entryStatus?: StatusType): boolean {
	if (mode === 'create') {
		const defaultStatus = collectionStatus || 'unpublish';
		return defaultStatus === 'publish';
	}
	const status = entryStatus || collectionStatus || 'unpublish';
	return status === 'publish';
}
