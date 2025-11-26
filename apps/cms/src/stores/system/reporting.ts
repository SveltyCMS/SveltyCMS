/**
 * @file src/stores/system/reporting.ts
 * @description Reporting and analysis functions for system health and performance.
 */

import { getSystemState } from './state';
import { SERVICE_BASELINE_TIMES } from './config';

/**
 * Export comprehensive system state for health check endpoint with performance data
 */
export function getHealthCheckReport() {
	const state = getSystemState();
	const now = Date.now();

	return {
		overallStatus: state.overallState,
		timestamp: now,
		uptime: state.initializationStartedAt ? now - state.initializationStartedAt : 0,
		initializationTime:
			state.initializationCompletedAt && state.initializationStartedAt ? state.initializationCompletedAt - state.initializationStartedAt : undefined,
		components: Object.fromEntries(
			Object.entries(state.services).map(([name, service]) => [
				name,
				{
					status: service.status,
					message: service.message,
					lastChecked: service.lastChecked,
					error: service.error,
					performance: {
						initTime: service.metrics.initializationDuration,
						avgInitTime: service.metrics.averageInitTime,
						minInitTime: service.metrics.minInitTime,
						maxInitTime: service.metrics.maxInitTime,
						healthChecks: service.metrics.healthCheckCount,
						failures: service.metrics.failureCount,
						consecutiveFailures: service.metrics.consecutiveFailures,
						restarts: service.metrics.restartCount,
						uptimePercentage: service.metrics.uptimePercentage.toFixed(2) + '%',
						reliability:
							service.metrics.healthCheckCount > 0
								? (((service.metrics.healthCheckCount - service.metrics.failureCount) / service.metrics.healthCheckCount) * 100).toFixed(1) + '%'
								: 'N/A',
						stateTimings: {
							startup: {
								count: service.metrics.stateTimings.startup.count,
								avgTime: service.metrics.stateTimings.startup.avgTime,
								minTime: service.metrics.stateTimings.startup.minTime,
								maxTime: service.metrics.stateTimings.startup.maxTime,
								lastTime: service.metrics.stateTimings.startup.lastTime,
								trend: service.metrics.stateTimings.startup.trend
							},
							shutdown: {
								count: service.metrics.stateTimings.shutdown.count,
								avgTime: service.metrics.stateTimings.shutdown.avgTime,
								trend: service.metrics.stateTimings.shutdown.trend
							},
							idle: {
								count: service.metrics.stateTimings.idle.count,
								totalTime: service.metrics.stateTimings.idle.totalTime
							},
							active: {
								count: service.metrics.stateTimings.active.count,
								totalTime: service.metrics.stateTimings.active.totalTime
							}
						},
						thresholds: {
							maxStartupTime: service.metrics.anomalyThresholds.maxStartupTime,
							maxShutdownTime: service.metrics.anomalyThresholds.maxShutdownTime,
							calibrationCount: service.metrics.anomalyThresholds.calibrationCount
						}
					}
				}
			])
		),
		systemPerformance: {
			totalInits: state.performanceMetrics.totalInitializations,
			successfulInits: state.performanceMetrics.successfulInitializations,
			failedInits: state.performanceMetrics.failedInitializations,
			successRate:
				state.performanceMetrics.totalInitializations > 0
					? ((state.performanceMetrics.successfulInitializations / state.performanceMetrics.totalInitializations) * 100).toFixed(1) + '%'
					: 'N/A',
			avgInitTime: state.performanceMetrics.averageTotalInitTime,
			minInitTime: state.performanceMetrics.minTotalInitTime,
			maxInitTime: state.performanceMetrics.maxTotalInitTime,
			lastInitTime: state.performanceMetrics.lastInitDuration
		}
	};
}

/**
 * Get performance summary for analysis and optimization
 */
export function getPerformanceSummary() {
	const state = getSystemState();

	return {
		services: Object.entries(state.services).map(([name, service]) => ({
			name,
			avgInitTime: service.metrics.averageInitTime,
			minInitTime: service.metrics.minInitTime,
			maxInitTime: service.metrics.maxInitTime,
			variance: service.metrics.maxInitTime && service.metrics.minInitTime ? service.metrics.maxInitTime - service.metrics.minInitTime : 0,
			reliability:
				service.metrics.healthCheckCount > 0
					? (service.metrics.healthCheckCount - service.metrics.failureCount) / service.metrics.healthCheckCount
					: 1,
			failures: service.metrics.failureCount,
			consecutiveFailures: service.metrics.consecutiveFailures,
			restarts: service.metrics.restartCount,
			uptimePercentage: service.metrics.uptimePercentage,
			stateTimings: service.metrics.stateTimings,
			anomalyThresholds: service.metrics.anomalyThresholds
		})),
		system: {
			totalInitTime: state.performanceMetrics.averageTotalInitTime,
			successRate:
				state.performanceMetrics.totalInitializations > 0
					? state.performanceMetrics.successfulInitializations / state.performanceMetrics.totalInitializations
					: 1,
			recentTransitions: state.performanceMetrics.stateTransitions.slice(-10)
		}
	};
}

/**
 * Identify performance bottlenecks
 */
export function identifyBottlenecks() {
	const state = getSystemState();
	const bottlenecks: Array<{
		service: string;
		issue: string;
		severity: 'low' | 'medium' | 'high';
		details: string;
	}> = [];

	Object.entries(state.services).forEach(([name, service]) => {
		const baseline = SERVICE_BASELINE_TIMES[name as keyof typeof SERVICE_BASELINE_TIMES];

		// Check if service is taking too long
		if (service.metrics.averageInitTime && service.metrics.averageInitTime > baseline * 2) {
			bottlenecks.push({
				service: name,
				issue: 'Slow initialization',
				severity: service.metrics.averageInitTime > baseline * 4 ? 'high' : 'medium',
				details: `Average: ${service.metrics.averageInitTime.toFixed(0)}ms, Expected: ~${baseline}ms`
			});
		}

		// Check for high variance (inconsistent performance)
		if (service.metrics.minInitTime && service.metrics.maxInitTime) {
			const variance = service.metrics.maxInitTime - service.metrics.minInitTime;
			if (variance > baseline * 3) {
				bottlenecks.push({
					service: name,
					issue: 'Inconsistent performance',
					severity: 'medium',
					details: `Variance: ${variance.toFixed(0)}ms (${service.metrics.minInitTime.toFixed(0)}-${service.metrics.maxInitTime.toFixed(0)}ms)`
				});
			}
		}

		// Check for frequent failures
		if (service.metrics.failureCount > 2) {
			bottlenecks.push({
				service: name,
				issue: 'Frequent failures',
				severity: service.metrics.failureCount > 5 ? 'high' : 'low',
				details: `${service.metrics.failureCount} failures out of ${service.metrics.healthCheckCount} checks`
			});
		}

		// Check for frequent restarts
		if (service.metrics.restartCount > 3) {
			bottlenecks.push({
				service: name,
				issue: 'Frequent restarts',
				severity: 'medium',
				details: `Restarted ${service.metrics.restartCount} times`
			});
		}
	});

	return bottlenecks.sort((a, b) => {
		const severityWeight = { high: 3, medium: 2, low: 1 };
		return severityWeight[b.severity] - severityWeight[a.severity];
	});
}

/**
 * Get recommended timeout values based on performance history
 */
export function getRecommendedTimeouts() {
	const state = getSystemState();

	return Object.fromEntries(
		Object.entries(state.services).map(([name, service]) => {
			const baseline = SERVICE_BASELINE_TIMES[name as keyof typeof SERVICE_BASELINE_TIMES];
			const recommended = service.metrics.averageInitTime ? Math.ceil(service.metrics.averageInitTime * 3) : baseline * 3;

			return [
				name,
				{
					recommended,
					baseline,
					current: service.metrics.averageInitTime || baseline,
					confidence: service.metrics.healthCheckCount > 5 ? 'high' : service.metrics.healthCheckCount > 2 ? 'medium' : 'low'
				}
			];
		})
	);
}
