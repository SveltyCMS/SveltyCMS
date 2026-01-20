/**
 * @file shared/stores/src/system/index.ts
 * @description Central export for system state and monitoring.
 */

export {
	type InitializationStage,
	type ServiceHealth,
	type ServiceName,
	type ServicesMap,
	type SystemState,
	type AnomalyDetection,
	type AnomalyThresholds,
	type ServiceCircuitBreaker,
	type ServicePerformanceMetrics,
	type ServiceStatus,
	type StateTimingMetrics,
	type SystemPerformanceMetrics,
	type SystemStateStore,
	SERVICE_NAMES
} from './types';

export {
	SERVICE_BASELINE_TIMES,
	DEFAULT_ANOMALY_THRESHOLDS,
	DEFAULT_SYSTEM_READY_TIMEOUT,
	CALIBRATION_CHECK_INTERVAL,
	initialServiceMetrics,
	MAX_STATE_TRANSITIONS_TO_KEEP
} from './config';

export {
	initialState,
	systemStateStore,
	systemState,
	overallState,
	isReady,
	isInitializing,
	isDegraded,
	isFailed,
	servicesStatus,
	databaseStatus,
	authStatus,
	cacheStatus,
	contentManagerStatus,
	themeManagerStatus,
	getSystemState,
	setSystemState,
	setInitializationStage,
	updateServiceHealth,
	isServiceHealthy,
	isSystemReady,
	resetSystemState,
	startServiceInitialization,
	resetCircuitBreaker,
	getSystemMetrics,
	systemEvents
} from './state';

export { trackStateTransition, calibrateAnomalyThresholds, detectAnomalies, updateUptimeMetrics } from './metrics';

export { waitForSystemReady, waitForServiceHealthy, getServiceTimeout } from './async';

export { getHealthCheckReport, getPerformanceSummary, getRecommendedTimeouts, identifyBottlenecks } from './reporting';
