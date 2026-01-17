import { d as derived, w as writable, g as get } from './index4.js';
import { logger } from './logger.js';
const DEFAULT_SYSTEM_READY_TIMEOUT = 1e4;
const CALIBRATION_CHECK_INTERVAL = 10;
const MAX_STATE_TRANSITIONS_TO_KEEP = 50;
const SERVICE_BASELINE_TIMES = {
	database: 500,
	// DB connection is usually fast
	auth: 50,
	// Auth initialization is nearly instant
	cache: 200,
	// Cache/media setup
	contentManager: 300,
	// Content loading
	themeManager: 200,
	// Theme loading
	widgets: 150
	// Widget store initialization
};
const DEFAULT_ANOMALY_THRESHOLDS = {
	maxStartupTime: 5e3,
	// 5 seconds default
	maxShutdownTime: 2e3,
	// 2 seconds default
	maxConsecutiveFailures: 3,
	minUptimePercentage: 95,
	calibrationCount: 0
};
const initialServiceMetrics = {
	healthCheckCount: 0,
	failureCount: 0,
	restartCount: 0,
	consecutiveFailures: 0,
	uptimePercentage: 100,
	stateTimings: {
		startup: { count: 0, trend: 'unknown' },
		shutdown: { count: 0, trend: 'unknown' },
		idle: { count: 0, totalTime: 0 },
		active: { count: 0, totalTime: 0 }
	},
	anomalyThresholds: { ...DEFAULT_ANOMALY_THRESHOLDS }
};
const initialState = {
	overallState: 'IDLE',
	services: {
		database: { status: 'initializing', message: 'Not initialized', metrics: structuredClone(initialServiceMetrics) },
		auth: { status: 'initializing', message: 'Not initialized', metrics: structuredClone(initialServiceMetrics) },
		cache: { status: 'initializing', message: 'Not initialized', metrics: structuredClone(initialServiceMetrics) },
		contentManager: { status: 'initializing', message: 'Not initialized', metrics: structuredClone(initialServiceMetrics) },
		themeManager: { status: 'initializing', message: 'Not initialized', metrics: structuredClone(initialServiceMetrics) },
		widgets: { status: 'initializing', message: 'Not initialized', metrics: structuredClone(initialServiceMetrics) }
	},
	performanceMetrics: {
		totalInitializations: 0,
		successfulInitializations: 0,
		failedInitializations: 0,
		stateTransitions: []
	}
};
function trackStateTransition(serviceName, fromState, toState, duration, store) {
	store.update((current) => {
		const service = { ...current.services[serviceName] };
		const stateTimings = { ...service.metrics.stateTimings };
		if (fromState === 'initializing' && toState === 'healthy') {
			const startup = { ...stateTimings.startup };
			startup.count++;
			startup.lastTime = duration;
			if (!startup.avgTime) {
				startup.avgTime = duration;
				startup.minTime = duration;
				startup.maxTime = duration;
			} else {
				const prevAvg = startup.avgTime;
				startup.avgTime = (startup.avgTime * (startup.count - 1) + duration) / startup.count;
				startup.minTime = Math.min(startup.minTime ?? duration, duration);
				startup.maxTime = Math.max(startup.maxTime ?? duration, duration);
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
function calibrateAnomalyThresholds(serviceName, store) {
	store.update((current) => {
		const service = { ...current.services[serviceName] };
		const metrics = service.metrics;
		const thresholds = { ...metrics.anomalyThresholds };
		if (metrics.stateTimings.startup.count < 5) {
			logger.debug(`Skipping calibration for ${String(serviceName)} - insufficient data (${metrics.stateTimings.startup.count} startups)`);
			return current;
		}
		if (metrics.stateTimings.startup.avgTime && metrics.stateTimings.startup.maxTime) {
			const avgBased = metrics.stateTimings.startup.avgTime * 3;
			const maxBased = metrics.stateTimings.startup.maxTime * 1.5;
			thresholds.maxStartupTime = Math.max(avgBased, maxBased);
		}
		if (metrics.stateTimings.shutdown.avgTime && metrics.stateTimings.shutdown.maxTime) {
			const avgBased = metrics.stateTimings.shutdown.avgTime * 3;
			const maxBased = metrics.stateTimings.shutdown.maxTime * 1.5;
			thresholds.maxShutdownTime = Math.max(avgBased, maxBased);
		}
		if (metrics.uptimePercentage > 99) {
			thresholds.maxConsecutiveFailures = 2;
		} else if (metrics.uptimePercentage > 95) {
			thresholds.maxConsecutiveFailures = 3;
		} else {
			thresholds.maxConsecutiveFailures = 5;
		}
		const actualUptime = metrics.uptimePercentage;
		if (actualUptime > 99) {
			thresholds.minUptimePercentage = 98;
		} else if (actualUptime > 95) {
			thresholds.minUptimePercentage = 90;
		} else {
			thresholds.minUptimePercentage = 80;
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
function detectAnomalies(serviceName, state) {
	const service = state.services[serviceName];
	const metrics = service.metrics;
	const thresholds = metrics.anomalyThresholds;
	const anomalies = [];
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
function updateUptimeMetrics(serviceName, store) {
	store.update((current) => {
		const service = { ...current.services[serviceName] };
		const metrics = service.metrics;
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
const systemStateStore = writable(initialState);
function transitionServiceState(state, serviceName, newStatus, message, error) {
	const now = Date.now();
	const service = state.services[serviceName];
	const metrics = { ...service.metrics };
	if (newStatus === 'healthy' && service.status === 'initializing' && metrics.initializationStartedAt) {
		const duration = now - metrics.initializationStartedAt;
		metrics.initializationCompletedAt = now;
		metrics.initializationDuration = duration;
		const alpha = 2 / (metrics.healthCheckCount + 1);
		if (!metrics.averageInitTime) {
			metrics.averageInitTime = duration;
			metrics.minInitTime = duration;
			metrics.maxInitTime = duration;
		} else {
			metrics.averageInitTime = alpha * duration + (1 - alpha) * metrics.averageInitTime;
			metrics.minInitTime = Math.min(metrics.minInitTime ?? duration, duration);
			metrics.maxInitTime = Math.max(metrics.maxInitTime ?? duration, duration);
		}
		logger.info(`✓ Service ${serviceName} initialized in ${duration}ms`, {
			average: metrics.averageInitTime.toFixed(2),
			min: metrics.minInitTime,
			max: metrics.maxInitTime
		});
		metrics.consecutiveFailures = 0;
	}
	if (newStatus === 'unhealthy') {
		metrics.consecutiveFailures++;
		metrics.failureCount++;
		if (service.status !== 'unhealthy') {
			metrics.lastFailureAt = now;
			logger.warn(`Service ${serviceName} became unhealthy (failure #${metrics.failureCount}, consecutive: ${metrics.consecutiveFailures})`, {
				error
			});
		}
	}
	if (newStatus === 'healthy' && service.status === 'unhealthy') {
		logger.info(`✓ Service ${serviceName} recovered from failure`);
		metrics.consecutiveFailures = 0;
	}
	metrics.healthCheckCount++;
	metrics.lastHealthCheckAt = now;
	const updatedState = {
		...state,
		services: {
			...state.services,
			[serviceName]: {
				status: newStatus,
				message,
				lastChecked: now,
				...(error && { error }),
				metrics
			}
		},
		lastStateChange: now
	};
	const derivedState = deriveOverallState(updatedState.services);
	updatedState.overallState = derivedState;
	if (derivedState === 'READY' && state.overallState === 'INITIALIZING' && state.performanceMetrics.totalInitializations > 0) {
		const duration = state.initializationStartedAt ? now - state.initializationStartedAt : 0;
		updatedState.performanceMetrics = {
			...state.performanceMetrics,
			successfulInitializations: state.performanceMetrics.successfulInitializations + 1,
			lastInitDuration: duration
		};
		logger.info(`✓ System auto-transitioned to READY (initialization completed in ${duration}ms)`);
	}
	return updatedState;
}
function startServiceInitialization(serviceName) {
	const now = Date.now();
	systemStateStore.update((state) => {
		const service = state.services[serviceName];
		return {
			...state,
			services: {
				...state.services,
				[serviceName]: {
					...service,
					status: 'initializing',
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
function updateServiceHealth(serviceName, status, message, error) {
	systemStateStore.update((state) => transitionServiceState(state, serviceName, status, message, error));
	updateUptimeMetrics(serviceName, systemStateStore);
	const updatedService = getSystemState().services[serviceName];
	if (status === 'healthy' && updatedService.metrics.initializationDuration) {
		const duration = updatedService.metrics.initializationDuration;
		trackStateTransition(serviceName, 'initializing', 'healthy', duration, systemStateStore);
	}
	const currentMetrics = updatedService.metrics;
	if (currentMetrics.healthCheckCount > 0 && currentMetrics.healthCheckCount % 10 === 0) {
		calibrateAnomalyThresholds(serviceName, systemStateStore);
	}
	const anomalies = detectAnomalies(serviceName, getSystemState());
	if (anomalies.length > 0 && anomalies.some((a) => a.severity === 'critical' || a.severity === 'high')) {
		logger.error(`🚨 ${anomalies.length} anomal${anomalies.length > 1 ? 'ies' : 'y'} detected for ${serviceName}`);
	}
}
function setSystemState(state, reason) {
	const now = Date.now();
	systemStateStore.update((current) => {
		const transition = {
			from: current.overallState,
			to: state,
			timestamp: now,
			...(reason && { reason })
		};
		const stateTransitions = [...current.performanceMetrics.stateTransitions, transition].slice(-50);
		const performanceMetrics = { ...current.performanceMetrics, stateTransitions };
		if (state === 'INITIALIZING' && current.overallState !== 'INITIALIZING') {
			performanceMetrics.totalInitializations++;
		}
		if (state === 'READY' && current.overallState !== 'READY' && performanceMetrics.totalInitializations > 0) {
			const duration = current.initializationStartedAt ? now - current.initializationStartedAt : 0;
			performanceMetrics.successfulInitializations++;
			performanceMetrics.lastInitDuration = duration;
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
		logger.info(`System state changed: ${current.overallState} → ${state}`, { reason });
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
function deriveOverallState(services) {
	const criticalServices = ['database', 'auth'];
	const nonCriticalServices = ['cache', 'contentManager', 'themeManager'];
	const criticalUnhealthy = criticalServices.some((service) => services[service].status === 'unhealthy');
	if (criticalUnhealthy) {
		return 'FAILED';
	}
	const criticalInitializing = criticalServices.some((service) => services[service].status === 'initializing');
	if (criticalInitializing) {
		return 'INITIALIZING';
	}
	const nonCriticalUnhealthy = nonCriticalServices.some((service) => services[service].status === 'unhealthy');
	if (nonCriticalUnhealthy) {
		return 'DEGRADED';
	}
	return 'READY';
}
function getSystemState() {
	return get(systemStateStore);
}
function isSystemReady() {
	const state = getSystemState();
	return state.overallState === 'READY' || state.overallState === 'DEGRADED';
}
function isServiceHealthy(serviceName) {
	const state = getSystemState();
	return state.services[serviceName].status === 'healthy';
}
function resetSystemState() {
	logger.info('Resetting system state to IDLE');
	systemStateStore.set({
		...structuredClone(initialState),
		lastStateChange: Date.now()
	});
}
const systemState = derived(systemStateStore, ($state) => $state);
const overallState = derived(systemStateStore, ($state) => $state.overallState);
const isReady = derived(overallState, ($s) => $s === 'READY' || $s === 'DEGRADED');
const isInitializing = derived(overallState, ($s) => $s === 'INITIALIZING');
const isFailed = derived(overallState, ($s) => $s === 'FAILED');
const isDegraded = derived(overallState, ($s) => $s === 'DEGRADED');
const servicesStatus = derived(systemState, ($s) => $s.services);
const databaseStatus = derived(servicesStatus, ($s) => $s.database);
const authStatus = derived(servicesStatus, ($s) => $s.auth);
const cacheStatus = derived(servicesStatus, ($s) => $s.cache);
const contentManagerStatus = derived(servicesStatus, ($s) => $s.contentManager);
const themeManagerStatus = derived(servicesStatus, ($s) => $s.themeManager);
export {
	updateUptimeMetrics as A,
	CALIBRATION_CHECK_INTERVAL as C,
	DEFAULT_SYSTEM_READY_TIMEOUT as D,
	MAX_STATE_TRANSITIONS_TO_KEEP as M,
	SERVICE_BASELINE_TIMES as S,
	DEFAULT_ANOMALY_THRESHOLDS as a,
	initialState as b,
	systemStateStore as c,
	startServiceInitialization as d,
	setSystemState as e,
	isSystemReady as f,
	getSystemState as g,
	isServiceHealthy as h,
	initialServiceMetrics as i,
	isReady as j,
	isInitializing as k,
	isFailed as l,
	isDegraded as m,
	servicesStatus as n,
	overallState as o,
	databaseStatus as p,
	authStatus as q,
	resetSystemState as r,
	systemState as s,
	cacheStatus as t,
	updateServiceHealth as u,
	contentManagerStatus as v,
	themeManagerStatus as w,
	trackStateTransition as x,
	calibrateAnomalyThresholds as y,
	detectAnomalies as z
};
//# sourceMappingURL=state.js.map
