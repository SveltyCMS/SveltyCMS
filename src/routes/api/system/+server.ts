/**
 * @file src/routes/api/system/+server.ts
 * @description System Management API - unified database-agnostic endpoint for system operations
 * @summary All system management goes through this single endpoint with action-based routing
 *  - GET: health - Get current system health status
 *  - POST: reinitialize - Reinitialize system services
 *  - POST: restart-service - Restart specific service
 *  - GET: metrics - Get system metrics (future)
 *  - POST: backup - Trigger system backup (future)
 */

import { json, error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getHealthCheckReport } from '@src/stores/system/reporting';
import { reinitializeSystem } from '@src/databases/db';
import { logger } from '@utils/logger.server';

/**
 * GET /api/system?action=health
 * Public health check endpoint for monitoring system status
 */
export const GET: RequestHandler = async ({ url, locals }) => {
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
					throw svelteError(403, 'Admin access required');
				}

				return json({
					message: 'Metrics endpoint - coming soon',
					availableMetrics: ['service uptime', 'failure count history', 'performance metrics', 'request latency', 'error rates']
				});
			}

			default:
				throw svelteError(400, `Unknown action: ${action}`);
		}
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err; // Re-throw SvelteKit errors
		}

		logger.error('System GET request failed', { action, error: err });
		return json(
			{
				error: err instanceof Error ? err.message : 'Unknown error',
				action
			},
			{ status: 500 }
		);
	}
};

/**
 * POST /api/system
 * Admin-only system management operations
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		// Authentication check
		if (!locals.user) {
			throw svelteError(401, 'Authentication required');
		}

		// Authorization check - require admin role
		if (locals.user.role !== 'admin' && locals.user.role !== 'superadmin') {
			throw svelteError(403, 'Admin access required');
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
					logger.info('System reinitialized successfully', { userId: locals.user._id });
					return json({
						success: true,
						status: result.status,
						message: 'System reinitialized successfully'
					});
				} else {
					logger.error('System reinitialization failed', {
						result,
						userId: locals.user._id
					});
					return json(
						{
							success: false,
							status: result.status,
							error: result.error || 'Unknown error'
						},
						{ status: 500 }
					);
				}
			}

			case 'restart-service': {
				// Future: Restart specific service
				const serviceName = params.service;

				if (!serviceName) {
					throw svelteError(400, 'Service name required');
				}

				// Validate service name
				const validServices = ['database', 'auth', 'cache', 'contentManager', 'themeManager'];
				if (!validServices.includes(serviceName)) {
					throw svelteError(400, `Invalid service name. Valid services: ${validServices.join(', ')}`);
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
				throw svelteError(400, `Unknown action: ${action}`);
		}
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err; // Re-throw SvelteKit errors
		}

		logger.error('System POST request failed', { error: err });
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
