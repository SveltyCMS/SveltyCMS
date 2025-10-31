/**
 * @file src/stores/system/types.ts
 * @description Type definitions for the system state and health architecture.
 */

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

export const SERVICE_NAMES = ['database', 'auth', 'cache', 'contentManager', 'themeManager'] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];
export type ServicesMap = {
	[K in ServiceName]: ServiceStatus;
};

// Main system state store interface
export interface SystemStateStore {
	overallState: SystemState;
	services: ServicesMap;
	performanceMetrics: SystemPerformanceMetrics;
	lastStateChange?: number; // Timestamp of last state transition
	initializationStartedAt?: number; // When system initialization began
	initializationCompletedAt?: number; // When system initialization completed
}

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
