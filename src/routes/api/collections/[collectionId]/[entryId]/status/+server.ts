/**
 * @file src/routes/api/collections/[collectionId]/[entryId]/status/+server.ts
 * @description API endpoint for updating entry status
 *
 * @example: PATCH /api/collections/posts/123/status
 *
 * Features:
 * * Dedicated endpoint for status changes
 * * Supports batch status updates via query parameters
 * * Maintains audit trail of status changes
 * * Permission checking for status modifications, scoped to the current tenant
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { privateEnv } from '@root/config/private';

// Databases
import { dbAdapter } from '@src/databases/db';

// Auth
import { contentManager } from '@src/content/ContentManager';
import { hasCollectionPermission } from '@api/permissions';

// Helper function to normalize collection names for database operations
const normalizeCollectionName = (collectionId: string): string => {
	// Remove hyphens from UUID for MongoDB collection naming
	const cleanId = collectionId.replace(/-/g, '');
	return `collection_${cleanId}`;
};

// System Logger
import { logger } from '@utils/logger.svelte';

// PATCH: Updates entry status
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	const start = performance.now();
	const { user, tenantId } = locals; // Destructure user and tenantId

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	// In multi-tenant mode, a tenantId is required.
	if (privateEnv.MULTI_TENANT && !tenantId) {
		logger.error('Status update failed: Tenant ID is missing in a multi-tenant setup.');
		throw error(400, 'Could not identify the tenant for this request.');
	}

	const schema = await contentManager.getCollectionById(params.collectionId, tenantId);
	if (!schema) {
		throw error(404, 'Collection not found');
	}

	if (!(await hasCollectionPermission(user, 'write', schema))) {
		throw error(403, 'Forbidden');
	}

	try {
		let body;
		try {
			body = await request.json();
		} catch (parseError) {
			logger.error(`Failed to parse request body: ${parseError.message}`);
			throw error(400, 'Invalid JSON in request body');
		}

		const { status, entries } = body;

		if (!status) {
			throw error(400, 'Status is required');
		}

		const validStatuses = ['draft', 'publish', 'unpublish', 'schedule', 'test', 'archive'];
		if (!validStatuses.includes(status)) {
			throw error(400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
		}

		let results = [];
		const normalizedCollectionId = normalizeCollectionName(schema._id);
		const updateData = { status, updatedBy: user._id };

		if (entries && Array.isArray(entries) && entries.length > 0) {
			// Batch status update
			const query = { _id: { $in: entries } };
			if (privateEnv.MULTI_TENANT) {
				query.tenantId = tenantId;
			}

			// --- MULTI-TENANCY SECURITY CHECK ---
			// Verify all entries belong to the current tenant before updating.
			const verificationResult = await dbAdapter.crud.find(normalizedCollectionId, query);
			if (!verificationResult.success || verificationResult.data.length !== entries.length) {
				logger.warn(`Attempt to update status for entries outside of tenant`, {
					userId: user._id,
					tenantId,
					requestedEntryIds: entries
				});
				throw error(403, 'Forbidden: One or more entries do not belong to your tenant or do not exist.');
			}

			const result = await dbAdapter.crud.updateMany(normalizedCollectionId, query, updateData);
			if (result.success) {
				results = entries.map((entryId) => ({ entryId, success: true }));
			} else {
				throw error(500, result.error.message);
			}
		} else {
			// Single entry status update
			const query = { _id: params.entryId };
			if (privateEnv.MULTI_TENANT) {
				query.tenantId = tenantId;
			}

			const result = await dbAdapter.crud.update(normalizedCollectionId, query, updateData);

			if (!result.success) {
				throw error(500, result.error.message);
			}

			if (!result.data) {
				throw error(404, 'Entry not found');
			}

			results = [{ entryId: params.entryId, success: true, data: result.data }];
		}

		const duration = performance.now() - start;
		const successCount = results.filter((r) => r.success).length;

		logger.info(`Status updated for ${successCount}/${results.length} entries in ${duration.toFixed(2)}ms`, { tenantId });

		return json({
			success: true,
			data: {
				status,
				results,
				summary: {
					total: results.length,
					successful: successCount,
					failed: results.length - successCount
				}
			},
			performance: { duration }
		});
	} catch (e) {
		if (e.status) {
			logger.error(`Status update error (${e.status}): ${e.body?.message || e.message}`);
			throw e; // Re-throw SvelteKit errors
		}

		const duration = performance.now() - start;
		logger.error(`Failed to update status: ${e.message} in ${duration.toFixed(2)}ms`, {
			error: e,
			stack: e.stack,
			collectionId: params.collectionId,
			entryId: params.entryId
		});
		throw error(500, 'Internal Server Error');
	}
};
