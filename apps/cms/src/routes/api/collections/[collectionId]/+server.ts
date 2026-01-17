/**
 * @file src/routes/api/collections/[collectionId]/+server.ts
 * @description API endpoint for creating new collection entries
 *
 * @example POST /api/collections/:collectionId
 *
 * Features:
 * * ❌ GET removed - use +page.server.ts load() for SSR data fetching
 * * Performance-optimized entry creation with automatic metadata
 * * ModifyRequest support for widget-based data processing
 * * Multi-tenant support with automatic tenantId scoping
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { getPrivateSettingSync } from '@shared/services/settingsService';

// Databases
// Auth
import { contentManager } from '@content/ContentManager';
import { modifyRequest } from '@api/collections/modifyRequest';
import { cacheService } from '@shared/database/CacheService';

// Types
import type { FieldInstance } from '@cms-types';
// System Logger
import { logger } from '@shared/utils/logger.server';

// ❌ REMOVED: GET handler - SSR data loading should use +page.server.ts load() function
// This prevents redundant data fetching and improves SSR performance.
// Use the load() function in +page.server.ts for initial page loads,
// and client-side API calls only for dynamic updates (create/update/delete).

// POST: Creates a new entry in a collection
export const POST: RequestHandler = async ({ locals, params, request }) => {
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

		// Check if data is nested under a 'data' property (handles both direct and nested payloads)
		// This prevents "last_name is required" errors when data comes from different sources
		const sourceData = body.data && typeof body.data === 'object' ? body.data : body;

		logger.trace('Data extraction completed', {
			hasNestedData: !!body.data,
			fieldCount: Object.keys(sourceData).length,
			fields: Object.keys(sourceData)
		});

		if (!user) throw error(401, 'Unauthorized');

		// Initialize database adapter
		const dbAdapter = locals.dbAdapter;
		if (!dbAdapter) throw error(503, 'Service Unavailable: Database service is not properly initialized');

		if (!schema._id) throw error(500, 'Collection ID is missing');
		const collectionModel = await dbAdapter.collection.getModel(schema._id);

		// Prepare entry data with user ID
		const entryData = {
			...sourceData, // Use extracted source data directly
			...(getPrivateSettingSync('MULTI_TENANT') && { tenantId }), // Add tenantId
			createdBy: user._id,
			updatedBy: user._id,
			status: sourceData.status || schema.status || 'draft' // Respect collection's default status
		};

		// Apply modifyRequest for pre-processing
		const dataArray = [entryData];

		try {
			await modifyRequest({
				data: dataArray,
				fields: schema.fields as FieldInstance[],
				collection: collectionModel,
				user,
				type: 'POST',
				tenantId
			});
		} catch (modifyError) {
			logger.warn(`${endpoint} - ModifyRequest pre-processing failed`, {
				collection: schema._id,
				error: (modifyError as Error).message,
				userId: user._id
			});
		}

		if (!schema._id) throw error(500, 'Collection ID is missing');
		const collectionName = `collection_${schema._id}`;
		if (!dbAdapter) throw error(503, 'Database adapter not initialized');
		const result = await dbAdapter.crud.insert(collectionName, dataArray[0]);

		if (!result.success) {
			const errorMessage = result.error.message || '';
			// Handle validation errors specifically
			if (errorMessage.includes('validation failed') || result.error.code === 'INSERT_ERROR') {
				// Log warning but return 400 to client so it can display the error
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

		// Invalidate server-side page cache for this collection
		// Use the statically imported cacheService
		const cachePattern = `collection:${schema._id}:*`;

		logger.debug(`${endpoint} - Invalidating cache pattern: ${cachePattern}`);

		await cacheService.clearByPattern(cachePattern, tenantId).catch((err) => {
			logger.warn('Failed to invalidate page cache after POST', { pattern: cachePattern, error: err });
		});

		// Also invalidate specific caches in ContentManager to ensure schema updates are reflected
		await contentManager.invalidateSpecificCaches([schema.path || '', schema._id as string].filter(Boolean));

		// Publish entryUpdated event
		try {
			// Dynamic import to avoid circular dependencies or initialization issues if any
			const { pubSub } = await import('@shared/services/pubSub');
			pubSub.publish('entryUpdated', {
				collection: schema.name || params.collectionId,
				id: result.data._id,
				action: 'create',
				data: result.data,
				timestamp: new Date().toISOString(),
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

		if ((e as any).status) {
			logger.warn(`${endpoint} - Request failed`, {
				status: (e as any).status,
				message: (e as any).body?.message,
				duration: `${duration.toFixed(2)}ms`,
				userId,
				collection: params.collectionId
			});
			throw e;
		}

		logger.error(`${endpoint} - Unexpected error`, {
			error: (e as any).message,
			stack: (e as any).stack,
			duration: `${duration.toFixed(2)}ms`,
			userId,
			collection: params.collectionId
		});
		throw error(500, 'Internal Server Error');
	}
};
