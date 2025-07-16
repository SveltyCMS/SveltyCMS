/**
 * @file src/routes/api/collections/[collectionId]/[entryId]/revisions/+server.ts
 * @description API endpoint for retrieving entry revision history
 *
 * @example: GET /api/collections/posts/123/revisions
 *
 * Features:
 *    * Lists all revisions for a specific entry
 *    * Provides diff comparison between revisions
 *    * Supports pagination for large revision histories
 *    * Permission checking for revision access
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { contentManager } from '@src/content/ContentManager';
import { logger } from '@utils/logger.svelte';
import { hasCollectionPermission } from '../../../../../permissions';
import { dbAdapter } from '@src/databases/db';

// GET: Retrieves revision history for an entry
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const start = performance.now();

	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const schema = contentManager.getCollectionById(params.collectionId);
	if (!schema) {
		throw error(404, 'Collection not found');
	}

	if (!(await hasCollectionPermission(locals.user, 'read', schema))) {
		throw error(403, 'Forbidden');
	}

	try {
		// Get query parameters for pagination
		const page = Number(url.searchParams.get('page') ?? 1);
		const limit = Number(url.searchParams.get('limit') ?? 10);

		// Get revision history for the entry
		const revisionsResult = await dbAdapter.content.revisions.getHistory(params.entryId);

		if (!revisionsResult.success) {
			logger.error(`Failed to get revisions for entry ${params.entryId}: ${revisionsResult.error?.message}`);
			throw error(500, 'Failed to retrieve revisions');
		}

		const revisions = revisionsResult.data || [];

		// Apply pagination if specified
		const pageNum = page ? parseInt(page) : 1;
		const limitNum = limit ? parseInt(limit) : 10;
		const startIndex = (pageNum - 1) * limitNum;
		const endIndex = startIndex + limitNum;

		const paginatedRevisions = revisions.slice(startIndex, endIndex);

		const duration = performance.now() - start;
		logger.info(`Revisions for entry ${params.entryId} retrieved in ${duration.toFixed(2)}ms`);

		return json({
			success: true,
			data: {
				revisions: paginatedRevisions,
				total: revisions.length,
				page: pageNum,
				limit: limitNum,
				totalPages: Math.ceil(revisions.length / limitNum)
			},
			performance: { duration }
		});
	} catch (e) {
		if (e.status) throw e; // Re-throw SvelteKit errors

		const duration = performance.now() - start;
		logger.error(`Failed to get revisions for entry ${params.entryId}: ${e.message} in ${duration.toFixed(2)}ms`);
		throw error(500, 'Internal Server Error');
	}
};
