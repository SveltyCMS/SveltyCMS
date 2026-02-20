/** @file src/routes/api/system/+server.ts @description System Management API - unified database-agnostic endpoint for system operations features: [health monitoring, reinitialization, service restart, backup trigger, cache clearing] */

import { reinitializeSystem } from '@src/databases/db';
// System Utilities
import { getHealthCheckReport } from '@src/stores/system/reporting';
import { json } from '@sveltejs/kit';
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';

// Logging
import { logger } from '@utils/logger.server';

/**
 * GET /api/system?action=health
 * Public health check endpoint for monitoring system status
 */
export const GET = apiHandler(async ({ url, locals }) => {
	const action = url.searchParams.get('action') || 'health';

	try {
		switch (action) {
			case 'health': {
				const healthReport = getHealthCheckReport();

				// Map system state to HTTP status codes
				const statusCode = healthReport.overallStatus === 'READY' || healthReport.overallStatus === 'DEGRADED' ? 200 : 503;

				return json(healthReport, { status: statusCode });
			}

			case 'metrics': {
				// Future: Return detailed metrics
				if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'superadmin')) {
					throw new AppError('Admin access required', 403, 'FORBIDDEN');
				}

				return json({
					message: 'Metrics endpoint - coming soon',
					availableMetrics: ['service uptime', 'failure count history', 'performance metrics', 'request latency', 'error rates']
				});
			}

			default:
				throw new AppError(`Unknown action: ${action}`, 400, 'INVALID_ACTION');
		}
	} catch (err) {
		if (err instanceof AppError) {
			throw err;
		}
		if (err && typeof err === 'object' && 'status' in err) {
			throw err; // Re-throw SvelteKit errors if any remain
		}

		logger.error('System GET request failed', { action, error: err });
		throw new AppError(err instanceof Error ? err.message : 'Unknown error', 500, 'SYSTEM_ERROR');
	}
});

/**
 * POST /api/system
 * Admin-only system management operations
 */
export const POST = apiHandler(async ({ request, locals }) => {
	// Authentication check
	if (!locals.user) {
		throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
	}

	// Authorization check - require admin role
	if (locals.user.role !== 'admin' && locals.user.role !== 'superadmin') {
		throw new AppError('Admin access required', 403, 'FORBIDDEN');
	}

	const body = await request.json();
	const { action, ...params } = body;

	logger.info('System management action requested', {
		action,
		userId: locals.user._id,
		userEmail: locals.user.email,
		params
	});

	switch (action) {
		case 'reinitialize': {
			const force = params.force ?? true;
			const result = await reinitializeSystem(force);

			if (result.status === 'initialized') {
				logger.info('System reinitialized successfully', {
					userId: locals.user._id
				});
				return json({
					success: true,
					status: result.status,
					message: 'System reinitialized successfully'
				});
			}
			logger.error('System reinitialization failed', {
				result,
				userId: locals.user._id
			});
			// Return failure JSON but still 200/500? Use AppError for failure?
			// The original code returned 500 JSON.
			throw new AppError(result.error || 'Unknown error', 500, 'REINIT_FAILED');
		}

		case 'restart-service': {
			// Future: Restart specific service
			const serviceName = params.service;

			if (!serviceName) {
				throw new AppError('Service name required', 400, 'MISSING_SERVICE');
			}

			// Validate service name
			const validServices = ['database', 'auth', 'cache', 'contentManager', 'themeManager'];
			if (!validServices.includes(serviceName)) {
				throw new AppError(`Invalid service name. Valid services: ${validServices.join(', ')}`, 400, 'INVALID_SERVICE');
			}

			logger.info('Service restart requested', {
				service: serviceName,
				userId: locals.user._id
			});

			return json(
				{
					success: false,
					message: 'Service-specific restart not yet implemented',
					service: serviceName,
					note: 'Use "reinitialize" action to restart all services'
				},
				{ status: 501 }
			); // Not Implemented
		}

		case 'backup': {
			// Future: Trigger system backup
			logger.info('System backup requested', { userId: locals.user._id });

			return json(
				{
					success: false,
					message: 'Backup endpoint - coming soon',
					note: 'Will trigger database backup and export system configuration'
				},
				{ status: 501 }
			); // Not Implemented
		}

		case 'clear-cache': {
			// Future: Clear system caches
			logger.info('Cache clear requested', { userId: locals.user._id });

			return json(
				{
					success: false,
					message: 'Cache clear endpoint - coming soon',
					note: 'Will clear session cache, content cache, and other caches'
				},
				{ status: 501 }
			); // Not Implemented
		}

		default:
			throw new AppError(`Unknown action: ${action}`, 400, 'INVALID_ACTION');
	}
});
