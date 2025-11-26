/**
 * @file src/routes/api/metrics/+server.ts
 * @description Unified metrics API endpoint for monitoring and observability
 *
 * ### Features
 * - Comprehensive system metrics from unified MetricsService
 * - Prometheus-compatible format support
 * - Admin-only access with proper authorization
 * - Multiple output formats (JSON, Prometheus)
 * - Real-time performance data
 *
 * ### Endpoints
 * - `GET /api/metrics` - JSON format metrics
 * - `GET /api/metrics?format=prometheus` - Prometheus format
 * - `POST /api/metrics/reset` - Reset metrics (admin only)
 *
 * @monitoring Provides enterprise-grade metrics for system monitoring
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import { metricsService } from '@src/services/MetricsService';
import { error } from '@sveltejs/kit';

/**
 * GET /api/metrics
 * Returns comprehensive system metrics
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	// Check admin permissions for metrics access
	if (!locals.isAdmin) {
		throw error(403, 'Admin privileges required to access metrics');
	}

	const format = url.searchParams.get('format') || 'json';

	try {
		if (format === 'prometheus') {
			// Return Prometheus-formatted metrics
			const prometheusMetrics = metricsService.exportPrometheus();

			return new Response(prometheusMetrics, {
				status: 200,
				headers: {
					'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
					'Cache-Control': 'no-cache, no-store, must-revalidate'
				}
			});
		}

		// Default: Return JSON metrics
		const report = metricsService.getReport();

		return json(report, {
			headers: {
				'Cache-Control': 'no-cache, no-store, must-revalidate'
			}
		});
	} catch (err) {
		logger.error('Error retrieving metrics:', err);
		throw error(500, 'Failed to retrieve metrics');
	}
};

/**
 * POST /api/metrics/reset
 * Resets all metrics counters (admin only)
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	// Check authentication
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}

	// Check admin permissions
	if (!locals.isAdmin) {
		throw error(403, 'Admin privileges required to reset metrics');
	}

	try {
		const body = await request.json();

		// Optional: Allow resetting specific metric categories
		if (body?.action === 'reset') {
			metricsService.reset();

			return json({
				success: true,
				message: 'All metrics have been reset',
				resetAt: new Date().toISOString()
			});
		}

		throw error(400, 'Invalid action. Use {"action": "reset"} to reset metrics.');
	} catch (err) {
		if (err instanceof Error && err.message.includes('Invalid action')) {
			throw err;
		}

		logger.error('Error resetting metrics:', err);
		throw error(500, 'Failed to reset metrics');
	}
};
