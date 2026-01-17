import { getPrivateSettingSync } from './settingsService.js';
async function getRevisions({ collection, entryId, tenantId, dbAdapter, page = 1, limit = 10 }) {
	if (!collection) {
		return { success: false, error: { message: 'Collection is required' } };
	}
	if (getPrivateSettingSync('MULTI_TENANT')) {
		const collectionName = `collection_${collection._id}`;
		const entryResult = await dbAdapter.crud.findMany(collectionName, { _id: entryId, tenantId });
		if (!entryResult.success || !entryResult.data || entryResult.data.length === 0) {
			return { success: false, error: { message: 'Entry not found' } };
		}
	}
	const revisionResult = await dbAdapter.content.revisions.getHistory(entryId, {
		page,
		pageSize: limit
	});
	return revisionResult;
}
export { getRevisions };
//# sourceMappingURL=RevisionService.js.map
