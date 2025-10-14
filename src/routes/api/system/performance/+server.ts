/**
 * @file src/routes/api/system/performance/+server.ts
 * @description Public performance metrics endpoint
 * @summary
 *  - Returns detailed performance metrics and analysis
 *  - Identifies bottlenecks and anomalies
 *  - Provides recommended timeout settings
 *  - No authentication required
 *  - Catches and reports errors gracefully
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPerformanceSummary, identifyBottlenecks, getRecommendedTimeouts, detectAnomalies, getSystemState } from '@src/stores/system';

/**
 * GET /api/system/performance
 * Returns detailed performance metrics and analysis
 */
export const GET: RequestHandler = async () => {
	try {
		const summary = getPerformanceSummary();
		const bottlenecks = identifyBottlenecks();
		const timeouts = getRecommendedTimeouts();

		// Detect anomalies for all services
		const state = getSystemState();
		const anomalies = Object.keys(state.services).flatMap((serviceName) => detectAnomalies(serviceName as keyof typeof state.services));

		return json({
			success: true,
			data: {
				summary,
				bottlenecks,
				anomalies,
				recommendedTimeouts: timeouts,
				analysis: {
					overallHealth:
						bottlenecks.filter((b) => b.severity === 'high').length === 0 &&
						anomalies.filter((a) => a.severity === 'critical' || a.severity === 'high').length === 0
							? 'good'
							: 'needs attention',
					slowestService: summary.services.reduce((prev, curr) => ((curr.avgInitTime || 0) > (prev.avgInitTime || 0) ? curr : prev)).name,
					mostReliableService: summary.services.reduce((prev, curr) => (curr.reliability > prev.reliability ? curr : prev)).name,
					totalBottlenecks: bottlenecks.length,
					totalAnomalies: anomalies.length,
					criticalAnomalies: anomalies.filter((a) => a.severity === 'critical').length
				}
			}
		});
	} catch (error) {
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Failed to generate performance report'
			},
			{ status: 500 }
		);
	}
};
