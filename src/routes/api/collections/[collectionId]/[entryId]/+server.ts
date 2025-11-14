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

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { getPrivateSettingSync } from '@src/services/settingsService';

// Databases

// Auth
import { contentManager } from '@src/content/ContentManager';
import { modifyRequest } from '@api/collections/modifyRequest';

// Helper function to normalize collection names for database operations
const normalizeCollectionName = (collectionId: string): string => {
	// Remove hyphens from UUID for MongoDB collection naming
	const cleanId = collectionId.replace(/-/g, '');
	return `collection_${cleanId}`;
};

// System Logger
import { logger } from '@utils/logger.server';

// ❌ REMOVED: GET handler - SSR data loading should use +page.server.ts load() function
// This prevents redundant data fetching and improves SSR performance.
// For single entry reads, use the load() function in +page.server.ts with editEntryId param.

// PATCH: Updates an existing entry
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
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

		// User access already validated by hooks

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
		try {
			await modifyRequest({
				data: dataArray,
				fields: schema.fields,
				collection: schema,
				user,
				type: 'PATCH',
				tenantId
			});
		} catch (modifyError) {
			logger.warn(`${endpoint} - ModifyRequest pre-processing failed`, { error: modifyError.message });
		}

		const dbAdapter = locals.dbAdapter;
		if (!dbAdapter) {
			throw error(503, 'Service Unavailable: Database service is not properly initialized');
		}

		const collectionName = `collection_${schema._id}`;
		// First verify the entry exists and belongs to the current tenant
		const query: { _id: string; tenantId?: string } = { _id: params.entryId };
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

		// Invalidate server-side page cache for this collection
		const cacheService = (await import('@src/databases/CacheService')).cacheService;
		const cachePattern = `collection:${schema._id}:*`;
		await cacheService.clearByPattern(cachePattern).catch((err) => {
			logger.warn('Failed to invalidate page cache after PATCH', { pattern: cachePattern, error: err });
		});

		logger.info(`${endpoint} - Entry updated successfully`, { duration: `${duration.toFixed(2)}ms` });

		return json(responseData);
	} catch (e) {
		if (typeof e === 'object' && e !== null && 'status' in e) {
			throw e;
		}
		const errorMsg = e instanceof Error ? e.message : 'Unknown error';
		const stack = e instanceof Error ? e.stack : undefined;
		logger.error(`${endpoint} - Unexpected error`, { error: errorMsg, stack });
		throw error(500, 'Internal Server Error');
	}
};

// DELETE: Removes an entry from a collection
export const DELETE: RequestHandler = async ({ locals, params }) => {
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

		// First verify the entry exists and belongs to the current tenant
		const query: Record<string, unknown> = { _id: params.entryId };
		if (getPrivateSettingSync('MULTI_TENANT')) {
			query.tenantId = tenantId;
		}

		const verificationResult = await dbAdapter.crud.findOne(normalizedCollectionId, query as Partial<Record<string, unknown>>);
		if (!verificationResult.success || !verificationResult.data) {
			throw error(404, 'Entry not found or access denied');
		}

		const result = await dbAdapter.crud.delete(normalizedCollectionId, params.entryId as unknown as import('@src/databases/types').DatabaseId);

		if (!result.success) {
			if (result.error.message.includes('not found')) {
				throw error(404, 'Entry not found');
			}
			throw error(500, 'Failed to delete entry');
		}

		// Invalidate server-side page cache for this collection
		const cacheService = (await import('@src/databases/CacheService')).cacheService;
		const cachePattern = `collection:${schema._id}:*`;
		await cacheService.clearByPattern(cachePattern).catch((err) => {
			logger.warn('Failed to invalidate page cache after DELETE', { pattern: cachePattern, error: err });
		});

		const duration = performance.now() - startTime;
		logger.info(`${endpoint} - Entry deleted successfully`, { duration: `${duration.toFixed(2)}ms` });

		return new Response(null, { status: 204 }); // 204 No Content
	} catch (e) {
		if (typeof e === 'object' && e !== null && 'status' in e) {
			throw e;
		}
		const errorMsg = e instanceof Error ? e.message : 'Unknown error';
		const stack = e instanceof Error ? e.stack : undefined;
		logger.error(`${endpoint} - Unexpected error`, { error: errorMsg, stack });
		throw error(500, 'Internal Server Error');
	}
};
