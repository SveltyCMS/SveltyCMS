/**
 * @file src/routes/api/cache/clear/+server.ts
 * @description API endpoint for clearing all cache entries
 *
 * Features:
 * - Clear all cache entries
 */

import { cacheService } from '@src/databases/cache-service';
import { json } from '@sveltejs/kit';
/**
 * POST - Clear all cache entries
 */
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';

/**
 * POST - Clear all cache entries
 */
export const POST = apiHandler(async ({ locals }) => {
	// Check admin permission
	if (!locals.user?.isAdmin) {
		throw new AppError('Unauthorized', 403, 'FORBIDDEN');
	}

	// Invalidate all cache
	await cacheService.invalidateAll();

	logger.info('Cache cleared by admin user', {
		userId: locals.user.id,
		username: locals.user.username
	});

	return json({
		success: true,
		message: 'All cache entries cleared successfully'
	});
});
