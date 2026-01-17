import { json } from '@sveltejs/kit';
import { c as cacheMetrics } from '../../../../../chunks/CacheMetrics.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
const GET = async () => {
	try {
		const snapshot = cacheMetrics.getSnapshot();
		const recentEvents = cacheMetrics.getRecentEvents(20);
		const recentMisses = recentEvents
			.filter((event) => event.type === 'miss')
			.slice(-10)
			.map((event) => ({
				key: event.key,
				category: event.category,
				tenantId: event.tenantId,
				timestamp: event.timestamp
			}));
		return json({
			overall: {
				hits: snapshot.hits,
				misses: snapshot.misses,
				sets: 0,
				// Not tracked in current implementation
				deletes: 0,
				// Not tracked in current implementation
				hitRate: snapshot.hitRate,
				totalOperations: snapshot.totalRequests
			},
			byCategory: Object.entries(snapshot.byCategory || {}).reduce((acc, [category, stats]) => {
				acc[category] = {
					hits: stats.hits,
					misses: stats.misses,
					hitRate: stats.hitRate
				};
				return acc;
			}, {}),
			byTenant: Object.entries(snapshot.byTenant || {}).reduce((acc, [tenant, stats]) => {
				acc[tenant] = {
					hits: stats.hits,
					misses: stats.misses,
					hitRate: stats.hitRate
				};
				return acc;
			}, {}),
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
const DELETE = async () => {
	try {
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
export { DELETE, GET };
//# sourceMappingURL=_server.ts.js.map
