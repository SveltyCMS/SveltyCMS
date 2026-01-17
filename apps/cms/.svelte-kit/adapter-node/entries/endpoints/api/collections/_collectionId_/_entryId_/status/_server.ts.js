import { getPrivateSettingSync } from '../../../../../../../chunks/settingsService.js';
import { error, json } from '@sveltejs/kit';
import { contentManager } from '../../../../../../../chunks/ContentManager.js';
import { S as StatusTypes } from '../../../../../../../chunks/definitions.js';
import { l as logger } from '../../../../../../../chunks/logger.server.js';
const normalizeCollectionName = (collectionId) => {
	const cleanId = collectionId.replace(/-/g, '');
	return `collection_${cleanId}`;
};
const PATCH = async ({ locals, params, request }) => {
	const start = performance.now();
	const { user, tenantId } = locals;
	if (!user) {
		throw error(401, 'Unauthorized');
	}
	await contentManager.initialize(tenantId);
	const schema = await contentManager.getCollectionById(params.collectionId, tenantId);
	if (!schema) {
		throw error(404, 'Collection not found');
	}
	try {
		let body;
		try {
			body = await request.json();
		} catch (parseError) {
			const errorMsg = parseError instanceof Error ? parseError.message : 'Unknown parse error';
			logger.error(`Failed to parse request body: ${errorMsg}`);
			throw error(400, 'Invalid JSON in request body');
		}
		const { status, entries } = body;
		if (!status) {
			throw error(400, 'Status is required');
		}
		const validStatuses = Object.values(StatusTypes);
		if (!validStatuses.includes(status)) {
			throw error(400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
		}
		const dbAdapter = locals.dbAdapter;
		if (!dbAdapter) {
			throw error(503, 'Service Unavailable: Database service is not properly initialized');
		}
		if (!schema._id) {
			throw error(500, 'Collection ID is missing');
		}
		let results = [];
		const normalizedCollectionId = normalizeCollectionName(schema._id);
		const updateData = { status, updatedBy: user._id };
		if (entries && Array.isArray(entries) && entries.length > 0) {
			const query = { _id: { $in: entries } };
			if (getPrivateSettingSync('MULTI_TENANT')) {
				query.tenantId = tenantId;
			}
			const verificationResult = await dbAdapter.crud.findMany(normalizedCollectionId, query);
			if (!verificationResult.success || verificationResult.data.length !== entries.length) {
				logger.warn(`Attempt to update status for entries outside of tenant`, {
					userId: user._id,
					tenantId,
					requestedEntryIds: entries
				});
				throw error(403, 'Forbidden: One or more entries do not belong to your tenant or do not exist.');
			}
			const result = await dbAdapter.crud.updateMany(normalizedCollectionId, query, updateData);
			if (result.success) {
				results = entries.map((entryId) => ({ entryId, success: true }));
			} else {
				throw error(500, result.error.message);
			}
		} else {
			const query = { _id: params.entryId };
			if (getPrivateSettingSync('MULTI_TENANT')) {
				query.tenantId = tenantId;
			}
			const verificationResult = await dbAdapter.crud.findOne(normalizedCollectionId, query);
			if (!verificationResult.success || !verificationResult.data) {
				throw error(404, 'Entry not found or access denied');
			}
			const result = await dbAdapter.crud.update(normalizedCollectionId, params.entryId, updateData);
			if (!result.success) {
				throw error(500, result.error.message);
			}
			if (!result.data) {
				throw error(404, 'Entry not found');
			}
			results = [{ entryId: params.entryId, success: true, data: result.data }];
		}
		const duration = performance.now() - start;
		const successCount = results.filter((r) => r.success).length;
		const cacheService = (await import('../../../../../../../chunks/CacheService.js')).cacheService;
		const cachePattern = `collection:${schema._id}:*`;
		await cacheService.clearByPattern(cachePattern).catch((err) => {
			logger.warn('Failed to invalidate page cache after status change', { pattern: cachePattern, error: err });
		});
		logger.info(`Status updated for ${successCount}/${results.length} entries in ${duration.toFixed(2)}ms`, { tenantId });
		return json({
			success: true,
			data: {
				status,
				results,
				summary: {
					total: results.length,
					successful: successCount,
					failed: results.length - successCount
				}
			},
			performance: { duration }
		});
	} catch (e) {
		if (typeof e === 'object' && e !== null && 'status' in e) {
			const errorBody = 'body' in e && typeof e.body === 'object' && e.body !== null && 'message' in e.body ? e.body.message : void 0;
			const errorMsg2 = e instanceof Error ? e.message : 'Unknown error';
			logger.error(`Status update error (${e.status})`, {
				error: e.message,
				stack: e.stack,
				body: errorBody || errorMsg2
			});
			throw e;
		}
		const duration = performance.now() - start;
		const errorMsg = e instanceof Error ? e.message : 'Unknown error';
		const stack = e instanceof Error ? e.stack : void 0;
		logger.error(`Failed to update status: ${errorMsg} in ${duration.toFixed(2)}ms`, {
			error: e,
			stack,
			collectionId: params.collectionId,
			entryId: params.entryId
		});
		throw error(500, 'Internal Server Error');
	}
};
export { PATCH };
//# sourceMappingURL=_server.ts.js.map
