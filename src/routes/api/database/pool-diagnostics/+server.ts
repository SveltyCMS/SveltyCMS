import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import logger from '@utils/logger.server';

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
		const { db } = await import('@databases/db');

		if (!db) {
			throw svelteError(503, 'Database not initialized');
		}

		// Check if performance.getPoolDiagnostics exists
		if (!db.performance || typeof db.performance.getPoolDiagnostics !== 'function') {
			logger.warn('Pool diagnostics not available - method not implemented');
			throw svelteError(501, 'Pool diagnostics not implemented for this database adapter');
		}

		// Get pool diagnostics
		const result = await db.performance.getPoolDiagnostics();

		if (!result.success) {
			throw svelteError(500, result.message || 'Failed to retrieve pool diagnostics');
		}

		logger.debug('Pool diagnostics retrieved', {
			user: locals.user.email,
			utilization: result.data?.poolUtilization,
			healthStatus: result.data?.healthStatus
		});

		return json({
			success: true,
			data: result.data
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
