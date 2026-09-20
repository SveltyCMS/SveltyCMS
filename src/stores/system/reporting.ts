/**
 * @file src/stores/system/reporting.ts
 * @description Reporting and analysis functions for system health and performance.
 */

import { getSystemState } from "./state.svelte.ts";

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
      state.initializationCompletedAt && state.initializationStartedAt
        ? state.initializationCompletedAt - state.initializationStartedAt
        : undefined,
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
            latency: service.metrics.lastLatency, // Added
            avgLatency: service.metrics.averageLatency, // Added
            healthChecks: service.metrics.healthCheckCount,
            failures: service.metrics.failureCount,
            consecutiveFailures: service.metrics.consecutiveFailures,
            restarts: service.metrics.restartCount,
            uptimePercentage: `${service.metrics.uptimePercentage.toFixed(2)}%`,
            reliability:
              service.metrics.healthCheckCount > 0
                ? `${(((service.metrics.healthCheckCount - service.metrics.failureCount) / service.metrics.healthCheckCount) * 100).toFixed(1)}%`
                : "N/A",
            stateTimings: {
              startup: {
                count: service.metrics.stateTimings.startup.count,
                avgTime: service.metrics.stateTimings.startup.avgTime,
                minTime: service.metrics.stateTimings.startup.minTime,
                maxTime: service.metrics.stateTimings.startup.maxTime,
                lastTime: service.metrics.stateTimings.startup.lastTime,
                trend: service.metrics.stateTimings.startup.trend,
              },
              shutdown: {
                count: service.metrics.stateTimings.shutdown.count,
                avgTime: service.metrics.stateTimings.shutdown.avgTime,
                trend: service.metrics.stateTimings.shutdown.trend,
              },
              idle: {
                count: service.metrics.stateTimings.idle.count,
                totalTime: service.metrics.stateTimings.idle.totalTime,
              },
              active: {
                count: service.metrics.stateTimings.active.count,
                totalTime: service.metrics.stateTimings.active.totalTime,
              },
            },
            thresholds: {
              maxStartupTime: service.metrics.anomalyThresholds.maxStartupTime,
              maxShutdownTime: service.metrics.anomalyThresholds.maxShutdownTime,
              maxLatency: service.metrics.anomalyThresholds.maxLatency, // Added
              calibrationCount: service.metrics.anomalyThresholds.calibrationCount,
            },
          },
        },
      ]),
    ),
    systemPerformance: {
      totalInits: state.performanceMetrics.totalInitializations,
      successfulInits: state.performanceMetrics.successfulInitializations,
      failedInits: state.performanceMetrics.failedInitializations,
      recoveryCount: state.performanceMetrics.recoveryCount,
      lastRecoveryAt: state.performanceMetrics.lastRecoveryAt,
      successRate:
        state.performanceMetrics.totalInitializations > 0
          ? `${((state.performanceMetrics.successfulInitializations / state.performanceMetrics.totalInitializations) * 100).toFixed(1)}%`
          : "N/A",
      avgInitTime: state.performanceMetrics.averageTotalInitTime,
      minInitTime: state.performanceMetrics.minTotalInitTime,
      maxInitTime: state.performanceMetrics.maxTotalInitTime,
      lastInitTime: state.performanceMetrics.lastInitDuration,
    },
  };
}
