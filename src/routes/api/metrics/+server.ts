/**
 * @file src/routes/api/metrics/+server.ts
 * @description Unified metrics API endpoint for monitoring and observability
 *
 * ### Features
 * - Comprehensive system metrics from unifiedmetrics-service * - Prometheus-compatible format support
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

// Services
import { metricsService } from '@src/services/metrics-service';
import { json } from '@sveltejs/kit';
/**
 * GET /api/metrics
 * Returns comprehensive system metrics
 */
// Unified Error Handling
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';

/**
 * GET /api/metrics
 * Returns comprehensive system metrics
 */
export const GET = apiHandler(async ({ url, locals }) => {
	// Check authentication
	if (!locals.user) {
		throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
	}

	// Check admin permissions for metrics access
	if (!locals.isAdmin) {
		throw new AppError('Admin privileges required to access metrics', 403, 'FORBIDDEN');
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
		throw new AppError('Failed to retrieve metrics', 500, 'METRICS_ERROR');
	}
});

/**
 * POST /api/metrics/reset
 * Resets all metrics counters (admin only)
 */
export const POST = apiHandler(async ({ locals, request }) => {
	// Check authentication
	if (!locals.user) {
		throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
	}

	// Check admin permissions
	if (!locals.isAdmin) {
		throw new AppError('Admin privileges required to reset metrics', 403, 'FORBIDDEN');
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

		throw new AppError('Invalid action. Use {"action": "reset"} to reset metrics.', 400, 'INVALID_ACTION');
	} catch (err) {
		if (err instanceof AppError) {
			throw err;
		}
		if (err instanceof Error && err.message.includes('Invalid action')) {
			throw new AppError(err.message, 400, 'INVALID_ACTION');
		}

		logger.error('Error resetting metrics:', err);
		throw new AppError('Failed to reset metrics', 500, 'METRICS_RESET_ERROR');
	}
});
