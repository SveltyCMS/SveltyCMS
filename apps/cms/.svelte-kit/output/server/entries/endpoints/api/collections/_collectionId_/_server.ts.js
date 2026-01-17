import { error, json } from '@sveltejs/kit';
import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { contentManager } from '../../../../../chunks/ContentManager.js';
import { m as modifyRequest } from '../../../../../chunks/modifyRequest.js';
import { cacheService } from '../../../../../chunks/CacheService.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
const POST = async ({ locals, params, request }) => {
	const startTime = performance.now();
	const endpoint = `POST /api/collections/${params.collectionId}`;
	const { user, tenantId } = locals;
	logger.info(`${endpoint} - Request started`, {
		userId: user?._id,
		userEmail: user?.email,
		tenantId
	});
	try {
		const schema = await contentManager.getCollectionById(params.collectionId, tenantId);
		if (!schema) {
			logger.warn(`${endpoint} - Collection not found`, {
				collectionId: params.collectionId,
				userId: user?._id,
				tenantId
			});
			throw error(404, 'Collection not found');
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
		const sourceData = body.data && typeof body.data === 'object' ? body.data : body;
		logger.trace('Data extraction completed', {
			hasNestedData: !!body.data,
			fieldCount: Object.keys(sourceData).length,
			fields: Object.keys(sourceData)
		});
		if (!user) throw error(401, 'Unauthorized');
		const dbAdapter = locals.dbAdapter;
		if (!dbAdapter) throw error(503, 'Service Unavailable: Database service is not properly initialized');
		if (!schema._id) throw error(500, 'Collection ID is missing');
		const collectionModel = await dbAdapter.collection.getModel(schema._id);
		const entryData = {
			...sourceData,
			// Use extracted source data directly
			...(getPrivateSettingSync('MULTI_TENANT') && { tenantId }),
			// Add tenantId
			createdBy: user._id,
			updatedBy: user._id,
			status: sourceData.status || schema.status || 'draft'
			// Respect collection's default status
		};
		const dataArray = [entryData];
		try {
			await modifyRequest({
				data: dataArray,
				fields: schema.fields,
				collection: collectionModel,
				user,
				type: 'POST',
				tenantId
			});
		} catch (modifyError) {
			logger.warn(`${endpoint} - ModifyRequest pre-processing failed`, {
				collection: schema._id,
				error: modifyError.message,
				userId: user._id
			});
		}
		if (!schema._id) throw error(500, 'Collection ID is missing');
		const collectionName = `collection_${schema._id}`;
		if (!dbAdapter) throw error(503, 'Database adapter not initialized');
		const result = await dbAdapter.crud.insert(collectionName, dataArray[0]);
		if (!result.success) {
			const errorMessage = result.error.message || '';
			if (errorMessage.includes('validation failed') || result.error.code === 'INSERT_ERROR') {
				logger.warn(`${endpoint} - Validation failed`, { error: errorMessage });
				throw error(400, errorMessage);
			}
			throw new Error(errorMessage);
		}
		if (!result.data) {
			throw error(500, 'Failed to insert entry');
		}
		const duration = performance.now() - startTime;
		const responseData = { success: true, data: result.data, performance: { duration } };
		const cachePattern = `collection:${schema._id}:*`;
		logger.debug(`${endpoint} - Invalidating cache pattern: ${cachePattern}`);
		await cacheService.clearByPattern(cachePattern, tenantId).catch((err) => {
			logger.warn('Failed to invalidate page cache after POST', { pattern: cachePattern, error: err });
		});
		await contentManager.invalidateSpecificCaches([schema.path || '', schema._id].filter(Boolean));
		try {
			const { pubSub } = await import('../../../../../chunks/pubSub.js');
			pubSub.publish('entryUpdated', {
				collection: schema.name || params.collectionId,
				id: result.data._id,
				action: 'create',
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
		logger.info(`${endpoint} - Entry created successfully`, {
			duration: `${duration.toFixed(2)}ms`,
			collection: schema._id,
			userId: user?._id,
			tenantId,
			entryId: result.data._id
		});
		return json(responseData, { status: 201 });
	} catch (e) {
		const duration = performance.now() - startTime;
		const userId = locals.user?._id;
		if (e.status) {
			logger.warn(`${endpoint} - Request failed`, {
				status: e.status,
				message: e.body?.message,
				duration: `${duration.toFixed(2)}ms`,
				userId,
				collection: params.collectionId
			});
			throw e;
		}
		logger.error(`${endpoint} - Unexpected error`, {
			error: e.message,
			stack: e.stack,
			duration: `${duration.toFixed(2)}ms`,
			userId,
			collection: params.collectionId
		});
		throw error(500, 'Internal Server Error');
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
