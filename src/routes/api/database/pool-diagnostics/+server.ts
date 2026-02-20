import { json } from '@sveltejs/kit';
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
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';

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
export const GET = apiHandler(async ({ locals }) => {
	// Check authentication
	if (!locals.user) {
		throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
	}

	// Check authorization - only admins can view pool diagnostics
	if (locals.user.role !== 'admin') {
		throw new AppError('Admin access required to view pool diagnostics', 403, 'FORBIDDEN');
	}

	// Get database adapter
	const { getDb } = await import('@databases/db');
	const db = getDb();

	if (!db) {
		throw new AppError('Database not initialized', 503, 'DB_NOT_INITIALIZED');
	}

	// Check if performance.getMetrics exists
	if (!db.performance || typeof db.performance.getMetrics !== 'function') {
		logger.warn('Pool diagnostics not available - method not implemented');
		throw new AppError('Pool diagnostics not implemented for this database adapter', 501, 'NOT_IMPLEMENTED');
	}

	// Get pool diagnostics
	const metricsResult = await db.performance.getMetrics();

	if (!metricsResult.success) {
		throw new AppError(metricsResult.message || 'Failed to retrieve pool diagnostics', 500, 'METRICS_ERROR');
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
});
