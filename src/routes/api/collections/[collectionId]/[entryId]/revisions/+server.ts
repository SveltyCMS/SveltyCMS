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

import { json } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import { getRevisions } from '@src/services/RevisionService';

// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { AppError } from '@utils/errorHandling';

export const GET = apiHandler(async ({ locals, params, url }) => {
	const start = performance.now();
	const { user, tenantId, dbAdapter } = locals;
	const { collectionId, entryId } = params;

	if (!user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	if (!dbAdapter) throw new AppError('Database service unavailable', 503, 'SERVICE_UNAVAILABLE');

	const page = parseInt(url.searchParams.get('page') ?? '1', 10);
	const limit = parseInt(url.searchParams.get('limit') ?? '10', 10);

	const result = await getRevisions({
		collectionId,
		entryId,
		tenantId: tenantId || '',
		dbAdapter,
		page,
		limit
	});

	if (!result.success) {
		const msg = result.error?.message || 'Unknown error';
		if (msg === 'Collection not found' || msg === 'Entry not found') {
			throw new AppError(msg, 404, 'NOT_FOUND');
		}
		throw new AppError('Failed to get revisions', 500, 'REVISION_FETCH_ERROR');
	}

	const paginatedResult = result.data;
	const duration = performance.now() - start;
	logger.info(`Revisions retrieved`, { entryId, duration: `${duration.toFixed(2)}ms` });

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
});
