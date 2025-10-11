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
import { getHealthCheckReport } from '$stores/systemState';

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
					? 503
					: healthReport.overallStatus === 'FAILED'
						? 503
						: healthReport.overallStatus === 'INITIALIZING'
							? 503
							: 503;

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
