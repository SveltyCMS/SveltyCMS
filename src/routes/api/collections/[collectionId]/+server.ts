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

// Auth
import { contentManager } from '@src/content/ContentManager';
import { modifyRequest } from '@api/collections/modifyRequest';

// System Logger
import { logger } from '@utils/logger.server';

// GET: Lists entries from a collection with pagination, filtering, and caching
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const startTime = performance.now();
	const endpoint = `GET /api/collections/${params.collectionId}`;
	const { user, tenantId } = locals;

	try {
		if (!user) {
			throw error(401, 'Unauthorized');
		}

		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = parseInt(url.searchParams.get('limit') || '10');
		const locale = url.searchParams.get('locale') || 'en';

		// Cache Key: collection:id:page:limit:locale
		// This matches the GraphQL cache strategy for consistency
		const cacheKey = `collections:${params.collectionId}:${page}:${limit}:${locale}`;
		const cacheService = (await import('@src/databases/CacheService')).cacheService;

		// Try to get from cache first
		const cachedResult = await cacheService.get<any>(cacheKey, tenantId);
		if (cachedResult) {
			logger.debug(`${endpoint} - Cache hit`, { cacheKey });
			return json(cachedResult);
		}

		const schema = await contentManager.getCollectionById(params.collectionId, tenantId);
		if (!schema) {
			throw error(404, 'Collection not found');
		}

		const dbAdapter = locals.dbAdapter;
		if (!dbAdapter) {
			throw error(503, 'Service Unavailable: Database service is not properly initialized');
		}

		const collectionName = `collection_${schema._id}`;
		const queryBuilder = dbAdapter.queryBuilder(collectionName).paginate({ page, pageSize: limit });

		// Add tenant filter if multi-tenant
		if (getPrivateSettingSync('MULTI_TENANT') && tenantId) {
			queryBuilder.where({ tenantId } as any);
		}

		const result = await queryBuilder.execute();

		if (!result.success) {
			throw new Error(result.error?.message || 'Database query failed');
		}

		// Process results (Token replacement & Localization)
		const { replaceTokens } = await import('@src/services/token/engine');
		const processedData = await Promise.all(
			(result.data as any[]).map(async (entry) => {
				// 1. Token Replacement
				const tokenContext = { entry, user };
				let processedEntry = { ...entry };

				for (const key in processedEntry) {
					const value = processedEntry[key];
					if (typeof value === 'string' && value.includes('{{')) {
						try {
							processedEntry[key] = await replaceTokens(value, tokenContext);
						} catch (err) {
							// Ignore token errors
						}
					}
				}

				// 2. Localization (Simple extraction matching GraphQL logic)
				for (const key in processedEntry) {
					const value = processedEntry[key];
					if (value && typeof value === 'object' && !Array.isArray(value)) {
						const valObj = value as Record<string, unknown>;
						if (locale in valObj) {
							processedEntry[key] = valObj[locale];
						} else if ('en' in valObj) {
							processedEntry[key] = valObj['en'];
						} else {
							const keys = Object.keys(valObj);
							if (keys.length > 0) processedEntry[key] = valObj[keys[0]];
						}
					}
				}
				return processedEntry;
			})
		);

		const responseData = {
			success: true,
			data: processedData,
			pagination: {
				page,
				limit,
				total: (result as any).total || 0, // QueryBuilder should return total
				totalPages: Math.ceil(((result as any).total || 0) / limit)
			},
			performance: { duration: performance.now() - startTime }
		};

		// Cache the result (TTL 5 minutes)
		await cacheService.set(cacheKey, responseData, 300, tenantId);

		return json(responseData);
	} catch (e) {
		const duration = performance.now() - startTime;
		logger.error(`${endpoint} - Error`, { error: e instanceof Error ? e.message : String(e), duration: `${duration.toFixed(2)}ms` });
		throw error(500, 'Internal Server Error');
	}
};

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
