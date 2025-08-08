/**
 * @file src/routes/api/collections/[collectionId]/+server.ts
 * @description API endpoint for listing collection entries and creating new entries
 *
 * @example for get/post single collection:  /api/collections/:collectionId
 *
 * Features:
 * * Performance-optimized listing with QueryBuilder
 * * Handles pagination, filtering, and sorting via URL parameters
 * * Secure entry creation with automatic user metadata
 * * ModifyRequest support for widget-based data processing
 * * Status-based filtering for non-admin users
 * * Content language support
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { privateEnv } from '@root/config/private';

// Databases
import type { BaseEntity } from '@src/databases/dbInterface';

// Auth
import { contentManager } from '@src/content/ContentManager';
import { modifyRequest } from '@api/collections/modifyRequest';
import { roles, initializeRoles } from '@root/config/roles';

// System Logger
import { logger } from '@utils/logger.svelte';

// GET: Lists entries in a collection with pagination, filtering, and sorting
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const startTime = performance.now();
	const endpoint = `GET /api/collections/${params.collectionId}`;
	const { user, tenantId } = locals; // User is guaranteed to exist due to hooks protection

	// If auth service is not ready, user might be null
	if (!user) {
		logger.warn(`${endpoint} - Unauthorized access due to unavailable user object`, {
			collectionId: params.collectionId,
			tenantId
		});
		throw error(401, 'Unauthorized');
	}

	// Ensure roles are initialized
	await initializeRoles();

	// Get user's role and determine admin status properly
	const availableRoles = locals.roles && locals.roles.length > 0 ? locals.roles : roles;
	const userRole = availableRoles.find((role) => role._id === user?.role);
	const isAdmin = Boolean(userRole?.isAdmin);

	try {
		// Note: tenantId validation is handled by hooks in multi-tenant mode
		const schema = await contentManager.getCollectionById(params.collectionId, tenantId);
		if (!schema) {
			logger.warn(`${endpoint} - Collection not found`, {
				collectionId: params.collectionId,
				userId: user._id,
				tenantId
			});
			throw error(404, 'Collection not found');
		}

		const page = Number(url.searchParams.get('page') ?? 1);
		const pageSize = Number(url.searchParams.get('pageSize') ?? 25);
		const sortField = url.searchParams.get('sortField') || 'createdAt';
		const sortDirection = (url.searchParams.get('sortDirection') as 'asc' | 'desc' | null) || 'desc';
		const filterParam = url.searchParams.get('filter');

		let filter = {};
		if (filterParam) {
			try {
				filter = JSON.parse(filterParam);
				// Convert string operators to MongoDB operators
				filter = convertFilterOperators(filter);
			} catch (parseError) {
				logger.warn(`\x1b[34m${endpoint}\x1b[0m - Invalid filter parameter`, {
					filterParam,
					parseError: parseError.message,
					collection: schema._id,
					userId: user._id
				});
				throw error(400, 'Invalid filter parameter');
			}
		}

		// Helper function to convert string operators to MongoDB operators
		function convertFilterOperators(obj: Record<string, unknown>): Record<string, unknown> {
			if (typeof obj !== 'object' || obj === null) {
				return obj;
			}

			const result: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(obj)) {
				if (typeof value === 'string' && value.startsWith('!=')) {
					// Convert "!=value" to {$ne: "value"}
					const actualValue = value.substring(2);
					result[key] = { $ne: actualValue };
				} else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
					// Recursively convert nested objects
					result[key] = convertFilterOperators(value as Record<string, unknown>);
				} else {
					result[key] = value;
				}
			}
			return result;
		}

		// --- MULTI-TENANCY: Scope all filters by tenantId ---
		logger.debug(`Multi-tenant check: MULTI_TENANT=\x1b[34m${privateEnv.MULTI_TENANT}\x1b[0m, tenantId=\x1b[34m${tenantId}\x1b[0m`);
		const baseFilter = privateEnv.MULTI_TENANT ? { ...filter, tenantId } : filter;
		logger.debug(`Filter applied:`, { baseFilter, originalFilter: filter });

		// Status filtering - non-admin users only see published content
		let finalFilter = baseFilter;
		if (!isAdmin) {
			finalFilter = { ...baseFilter, status: 'published' };
		}
		logger.debug(`Final filter for query:`, { finalFilter, isAdmin }); // Build the query efficiently using QueryBuilder

		const dbAdapter = locals.dbAdapter;
		if (!dbAdapter) {
			logger.error('Database adapter is not initialized in locals', {
				hasLocals: !!locals,
				localKeys: Object.keys(locals || {}),
				collection: schema._id,
				userId: user._id
			});
			throw error(503, 'Service Unavailable: Database service is not properly initialized. Please try again shortly.');
		}

		const collectionName = `collection_${schema._id}`;
		const query = dbAdapter
			.queryBuilder(collectionName)
			.where(finalFilter)
			.sort(sortField as keyof BaseEntity, sortDirection)
			.paginate({ page, pageSize }); // Get both the paginated results and total count

		const [result, countResult] = await Promise.all([query.execute(), dbAdapter.queryBuilder(collectionName).where(finalFilter).count()]);

		if (!result.success) {
			throw new Error(result.error.message);
		}
		if (!countResult.success) {
			throw new Error(countResult.error.message);
		}

		const processedData = result.data;
		const totalCount = countResult.data;

		if (Array.isArray(processedData) && processedData.length > 0) {
			try {
				await modifyRequest({
					data: processedData,
					fields: schema.fields,
					collection: schema,
					user,
					type: 'GET'
				});
			} catch (modifyError) {
				logger.warn(`\x1b[34m${endpoint}\x1b[0m - ModifyRequest failed`, {
					collection: schema._id,
					error: modifyError.message,
					userId: user._id,
					itemCount: processedData.length
				});
			}
		}

		const duration = performance.now() - startTime;
		const responseData = {
			success: true,
			data: {
				items: processedData,
				total: totalCount,
				page,
				pageSize,
				totalPages: Math.ceil(totalCount / pageSize)
			},
			performance: { duration }
		};

		logger.info(`\x1b[34m${endpoint}\x1b[0m - Request completed successfully`, {
			collection: schema._id,
			userId: user._id,
			tenantId,
			itemCount: processedData.length,
			totalCount,
			duration: `${duration.toFixed(2)}ms`
		});

		return json(responseData);
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
		} // Prepare data with metadata and tenantId

		// Map form field names to database field names
		const mappedBody = {};

		// Create a mapping from form field keys to database field names
		schema.fields.forEach((field) => {
			// The field key used in forms is typically the lowercase label without spaces
			const formFieldKey = field.label.toLowerCase().replace(/\s+/g, '');
			const dbFieldName = field.db_fieldName || formFieldKey;

			// Check if this form field exists in the body
			if (formFieldKey in body) {
				mappedBody[dbFieldName] = body[formFieldKey];
			}
			// Also check for exact label match
			else if (field.label in body) {
				mappedBody[dbFieldName] = body[field.label];
			}
		});

		// Add any remaining fields that don't need mapping
		Object.entries(body).forEach(([key, value]) => {
			const formFieldKey = key.toLowerCase().replace(/\s+/g, '');
			const hasMapping = schema.fields.some((field) => field.label.toLowerCase().replace(/\s+/g, '') === formFieldKey || field.label === key);

			if (!hasMapping) {
				mappedBody[key] = value;
			}
		});

		logger.debug('Field mapping completed', {
			originalBody: body,
			mappedBody: mappedBody,
			collection: schema._id
		});

		const entryData = {
			...mappedBody,
			...(privateEnv.MULTI_TENANT && { tenantId }), // Add tenantId
			createdBy: user._id,
			updatedBy: user._id,
			status: body.status || schema.status || 'draft' // Respect collection's default status
		}; // Apply modifyRequest for pre-processing

		const dataArray = [entryData];
		try {
			await modifyRequest({
				data: dataArray,
				fields: schema.fields,
				collection: schema,
				user,
				type: 'POST'
			});
		} catch (modifyError) {
			logger.warn(`${endpoint} - ModifyRequest pre-processing failed`, {
				collection: schema._id,
				error: modifyError.message,
				userId: user._id
			});
		} // Use the generic CRUD insert operation

		const dbAdapter = locals.dbAdapter;
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
