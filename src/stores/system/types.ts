/**
 * @file src/stores/system/types.ts
 * @description Type definitions for the system state and health architecture.
 */

// System-wide states
export type SystemState = 'IDLE' | 'INITIALIZING' | 'READY' | 'WARMING' | 'WARMED' | 'DEGRADED' | 'FAILED' | 'SETUP' | 'MAINTENANCE';

// Individual service health statuses
export type ServiceHealth = 'healthy' | 'unhealthy' | 'initializing' | 'skipped' | 'maintenance';

// State-specific timing metrics (up/down/idle)
export interface StateTimingMetrics {
	// Active time (time spent in READY state)
	active: {
		count: number; // Number of active periods
		avgDuration?: number; // Average active duration
		minDuration?: number; // Shortest active period
		maxDuration?: number; // Longest active period
		lastDuration?: number; // Most recent active duration
		totalTime: number; // Total time spent active
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
	// Shutdown (READY → IDLE)
	shutdown: {
		count: number;
		avgTime?: number;
		minTime?: number;
		maxTime?: number;
		lastTime?: number;
		trend: 'improving' | 'stable' | 'degrading' | 'unknown';
	};
	// Startup (IDLE → INITIALIZING → READY)
	startup: {
		count: number; // Number of startups
		avgTime?: number; // Average startup time
		minTime?: number; // Fastest startup
		maxTime?: number; // Slowest startup
		lastTime?: number; // Most recent startup time
		trend: 'improving' | 'stable' | 'degrading' | 'unknown'; // Performance trend
	};
}

// Anomaly detection thresholds (self-learning)
export interface AnomalyThresholds {
	calibrationCount: number; // Number of calibrations performed
	lastCalibrated?: number; // When thresholds were last updated
	maxConsecutiveFailures: number; // Max failures before alert
	maxShutdownTime: number; // Max acceptable shutdown time
	maxStartupTime: number; // Max acceptable startup time
	minUptimePercentage: number; // Min acceptable uptime %
}

// Performance metrics for a service lifecycle
export interface ServicePerformanceMetrics {
	anomalyThresholds: AnomalyThresholds;
	averageInitTime?: number; // Running average of init times
	consecutiveFailures: number; // Current streak of failures
	failureCount: number; // Number of times service became unhealthy
	healthCheckCount: number; // Number of health checks performed
	initializationCompletedAt?: number; // When initialization completed
	initializationDuration?: number; // Total time taken to initialize (ms)
	initializationStartedAt?: number; // When initialization began
	lastFailureAt?: number; // Timestamp of last failure
	lastHealthCheckAt?: number; // Last time health was checked
	maxInitTime?: number; // Slowest initialization time
	minInitTime?: number; // Fastest initialization time
	restartCount: number; // Number of times service was restarted

	// Enhanced state-specific metrics
	stateTimings: StateTimingMetrics;
	uptimePercentage: number; // Percentage of time service is healthy
}

// Service status with enhanced metrics
export interface ServiceStatus {
	error?: string;
	lastChecked?: number;
	message: string;
	metrics: ServicePerformanceMetrics;
	status: ServiceHealth;
}

// System-wide performance metrics
export interface SystemPerformanceMetrics {
	averageTotalInitTime?: number;
	failedInitializations: number;
	lastInitDuration?: number;
	maxTotalInitTime?: number;
	minTotalInitTime?: number;
	stateTransitions: Array<{
		from: SystemState;
		to: SystemState;
		timestamp: number;
		reason?: string;
	}>;
	successfulInitializations: number;
	totalInitializations: number;
}

// ✅ ENTERPRISE ENHANCEMENT: Added 'widgets' as a monitored service
// This allows the system health monitor to track widget availability and dependencies
export const SERVICE_NAMES = ['database', 'auth', 'cache', 'contentManager', 'themeManager', 'widgets'] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];
export type ServicesMap = {
	[K in ServiceName]: ServiceStatus;
};

// Main system state store interface
export interface SystemStateStore {
	initializationCompletedAt?: number; // When system initialization completed
	initializationStartedAt?: number; // When system initialization began
	lastStateChange?: number; // Timestamp of last state transition
	overallState: SystemState;
	performanceMetrics: SystemPerformanceMetrics;
	services: ServicesMap;
}

export interface AnomalyDetection {
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
	message: string;
	severity: 'low' | 'medium' | 'high' | 'critical';
	type: 'slow_startup' | 'slow_shutdown' | 'consecutive_failures' | 'low_uptime' | 'degrading_performance';
}
