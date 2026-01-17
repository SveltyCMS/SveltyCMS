/**
 * @file apps/cms/src/routes/api/cache/clear/+server.ts
 * @description API endpoint for clearing all cache entries
 *
 * ### Features:
 * - Clear all cache entries
 *
 * ### Props
 *- locals: App.Locals
 *
 * ### Events
 *- POST: Clears all cache entries
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cacheService } from '@shared/database/CacheService';
import { logger } from '@shared/utils/logger.server';

/**
 * POST - Clear all cache entries
 */
export const POST: RequestHandler = async ({ locals }) => {
	try {
		// Check admin permission
		if (!locals.user?.isAdmin) {
			return json({ error: 'Unauthorized' }, { status: 403 });
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
	} catch (error) {
		logger.error('Failed to clear cache:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to clear cache'
			},
			{ status: 500 }
		);
	}
};
