import { error, json } from '@sveltejs/kit';
import { l as logger } from '../../../../../chunks/logger.server.js';
const GET = async ({ locals }) => {
	try {
		if (!locals.user) {
			throw error(401, 'Authentication required');
		}
		if (locals.user.role !== 'admin') {
			throw error(403, 'Admin access required to view pool diagnostics');
		}
		const { getDb } = await import('../../../../../chunks/db.js').then((n) => n.e);
		const db = getDb();
		if (!db) {
			throw error(503, 'Database not initialized');
		}
		if (!db.performance || typeof db.performance.getMetrics !== 'function') {
			logger.warn('Pool diagnostics not available - method not implemented');
			throw error(501, 'Pool diagnostics not implemented for this database adapter');
		}
		const metricsResult = await db.performance.getMetrics();
		if (!metricsResult.success) {
			throw error(500, metricsResult.message || 'Failed to retrieve pool diagnostics');
		}
		const healthResult = await db.getConnectionHealth();
		const healthData = healthResult.success ? healthResult.data : null;
		const data = {
			...(metricsResult.data || {}),
			poolUtilization: metricsResult.data?.connectionPoolUsage,
			healthStatus: healthData ? (healthData.healthy ? 'healthy' : 'unhealthy') : 'unknown',
			latency: healthData?.latency,
			activeConnections: healthData?.activeConnections
		};
		logger.debug('Pool diagnostics retrieved', {
			user: locals.user.email,
			utilization: data.poolUtilization,
			healthStatus: data.healthStatus
		});
		return json({
			success: true,
			data
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		logger.error('Error retrieving pool diagnostics', { error: err });
		throw error(500, 'Failed to retrieve pool diagnostics');
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
