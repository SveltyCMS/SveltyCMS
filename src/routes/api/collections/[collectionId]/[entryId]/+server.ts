/**
 * @file src/routes/api/collections/[collectionId]/[entryId]/+server.ts
 * @description API endpoint for updating and deleting a single collection entry
 *
 * @example PATCH/DELETE /api/collections/:collectionId/:entryId
 *
 * Features:
 * * ❌ GET removed - use +page.server.ts load() for SSR data fetching
 * * Handles PATCH and DELETE verbs for full CRUD on a single entry
 * * Secure, granular access control per operation, scoped to the current tenant
 * * Automatic metadata updates on modification (updatedBy)
 * * ModifyRequest support for widget-based data processing
 * * Status-based access control for non-admin users
 */

import { json } from '@sveltejs/kit';
import { getPrivateSettingSync } from '@src/services/settingsService';

// Databases
import type { DatabaseId } from '@src/databases/dbInterface';

// Auth
import { contentManager } from '@src/content/ContentManager';
import { modifyRequest } from '@api/collections/modifyRequest';

// Logging
import { logger } from '@utils/logger.server';

// Types
import type { FieldInstance } from '@src/content/types';

// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

const normalizeCollectionName = (id: string) => `collection_${id.replace(/-/g, '')}`;

// PATCH: Updates an existing entry
export const PATCH = apiHandler(async ({ locals, params, request }) => {
	const startTime = performance.now();
	const { user, tenantId, dbAdapter } = locals;
	const { collectionId, entryId } = params;

	if (!user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) throw new AppError('Tenant ID missing', 400, 'TENANT_MISSING');
	if (!dbAdapter) throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');

	const schema = await contentManager.getCollectionById(collectionId, tenantId);
	if (!schema || !schema._id) throw new AppError('Collection not found', 404, 'NOT_FOUND');

	// Parse Body
	let body;
	const contentType = request.headers.get('content-type');
	if (contentType?.includes('application/json')) {
		body = await request.json().catch(() => {
			throw new AppError('Invalid JSON', 400, 'INVALID_JSON');
		});
	} else if (contentType?.includes('multipart/form-data')) {
		const formData = await request.formData();
		body = Object.fromEntries(formData.entries());
	} else {
		throw new AppError('Unsupported content type', 400, 'UNSUPPORTED_MEDIA_TYPE');
	}

	const updateData = { ...body, updatedBy: user._id };
	const dataArray = [updateData];
	const collectionModel = await dbAdapter.collection.getModel(schema._id);

	try {
		await modifyRequest({
			data: dataArray,
			fields: schema.fields as FieldInstance[],
			collection: collectionModel,
			user,
			type: 'PATCH',
			tenantId
		});
	} catch (modifyError) {
		logger.warn(`PATCH modifyRequest failed`, { error: (modifyError as Error).message });
	}

	const collectionName = normalizeCollectionName(schema._id);
	// First verify the entry exists and belongs to the current tenant
	const query: { _id: DatabaseId; tenantId?: string } = { _id: entryId as DatabaseId };
	if (getPrivateSettingSync('MULTI_TENANT')) query.tenantId = tenantId;

	// Verify existence & access
	const check = await dbAdapter.crud.findOne(collectionName, query);
	if (!check.success || !check.data) throw new AppError('Entry not found or access denied', 404, 'NOT_FOUND');

	const result = await dbAdapter.crud.update(collectionName, entryId as DatabaseId, dataArray[0]);

	if (!result.success) throw new AppError(result.error.message || 'Update failed', 500, 'DB_UPDATE_ERROR');
	if (!result.data) throw new AppError('Entry not found during update', 404, 'NOT_FOUND');

	// Cache & PubSub
	const cacheService = (await import('@src/databases/CacheService')).cacheService;
	const cachePattern = `collection:${schema._id}:*`;
	await cacheService.clearByPattern(cachePattern, tenantId).catch((e) => logger.warn('Cache clear failed', e));
	await contentManager.invalidateSpecificCaches([schema.path || '', schema._id as string].filter(Boolean));

	// Publish entryUpdated event
	try {
		const { pubSub } = await import('@src/services/pubSub');
		pubSub.publish('entryUpdated', {
			collection: schema.name || collectionId,
			id: entryId,
			action: 'update',
			data: result.data,
			timestamp: new Date().toISOString(),
			user: user
		});
	} catch (e) {
		logger.warn('PubSub failed', e);
	}

	const duration = performance.now() - startTime;
	return json({ success: true, data: result.data, performance: { duration } });
});

// DELETE: Removes an entry
export const DELETE = apiHandler(async ({ locals, params }) => {
	const { user, tenantId, dbAdapter } = locals;
	const { collectionId, entryId } = params;

	if (!user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) throw new AppError('Tenant ID missing', 400, 'TENANT_MISSING');
	if (!dbAdapter) throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');

	const schema = await contentManager.getCollectionById(collectionId, tenantId);
	if (!schema || !schema._id) throw new AppError('Collection not found', 404, 'NOT_FOUND');

	const collectionName = normalizeCollectionName(schema._id);
	const query: { _id: DatabaseId; tenantId?: string } = { _id: entryId as DatabaseId };
	if (getPrivateSettingSync('MULTI_TENANT')) query.tenantId = tenantId;

	const check = await dbAdapter.crud.findOne(collectionName, query);
	if (!check.success || !check.data) throw new AppError('Entry not found or access denied', 404, 'NOT_FOUND');

	const result = await dbAdapter.crud.delete(collectionName, entryId as DatabaseId);

	if (!result.success) {
		if (result.error.message.includes('not found')) throw new AppError('Entry not found', 404, 'NOT_FOUND');
		throw new AppError('Failed to delete entry', 500, 'DB_DELETE_ERROR');
	}

	// Cache & PubSub
	const cacheService = (await import('@src/databases/CacheService')).cacheService;
	const cachePattern = `collection:${schema._id}:*`;
	await cacheService.clearByPattern(cachePattern, tenantId).catch((e) => logger.warn('Cache clear failed', e));
	await contentManager.invalidateSpecificCaches([schema.path || '', schema._id as string].filter(Boolean));

	try {
		const { pubSub } = await import('@src/services/pubSub');
		pubSub.publish('entryUpdated', {
			collection: schema.name || collectionId,
			id: entryId,
			action: 'delete',
			data: { _id: entryId },
			timestamp: new Date().toISOString(),
			user: user
		});
	} catch (e) {
		logger.warn('PubSub failed', e);
	}

	return new Response(null, { status: 204 });
});
