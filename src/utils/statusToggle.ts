/**
 * @file src/utils/statusToggle.ts
 * @description Utility functions for status toggle operations
 */

import { StatusTypes } from '@src/content/types';
import type { StatusType } from '@src/content/types';

export interface StatusToggleOptions {
	collectionId: string;
	entryId?: string;
	currentStatus: StatusType;
	onSuccess?: (newStatus: StatusType) => void;
	onError?: (error: string) => void;
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

	const newStatus = currentStatus === StatusTypes.publish ? StatusTypes.unpublish : StatusTypes.publish;

	if (entryId) {
		try {
			const { updateEntryStatus } = await import('@src/utils/apiClient');
			const result = await updateEntryStatus(collectionId, entryId, newStatus);

			if (result.success) {
				onSuccess?.(newStatus);
				return { success: true, newStatus };
			} else {
				onError?.(result.error || `Failed to ${newStatus === StatusTypes.publish ? 'publish' : 'unpublish'} entry`);
				return { success: false, error: result.error };
			}
		} catch (e) {
			const error = `Error ${newStatus === StatusTypes.publish ? 'publishing' : 'unpublishing'} entry: ${(e as Error).message}`;
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
		const defaultStatus = collectionStatus || StatusTypes.unpublish;
		return defaultStatus === StatusTypes.publish;
	} else {
		const status = entryStatus || collectionStatus || StatusTypes.unpublish;
		return status === StatusTypes.publish;
	}
}
