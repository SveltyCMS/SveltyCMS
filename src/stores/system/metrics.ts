/**
 * @file src/stores/system/metrics.ts
 * @description Performance metrics, anomaly detection, and reporting for the system state.
 *
 * Features:
 * - Track state timing (startup/shutdown) and update metrics
 * - Self-calibrate anomaly thresholds based on historical performance
 * - Detect anomalies and notify if something is wrong
 * - Load historical metrics from the database
 * - Save current metrics to the database
 * - Record a specific benchmark (e.g. for a setup phase)
 */

import { logger } from '@utils/logger';
import type { Writable } from 'svelte/store';
import type { AnomalyDetection, ServiceHealth, ServiceName, SystemStateStore } from './types';

/**
 * Track state timing (startup/shutdown) and update metrics
 */
export function trackStateTransition(
	serviceName: keyof SystemStateStore['services'],
	fromState: ServiceHealth,
	toState: ServiceHealth,
	duration: number,
	store: Writable<SystemStateStore>
): void {
	store.update((current) => {
		const service = { ...current.services[serviceName] };
		const stateTimings = { ...service.metrics.stateTimings };

		// Track startup (initializing → healthy)
		if (fromState === 'initializing' && toState === 'healthy') {
			const startup = { ...stateTimings.startup };
			startup.count++;
			startup.lastTime = duration;

			// Update statistics
			if (startup.avgTime) {
				const prevAvg = startup.avgTime;
				startup.avgTime = (startup.avgTime * (startup.count - 1) + duration) / startup.count;
				startup.minTime = Math.min(startup.minTime ?? duration, duration);
				startup.maxTime = Math.max(startup.maxTime ?? duration, duration);

				// Determine trend (comparing to previous average)
				if (duration < prevAvg * 0.9) {
					startup.trend = 'improving';
				} else if (duration > prevAvg * 1.1) {
					startup.trend = 'degrading';
				} else {
					startup.trend = 'stable';
				}
			} else {
				startup.avgTime = duration;
				startup.minTime = duration;
				startup.maxTime = duration;
			}

			stateTimings.startup = startup;
		}

		// Track shutdown (healthy → unhealthy or healthy → idle)
		if (fromState === 'healthy' && (toState === 'unhealthy' || toState === 'initializing')) {
			const shutdown = { ...stateTimings.shutdown };
			shutdown.count++;
			shutdown.lastTime = duration;

			if (shutdown.avgTime) {
				const prevAvg = shutdown.avgTime;
				shutdown.avgTime = (shutdown.avgTime * (shutdown.count - 1) + duration) / shutdown.count;
				shutdown.minTime = Math.min(shutdown.minTime ?? duration, duration);
				shutdown.maxTime = Math.max(shutdown.maxTime ?? duration, duration);

				// Determine trend
				if (duration < prevAvg * 0.9) {
					shutdown.trend = 'improving';
				} else if (duration > prevAvg * 1.1) {
					shutdown.trend = 'degrading';
				} else {
					shutdown.trend = 'stable';
				}
			} else {
				shutdown.avgTime = duration;
				shutdown.minTime = duration;
				shutdown.maxTime = duration;
			}

			stateTimings.shutdown = shutdown;
		}

		service.metrics.stateTimings = stateTimings;

		return {
			...current,
			services: {
				...current.services,
				[serviceName]: service
			}
		};
	});
}

/**
 * Self-calibrate anomaly thresholds based on historical performance
 */
export function calibrateAnomalyThresholds(serviceName: keyof SystemStateStore['services'], store: Writable<SystemStateStore>): void {
	store.update((current) => {
		const service = { ...current.services[serviceName] };
		const metrics = service.metrics;
		const thresholds = { ...metrics.anomalyThresholds };

		// Only calibrate if we have enough data (at least 5 startups)
		if (metrics.stateTimings.startup.count < 5) {
			logger.debug(`Skipping calibration for ${String(serviceName)} - insufficient data (${metrics.stateTimings.startup.count} startups)`);
			return current;
		}

		// Calibrate startup threshold (use 3x average or 1.5x max, whichever is larger)
		if (metrics.stateTimings.startup.avgTime && metrics.stateTimings.startup.maxTime) {
			const avgBased = metrics.stateTimings.startup.avgTime * 3;
			const maxBased = metrics.stateTimings.startup.maxTime * 1.5;
			thresholds.maxStartupTime = Math.max(avgBased, maxBased);
		}

		// Calibrate shutdown threshold
		if (metrics.stateTimings.shutdown.avgTime && metrics.stateTimings.shutdown.maxTime) {
			const avgBased = metrics.stateTimings.shutdown.avgTime * 3;
			const maxBased = metrics.stateTimings.shutdown.maxTime * 1.5;
			thresholds.maxShutdownTime = Math.max(avgBased, maxBased);
		}

		// Calibrate failure threshold based on reliability
		if (metrics.uptimePercentage > 99) {
			thresholds.maxConsecutiveFailures = 2; // Stricter for highly reliable services
		} else if (metrics.uptimePercentage > 95) {
			thresholds.maxConsecutiveFailures = 3;
		} else {
			thresholds.maxConsecutiveFailures = 5; // More lenient for less reliable services
		}

		// Adjust uptime threshold based on historical performance
		const actualUptime = metrics.uptimePercentage;
		if (actualUptime > 99) {
			thresholds.minUptimePercentage = 98; // Expect high reliability to continue
		} else if (actualUptime > 95) {
			thresholds.minUptimePercentage = 90; // More realistic expectations
		} else {
			thresholds.minUptimePercentage = 80; // Lower bar for struggling services
		}

		thresholds.lastCalibrated = Date.now();
		thresholds.calibrationCount++;

		service.metrics.anomalyThresholds = thresholds;

		logger.info(`🎯 Calibrated anomaly thresholds for ${String(serviceName)}`, {
			maxStartup: `${thresholds.maxStartupTime.toFixed(0)}ms`,
			maxShutdown: `${thresholds.maxShutdownTime.toFixed(0)}ms`,
			maxFailures: thresholds.maxConsecutiveFailures,
			minUptime: `${thresholds.minUptimePercentage}%`,
			calibrationCount: thresholds.calibrationCount
		});

		return {
			...current,
			services: {
				...current.services,
				[serviceName]: service
			}
		};
	});
}

/**
 * Detect anomalies and notify if something is wrong
 */
export function detectAnomalies(serviceName: keyof SystemStateStore['services'], state: SystemStateStore): AnomalyDetection[] {
	const service = state.services[serviceName];
	const metrics = service.metrics;
	const thresholds = metrics.anomalyThresholds;
	const anomalies: AnomalyDetection[] = [];

	// Check startup time
	if (metrics.stateTimings.startup.lastTime && metrics.stateTimings.startup.lastTime > thresholds.maxStartupTime) {
		const excessPercent = (metrics.stateTimings.startup.lastTime / thresholds.maxStartupTime - 1) * 100;
		anomalies.push({
			type: 'slow_startup',
			severity: excessPercent > 100 ? 'critical' : excessPercent > 50 ? 'high' : 'medium',
			message: `Service ${String(serviceName)} startup is slower than expected`,
			details: {
				actual: `${metrics.stateTimings.startup.lastTime.toFixed(0)}ms`,
				threshold: `${thresholds.maxStartupTime.toFixed(0)}ms`,
				excess: `${excessPercent.toFixed(0)}%`
			}
		});
	}

	// Check shutdown time
	if (metrics.stateTimings.shutdown.lastTime && metrics.stateTimings.shutdown.lastTime > thresholds.maxShutdownTime) {
		anomalies.push({
			type: 'slow_shutdown',
			severity: 'medium',
			message: `Service ${String(serviceName)} shutdown is slower than expected`,
			details: {
				actual: `${metrics.stateTimings.shutdown.lastTime.toFixed(0)}ms`,
				threshold: `${thresholds.maxShutdownTime.toFixed(0)}ms`
			}
		});
	}

	// Check consecutive failures
	if (metrics.consecutiveFailures >= thresholds.maxConsecutiveFailures) {
		anomalies.push({
			type: 'consecutive_failures',
			severity: metrics.consecutiveFailures >= thresholds.maxConsecutiveFailures * 2 ? 'critical' : 'high',
			message: `Service ${String(serviceName)} has ${metrics.consecutiveFailures} consecutive failures`,
			details: {
				failures: metrics.consecutiveFailures,
				threshold: thresholds.maxConsecutiveFailures.toString()
			}
		});
	}

	// Check uptime percentage
	if (metrics.uptimePercentage < thresholds.minUptimePercentage) {
		anomalies.push({
			type: 'low_uptime',
			severity: metrics.uptimePercentage < thresholds.minUptimePercentage * 0.8 ? 'high' : 'medium',
			message: `Service ${String(serviceName)} uptime is below threshold`,
			details: {
				uptime: `${metrics.uptimePercentage.toFixed(1)}%`,
				threshold: `${thresholds.minUptimePercentage}%`
			}
		});
	}

	// Check performance trend
	if (metrics.stateTimings.startup.trend === 'degrading' && metrics.stateTimings.startup.count > 10) {
		anomalies.push({
			type: 'degrading_performance',
			severity: 'medium',
			message: `Service ${String(serviceName)} performance is degrading over time`,
			details: {
				trend: metrics.stateTimings.startup.trend,
				avgTime: `${metrics.stateTimings.startup.avgTime?.toFixed(0)}ms`,
				lastTime: `${metrics.stateTimings.startup.lastTime?.toFixed(0)}ms`
			}
		});
	}

	// Log anomalies
	if (anomalies.length > 0) {
		anomalies.forEach((anomaly) => {
			if (anomaly.severity === 'critical' || anomaly.severity === 'high') {
				logger.error(`🚨 ${anomaly.message}`, anomaly.details);
			} else {
				logger.warn(`⚠️ ${anomaly.message}`, anomaly.details);
			}
		});
	}

	return anomalies;
}

/**
 * Update uptime percentage based on health checks
 */
export function updateUptimeMetrics(serviceName: ServiceName, store: Writable<SystemStateStore>): void {
	store.update((current) => {
		const service = { ...current.services[serviceName] };
		const metrics = service.metrics;

		// Calculate uptime percentage
		if (metrics.healthCheckCount > 0) {
			const healthyChecks = metrics.healthCheckCount - metrics.failureCount;
			metrics.uptimePercentage = (healthyChecks / metrics.healthCheckCount) * 100;
		}

		service.metrics = metrics;

		return {
			...current,
			services: {
				...current.services,
				[serviceName]: service
			}
		};
	});
}

/**
 * Load historical metrics from the database and hydrate the store.
 * This is the "Learning" part of the state machine.
 */
export async function loadHistoricalMetrics(store: Writable<SystemStateStore>): Promise<void> {
	try {
		const { performanceService } = await import('@src/services/PerformanceService');
		const historicalMetrics = await performanceService.loadMetrics();
		if (Object.keys(historicalMetrics).length === 0) {
			return;
		}

		store.update((current) => {
			const services = { ...current.services };
			for (const [name, metrics] of Object.entries(historicalMetrics)) {
				if (services[name as ServiceName]) {
					// Merge historical data, favoring more established trends
					services[name as ServiceName].metrics = {
						...services[name as ServiceName].metrics,
						...metrics,
						// Reset volatile session-specific fields
						initializationStartedAt: undefined,
						initializationCompletedAt: undefined,
						initializationDuration: undefined,
						consecutiveFailures: 0,
						lastHealthCheckAt: undefined
					};
				}
			}
			logger.info(`🧠 Hydrated system state with historical metrics for ${Object.keys(historicalMetrics).length} services`);
			return { ...current, services };
		});
	} catch (error) {
		logger.error('Failed to load historical metrics:', error);
	}
}

/**
 * Save current performance metrics to the database.
 */
export async function saveCurrentMetrics(store: Writable<SystemStateStore>): Promise<void> {
	try {
		const { performanceService } = await import('@src/services/PerformanceService');
		const state = getSystemStateForSaving(store);
		if (!state) {
			return;
		}
		await performanceService.saveMetrics(state.services);
	} catch (error) {
		logger.error('Failed to save current metrics:', error);
	}
}

// Helper to get state from store for saving (avoids calling get() too much)
function getSystemStateForSaving(store: Writable<SystemStateStore>): SystemStateStore | undefined {
	let state: SystemStateStore | undefined;
	const unsubscribe = store.subscribe((s) => (state = s));
	unsubscribe();
	return state;
}
