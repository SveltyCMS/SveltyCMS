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
import { getPrivateSettingSync } from '@src/services/settingsService';

// Databases
import type { BaseEntity } from '@src/databases/dbInterface';

// Auth
import { contentManager } from '@src/content/ContentManager';
import { modifyRequest } from '@api/collections/modifyRequest';
import { getDefaultRoles } from '@src/databases/auth/defaultRoles';

// System Logger
import { logger } from '@utils/logger.server';

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
		if (!user) {
			throw error(401, 'Unauthorized');
		}

		const schema = await contentManager.getCollectionById(params.collectionId, tenantId);
		if (!schema) {
			logger.warn(`${endpoint} - Collection not found`, {
				collectionId: params.collectionId,
				userId: user._id,
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
				fields: schema.fields as any,
				collection: schema as any,
				user,
				type: 'POST'
			});
		} catch (modifyError) {
			const errorMsg = modifyError instanceof Error ? modifyError.message : 'Unknown error';
			logger.warn(`${endpoint} - ModifyRequest pre-processing failed`, {
				collection: schema._id,
				error: errorMsg,
				userId: user._id
			});
		} // Use the generic CRUD insert operation

		const dbAdapter = locals.dbAdapter;
		if (!dbAdapter) {
			throw error(503, 'Service Unavailable: Database service is not properly initialized');
		}

		const collectionName = `collection_${schema._id}`;
		const result = await dbAdapter.crud.insert(collectionName, dataArray[0]);

		if (!result.success) {
			throw new Error(result.error.message);
		}

		const duration = performance.now() - startTime;
		const responseData = {
			success: true,
			data: result.data,
			performance: { duration }
		};

		// Invalidate server-side page cache for this collection
		const cacheService = (await import('@src/databases/CacheService')).cacheService;
		const cachePattern = `collection:${schema._id}:*`;
		await cacheService.clearByPattern(cachePattern).catch((err) => {
			logger.warn('Failed to invalidate page cache after POST', { pattern: cachePattern, error: err });
		});

		logger.info(`${endpoint} - Entry created successfully`, {
			collection: schema._id,
			userId: user._id,
			tenantId,
			entryId: result.data._id,
			duration: `${duration.toFixed(2)}ms`
		});

		return json(responseData, { status: 201 });
	} catch (e) {
		const duration = performance.now() - startTime;
		const userId = locals.user?._id;

		if (typeof e === 'object' && e !== null && 'status' in e) {
			const errorBody =
				'body' in e && typeof e.body === 'object' && e.body !== null && 'message' in e.body ? (e.body as { message?: string }).message : undefined;
			logger.warn(`${endpoint} - Request failed`, {
				status: (e as any).status,
				message: errorBody,
				duration: `${duration.toFixed(2)}ms`,
				userId,
				collection: params.collectionId
			});
			throw e;
		}

		const errorMsg = e instanceof Error ? e.message : 'Unknown error';
		const stack = e instanceof Error ? e.stack : undefined;
		logger.error(`${endpoint} - Unexpected error`, {
			error: errorMsg,
			stack,
			duration: `${duration.toFixed(2)}ms`,
			userId,
			collection: params.collectionId
		});
		throw error(500, 'Internal Server Error');
	}
};
