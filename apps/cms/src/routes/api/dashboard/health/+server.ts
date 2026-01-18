/**
 * GET /api/health
 *
 * Public health check endpoint for monitoring system status.
 * Provides detailed information about system state and individual service health.
 *
 * Useful for:
 * - Load balancers
 * - Monitoring systems (Datadog, New Relic, etc.)
 * - CI/CD pipelines
 * - Kubernetes readiness/liveness probes
 *
 * Response format:
 * {
 *   "overallStatus": "READY" | "INITIALIZING" | "DEGRADED" | "FAILED" | "IDLE",
 *   "timestamp": 1234567890,
 *   "uptime": 45000,
 *   "components": {
 *     "database": { "status": "healthy", "message": "...", "lastChecked": 1234567890 },
 *     "auth": { "status": "healthy", "message": "..." },
 *     ...
 *   }
 * }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getHealthCheckReport } from '@cms/stores/system';

export const GET: RequestHandler = async () => {
	try {
		const healthReport = getHealthCheckReport();

		// Map system state to HTTP status codes
		// READY/DEGRADED = 200 (service is operational)
		// INITIALIZING = 503 (service temporarily unavailable)
		// FAILED/IDLE = 503 (service unavailable)
		const statusCode = healthReport.overallStatus === 'READY' || healthReport.overallStatus === 'DEGRADED' ? 200 : 503;

		return json(healthReport, { status: statusCode });
	} catch (error) {
		// If health check itself fails, return minimal error response
		return json(
			{
				overallStatus: 'FAILED',
				timestamp: Date.now(),
				uptime: 0,
				components: {},
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 503 }
		);
	}
};
