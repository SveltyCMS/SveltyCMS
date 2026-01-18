import { getPrivateSettingSync } from '@shared/services/settingsService';
import type { DatabaseId } from '@shared/database/dbInterface';

interface Collection {
	_id: string;
	revision?: boolean;
	[key: string]: any;
}

// Shared logic for retrieving revisions
export async function getRevisions({
	collection,
	entryId,
	tenantId,
	dbAdapter,
	page = 1,
	limit = 10
}: {
	collection: Collection;
	entryId: string;
	tenantId: string;
	dbAdapter: any;
	page?: number;
	limit?: number;
}) {
	if (!collection) {
		return { success: false, error: { message: 'Collection is required' } };
	}

	// --- MULTI-TENANCY SECURITY CHECK ---
	if (getPrivateSettingSync('MULTI_TENANT')) {
		const collectionName = `collection_${collection._id}`;
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
