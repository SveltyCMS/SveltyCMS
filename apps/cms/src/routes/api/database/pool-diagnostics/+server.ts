import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '@shared/utils/logger.server';

/**
 * Get database connection pool diagnostics
 * GET /api/database/pool-diagnostics
 *
 * Returns real-time connection pool statistics including:
 * - Total/active/idle connections
 * - Pool utilization percentage
 * - Waiting requests
 * - Health status (healthy/degraded/critical)
 * - Optimization recommendations
 *
 * Authorization: Requires admin role
 */
export const GET: RequestHandler = async ({ locals }) => {
	try {
		// Check authentication
		if (!locals.user) {
			throw svelteError(401, 'Authentication required');
		}

		// Check authorization - only admins can view pool diagnostics
		if (locals.user.role !== 'admin') {
			throw svelteError(403, 'Admin access required to view pool diagnostics');
		}

		// Get database adapter
		const { getDb } = await import('@shared/database/db');
		const db = getDb();

		if (!db) {
			throw svelteError(503, 'Database not initialized');
		}

		// Check if performance.getMetrics exists
		if (!db.performance || typeof db.performance.getMetrics !== 'function') {
			logger.warn('Pool diagnostics not available - method not implemented');
			throw svelteError(501, 'Pool diagnostics not implemented for this database adapter');
		}

		// Get pool diagnostics
		const metricsResult = await db.performance.getMetrics();

		if (!metricsResult.success) {
			throw svelteError(500, metricsResult.message || 'Failed to retrieve pool diagnostics');
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
		// Re-throw SvelteKit errors
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}

		logger.error('Error retrieving pool diagnostics', { error: err });
		throw svelteError(500, 'Failed to retrieve pool diagnostics');
	}
};
