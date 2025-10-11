/**
 * @file src/stores/systemState.ts
 * @description System State & Health Architecture with Performance Metrics
 *
 * This module implements a centralized state machine for tracking system readiness
 * and service health with fine-grained performance monitoring.
 *
 * @summary:
 * - Overall system state (IDLE, INITIALIZING, READY, DEGRADED, FAILED)
 * - Individual service health tracking with timing metrics
 * - Performance benchmarks for initialization phases
 * - Event-driven state updates
 * - Historical performance data for optimization
 * - Intelligent timeout calculations based on historical data
 */

import { writable, derived, get } from 'svelte/store';
import type { Writable, Readable } from 'svelte/store';
// System Logging
import { logger } from '@utils/logger.svelte';

// System-wide states
export type SystemState = 'IDLE' | 'INITIALIZING' | 'READY' | 'DEGRADED' | 'FAILED';

// Individual service health statuses
export type ServiceHealth = 'healthy' | 'unhealthy' | 'initializing';

// State-specific timing metrics (up/down/idle)
export interface StateTimingMetrics {
	// Startup (IDLE → INITIALIZING → READY)
	startup: {
		count: number; // Number of startups
		avgTime?: number; // Average startup time
		minTime?: number; // Fastest startup
		maxTime?: number; // Slowest startup
		lastTime?: number; // Most recent startup time
		trend: 'improving' | 'stable' | 'degrading' | 'unknown'; // Performance trend
	};
	// Shutdown (READY → IDLE)
	shutdown: {
		count: number;
		avgTime?: number;
		minTime?: number;
		maxTime?: number;
		lastTime?: number;
		trend: 'improving' | 'stable' | 'degrading' | 'unknown';
	};
	// Idle time (time spent in IDLE state)
	idle: {
		count: number; // Number of idle periods
		avgDuration?: number; // Average idle duration
		minDuration?: number; // Shortest idle period
		maxDuration?: number; // Longest idle period
		lastDuration?: number; // Most recent idle duration
		totalTime: number; // Total time spent idle
	};
	// Active time (time spent in READY state)
	active: {
		count: number; // Number of active periods
		avgDuration?: number; // Average active duration
		minDuration?: number; // Shortest active period
		maxDuration?: number; // Longest active period
		lastDuration?: number; // Most recent active duration
		totalTime: number; // Total time spent active
	};
}

// Anomaly detection thresholds (self-learning)
export interface AnomalyThresholds {
	maxStartupTime: number; // Max acceptable startup time
	maxShutdownTime: number; // Max acceptable shutdown time
	maxConsecutiveFailures: number; // Max failures before alert
	minUptimePercentage: number; // Min acceptable uptime %
	lastCalibrated?: number; // When thresholds were last updated
	calibrationCount: number; // Number of calibrations performed
}

// Performance metrics for a service lifecycle
export interface ServicePerformanceMetrics {
	initializationStartedAt?: number; // When initialization began
	initializationCompletedAt?: number; // When initialization completed
	initializationDuration?: number; // Total time taken to initialize (ms)
	lastHealthCheckAt?: number; // Last time health was checked
	healthCheckCount: number; // Number of health checks performed
	failureCount: number; // Number of times service became unhealthy
	lastFailureAt?: number; // Timestamp of last failure
	averageInitTime?: number; // Running average of init times
	minInitTime?: number; // Fastest initialization time
	maxInitTime?: number; // Slowest initialization time
	restartCount: number; // Number of times service was restarted

	// Enhanced state-specific metrics
	stateTimings: StateTimingMetrics;
	anomalyThresholds: AnomalyThresholds;
	consecutiveFailures: number; // Current streak of failures
	uptimePercentage: number; // Percentage of time service is healthy
}

// Service status with enhanced metrics
export interface ServiceStatus {
	status: ServiceHealth;
	message: string;
	lastChecked?: number;
	error?: string;
	metrics: ServicePerformanceMetrics;
}

// System-wide performance metrics
export interface SystemPerformanceMetrics {
	totalInitializations: number;
	successfulInitializations: number;
	failedInitializations: number;
	averageTotalInitTime?: number;
	minTotalInitTime?: number;
	maxTotalInitTime?: number;
	lastInitDuration?: number;
	stateTransitions: Array<{
		from: SystemState;
		to: SystemState;
		timestamp: number;
		reason?: string;
	}>;
}

export interface SystemStateStore {
	overallState: SystemState;
	services: {
		database: ServiceStatus;
		auth: ServiceStatus;
		cache: ServiceStatus;
		contentManager: ServiceStatus;
		themeManager: ServiceStatus;
	};
	initializationStartedAt?: number;
	initializationCompletedAt?: number;
	lastStateChange?: number;
	performanceMetrics: SystemPerformanceMetrics;
}

// Service performance baseline estimates (in milliseconds)
// These are used for intelligent timeout calculations
const SERVICE_BASELINE_TIMES = {
	database: 500, // DB connection is usually fast
	auth: 50, // Auth initialization is nearly instant
	cache: 200, // Cache/media setup
	contentManager: 300, // Content loading
	themeManager: 200 // Theme loading
} as const;

// Initial metrics for a service
const initialServiceMetrics: ServicePerformanceMetrics = {
	healthCheckCount: 0,
	failureCount: 0,
	restartCount: 0,
	consecutiveFailures: 0,
	uptimePercentage: 100,
	stateTimings: {
		startup: {
			count: 0,
			trend: 'unknown'
		},
		shutdown: {
			count: 0,
			trend: 'unknown'
		},
		idle: {
			count: 0,
			totalTime: 0
		},
		active: {
			count: 0,
			totalTime: 0
		}
	},
	anomalyThresholds: {
		maxStartupTime: 5000, // 5 seconds default
		maxShutdownTime: 2000, // 2 seconds default
		maxConsecutiveFailures: 3,
		minUptimePercentage: 95,
		calibrationCount: 0
	}
};

// Initial state
const initialState: SystemStateStore = {
	overallState: 'IDLE',
	services: {
		database: { status: 'initializing', message: 'Not initialized', metrics: { ...initialServiceMetrics } },
		auth: { status: 'initializing', message: 'Not initialized', metrics: { ...initialServiceMetrics } },
		cache: { status: 'initializing', message: 'Not initialized', metrics: { ...initialServiceMetrics } },
		contentManager: { status: 'initializing', message: 'Not initialized', metrics: { ...initialServiceMetrics } },
		themeManager: { status: 'initializing', message: 'Not initialized', metrics: { ...initialServiceMetrics } }
	},
	performanceMetrics: {
		totalInitializations: 0,
		successfulInitializations: 0,
		failedInitializations: 0,
		stateTransitions: []
	}
};

// Create the writable store
const systemStateStore: Writable<SystemStateStore> = writable(initialState);

/**
 * Start tracking initialization for a service
 */
export function startServiceInitialization(serviceName: keyof SystemStateStore['services']): void {
	const now = Date.now();
	systemStateStore.update((state) => {
		const service = state.services[serviceName];
		return {
			...state,
			services: {
				...state.services,
				[serviceName]: {
					...service,
					status: 'initializing' as ServiceHealth,
					metrics: {
						...service.metrics,
						initializationStartedAt: now,
						restartCount: service.metrics.restartCount + (service.metrics.initializationStartedAt ? 1 : 0)
					}
				}
			}
		};
	});
}

/**
 * Update a specific service's health status with performance tracking
 */
export function updateServiceHealth(serviceName: keyof SystemStateStore['services'], status: ServiceHealth, message: string, error?: string): void {
	const now = Date.now();

	systemStateStore.update((state) => {
		const service = state.services[serviceName];
		const metrics = { ...service.metrics };

		// Track initialization completion
		if (status === 'healthy' && service.status === 'initializing' && metrics.initializationStartedAt) {
			const duration = now - metrics.initializationStartedAt;
			metrics.initializationCompletedAt = now;
			metrics.initializationDuration = duration;

			// Update running statistics
			if (!metrics.averageInitTime) {
				metrics.averageInitTime = duration;
				metrics.minInitTime = duration;
				metrics.maxInitTime = duration;
			} else {
				// Running average calculation
				const count = metrics.healthCheckCount + 1;
				metrics.averageInitTime = (metrics.averageInitTime * (count - 1) + duration) / count;
				metrics.minInitTime = Math.min(metrics.minInitTime ?? duration, duration);
				metrics.maxInitTime = Math.max(metrics.maxInitTime ?? duration, duration);
			}

			logger.info(`✓ Service ${serviceName} initialized in ${duration}ms`, {
				average: metrics.averageInitTime.toFixed(2),
				min: metrics.minInitTime,
				max: metrics.maxInitTime
			});

			// Reset consecutive failures on successful initialization
			metrics.consecutiveFailures = 0;
		}

		// Track failures
		if (status === 'unhealthy' && service.status !== 'unhealthy') {
			metrics.failureCount++;
			metrics.consecutiveFailures++;
			metrics.lastFailureAt = now;
			logger.warn(`Service ${serviceName} became unhealthy (failure #${metrics.failureCount}, consecutive: ${metrics.consecutiveFailures})`, {
				error
			});
		}

		// Reset consecutive failures on recovery
		if (status === 'healthy' && service.status === 'unhealthy') {
			logger.info(`✓ Service ${serviceName} recovered from failure`);
			metrics.consecutiveFailures = 0;
		}

		// Track health checks
		metrics.healthCheckCount++;
		metrics.lastHealthCheckAt = now;

		const updatedState = {
			...state,
			services: {
				...state.services,
				[serviceName]: {
					status,
					message,
					lastChecked: now,
					...(error && { error }),
					metrics
				}
			},
			lastStateChange: now
		};

		// Derive overall state from service statuses
		updatedState.overallState = deriveOverallState(updatedState.services);

		return updatedState;
	});

	// Update uptime metrics after state change
	updateUptimeMetrics(serviceName);

	// Track state transition timing if status changed
	const updatedService = getSystemState().services[serviceName];
	if (status === 'healthy' && updatedService.metrics.initializationDuration) {
		const duration = updatedService.metrics.initializationDuration;
		trackStateTransition(serviceName, 'initializing', 'healthy', duration);
	}

	// Auto-calibrate thresholds periodically (every 10 health checks)
	const currentMetrics = updatedService.metrics;
	if (currentMetrics.healthCheckCount > 0 && currentMetrics.healthCheckCount % 10 === 0) {
		calibrateAnomalyThresholds(serviceName);
	}

	// Detect and report anomalies
	const anomalies = detectAnomalies(serviceName);

	// You can integrate with notification system here
	if (anomalies.length > 0 && anomalies.some((a) => a.severity === 'critical' || a.severity === 'high')) {
		// TODO: Integrate with notification system (email, Slack, etc.)
		logger.error(`🚨 ${anomalies.length} anomal${anomalies.length > 1 ? 'ies' : 'y'} detected for ${serviceName}`);
	}
}

/**
 * Set the overall system state with transition tracking
 */
export function setSystemState(state: SystemState, reason?: string): void {
	const now = Date.now();

	systemStateStore.update((current) => {
		const transition = {
			from: current.overallState,
			to: state,
			timestamp: now,
			...(reason && { reason })
		};

		// Keep last 50 transitions for analysis
		const stateTransitions = [...current.performanceMetrics.stateTransitions, transition].slice(-50);

		// Track initialization metrics
		const performanceMetrics = { ...current.performanceMetrics, stateTransitions };

		if (state === 'INITIALIZING' && current.overallState !== 'INITIALIZING') {
			performanceMetrics.totalInitializations++;
		}

		if (state === 'READY' && current.overallState === 'INITIALIZING' && current.initializationStartedAt) {
			const duration = now - current.initializationStartedAt;
			performanceMetrics.successfulInitializations++;
			performanceMetrics.lastInitDuration = duration;

			// Update running statistics
			if (!performanceMetrics.averageTotalInitTime) {
				performanceMetrics.averageTotalInitTime = duration;
				performanceMetrics.minTotalInitTime = duration;
				performanceMetrics.maxTotalInitTime = duration;
			} else {
				const count = performanceMetrics.successfulInitializations;
				performanceMetrics.averageTotalInitTime = (performanceMetrics.averageTotalInitTime * (count - 1) + duration) / count;
				performanceMetrics.minTotalInitTime = Math.min(performanceMetrics.minTotalInitTime ?? duration, duration);
				performanceMetrics.maxTotalInitTime = Math.max(performanceMetrics.maxTotalInitTime ?? duration, duration);
			}

			logger.info(`🚀 System initialization completed in ${duration}ms`, {
				average: performanceMetrics.averageTotalInitTime.toFixed(2),
				min: performanceMetrics.minTotalInitTime,
				max: performanceMetrics.maxTotalInitTime,
				successRate: `${((performanceMetrics.successfulInitializations / performanceMetrics.totalInitializations) * 100).toFixed(1)}%`
			});
		}

		if (state === 'FAILED' && current.overallState === 'INITIALIZING') {
			performanceMetrics.failedInitializations++;
		}

		logger.info(`System state changed: \x1b[34m${current.overallState}\x1b[0m → \x1b[32m${state}\x1b[0m`, { reason });

		return {
			...current,
			overallState: state,
			lastStateChange: now,
			performanceMetrics,
			...(state === 'INITIALIZING' && { initializationStartedAt: now }),
			...(state === 'READY' && current.initializationStartedAt && { initializationCompletedAt: now })
		};
	});
}

// Derive overall system state from individual service statuses
function deriveOverallState(services: SystemStateStore['services']): SystemState {
	const criticalServices = ['database', 'auth'] as const;
	const nonCriticalServices = ['cache', 'contentManager', 'themeManager'] as const;

	// Check if any critical service is unhealthy
	const criticalUnhealthy = criticalServices.some((service) => services[service].status === 'unhealthy');
	if (criticalUnhealthy) {
		return 'FAILED';
	}

	// Check if any critical service is still initializing
	const criticalInitializing = criticalServices.some((service) => services[service].status === 'initializing');
	if (criticalInitializing) {
		return 'INITIALIZING';
	}

	// Check if any non-critical service is unhealthy
	const nonCriticalUnhealthy = nonCriticalServices.some((service) => services[service].status === 'unhealthy');
	if (nonCriticalUnhealthy) {
		return 'DEGRADED';
	}

	// All critical services are healthy
	return 'READY';
}

// Get the current system state (synchronous)
export function getSystemState(): SystemStateStore {
	return get(systemStateStore);
}

// Check if the system is ready (synchronous)
export function isSystemReady(): boolean {
	const state = getSystemState();
	return state.overallState === 'READY' || state.overallState === 'DEGRADED';
}

// Check if a specific service is healthy (synchronous)
export function isServiceHealthy(serviceName: keyof SystemStateStore['services']): boolean {
	const state = getSystemState();
	return state.services[serviceName].status === 'healthy';
}

// Wait for the system to be ready (async with timeout)
export async function waitForSystemReady(timeoutMs: number = 10000): Promise<boolean> {
	return new Promise((resolve) => {
		let resolved = false;

		// Set up timeout to ensure we don't wait forever
		const timeoutId = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				unsubscribe();
				const state = getSystemState();
				logger.warn(`System ready timeout after ${timeoutMs}ms`, { state: state.overallState });
				resolve(false);
			}
		}, timeoutMs);

		const unsubscribe = systemStateStore.subscribe((state) => {
			if (resolved) return;

			if (state.overallState === 'READY' || state.overallState === 'DEGRADED') {
				resolved = true;
				clearTimeout(timeoutId);
				unsubscribe();
				resolve(true);
			} else if (state.overallState === 'FAILED') {
				resolved = true;
				clearTimeout(timeoutId);
				unsubscribe();
				resolve(false);
			}
		});
	});
}

/**
 * Calculate intelligent timeout for a service based on historical performance
 * Uses baseline time as fallback if no historical data available
 */
export function getServiceTimeout(serviceName: keyof SystemStateStore['services'], multiplier: number = 3): number {
	const state = getSystemState();
	const service = state.services[serviceName];
	const baseline = SERVICE_BASELINE_TIMES[serviceName];

	// If we have historical data, use average + buffer
	if (service.metrics.averageInitTime) {
		// Use 3x average or max time (whichever is larger) as timeout
		const calculated = Math.max(service.metrics.averageInitTime * multiplier, (service.metrics.maxInitTime ?? baseline) * 1.5);
		return Math.min(calculated, 30000); // Cap at 30 seconds
	}

	// Fallback to baseline * multiplier
	return baseline * multiplier;
}

/**
 * Wait for a specific service to be healthy with intelligent timeout
 */
export async function waitForServiceHealthy(serviceName: keyof SystemStateStore['services'], timeoutMs?: number): Promise<boolean> {
	// Use intelligent timeout if not specified
	const timeout = timeoutMs ?? getServiceTimeout(serviceName);

	return new Promise((resolve) => {
		let resolved = false;
		const startTime = Date.now();

		// Set up timeout to ensure we don't wait forever
		const timeoutId = setTimeout(() => {
			if (!resolved) {
				resolved = true;
				unsubscribe();
				const state = getSystemState();
				const elapsed = Date.now() - startTime;
				logger.warn(`Service ${serviceName} healthy timeout after ${timeout}ms (actual: ${elapsed}ms)`, {
					status: state.services[serviceName].status,
					expectedTime: state.services[serviceName].metrics.averageInitTime?.toFixed(2) || 'unknown'
				});
				resolve(false);
			}
		}, timeout);

		const unsubscribe = systemStateStore.subscribe((state) => {
			if (resolved) return;

			const service = state.services[serviceName];
			if (service.status === 'healthy') {
				resolved = true;
				clearTimeout(timeoutId);
				unsubscribe();
				const elapsed = Date.now() - startTime;
				logger.debug(
					`Service ${serviceName} became healthy in ${elapsed}ms (expected: ${service.metrics.averageInitTime?.toFixed(2) || 'unknown'}ms)`
				);
				resolve(true);
			} else if (service.status === 'unhealthy') {
				resolved = true;
				clearTimeout(timeoutId);
				unsubscribe();
				resolve(false);
			}
		});
	});
}

// Reset system state to IDLE (used for shutdown or reinitialization)
export function resetSystemState(): void {
	logger.info('Resetting system state to IDLE');
	systemStateStore.set({
		...initialState,
		lastStateChange: Date.now()
	});
}

// Get a readable store for the system state (for Svelte components)
export const systemState: Readable<SystemStateStore> = derived(systemStateStore, ($state) => $state);

// Get a readable store for just the overall state (for simple checks)
export const overallState: Readable<SystemState> = derived(systemStateStore, ($state) => $state.overallState);

/**
 * Track state timing (startup/shutdown) and update metrics
 */
export function trackStateTransition(
	serviceName: keyof SystemStateStore['services'],
	fromState: ServiceHealth,
	toState: ServiceHealth,
	duration: number
): void {
	systemStateStore.update((current) => {
		const service = { ...current.services[serviceName] };
		const stateTimings = { ...service.metrics.stateTimings };

		// Track startup (initializing → healthy)
		if (fromState === 'initializing' && toState === 'healthy') {
			const startup = { ...stateTimings.startup };
			startup.count++;
			startup.lastTime = duration;

			// Update statistics
			if (!startup.avgTime) {
				startup.avgTime = duration;
				startup.minTime = duration;
				startup.maxTime = duration;
			} else {
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
			}

			stateTimings.startup = startup;
		}

		// Track shutdown (healthy → unhealthy or healthy → idle)
		if (fromState === 'healthy' && (toState === 'unhealthy' || toState === 'initializing')) {
			const shutdown = { ...stateTimings.shutdown };
			shutdown.count++;
			shutdown.lastTime = duration;

			if (!shutdown.avgTime) {
				shutdown.avgTime = duration;
				shutdown.minTime = duration;
				shutdown.maxTime = duration;
			} else {
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
 * Makes the system smarter over time by learning normal behavior
 */
export function calibrateAnomalyThresholds(serviceName: keyof SystemStateStore['services']): void {
	systemStateStore.update((current) => {
		const service = { ...current.services[serviceName] };
		const metrics = service.metrics;
		const thresholds = { ...metrics.anomalyThresholds };

		// Only calibrate if we have enough data (at least 5 startups)
		if (metrics.stateTimings.startup.count < 5) {
			logger.debug(`Skipping calibration for ${serviceName} - insufficient data (${metrics.stateTimings.startup.count} startups)`);
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

		logger.info(`🎯 Calibrated anomaly thresholds for ${serviceName}`, {
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
 * Returns array of detected issues
 */
export interface AnomalyDetection {
	type: 'slow_startup' | 'slow_shutdown' | 'consecutive_failures' | 'low_uptime' | 'degrading_performance';
	severity: 'low' | 'medium' | 'high' | 'critical';
	message: string;
	details: {
		actual?: string;
		threshold?: string;
		excess?: string;
		failures?: number;
		uptime?: string;
		trend?: string;
		avgTime?: string;
		lastTime?: string;
	};
}

export function detectAnomalies(serviceName: keyof SystemStateStore['services']): AnomalyDetection[] {
	const state = getSystemState();
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
			message: `Service ${serviceName} startup is slower than expected`,
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
			message: `Service ${serviceName} shutdown is slower than expected`,
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
			message: `Service ${serviceName} has ${metrics.consecutiveFailures} consecutive failures`,
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
			message: `Service ${serviceName} uptime is below threshold`,
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
			message: `Service ${serviceName} performance is degrading over time`,
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
export function updateUptimeMetrics(serviceName: keyof SystemStateStore['services']): void {
	systemStateStore.update((current) => {
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
