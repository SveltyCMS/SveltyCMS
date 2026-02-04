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

import { json } from '@sveltejs/kit';
import { randomUUID } from 'crypto';
import { getPrivateSettingSync } from '@src/services/settingsService';

// Databases
// Auth
import { contentManager } from '@src/content/ContentManager';
import { modifyRequest } from '@api/collections/modifyRequest';
import { cacheService } from '@src/databases/CacheService';

// Types
import type { FieldInstance } from '@src/content/types';
// System Logger
import { logger } from '@utils/logger.server';

// ❌ REMOVED: GET handler - SSR data loading should use +page.server.ts load() function
// This prevents redundant data fetching and improves SSR performance.
// Use the load() function in +page.server.ts for initial page loads,
// and client-side API calls only for dynamic updates (create/update/delete).

// POST: Creates a new entry in a collection
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

// POST: Creates a new entry in a collection
export const POST = apiHandler(async ({ locals, params, request }) => {
	const startTime = performance.now();
	const endpoint = `POST /api/collections/${params.collectionId}`;
	const { user, tenantId } = locals;

	logger.info(`${endpoint} - Request started`, {
		userId: user?._id,
		userEmail: user?.email,
		tenantId
	});

	if (!user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

	const schema = await contentManager.getCollectionById(params.collectionId, tenantId);
	if (!schema) {
		logger.warn(`${endpoint} - Collection not found`, {
			collectionId: params.collectionId,
			userId: user?._id,
			tenantId
		});
		throw new AppError('Collection not found', 404, 'COLLECTION_NOT_FOUND');
	}

	let body;
	const contentType = request.headers.get('content-type');

	if (contentType?.includes('application/json')) {
		body = await request.json();
	} else if (contentType?.includes('multipart/form-data')) {
		const formData = await request.formData();
		body = Object.fromEntries(formData.entries());
	} else {
		throw new AppError('Unsupported content type', 400, 'INVALID_CONTENT_TYPE');
	}

	// Check if data is nested under a 'data' property
	const sourceData = body.data && typeof body.data === 'object' ? body.data : body;

	logger.trace('Data extraction completed', {
		hasNestedData: !!body.data,
		fieldCount: Object.keys(sourceData).length,
		fields: Object.keys(sourceData)
	});

	// Initialize database adapter
	const dbAdapter = locals.dbAdapter;
	if (!dbAdapter) throw new AppError('Service Unavailable: Database service is not properly initialized', 503, 'DB_ADAPTER_MISSING');

	if (!schema._id) throw new AppError('Collection ID is missing', 500, 'INVALID_SCHEMA');
	const collectionModel = await dbAdapter.collection.getModel(schema._id);

	// Prepare entry data with user ID and required content_nodes fields
	const entryId = randomUUID().replace(/-/g, '');
	const entryData = {
		...sourceData,
		_id: entryId,
		nodeType: 'entry',
		path: `entries/${params.collectionId}/${entryId}`,
		...(getPrivateSettingSync('MULTI_TENANT') && { tenantId }),
		createdBy: user._id,
		updatedBy: user._id,
		status: sourceData.status || schema.status || 'draft'
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
		// Consider if we should throw here or just log. Original code logged.
	}

	if (!schema._id) throw new AppError('Collection ID is missing', 500, 'INVALID_SCHEMA');
	const collectionName = `collection_${schema._id}`;
	if (!dbAdapter) throw new AppError('Database adapter not initialized', 503, 'DB_ADAPTER_MISSING');

	const result = await dbAdapter.crud.insert(collectionName, dataArray[0]);

	if (!result.success) {
		const errorMessage = result.error.message || '';
		// Handle validation errors specifically
		if (errorMessage.includes('validation failed') || result.error.code === 'INSERT_ERROR') {
			logger.warn(`${endpoint} - Validation failed`, { error: errorMessage });
			throw new AppError(errorMessage, 400, 'VALIDATION_FAILED');
		}
		throw new AppError(errorMessage, 500, 'INSERT_FAILED');
	}

	if (!result.data) {
		throw new AppError('Failed to insert entry', 500, 'INSERT_FAILED');
	}

	const duration = performance.now() - startTime;
	const responseData = { success: true, data: result.data, performance: { duration } };

	// Invalidate server-side page cache
	const cachePattern = `collection:${schema._id}:*`;
	logger.debug(`${endpoint} - Invalidating cache pattern: ${cachePattern}`);

	await cacheService.clearByPattern(cachePattern, tenantId).catch((err) => {
		logger.warn('Failed to invalidate page cache after POST', { pattern: cachePattern, error: err });
	});

	await contentManager.invalidateSpecificCaches([schema.path || '', schema._id as string].filter(Boolean));

	try {
		const { pubSub } = await import('@src/services/pubSub');
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
});
