/**
 * @file src/routes/api/dashboard/cache-metrics/+server.ts
 * @description API endpoint for cache performance metrics
 * Returns cache hit rates, category statistics, and tenant metrics for dashboard monitoring
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cacheMetrics } from '@src/databases/CacheMetrics';
import { logger } from '@utils/logger.svelte';

export const GET: RequestHandler = async () => {
	try {
		// Get cache metrics snapshot
		const snapshot = cacheMetrics.getSnapshot();

		// Return formatted metrics
		return json({
			overall: {
				hits: snapshot.overall.hits,
				misses: snapshot.overall.misses,
				sets: snapshot.overall.sets,
				deletes: snapshot.overall.deletes,
				hitRate: snapshot.overall.hitRate,
				totalOperations: snapshot.overall.hits + snapshot.overall.misses
			},
			byCategory: Object.entries(snapshot.byCategory).reduce(
				(acc, [category, stats]) => {
					acc[category] = {
						hits: stats.hits,
						misses: stats.misses,
						hitRate: stats.hitRate
					};
					return acc;
				},
				{} as Record<string, { hits: number; misses: number; hitRate: number }>
			),
			byTenant: Object.entries(snapshot.byTenant).reduce(
				(acc, [tenant, stats]) => {
					acc[tenant] = {
						hits: stats.hits,
						misses: stats.misses,
						hitRate: stats.hitRate
					};
					return acc;
				},
				{} as Record<string, { hits: number; misses: number; hitRate: number }>
			),
			timestamp: Date.now()
		});
	} catch (error) {
		logger.error('Error fetching cache metrics:', error);
		return json(
			{
				error: 'Failed to fetch cache metrics',
				overall: {
					hits: 0,
					misses: 0,
					sets: 0,
					deletes: 0,
					hitRate: 0,
					totalOperations: 0
				},
				byCategory: {},
				byTenant: {},
				timestamp: Date.now()
			},
			{ status: 500 }
		);
	}
};

/**
 * Reset cache metrics endpoint (admin only)
 * DELETE /api/dashboard/cache-metrics
 */
export const DELETE: RequestHandler = async () => {
	try {
		// TODO: Add authorization check
		// if (!locals.user?.isAdmin) {
		//   return json({ error: 'Unauthorized' }, { status: 403 });
		// }

		cacheMetrics.reset();
		logger.info('Cache metrics reset successfully');

		return json({
			success: true,
			message: 'Cache metrics reset successfully'
		});
	} catch (error) {
		logger.error('Error resetting cache metrics:', error);
		return json({ error: 'Failed to reset cache metrics' }, { status: 500 });
	}
};
