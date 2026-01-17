/**
 * @file src/routes/api/dashboard/cache-metrics/+server.ts
 * @description API endpoint for cache performance metrics
 * Returns cache hit rates, category statistics, and tenant metrics for dashboard monitoring
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cacheMetrics } from '@shared/database/CacheMetrics';
import { logger } from '@shared/utils/logger.server';

export const GET: RequestHandler = async () => {
	try {
		// Get cache metrics snapshot
		const snapshot = cacheMetrics.getSnapshot();

		// Get recent events (last 20)
		const recentEvents = cacheMetrics.getRecentEvents(20);

		// Filter recent misses
		const recentMisses = recentEvents
			.filter((event) => event.type === 'miss')
			.slice(-10) // Last 10 misses
			.map((event) => ({
				key: event.key,
				category: event.category,
				tenantId: event.tenantId,
				timestamp: event.timestamp
			})); // Return formatted metrics
		return json({
			overall: {
				hits: snapshot.hits,
				misses: snapshot.misses,
				sets: 0, // Not tracked in current implementation
				deletes: 0, // Not tracked in current implementation
				hitRate: snapshot.hitRate,
				totalOperations: snapshot.totalRequests
			},
			byCategory: Object.entries(snapshot.byCategory || {}).reduce(
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
			byTenant: Object.entries(snapshot.byTenant || {}).reduce(
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
			recentMisses,
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
