/**
 * @file src/stores/system/types.ts
 * @description Type definitions for the system state and health architecture.
 */

export type SystemState =
  | "IDLE"
  | "INITIALIZING"
  | "RECOVERY"
  | "READY"
  | "WARMING"
  | "WARMED"
  | "DEGRADED"
  | "FAILED"
  | "SETUP"
  | "MAINTENANCE";

export type ServiceHealth = "healthy" | "unhealthy" | "initializing" | "skipped" | "maintenance";

export type ServiceName =
  | "database"
  | "auth"
  | "cache"
  | "media"
  | "contentSystem"
  | "themeManager"
  | "widgets"
  | "search";

export interface AnomalyThresholds {
  maxStartupTime: number;
  maxShutdownTime: number;
  maxConsecutiveFailures: number;
  minUptimePercentage: number;
  maxLatency: number;
  calibrationCount: number;
  lastCalibrated?: number;
}

export interface ServicePerformanceMetrics {
  healthCheckCount: number;
  failureCount: number;
  restartCount: number;
  consecutiveFailures: number;
  uptimePercentage: number;
  stateTimings: {
    startup: {
      count: number;
      trend: "unknown" | "stable" | "improving" | "degrading";
      lastTime?: number;
      avgTime?: number;
      minTime?: number;
      maxTime?: number;
    };
    shutdown: {
      count: number;
      trend: "unknown" | "stable" | "improving" | "degrading";
      lastTime?: number;
      avgTime?: number;
      minTime?: number;
      maxTime?: number;
    };
    idle: { count: number; totalTime: number };
    active: { count: number; totalTime: number };
  };
  lastLatency: number;
  averageLatency: number;
  anomalyThresholds: AnomalyThresholds;
  initializationStartedAt?: number;
  initializationCompletedAt?: number;
  initializationDuration?: number;
  lastFailureAt?: number;
  lastHealthCheckAt?: number;
  averageInitTime?: number;
  minInitTime?: number;
  maxInitTime?: number;
}

export interface ServiceStatus {
  error?: string;
  lastChecked?: number;
  message: string;
  status: ServiceHealth;
  metrics: ServicePerformanceMetrics;
}

export interface StateTransition {
  from: SystemState;
  to: SystemState;
  timestamp: number;
  reason?: string;
}

export interface SystemPerformanceMetrics {
  totalInitializations: number;
  successfulInitializations: number;
  failedInitializations: number;
  recoveryCount: number;
  lastRecoveryAt?: number;
  averageTotalInitTime?: number;
  minTotalInitTime?: number;
  maxTotalInitTime?: number;
  lastInitDuration?: number;
  stateTransitions: StateTransition[];
}

export interface SystemStateStore {
  overallState: SystemState;
  services: Record<ServiceName, ServiceStatus>;
  startedAt?: number;
  message?: string;
  initializationStartedAt?: number;
  initializationCompletedAt?: number;
  lastStateChange?: number;
  performanceMetrics: SystemPerformanceMetrics;
}

export interface AnomalyDetection {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  details?: Record<string, string | number | undefined>;
}
