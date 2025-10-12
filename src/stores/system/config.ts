/**
 * @file src/stores/system/config.ts
 * @description Configuration and initial state for the system state machine.
 */

import type { ServicePerformanceMetrics, SystemStateStore, AnomalyThresholds } from './types';

// --- Core Constants ---
export const DEFAULT_SYSTEM_READY_TIMEOUT = 10000; // 10 seconds
export const CALIBRATION_CHECK_INTERVAL = 10; // Calibrate after every 10 health checks
export const MAX_STATE_TRANSITIONS_TO_KEEP = 50; // Max history for state transitions

// --- Service Baseline Performance ---
// Used for intelligent timeout calculations on first run.
export const SERVICE_BASELINE_TIMES = {
	database: 500, // DB connection is usually fast
	auth: 50, // Auth initialization is nearly instant
	cache: 200, // Cache/media setup
	contentManager: 300, // Content loading
	themeManager: 200 // Theme loading
} as const;

// --- Default Anomaly Thresholds ---
// These are the initial values before self-calibration kicks in.
export const DEFAULT_ANOMALY_THRESHOLDS: AnomalyThresholds = {
	maxStartupTime: 5000, // 5 seconds default
	maxShutdownTime: 2000, // 2 seconds default
	maxConsecutiveFailures: 3,
	minUptimePercentage: 95,
	calibrationCount: 0
};

// --- Initial State Objects ---

// Initial metrics for a new service.
export const initialServiceMetrics: ServicePerformanceMetrics = {
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

// Initial state for the entire system store.
export const initialState: SystemStateStore = {
	overallState: 'IDLE',
	services: {
		database: { status: 'initializing', message: 'Not initialized', metrics: structuredClone(initialServiceMetrics) },
		auth: { status: 'initializing', message: 'Not initialized', metrics: structuredClone(initialServiceMetrics) },
		cache: { status: 'initializing', message: 'Not initialized', metrics: structuredClone(initialServiceMetrics) },
		contentManager: { status: 'initializing', message: 'Not initialized', metrics: structuredClone(initialServiceMetrics) },
		themeManager: { status: 'initializing', message: 'Not initialized', metrics: structuredClone(initialServiceMetrics) }
	},
	performanceMetrics: {
		totalInitializations: 0,
		successfulInitializations: 0,
		failedInitializations: 0,
		stateTransitions: []
	}
};
