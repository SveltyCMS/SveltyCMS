import { error, json } from '@sveltejs/kit';
import { l as logger } from '../../../../chunks/logger.server.js';
import { m as metricsService } from '../../../../chunks/MetricsService.js';
const GET = async ({ url, locals }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}
	if (!locals.isAdmin) {
		throw error(403, 'Admin privileges required to access metrics');
	}
	const format = url.searchParams.get('format') || 'json';
	try {
		if (format === 'prometheus') {
			const prometheusMetrics = metricsService.exportPrometheus();
			return new Response(prometheusMetrics, {
				status: 200,
				headers: {
					'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
					'Cache-Control': 'no-cache, no-store, must-revalidate'
				}
			});
		}
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
const POST = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Authentication required');
	}
	if (!locals.isAdmin) {
		throw error(403, 'Admin privileges required to reset metrics');
	}
	try {
		const body = await request.json();
		if (body?.action === 'reset') {
			metricsService.reset();
			return json({
				success: true,
				message: 'All metrics have been reset',
				resetAt: /* @__PURE__ */ new Date().toISOString()
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
export { GET, POST };
//# sourceMappingURL=_server.ts.js.map
