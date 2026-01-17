import { error, json } from '@sveltejs/kit';
import { getPrivateSettingSync } from '../../../../../../chunks/settingsService.js';
import { contentManager } from '../../../../../../chunks/ContentManager.js';
import { m as modifyRequest } from '../../../../../../chunks/modifyRequest.js';
import { l as logger } from '../../../../../../chunks/logger.server.js';
const normalizeCollectionName = (collectionId) => {
	const cleanId = collectionId.replace(/-/g, '');
	return `collection_${cleanId}`;
};
const PATCH = async ({ locals, params, request }) => {
	const startTime = performance.now();
	const endpoint = `PATCH /api/collections/${params.collectionId}/${params.entryId}`;
	const { user, tenantId } = locals;
	logger.info(`${endpoint} - Request started`, { userId: user?._id, tenantId });
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
		if (!schema._id) {
			throw error(500, 'Collection ID is missing');
		}
		let body;
		const contentType = request.headers.get('content-type');
		if (contentType?.includes('application/json')) {
			body = await request.json();
		} else if (contentType?.includes('multipart/form-data')) {
			const formData = await request.formData();
			body = Object.fromEntries(formData.entries());
		} else {
			throw error(400, 'Unsupported content type');
		}
		const updateData = { ...body, updatedBy: user._id };
		const dataArray = [updateData];
		const dbAdapter = locals.dbAdapter;
		if (!dbAdapter) {
			throw error(503, 'Service Unavailable: Database service is not properly initialized');
		}
		const collectionModel = await dbAdapter.collection.getModel(schema._id);
		try {
			await modifyRequest({
				data: dataArray,
				fields: schema.fields,
				collection: collectionModel,
				user,
				type: 'PATCH',
				tenantId
			});
		} catch (modifyError) {
			logger.warn(`${endpoint} - ModifyRequest pre-processing failed`, { error: modifyError.message });
		}
		const collectionName = `collection_${schema._id}`;
		const query = { _id: params.entryId };
		if (getPrivateSettingSync('MULTI_TENANT')) {
			query.tenantId = tenantId;
		}
		const verificationResult = await dbAdapter.crud.findOne(collectionName, query);
		if (!verificationResult.success || !verificationResult.data) {
			throw error(404, 'Entry not found or access denied');
		}
		const result = await dbAdapter.crud.update(collectionName, params.entryId, dataArray[0]);
		if (!result.success) {
			throw new Error(result.error.message);
		}
		if (!result.data) {
			throw error(404, 'Entry not found');
		}
		const duration = performance.now() - startTime;
		const responseData = { success: true, data: result.data, performance: { duration } };
		const cacheService = (await import('../../../../../../chunks/CacheService.js')).cacheService;
		const cachePattern = `collection:${schema._id}:*`;
		await cacheService.clearByPattern(cachePattern, tenantId).catch((err) => {
			logger.warn('Failed to invalidate page cache after PATCH', { pattern: cachePattern, error: err });
		});
		await contentManager.invalidateSpecificCaches([schema.path || '', schema._id].filter(Boolean));
		try {
			const { pubSub } = await import('../../../../../../chunks/pubSub.js');
			pubSub.publish('entryUpdated', {
				collection: schema.name || params.collectionId,
				id: params.entryId,
				action: 'update',
				data: result.data,
				timestamp: /* @__PURE__ */ new Date().toISOString(),
				user: {
					_id: user._id,
					username: user.username,
					email: user.email
				}
			});
		} catch (pubSubError) {
			logger.warn('Failed to publish entryUpdated event', { error: pubSubError });
		}
		logger.info(`${endpoint} - Entry updated successfully`, { duration: `${duration.toFixed(2)}ms` });
		return json(responseData);
	} catch (e) {
		if (typeof e === 'object' && e !== null && 'status' in e) {
			throw e;
		}
		logger.error(`${endpoint} - Unexpected error`, {
			error: e.message,
			stack: e.stack
		});
		throw error(500, 'Internal Server Error');
	}
};
const DELETE = async ({ locals, params }) => {
	const startTime = performance.now();
	const endpoint = `DELETE /api/collections/${params.collectionId}/${params.entryId}`;
	const { user, tenantId } = locals;
	logger.info(`${endpoint} - Request started`, { userId: user?._id, tenantId });
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
		const dbAdapter = locals.dbAdapter;
		if (!dbAdapter) {
			throw error(503, 'Service Unavailable: Database service is not properly initialized');
		}
		if (!schema._id) {
			throw error(500, 'Collection ID is missing');
		}
		const normalizedCollectionId = normalizeCollectionName(schema._id);
		const query = { _id: params.entryId };
		if (getPrivateSettingSync('MULTI_TENANT')) {
			query.tenantId = tenantId;
		}
		const verificationResult = await dbAdapter.crud.findOne(normalizedCollectionId, query);
		if (!verificationResult.success || !verificationResult.data) {
			throw error(404, 'Entry not found or access denied');
		}
		const result = await dbAdapter.crud.delete(normalizedCollectionId, params.entryId);
		if (!result.success) {
			if (result.error.message.includes('not found')) {
				throw error(404, 'Entry not found');
			}
			throw error(500, 'Failed to delete entry');
		}
		const cacheService = (await import('../../../../../../chunks/CacheService.js')).cacheService;
		const cachePattern = `collection:${schema._id}:*`;
		await cacheService.clearByPattern(cachePattern, tenantId).catch((err) => {
			logger.warn('Failed to invalidate page cache after DELETE', { pattern: cachePattern, error: err });
		});
		await contentManager.invalidateSpecificCaches([schema.path || '', schema._id].filter(Boolean));
		try {
			const { pubSub } = await import('../../../../../../chunks/pubSub.js');
			pubSub.publish('entryUpdated', {
				collection: schema.name || params.collectionId,
				id: params.entryId,
				action: 'delete',
				data: { _id: params.entryId },
				// Minimal data for delete
				timestamp: /* @__PURE__ */ new Date().toISOString(),
				user: {
					_id: user._id,
					username: user.username,
					email: user.email
				}
			});
		} catch (pubSubError) {
			logger.warn('Failed to publish entryUpdated event', { error: pubSubError });
		}
		const duration = performance.now() - startTime;
		logger.info(`${endpoint} - Entry deleted successfully`, { duration: `${duration.toFixed(2)}ms` });
		return new Response(null, { status: 204 });
	} catch (e) {
		if (typeof e === 'object' && e !== null && 'status' in e) {
			throw e;
		}
		logger.error(`${endpoint} - Unexpected error`, {
			error: e.message,
			stack: e.stack
		});
		throw error(500, 'Internal Server Error');
	}
};
export { DELETE, PATCH };
//# sourceMappingURL=_server.ts.js.map
