/**
 * @file src/routes/api/dashboard/cache-metrics/+server.ts
 * @description API endpoint for cache performance metrics
 * Returns cache hit rates, category statistics, and tenant metrics for dashboard monitoring
 */

import { cacheMetrics } from '@src/databases/CacheMetrics';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';
import { logger } from '@utils/logger.server';

export const GET = apiHandler(async () => {
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
});

/**
 * Reset cache metrics endpoint (admin only)
 * DELETE /api/dashboard/cache-metrics
 */
export const DELETE = apiHandler(async () => {
	// TODO: Add authorization check
	// if (!locals.user?.isAdmin) {
	//   throw new AppError('Unauthorized', 403, 'FORBIDDEN');
	// }

	cacheMetrics.reset();
	logger.info('Cache metrics reset successfully');

	return json({
		success: true,
		message: 'Cache metrics reset successfully'
	});
});
