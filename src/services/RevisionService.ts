/**
 * @file src/services/RevisionService.ts
 * @description Service for handling entry revisions.
 */

import { contentManager } from '@src/content/ContentManager';
import { getPrivateSettingSync } from '@src/services/settingsService';
import type { DatabaseId } from '@src/databases/dbInterface';

// Shared logic for retrieving revisions
export async function getRevisions({
	collectionId,
	entryId,
	tenantId,
	dbAdapter,
	page = 1,
	limit = 10
}: {
	collectionId: string;
	entryId: string;
	tenantId: string;
	dbAdapter: import('@src/databases/dbInterface').IDBAdapter;
	page?: number;
	limit?: number;
}) {
	const schema = await contentManager.getCollectionById(collectionId, tenantId);
	if (!schema) {
		return { success: false, error: { message: 'Collection not found' } };
	}

	// --- MULTI-TENANCY SECURITY CHECK ---
	if (getPrivateSettingSync('MULTI_TENANT')) {
		const collectionName = `collection_${schema._id}`;
		const entryResult = await dbAdapter.crud.findMany(collectionName, { _id: entryId, tenantId } as Record<string, unknown>);
		if (!entryResult.success || !entryResult.data || entryResult.data.length === 0) {
			return { success: false, error: { message: 'Entry not found' } };
		}
	}

	const revisionResult = await dbAdapter.content.revisions.getHistory(entryId as unknown as DatabaseId, {
		page,
		pageSize: limit
	});

	return revisionResult;
}
