import { getPrivateSettingSync } from '../../../../../../chunks/settingsService.js';
import { error, json } from '@sveltejs/kit';
import { m as modifyRequest } from '../../../../../../chunks/modifyRequest.js';
import { contentManager } from '../../../../../../chunks/ContentManager.js';
import { object, optional, array, picklist, string, parse } from 'valibot';
import { l as logger } from '../../../../../../chunks/logger.server.js';
const batchOperationSchema = object({
	action: picklist(['delete', 'status', 'clone'], 'Invalid action specified.'),
	entryIds: array(string(), 'Entry IDs must be an array of strings'),
	// Optional fields for specific actions
	status: optional(string()),
	// Required for status action
	cloneCount: optional(string())
	// Required for clone action
});
const normalizeCollectionName = (collectionId) => {
	const cleanId = collectionId.replace(/-/g, '');
	return `collection_${cleanId}`;
};
const POST = async ({ locals, params, request }) => {
	const start = performance.now();
	const endpoint = `POST /api/collections/${params.collectionId}/batch`;
	const { user, tenantId } = locals;
	logger.info(`${endpoint} - Batch operation started`, {
		userId: user?._id,
		tenantId,
		collectionId: params.collectionId
	});
	try {
		if (!user) {
			throw error(401, 'Unauthorized');
		}
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Could not identify the tenant for this request.');
		}
		const schema = await contentManager.getCollectionById(params.collectionId, tenantId);
		if (!schema) {
			throw error(404, 'Collection not found');
		}
		let body;
		try {
			body = await request.json();
		} catch {
			throw error(400, 'Invalid JSON in request body');
		}
		const { action, entryIds, status, cloneCount } = parse(batchOperationSchema, body);
		if (action === 'status' && !status) {
			throw error(400, 'Status is required for status action');
		}
		if (action === 'status' && !['publish', 'unpublish', 'draft', 'archived'].includes(status)) {
			throw error(400, `Invalid status. Must be one of: publish, unpublish, draft, archived`);
		}
		if (action === 'clone' && !cloneCount) {
			throw error(400, 'Clone count is required for clone action');
		}
		const dbAdapter = locals.dbAdapter;
		if (!dbAdapter) {
			throw error(503, 'Service Unavailable: Database service is not properly initialized');
		}
		if (!schema._id) {
			throw error(500, 'Collection ID is missing');
		}
		const normalizedCollectionId = normalizeCollectionName(schema._id);
		const databaseEntryIds = entryIds.map((id) => id);
		const query = { _id: { $in: databaseEntryIds } };
		if (getPrivateSettingSync('MULTI_TENANT')) {
			query.tenantId = tenantId;
		}
		const verificationResult = await dbAdapter.crud.findMany(normalizedCollectionId, query);
		if (!verificationResult.success || !Array.isArray(verificationResult.data) || verificationResult.data.length !== entryIds.length) {
			logger.warn(`${endpoint} - Attempted batch operation on entries outside of tenant`, {
				userId: user._id,
				tenantId,
				requestedEntryIds: entryIds,
				foundEntries: verificationResult.data.length
			});
			throw error(403, 'One or more entries do not belong to your tenant or do not exist');
		}
		const results = [];
		let successCount = 0;
		switch (action) {
			case 'delete': {
				try {
					await modifyRequest({
						data: verificationResult.data,
						fields: schema.fields,
						collection: schema,
						user,
						type: 'DELETE'
					});
				} catch (modifyError) {
					const errorMsg = modifyError instanceof Error ? modifyError.message : 'Unknown error';
					logger.warn(`${endpoint} - ModifyRequest pre-processing failed`, {
						error: errorMsg
					});
				}
				const deleteResult = await dbAdapter.crud.deleteMany(normalizedCollectionId, query);
				if (deleteResult.success) {
					successCount = entryIds.length;
					results.push(...entryIds.map((id) => ({ entryId: id, success: true })));
				} else {
					results.push(
						...entryIds.map((id) => ({
							entryId: id,
							success: false,
							error: deleteResult.error.message
						}))
					);
				}
				logger.info(`${endpoint} - Batch delete completed`, {
					totalEntries: entryIds.length,
					successCount,
					failedCount: entryIds.length - successCount
				});
				break;
			}
			case 'status': {
				const updateData = { status, updatedBy: user._id };
				const updateResult = await dbAdapter.crud.updateMany(normalizedCollectionId, query, updateData);
				if (updateResult.success) {
					successCount = entryIds.length;
					results.push(...entryIds.map((id) => ({ entryId: id, success: true })));
				} else {
					results.push(
						...entryIds.map((id) => ({
							entryId: id,
							success: false,
							error: updateResult.error.message
						}))
					);
				}
				logger.info(`${endpoint} - Batch status update completed`, {
					newStatus: status,
					totalEntries: entryIds.length,
					successCount,
					failedCount: entryIds.length - successCount
				});
				break;
			}
			case 'clone': {
				const entriesToClone = [];
				const originalIds = [];
				for (const entry of verificationResult.data) {
					const entryData = entry;
					const clonedEntry = {
						...entryData,
						_id: void 0,
						// Remove ID so a new one is generated
						title: `${entryData.title || 'Untitled'} (Copy)`,
						createdBy: user._id,
						updatedBy: user._id,
						createdAt: /* @__PURE__ */ new Date().toISOString(),
						updatedAt: /* @__PURE__ */ new Date().toISOString()
					};
					entriesToClone.push(clonedEntry);
					originalIds.push(entry._id);
				}
				if (entriesToClone.length > 0) {
					const insertResult = await dbAdapter.crud.insertMany(normalizedCollectionId, entriesToClone);
					if (insertResult.success) {
						successCount = insertResult.data.length;
						insertResult.data.forEach((newEntry, index) => {
							results.push({
								entryId: originalIds[index],
								success: true,
								newId: newEntry._id
							});
						});
					} else {
						results.push(
							...originalIds.map((id) => ({
								entryId: id,
								success: false,
								error: insertResult.error.message
							}))
						);
					}
				}
				logger.info(`${endpoint} - Batch clone completed`, {
					totalEntries: entryIds.length,
					successCount,
					failedCount: entryIds.length - successCount
				});
				break;
			}
		}
		const duration = performance.now() - start;
		const cacheService = (await import('../../../../../../chunks/CacheService.js')).cacheService;
		const cachePattern = `collection:${schema._id}:*`;
		await cacheService.clearByPattern(cachePattern).catch((err) => {
			logger.warn('Failed to invalidate page cache after batch operation', { pattern: cachePattern, error: err });
		});
		return json({
			success: true,
			data: {
				action,
				results,
				summary: {
					total: entryIds.length,
					successful: successCount,
					failed: entryIds.length - successCount
				}
			},
			performance: { duration }
		});
	} catch (e) {
		if (typeof e === 'object' && e !== null && 'status' in e) {
			throw e;
		}
		const duration = performance.now() - start;
		logger.error(`${endpoint} - Unexpected error`, {
			error: e.message,
			stack: e.stack,
			duration: `${duration.toFixed(2)}ms`
		});
		throw error(500, 'Internal Server Error');
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
