/**
 * @file src/routes/api/collections/[collectionId]/[entryId]/+server.ts
 * @description API endpoint for reading, updating, and deleting a single collection entry
 *
 * @example for get/patch/delete single entry:  /api/collections/:collectionId/:entryId
 *
 * Features:
 * * Handles GET, PATCH, and DELETE verbs for full CRUD on a single entry
 * * Secure, granular access control per operation, scoped to the current tenant
 * * Automatic metadata updates on modification (updatedBy)
 * * ModifyRequest support for widget-based data processing
 * * Status-based access control for non-admin users
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { privateEnv } from '@root/config/private';

// Databases

// Auth
import { contentManager } from '@src/content/ContentManager';
import { modifyRequest } from '@api/collections/modifyRequest';
import { roles, initializeRoles } from '@root/config/roles';

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
	const { user, tenantId } = locals;

	logger.info(`${endpoint} - Request started`, {
		userId: user?._id,
		userEmail: user?.email,
		collectionId: params.collectionId,
		entryId: params.entryId,
		tenantId
	});

	try {
		if (!user) {
			logger.warn(`${endpoint} - Unauthorized access attempt`);
			throw error(401, 'Unauthorized');
		}

		if (privateEnv.MULTI_TENANT && !tenantId) {
			logger.error(`${endpoint} - Tenant ID is missing in a multi-tenant setup.`);
			throw error(400, 'Could not identify the tenant for this request.');
		}

		const schema = await contentManager.getCollectionById(params.collectionId, tenantId);
		if (!schema) {
			logger.warn(`${endpoint} - Collection not found`, {
				collectionId: params.collectionId,
				entryId: params.entryId,
				userId: user._id,
				tenantId
			});
			throw error(404, 'Collection not found');
		}

		const dbAdapter = locals.dbAdapter;
		const collectionName = `collection_${schema._id}`;
		const query: { _id: string; tenantId?: string } = { _id: params.entryId };
		if (privateEnv.MULTI_TENANT) {
			query.tenantId = tenantId;
		}
		const result = await dbAdapter.crud.findOne(collectionName, query);

		if (!result.success) {
			logger.error(`${endpoint} - Database findOne failed`, {
				collection: schema._id,
				entryId: params.entryId,
				error: result.error.message,
				userId: user._id
			});
			throw error(500, 'Failed to retrieve entry.');
		}

		if (!result.data) {
			logger.info(`${endpoint} - Entry not found`, {
				collection: schema._id,
				entryId: params.entryId,
				userId: user._id
			});
			throw error(404, 'Entry not found');
		} // Check if user can access this specific entry (status-based)

		await initializeRoles();
		const userRole = roles.find((role) => role._id === user.role);
		const isAdmin = userRole?.isAdmin === true;
		if (!isAdmin && result.data.status !== 'published') {
			logger.warn(`${endpoint} - Non-admin user attempted to access unpublished entry`, {
				collection: schema._id,
				entryId: params.entryId,
				entryStatus: result.data.status,
				userId: user._id,
				userEmail: user.email,
				userRole: user.role
			});
			throw error(404, 'Entry not found');
		} // Apply modifyRequest for widget-based processing

		const dataArray = [result.data];
		try {
			await modifyRequest({
				data: dataArray,
				fields: schema.fields,
				collection: schema,
				user: user,
				type: 'GET',
				tenantId
			});
		} catch (modifyError) {
			logger.warn(`${endpoint} - ModifyRequest processing failed`, {
				error: modifyError.message,
				userId: user._id
			});
		}

		const duration = performance.now() - startTime;
		const responseData = {
			success: true,
			data: dataArray[0],
			performance: { duration }
		};

		logger.info(`${endpoint} - Entry retrieved successfully`, {
			duration: `${duration.toFixed(2)}ms`
		});

		return json(responseData);
	} catch (e) {
		if (e.status) {
			throw e;
		}
		logger.error(`${endpoint} - Unexpected error`, { error: e.message, stack: e.stack });
		throw error(500, 'Internal Server Error');
	}
};

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

		if (privateEnv.MULTI_TENANT && !tenantId) {
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
		const collectionName = `collection_${schema._id}`;
		// First verify the entry exists and belongs to the current tenant
		const query: { _id: string; tenantId?: string } = { _id: params.entryId };
		if (privateEnv.MULTI_TENANT) {
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

		logger.info(`${endpoint} - Entry updated successfully`, { duration: `${duration.toFixed(2)}ms` });

		return json(responseData);
	} catch (e) {
		if (e.status) {
			throw e;
		}
		logger.error(`${endpoint} - Unexpected error`, { error: e.message, stack: e.stack });
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

		if (privateEnv.MULTI_TENANT && !tenantId) {
			throw error(400, 'Could not identify the tenant for this request.');
		}

		const schema = await contentManager.getCollectionById(params.collectionId, tenantId);
		if (!schema) {
			throw error(404, 'Collection not found');
		}

		const dbAdapter = locals.dbAdapter;
		const normalizedCollectionId = normalizeCollectionName(schema._id);

		// First verify the entry exists and belongs to the current tenant
		const query: { _id: string; tenantId?: string } = { _id: params.entryId };
		if (privateEnv.MULTI_TENANT) {
			query.tenantId = tenantId;
		}

		const verificationResult = await dbAdapter.crud.findOne(normalizedCollectionId, query);
		if (!verificationResult.success || !verificationResult.data) {
			throw error(404, 'Entry not found or access denied');
		}

		const result = await dbAdapter.crud.delete(normalizedCollectionId, params.entryId);

		if (!result.success) {
			if (result.error.message.includes('not found')) {
				throw error(404, 'Entry not found');
			}
			throw error(500, 'Failed to delete entry');
		}

		const duration = performance.now() - startTime;
		logger.info(`${endpoint} - Entry deleted successfully`, { duration: `${duration.toFixed(2)}ms` });

		return new Response(null, { status: 204 }); // 204 No Content
	} catch (e) {
		if (e.status) {
			throw e;
		}
		logger.error(`${endpoint} - Unexpected error`, { error: e.message, stack: e.stack });
		throw error(500, 'Internal Server Error');
	}
};
