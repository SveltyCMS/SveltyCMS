/**
 * @file src/routes/api/collections/[collectionId]/[entryId]/status/+server.ts
 * @description API endpoint for updating entry status
 *
 * @example: PATCH /api/collections/posts/123/status
 *
 * Features:
 *    * Dedicated endpoint for status changes
 *    * Supports batch status updates via query parameters
 *    * Maintains audit trail of status changes
 *    * Permission checking for status modifications
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';

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

	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const schema = contentManager.getCollectionById(params.collectionId);
	if (!schema) {
		throw error(404, 'Collection not found');
	}

	if (!(await hasCollectionPermission(locals.user, 'write', schema))) {
		throw error(403, 'Forbidden');
	}

	try {
		// Debug logging for request body
		let body;
		try {
			body = await request.json();
			logger.debug(`PATCH /api/collections/${params.collectionId}/${params.entryId}/status - Request body:`, body);
		} catch (parseError) {
			logger.error(`Failed to parse request body: ${parseError.message}`);
			throw error(400, 'Invalid JSON in request body');
		}

		const { status, entries } = body;

		if (!status) {
			throw error(400, 'Status is required');
		}

		// Validate status value
		// Note: 'draft' is only for data entered but never saved (auto-save scenarios)
		// ActionType mapping: 'publish' action, 'unpublish' action, 'schedule' action
		const validStatuses = ['draft', 'publish', 'unpublish', 'schedule', 'test', 'archive'];
		if (!validStatuses.includes(status)) {
			throw error(400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
		}

		let results = [];

		// Get normalized collection name for database operations
		const normalizedCollectionId = normalizeCollectionName(schema._id);

		if (entries && Array.isArray(entries)) {
			// Batch status update
			for (const entryId of entries) {
				const updateData = {
					status,
					updatedBy: locals.user._id
					// Note: updatedAt is automatically set by the database adapter
					// Removed duplicate statusChangedAt and statusChangedBy fields
				};

				const result = await dbAdapter.crud.update(normalizedCollectionId, entryId, updateData);

				if (result.success) {
					results.push({ entryId, success: true, data: result.data });
				} else {
					results.push({ entryId, success: false, error: result.error.message });
				}
			}
		} else {
			// Single entry status update
			const updateData = {
				status,
				updatedBy: locals.user._id
			};

			const result = await dbAdapter.crud.update(normalizedCollectionId, params.entryId, updateData);

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

		logger.info(`Status updated for ${successCount}/${results.length} entries in ${duration.toFixed(2)}ms`);

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
