import { error, json } from '@sveltejs/kit';
import '../../../../chunks/state.js';
import '../../../../chunks/logger.js';
import { g as getHealthCheckReport } from '../../../../chunks/reporting.js';
import { r as reinitializeSystem } from '../../../../chunks/db.js';
import { l as logger } from '../../../../chunks/logger.server.js';
const GET = async ({ url, locals }) => {
	const action = url.searchParams.get('action') || 'health';
	try {
		switch (action) {
			case 'health': {
				const healthReport = getHealthCheckReport();
				const statusCode = healthReport.overallStatus === 'READY' || healthReport.overallStatus === 'DEGRADED' ? 200 : 503;
				return json(healthReport, { status: statusCode });
			}
			case 'metrics': {
				if (!locals.user || (locals.user.role !== 'admin' && locals.user.role !== 'superadmin')) {
					throw error(403, 'Admin access required');
				}
				return json({
					message: 'Metrics endpoint - coming soon',
					availableMetrics: ['service uptime', 'failure count history', 'performance metrics', 'request latency', 'error rates']
				});
			}
			default:
				throw error(400, `Unknown action: ${action}`);
		}
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
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
const POST = async ({ request, locals }) => {
	try {
		if (!locals.user) {
			throw error(401, 'Authentication required');
		}
		if (locals.user.role !== 'admin' && locals.user.role !== 'superadmin') {
			throw error(403, 'Admin access required');
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
				const serviceName = params.service;
				if (!serviceName) {
					throw error(400, 'Service name required');
				}
				const validServices = ['database', 'auth', 'cache', 'contentManager', 'themeManager'];
				if (!validServices.includes(serviceName)) {
					throw error(400, `Invalid service name. Valid services: ${validServices.join(', ')}`);
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
				);
			}
			case 'backup': {
				logger.info('System backup requested', { userId: locals.user._id });
				return json(
					{
						success: false,
						message: 'Backup endpoint - coming soon',
						note: 'Will trigger database backup and export system configuration'
					},
					{ status: 501 }
				);
			}
			case 'clear-cache': {
				logger.info('Cache clear requested', { userId: locals.user._id });
				return json(
					{
						success: false,
						message: 'Cache clear endpoint - coming soon',
						note: 'Will clear session cache, content cache, and other caches'
					},
					{ status: 501 }
				);
			}
			default:
				throw error(400, `Unknown action: ${action}`);
		}
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
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
export { GET, POST };
//# sourceMappingURL=_server.ts.js.map
