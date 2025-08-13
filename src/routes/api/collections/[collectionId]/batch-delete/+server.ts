/**
 * @file src/routes/api/collections/[collectionId]/batch-delete/+server.ts
 * @description Batch delete API endpoint for collection entries
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '@utils/logger.svelte';
import { error } from '@sveltejs/kit';

// BATCH DELETE: Removes multiple entries from a collection
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const startTime = performance.now();
	const endpoint = `POST /api/collections/${params.collectionId}/batch-delete`;

	// Check authentication
	if (!locals.user) {
		logger.warn(`${endpoint} - Unauthorized access attempt`);
		throw error(401, 'Authentication required');
	}

	try {
		const body = await request.json();
		const { entryIds } = body;

		if (!Array.isArray(entryIds) || entryIds.length === 0) {
			logger.warn(`${endpoint} - Invalid entryIds provided`);
			throw error(400, 'entryIds must be a non-empty array');
		}

		const collectionId = params.collectionId;
		if (!collectionId) {
			logger.warn(`${endpoint} - Collection ID missing`);
			throw error(400, 'Collection ID is required');
		}

		// Normalize collection ID (remove spaces and convert to lowercase)
		const normalizedCollectionId = collectionId.replace(/\s+/g, '').toLowerCase();

		logger.info(`${endpoint} - Attempting to batch delete ${entryIds.length} entries from collection ${normalizedCollectionId}`);

		// Check if user has delete permissions for this collection
		// This should be implemented based on your permission system
		// For now, we'll allow authenticated users to delete

		const dbAdapter = locals.dbAdapter;
		if (!dbAdapter) {
			throw error(500, 'Database adapter not available');
		}

		// Perform batch delete
		const results = [];
		const errors = [];

		for (const entryId of entryIds) {
			try {
				const result = await dbAdapter.crud.delete(normalizedCollectionId, entryId);
				if (result.success) {
					results.push({ entryId, success: true });
				} else {
					errors.push({ entryId, error: result.error || 'Delete failed' });
				}
			} catch (entryError) {
				logger.error(`${endpoint} - Error deleting entry ${entryId}:`, entryError);
				errors.push({ entryId, error: (entryError as Error).message });
			}
		}

		const duration = performance.now() - startTime;

		if (errors.length === 0) {
			// All deletions successful
			logger.info(`${endpoint} - All ${entryIds.length} entries deleted successfully`, {
				duration: `${duration.toFixed(2)}ms`,
				deletedCount: results.length
			});

			return json({
				success: true,
				message: `${entryIds.length} entries deleted successfully`,
				data: {
					deletedCount: results.length,
					results
				}
			});
		} else if (results.length === 0) {
			// All deletions failed
			logger.error(`${endpoint} - All deletions failed`, {
				duration: `${duration.toFixed(2)}ms`,
				errors
			});

			throw error(500, `Failed to delete any entries: ${errors[0]?.error || 'Unknown error'}`);
		} else {
			// Partial success
			logger.warn(`${endpoint} - Partial success in batch delete`, {
				duration: `${duration.toFixed(2)}ms`,
				successCount: results.length,
				errorCount: errors.length,
				errors
			});

			return json({
				success: true,
				message: `${results.length} of ${entryIds.length} entries deleted successfully`,
				data: {
					deletedCount: results.length,
					results,
					errors
				}
			});
		}
	} catch (err) {
		const duration = performance.now() - startTime;

		if (err instanceof Error && err.message.includes('401')) {
			logger.warn(`${endpoint} - Unauthorized`, { duration: `${duration.toFixed(2)}ms` });
			throw error(401, 'Unauthorized');
		}

		if (err instanceof Error && err.message.includes('400')) {
			logger.warn(`${endpoint} - Bad request`, { duration: `${duration.toFixed(2)}ms` });
			throw error(400, err.message);
		}

		logger.error(`${endpoint} - Unexpected error:`, err);
		throw error(500, 'Failed to batch delete entries');
	}
};
