/**
 * @file src/routes/api/collections/[collectionId]/[entryId]/revisions/+server.ts
 * @description API endpoint for retrieving entry revision history
 *
 * @example: GET /api/collections/posts/123/revisions
 *
 * Features:
 * * Lists all revisions for a specific entry within the current tenant
 * * Provides diff comparison between revisions
 * * Supports pagination for large revision histories
 * * Permission checking for revision access
 */

import { json, error, type RequestHandler } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
// Shared logic for retrieving revisions
import { getRevisions } from '@src/services/RevisionService';

// GET: Retrieves revision history for an entry
export const GET: RequestHandler = async ({ locals, params, url }) => {
	const start = performance.now();
	const endpoint = `GET /api/collections/${params.collectionId}/${params.entryId}/revisions`;
	const { user, tenantId, dbAdapter } = locals;

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	if (!dbAdapter) {
		throw error(503, 'Service Unavailable: Database service is not properly initialized');
	}

	try {
		const page = parseInt(url.searchParams.get('page') ?? '1', 10);
		const limit = parseInt(url.searchParams.get('limit') ?? '10', 10);

		const result = await getRevisions({
			collectionId: params.collectionId,
			entryId: params.entryId,
			tenantId: tenantId || '',
			dbAdapter,
			page,
			limit
		});

		if (!result.success) {
			logger.error(`${endpoint} - Failed to get revisions`, {
				collectionId: params.collectionId,
				entryId: params.entryId,
				error: result.error?.message || 'Unknown error',
				userId: user._id
			});
			if (result.error?.message === 'Collection not found' || result.error?.message === 'Entry not found') {
				throw error(404, result.error.message);
			}
			throw error(500, 'Failed to get revisions');
		}

		const paginatedResult = result.data;
		const duration = performance.now() - start;
		logger.info(`Revisions for entry ${params.entryId} in tenant ${tenantId} retrieved in ${duration.toFixed(2)}ms`);

		return json({
			success: true,
			data: {
				revisions: paginatedResult.items,
				total: paginatedResult.total,
				page: paginatedResult.page,
				limit: paginatedResult.pageSize,
				totalPages: paginatedResult.total ? Math.ceil(paginatedResult.total / paginatedResult.pageSize) : undefined
			},
			performance: { duration }
		});
	} catch (e) {
		if (typeof e === 'object' && e !== null && 'status' in e) throw e;

		const duration = performance.now() - start;
		const errorMsg = e instanceof Error ? e.message : 'Unknown error';
		logger.error(`Failed to get revisions for entry ${params.entryId}: ${errorMsg} in ${duration.toFixed(2)}ms`);
		throw error(500, 'Internal Server Error');
	}
};
