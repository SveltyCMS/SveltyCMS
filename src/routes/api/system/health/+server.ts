/** @file src/routes/api/system/health/+server.ts @description Public health check endpoint features: [performance metrics, HTTP status mapping, error reporting, test mode support] */

import { getHealthCheckReport } from '@src/stores/system/reporting';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET /api/system/health
 * Returns system health status with performance metrics
 */
export const GET: RequestHandler = async () => {
	try {
		const healthReport = getHealthCheckReport();

		// Operational states that indicate the server is running and accepting requests
		const operationalStates = ['READY', 'DEGRADED', 'SETUP', 'WARMING', 'WARMED'];

		// In TEST_MODE, we must allow the runner to connect even if the DB is empty (SETUP state or FAILED)
		// This enables the runner to reach /api/testing to seed the database
		const isTestMode = process.env.TEST_MODE === 'true';
		const isOperational = operationalStates.includes(healthReport.overallStatus) || isTestMode;

		const httpStatus = isOperational ? 200 : 503; // Only 503 for FAILED, INITIALIZING, or IDLE

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
