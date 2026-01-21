/**
 * @file src/routes/api/system/health/+server.ts
 * @description Public health check endpoint
 * @summary
 *  - Returns system health status with performance metrics
 *  - Maps overall status to HTTP status codes
 *  - Catches and reports errors gracefully
 *  - No authentication required
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getHealthCheckReport } from '@src/stores/system/reporting';

/**
 * GET /api/system/health
 * Returns system health status with performance metrics
 */
export const GET: RequestHandler = async () => {
	try {
		const healthReport = getHealthCheckReport();

		const httpStatus =
			healthReport.overallStatus === 'READY'
				? 200
				: healthReport.overallStatus === 'DEGRADED'
					? 200 // Degraded is still operational, so return 200 OK
					: 503; // FAILED, INITIALIZING, or IDLE are 503 Service Unavailable

		return json(
			{
				success: healthReport.overallStatus === 'READY',
				...healthReport
			},
			{ status: httpStatus }
		);
	} catch (error) {
		return json(
			{
				success: false,
				overallStatus: 'FAILED',
				error: error instanceof Error ? error.message : 'Health check failed',
				timestamp: Date.now()
			},
			{ status: 500 }
		);
	}
};
