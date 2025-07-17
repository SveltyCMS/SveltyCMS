/**
 * @file src/routes/api/collections/[collectionId]/[entryId]/+server.ts
 * @description API endpoint for reading, updating, and deleting a single collection entry
 *
 * @example for get/patch/delete single entry:   /api/collections/:collectionId/:entryId
 *
 * Features:
 *    * Handles GET, PATCH, and DELETE verbs for full CRUD on a single entry
 *    * Secure, granular access control per operation
 *    * Automatic metadata updates on modification (updatedBy)
 *    * ModifyRequest support for widget-based data processing
 *    * Status-based access control for non-admin users
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';

// Databases
import { dbAdapter } from '@src/databases/db';

// Auth
import { contentManager } from '@src/content/ContentManager';
import { hasCollectionPermission } from '@api/permissions';
import { modifyRequest } from '@api/collections/modifyRequest';

// Helper function to normalize collection names for database operations
const normalizeCollectionName = (collectionId: string): string => {
	// Remove hyphens from UUID for MongoDB collection naming
	const cleanId = collectionId.replace(/-/g, '');
	return `collection_${cleanId}`;
};

// System Logger
import { logger } from '@utils/logger.svelte';

// GET: Retrieves a single entry by its ID
export const GET: RequestHandler = async ({ locals, params }) => {
	const startTime = performance.now();
	const endpoint = `GET /api/collections/${params.collectionId}/${params.entryId}`;

	logger.info(`${endpoint} - Request started`, {
		userId: locals.user?._id,
		userEmail: locals.user?.email,
		collectionId: params.collectionId,
		entryId: params.entryId
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
				entryId: params.entryId,
				userId: locals.user._id
			});
			throw error(404, 'Collection not found');
		}

		if (!(await hasCollectionPermission(locals.user, 'read', schema))) {
			logger.warn(`${endpoint} - Access forbidden`, {
				collection: schema._id,
				entryId: params.entryId,
				userId: locals.user._id,
				userEmail: locals.user.email,
				userRole: locals.user.role
			});
			throw error(403, 'Forbidden');
		}

		const collectionName = `collection_${schema._id}`;
		const result = await dbAdapter.crud.findOne(collectionName, { _id: params.entryId });

		if (!result.success) {
			logger.error(`${endpoint} - Database findOne failed`, {
				collection: schema._id,
				entryId: params.entryId,
				operation: 'findOne',
				error: result.error.message,
				userId: locals.user._id
			});
			throw error(500, 'Failed to retrieve entry.');
		}

		if (!result.data) {
			logger.info(`${endpoint} - Entry not found`, {
				collection: schema._id,
				entryId: params.entryId,
				userId: locals.user._id
			});
			throw error(404, 'Entry not found');
		}

		// Check if user can access this specific entry (status-based)
		const userRole = roles.find((role) => role._id === locals.user.role);
		const isAdmin = userRole?.isAdmin === true;
		if (!isAdmin && result.data.status !== 'publish') {
			logger.warn(`${endpoint} - Non-admin user attempted to access unpublished entry`, {
				collection: schema._id,
				entryId: params.entryId,
				entryStatus: result.data.status,
				userId: locals.user._id,
				userEmail: locals.user.email,
				userRole: locals.user.role
			});
			throw error(404, 'Entry not found');
		}

		// Apply modifyRequest for widget-based processing
		const dataArray = [result.data];
		try {
			await modifyRequest({
				data: dataArray,
				fields: schema.fields,
				collection: schema,
				user: locals.user,
				type: 'GET'
			});
			logger.debug(`${endpoint} - ModifyRequest processing completed`, {
				collection: schema._id,
				entryId: params.entryId,
				userId: locals.user._id
			});
		} catch (modifyError) {
			logger.warn(`${endpoint} - ModifyRequest processing failed`, {
				collection: schema._id,
				entryId: params.entryId,
				error: modifyError.message,
				userId: locals.user._id
			});
		}

		const duration = performance.now() - startTime;
		const responseData = {
			success: true,
			data: dataArray[0],
			performance: { duration }
		};

		logger.info(`${endpoint} - Entry retrieved successfully`, {
			collection: schema._id,
			entryId: params.entryId,
			entryStatus: result.data.status,
			userId: locals.user._id,
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
				collectionId: params.collectionId,
				entryId: params.entryId
			});
			throw e;
		}

		logger.error(`${endpoint} - Unexpected error`, {
			error: e.message,
			stack: e.stack,
			duration: `${duration.toFixed(2)}ms`,
			userId: locals.user?._id,
			collectionId: params.collectionId,
			entryId: params.entryId,
			status: 500
		});
		throw error(500, 'Internal Server Error');
	}
};

// PATCH: Updates an existing entry
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const startTime = performance.now();
	const endpoint = `PATCH /api/collections/${params.collectionId}/${params.entryId}`;

	logger.info(`${endpoint} - Request started`, {
		userId: locals.user?._id,
		userEmail: locals.user?.email,
		collectionId: params.collectionId,
		entryId: params.entryId
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
				entryId: params.entryId,
				userId: locals.user._id
			});
			throw error(404, 'Collection not found');
		}

		if (!(await hasCollectionPermission(locals.user, 'write', schema))) {
			logger.warn(`${endpoint} - Access forbidden`, {
				collection: schema._id,
				entryId: params.entryId,
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
			logger.debug(`${endpoint} - Received JSON update request`, {
				collection: schema._id,
				entryId: params.entryId,
				userId: locals.user._id,
				updateFields: Object.keys(body || {})
			});
		} else if (contentType?.includes('multipart/form-data')) {
			const formData = await request.formData();
			body = Object.fromEntries(formData.entries());
			logger.debug(`${endpoint} - Received FormData update request`, {
				collection: schema._id,
				entryId: params.entryId,
				userId: locals.user._id,
				fieldCount: Object.keys(body || {}).length
			});
		} else {
			logger.warn(`${endpoint} - Unsupported content type`, {
				contentType,
				collection: schema._id,
				entryId: params.entryId,
				userId: locals.user._id
			});
			throw error(400, 'Unsupported content type');
		}

		// Prepare update data with metadata
		const updateData = {
			...body,
			updatedBy: locals.user._id,
			updatedAt: new Date().toISOString()
		};

		// Apply modifyRequest for pre-processing
		const dataArray = [updateData];
		try {
			await modifyRequest({
				data: dataArray,
				fields: schema.fields,
				collection: schema,
				user: locals.user,
				type: 'PATCH'
			});
			logger.debug(`${endpoint} - ModifyRequest pre-processing completed`, {
				collection: schema._id,
				entryId: params.entryId,
				userId: locals.user._id
			});
		} catch (modifyError) {
			logger.warn(`${endpoint} - ModifyRequest pre-processing failed`, {
				collection: schema._id,
				entryId: params.entryId,
				error: modifyError.message,
				userId: locals.user._id
			});
		}

		const collectionName = `collection_${schema._id}`;
		const result = await dbAdapter.crud.update(collectionName, params.entryId, dataArray[0]);

		if (!result.success) {
			logger.error(`${endpoint} - Database update failed`, {
				collection: schema._id,
				entryId: params.entryId,
				operation: 'update',
				error: result.error.message,
				userId: locals.user._id
			});
			throw new Error(result.error.message);
		}

		if (!result.data) {
			logger.info(`${endpoint} - Entry not found for update`, {
				collection: schema._id,
				entryId: params.entryId,
				userId: locals.user._id
			});
			throw error(404, 'Entry not found');
		}

		const duration = performance.now() - startTime;
		const responseData = {
			success: true,
			data: result.data,
			performance: { duration }
		};

		logger.info(`${endpoint} - Entry updated successfully`, {
			collection: schema._id,
			entryId: params.entryId,
			updatedFields: Object.keys(body || {}),
			userId: locals.user._id,
			userEmail: locals.user.email,
			duration: `${duration.toFixed(2)}ms`,
			responseSize: JSON.stringify(responseData).length,
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
				collectionId: params.collectionId,
				entryId: params.entryId
			});
			throw e;
		}

		logger.error(`${endpoint} - Unexpected error`, {
			error: e.message,
			stack: e.stack,
			duration: `${duration.toFixed(2)}ms`,
			userId: locals.user?._id,
			collectionId: params.collectionId,
			entryId: params.entryId,
			status: 500
		});
		throw error(500, 'Internal Server Error');
	}
};

// DELETE: Removes an entry from a collection
export const DELETE: RequestHandler = async ({ locals, params }) => {
	const startTime = performance.now();
	const endpoint = `DELETE /api/collections/${params.collectionId}/${params.entryId}`;

	logger.info(`${endpoint} - Request started`, {
		userId: locals.user?._id,
		userEmail: locals.user?.email,
		collectionId: params.collectionId,
		entryId: params.entryId
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
				entryId: params.entryId,
				userId: locals.user._id
			});
			throw error(404, 'Collection not found');
		}

		if (!(await hasCollectionPermission(locals.user, 'write', schema))) {
			logger.warn(`${endpoint} - Access forbidden`, {
				collection: schema._id,
				entryId: params.entryId,
				userId: locals.user._id,
				userEmail: locals.user.email,
				userRole: locals.user.role
			});
			throw error(403, 'Forbidden');
		}

		// Get normalized collection name for database operations
		const normalizedCollectionId = normalizeCollectionName(schema._id);
		const result = await dbAdapter.crud.delete(normalizedCollectionId, params.entryId);

		if (!result.success) {
			if (result.error.message.includes('not found')) {
				logger.info(`${endpoint} - Entry not found for deletion`, {
					collection: schema._id,
					entryId: params.entryId,
					userId: locals.user._id
				});
				throw error(404, 'Entry not found');
			}
			logger.error(`${endpoint} - Database deletion failed`, {
				error: result.error.message,
				collection: schema._id,
				entryId: params.entryId,
				userId: locals.user._id
			});
			throw error(500, 'Failed to delete entry');
		}

		const duration = performance.now() - startTime;

		logger.info(`${endpoint} - Entry deleted successfully`, {
			collection: schema._id,
			entryId: params.entryId,
			userId: locals.user._id,
			userEmail: locals.user.email,
			duration: `${duration.toFixed(2)}ms`,
			status: 204
		});

		return new Response(null, { status: 204 }); // 204 No Content
	} catch (e) {
		const duration = performance.now() - startTime;

		if (e.status) {
			// SvelteKit errors (already have status codes)
			logger.warn(`${endpoint} - Request failed`, {
				status: e.status,
				message: e.message || e.body?.message,
				duration: `${duration.toFixed(2)}ms`,
				userId: locals.user?._id,
				collectionId: params.collectionId,
				entryId: params.entryId
			});
			throw e;
		}

		logger.error(`${endpoint} - Unexpected error`, {
			error: e.message,
			stack: e.stack,
			duration: `${duration.toFixed(2)}ms`,
			userId: locals.user?._id,
			collectionId: params.collectionId,
			entryId: params.entryId,
			status: 500
		});
		throw error(500, 'Internal Server Error');
	}
};
