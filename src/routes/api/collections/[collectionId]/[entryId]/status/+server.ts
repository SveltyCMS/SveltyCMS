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
import { dbAdapter } from '@src/databases/db';
import { contentManager } from '@src/content/ContentManager';
import { logger } from '@utils/logger.svelte';
import { hasCollectionPermission } from '../../../../permissions';

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
		const body = await request.json();
		const { status, entries } = body;

		if (!status) {
			throw error(400, 'Status is required');
		}

		// Validate status value
		const validStatuses = ['draft', 'published', 'archived', 'pending', 'scheduled'];
		if (!validStatuses.includes(status)) {
			throw error(400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
		}

		let results = [];

		if (entries && Array.isArray(entries)) {
			// Batch status update
			for (const entryId of entries) {
				const updateData = {
					status,
					updatedBy: locals.user._id,
					updatedAt: new Date().toISOString(),
					statusChangedAt: new Date().toISOString(),
					statusChangedBy: locals.user._id
				};

				const result = await dbAdapter.crud.update(schema.name, entryId, updateData);

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
				updatedBy: locals.user._id,
				updatedAt: new Date().toISOString(),
				statusChangedAt: new Date().toISOString(),
				statusChangedBy: locals.user._id
			};

			const result = await dbAdapter.crud.update(schema.name, params.entryId, updateData);

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
		if (e.status) throw e; // Re-throw SvelteKit errors

		const duration = performance.now() - start;
		logger.error(`Failed to update status: ${e.message} in ${duration.toFixed(2)}ms`);
		throw error(500, 'Internal Server Error');
	}
};
