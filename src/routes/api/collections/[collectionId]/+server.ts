/**
 * @file src/routes/api/collections/[collectionId]/+server.ts
 * @description API endpoint for listing collection entries and creating new entries
 *
 * @example for get/post single collection:   /api/collections/:collectionId
 *
 * Features:
 *    * Performance-optimized listing with QueryBuilder
 *    * Handles pagination, filtering, and sorting via URL parameters
 *    * Secure entry creation with automatic user metadata
 *    * ModifyRequest support for widget-based data processing
 *    * Status-based filtering for non-admin users
 *    * Content language support
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';

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

	// Ensure roles are initialized
	await initializeRoles();

	// Get user's role and determine admin status properly
	const availableRoles = locals.roles && locals.roles.length > 0 ? locals.roles : roles;
	const userRole = availableRoles.find((role) => role._id === locals.user?.role);
	const isAdmin = Boolean(userRole?.isAdmin);

	// Debug logging to understand the role lookup issue
	logger.debug(`Role lookup for user ${locals.user?._id}`, {
		userRoleId: locals.user?.role,
		availableRoles: availableRoles.map((r) => ({ id: r._id, isAdmin: r.isAdmin })),
		foundRole: userRole,
		isAdmin: isAdmin,
		isAdminRaw: userRole?.isAdmin,
		isAdminType: typeof userRole?.isAdmin,
		rolesSource: locals.roles && locals.roles.length > 0 ? 'locals' : 'import'
	});

	logger.info(`${endpoint} - Request started`, {
		userId: locals.user?._id,
		userEmail: locals.user?.email,
		userRole: locals.user?.role,
		isAdmin: isAdmin,
		ip: url.searchParams.get('__ip') || 'unknown',
		params: params,
		queryParams: Object.fromEntries(url.searchParams.entries())
	});

	try {
		if (!locals.user) {
			logger.warn(`${endpoint} - Unauthorized access attempt`, {
				ip: url.searchParams.get('__ip') || 'unknown'
			});
			throw error(401, 'Unauthorized');
		}

		const schema = contentManager.getCollectionById(params.collectionId);
		if (!schema) {
			logger.warn(`${endpoint} - Collection not found`, {
				collectionId: params.collectionId,
				userId: locals.user._id
			});
			throw error(404, 'Collection not found');
		}

		if (!(await hasCollectionPermission(locals.user, 'read', schema, availableRoles))) {
			logger.warn(`${endpoint} - Access forbidden`, {
				collection: schema._id,
				userId: locals.user._id,
				userEmail: locals.user.email,
				userRole: locals.user.role
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
				logger.debug(`${endpoint} - Applied filter`, {
					filter,
					collection: schema._id,
					userId: locals.user._id
				});
			} catch (parseError) {
				logger.warn(`${endpoint} - Invalid filter parameter`, {
					filterParam,
					parseError: parseError.message,
					collection: schema._id,
					userId: locals.user._id
				});
				throw error(400, 'Invalid filter parameter');
			}
		}

		// Status filtering - non-admin users only see published content
		if (!isAdmin) {
			filter = { ...filter, status: 'published' };
			logger.debug(`${endpoint} - Applied status filter for non-admin user`, {
				userId: locals.user._id,
				collection: schema._id,
				userRole: locals.user.role,
				isAdmin: isAdmin,
				statusFilter: 'published'
			});
		} else {
			// For admin users, remove any status filtering from the original filter
			const { status, ...adminFilter } = filter;
			filter = adminFilter;
			logger.debug(`${endpoint} - Admin user - removed status filter`, {
				userId: locals.user._id,
				collection: schema._id,
				userRole: locals.user.role,
				isAdmin: isAdmin,
				originalFilter: { ...filter, status },
				adminFilter: filter
			});
		}

		// Build the query efficiently using QueryBuilder
		const collectionName = `collection_${schema._id}`;
		const query = dbAdapter
			.queryBuilder(collectionName)
			.where(filter)
			.sort(sortField as keyof BaseEntity, sortDirection)
			.paginate({ page, pageSize });

		// Get both the paginated results and total count
		const [result, countResult] = await Promise.all([query.execute(), dbAdapter.queryBuilder(collectionName).where(filter).count()]);

		if (!result.success) {
			logger.error(`${endpoint} - Database query failed`, {
				collection: schema._id,
				collectionId: schema._id,
				operation: 'execute',
				error: result.error.message,
				userId: locals.user._id
			});
			throw new Error(result.error.message);
		}
		if (!countResult.success) {
			logger.error(`${endpoint} - Database count failed`, {
				collection: schema._id,
				collectionId: schema._id,
				operation: 'count',
				error: countResult.error.message,
				userId: locals.user._id
			});
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
					user: locals.user,
					type: 'GET'
				});
				logger.debug(`${endpoint} - ModifyRequest completed`, {
					collection: schema._id,
					processedCount: processedData.length,
					userId: locals.user._id
				});
			} catch (modifyError) {
				logger.warn(`${endpoint} - ModifyRequest failed`, {
					collection: schema._id,
					error: modifyError.message,
					userId: locals.user._id,
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

		logger.info(`${endpoint} - Request completed successfully`, {
			collection: schema._id,
			userId: locals.user._id,
			itemCount: processedData.length,
			totalCount,
			page,
			pageSize,
			hasFilter: Object.keys(filter).length > 0,
			duration: `${duration.toFixed(2)}ms`,
			status: 200
		});

		return json(responseData);
	} catch (e) {
		const duration = performance.now() - startTime;

		if (e.status) {
			// SvelteKit errors (already have status codes)
			logger.warn(`${endpoint} - Request failed`, {
				status: e.status,
				message: e.message || e.body?.message,
				duration: `${duration.toFixed(2)}ms`,
				userId: locals.user?._id,
				collection: params.collectionId
			});
			throw e;
		}

		logger.error(`${endpoint} - Unexpected error`, {
			error: e.message,
			stack: e.stack,
			duration: `${duration.toFixed(2)}ms`,
			userId: locals.user?._id,
			collection: params.collectionId,
			status: 500
		});
		throw error(500, 'Internal Server Error');
	}
};

// POST: Creates a new entry in a collection
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const startTime = performance.now();
	const endpoint = `POST /api/collections/${params.collectionId}`;

	logger.info(`${endpoint} - Request started`, {
		userId: locals.user?._id,
		userEmail: locals.user?.email,
		contentType: request.headers.get('content-type')
	});

	try {
		if (!locals.user) {
			logger.warn(`${endpoint} - Unauthorized access attempt`);
			throw error(401, 'Unauthorized');
		}

		const schema = contentManager.getCollectionById(params.collectionId);
		if (!schema) {
			logger.warn(`${endpoint} - Collection not found`, {
				collectionId: params.collectionId,
				userId: locals.user._id
			});
			throw error(404, 'Collection not found');
		}

		if (!(await hasCollectionPermission(locals.user, 'write', schema))) {
			logger.warn(`${endpoint} - Access forbidden`, {
				collection: schema._id,
				userId: locals.user._id,
				userEmail: locals.user.email,
				userRole: locals.user.role
			});
			throw error(403, 'Forbidden');
		}

		let body;
		const contentType = request.headers.get('content-type');

		// Handle both JSON and FormData
		if (contentType?.includes('application/json')) {
			body = await request.json();
			logger.debug(`${endpoint} - Received JSON request body`, {
				collection: schema._id,
				userId: locals.user._id,
				bodyKeys: Object.keys(body || {})
			});
		} else if (contentType?.includes('multipart/form-data')) {
			const formData = await request.formData();
			body = Object.fromEntries(formData.entries());
			logger.debug(`${endpoint} - Received FormData request body`, {
				collection: schema._id,
				userId: locals.user._id,
				fieldCount: Object.keys(body || {}).length
			});
		} else {
			logger.warn(`${endpoint} - Unsupported content type`, {
				contentType,
				collection: schema._id,
				userId: locals.user._id
			});
			throw error(400, 'Unsupported content type');
		}

		// Prepare data with metadata
		const entryData = {
			...body,
			createdBy: locals.user._id,
			updatedBy: locals.user._id,
			status: body.status || 'draft',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString()
		};

		// Apply modifyRequest for pre-processing
		const dataArray = [entryData];
		try {
			await modifyRequest({
				data: dataArray,
				fields: schema.fields,
				collection: schema,
				user: locals.user,
				type: 'POST'
			});
			logger.debug(`${endpoint} - ModifyRequest pre-processing completed`, {
				collection: schema._id,
				userId: locals.user._id
			});
		} catch (modifyError) {
			logger.warn(`${endpoint} - ModifyRequest pre-processing failed`, {
				collection: schema._id,
				error: modifyError.message,
				userId: locals.user._id
			});
		}

		// Use the generic CRUD insert operation
		const collectionName = `collection_${schema._id}`;
		const result = await dbAdapter.crud.insert(collectionName, dataArray[0]);

		if (!result.success) {
			logger.error(`${endpoint} - Database insert failed`, {
				collection: schema._id,
				operation: 'insert',
				error: result.error.message,
				userId: locals.user._id
			});
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
			userId: locals.user._id,
			entryId: result.data._id,
			entryStatus: result.data.status,
			duration: `${duration.toFixed(2)}ms`,
			status: 201
		});

		return json(responseData, { status: 201 });
	} catch (e) {
		const duration = performance.now() - startTime;

		if (e.status) {
			// SvelteKit errors (already have status codes)
			logger.warn(`${endpoint} - Request failed`, {
				status: e.status,
				message: e.message || e.body?.message,
				duration: `${duration.toFixed(2)}ms`,
				userId: locals.user?._id,
				collection: params.collectionId
			});
			throw e;
		}

		logger.error(`${endpoint} - Unexpected error`, {
			error: e.message,
			stack: e.stack,
			duration: `${duration.toFixed(2)}ms`,
			userId: locals.user?._id,
			collection: params.collectionId,
			status: 500
		});
		throw error(500, 'Internal Server Error');
	}
};
