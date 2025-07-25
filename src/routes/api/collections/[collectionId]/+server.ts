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
import { dbAdapter } from '@src/databases/db';
import type { BaseEntity } from '@src/databases/dbInterface';

// Auth
import { contentManager } from '@src/content/ContentManager';
import { hasCollectionPermission } from '@api/permissions';
import { modifyRequest } from '@api/collections/modifyRequest';
import { roles, initializeRoles } from '@root/config/roles';

// System Logger
import { logger } from '@utils/logger.svelte';

// GET: Lists entries in a collection with pagination, filtering, and sorting
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const startTime = performance.now();
	const endpoint = `GET /api/collections/${params.collectionId}`;
	const { user, tenantId } = locals; // Ensure roles are initialized

	await initializeRoles(); // Get user's role and determine admin status properly

	const availableRoles = locals.roles && locals.roles.length > 0 ? locals.roles : roles;
	const userRole = availableRoles.find((role) => role._id === user?.role);
	const isAdmin = Boolean(userRole?.isAdmin);

	try {
		if (!user) {
			logger.warn(`${endpoint} - Unauthorized access attempt`, {
				ip: url.searchParams.get('__ip') || 'unknown'
			});
			throw error(401, 'Unauthorized');
		}

		// In multi-tenant mode, a tenantId is required.
		if (privateEnv.MULTI_TENANT && !tenantId) {
			logger.error(`Get collection entries failed: Tenant ID is missing in a multi-tenant setup.`);
			throw error(400, 'Could not identify the tenant for this request.');
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

		if (!(await hasCollectionPermission(user, 'read', schema, availableRoles))) {
			logger.warn(`${endpoint} - Access forbidden`, {
				collection: schema._id,
				userId: user._id,
				userEmail: user.email,
				userRole: user.role
			});
			throw error(403, 'Forbidden');
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

		// --- MULTI-TENANCY: Scope all filters by tenantId ---
		const baseFilter = privateEnv.MULTI_TENANT ? { ...filter, tenantId } : filter; // Status filtering - non-admin users only see published content

		let finalFilter = baseFilter;
		if (!isAdmin) {
			finalFilter = { ...baseFilter, status: 'published' };
		} else {
			// For admin users, remove any status filtering from the original filter
			const { status, ...adminFilter } = baseFilter;
			finalFilter = adminFilter;
		} // Build the query efficiently using QueryBuilder

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
		if (!user) {
			logger.warn(`${endpoint} - Unauthorized access attempt`);
			throw error(401, 'Unauthorized');
		}

		// In multi-tenant mode, a tenantId is required.
		if (privateEnv.MULTI_TENANT && !tenantId) {
			logger.error(`Create collection entry failed: Tenant ID is missing in a multi-tenant setup.`);
			throw error(400, 'Could not identify the tenant for this request.');
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

		if (!(await hasCollectionPermission(user, 'write', schema))) {
			logger.warn(`${endpoint} - Access forbidden`, {
				collection: schema._id,
				userId: user._id,
				userEmail: user.email,
				userRole: user.role
			});
			throw error(403, 'Forbidden');
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

		const entryData = {
			...body,
			...(privateEnv.MULTI_TENANT && { tenantId }), // Add tenantId
			createdBy: user._id,
			updatedBy: user._id,
			status: body.status || 'draft'
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
