/**
 * @file src/stores/system/metrics.ts
 * @description Performance metrics, anomaly detection, and reporting for the system state.
 *
 * Features:
 * - Track state timing (startup/shutdown) and update metrics
 * - Self-calibrate anomaly thresholds based on historical performance
 * - Detect anomalies and notify if something is wrong
 * - Browser-safe historical metrics loading/saving no-op
 * - Record a specific benchmark (e.g. for a setup phase)
 */

import { logger } from "@utils/logger";
import type { Writable } from "svelte/store";
import type { AnomalyDetection, ServiceHealth, ServiceName, SystemStateStore } from "./types";

/**
 * Track state timing (startup/shutdown) and update metrics
 */
export function trackStateTransition(
  serviceName: keyof SystemStateStore["services"],
  fromState: ServiceHealth,
  toState: ServiceHealth,
  duration: number,
  store: Writable<SystemStateStore>,
): void {
  store.update((current) => {
    const service = { ...current.services[serviceName] };
    const stateTimings = { ...service.metrics.stateTimings };

    if (fromState === "initializing" && toState === "healthy") {
      const startup = { ...stateTimings.startup };
      startup.count++;
      startup.lastTime = duration;

      if (startup.avgTime) {
        const prevAvg = startup.avgTime;
        startup.avgTime = (startup.avgTime * (startup.count - 1) + duration) / startup.count;
        startup.minTime = Math.min(startup.minTime ?? duration, duration);
        startup.maxTime = Math.max(startup.maxTime ?? duration, duration);

        if (duration < prevAvg * 0.9) {
          startup.trend = "improving";
        } else if (duration > prevAvg * 1.1) {
          startup.trend = "degrading";
        } else {
          startup.trend = "stable";
        }
      } else {
        startup.avgTime = duration;
        startup.minTime = duration;
        startup.maxTime = duration;
      }

      stateTimings.startup = startup;
    }

    if (fromState === "healthy" && (toState === "unhealthy" || toState === "initializing")) {
      const shutdown = { ...stateTimings.shutdown };
      shutdown.count++;
      shutdown.lastTime = duration;

      if (shutdown.avgTime) {
        const prevAvg = shutdown.avgTime;
        shutdown.avgTime = (shutdown.avgTime * (shutdown.count - 1) + duration) / shutdown.count;
        shutdown.minTime = Math.min(shutdown.minTime ?? duration, duration);
        shutdown.maxTime = Math.max(shutdown.maxTime ?? duration, duration);

        if (duration < prevAvg * 0.9) {
          shutdown.trend = "improving";
        } else if (duration > prevAvg * 1.1) {
          shutdown.trend = "degrading";
        } else {
          shutdown.trend = "stable";
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
        [serviceName]: service,
      },
    };
  });
}

/**
 * Self-calibrate anomaly thresholds based on historical performance
 */
export function calibrateAnomalyThresholds(
  serviceName: keyof SystemStateStore["services"],
  store: Writable<SystemStateStore>,
): void {
  store.update((current) => {
    const service = { ...current.services[serviceName] };
    const metrics = service.metrics;
    const thresholds = { ...metrics.anomalyThresholds };

    if (metrics.stateTimings.startup.count < 5) {
      logger.debug(
        `Skipping calibration for ${String(serviceName)} - insufficient data (${metrics.stateTimings.startup.count} startups)`,
      );
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

    if (metrics.averageLatency && metrics.averageLatency > 0) {
      thresholds.maxLatency = Math.max(metrics.averageLatency * 2, 50);
    }

    thresholds.lastCalibrated = Date.now();
    thresholds.calibrationCount++;

    service.metrics.anomalyThresholds = thresholds;

    logger.info(`🎯 Calibrated anomaly thresholds for ${String(serviceName)}`, {
      maxStartup: `${thresholds.maxStartupTime.toFixed(0)}ms`,
      maxShutdown: `${thresholds.maxShutdownTime.toFixed(0)}ms`,
      maxFailures: thresholds.maxConsecutiveFailures,
      minUptime: `${thresholds.minUptimePercentage}%`,
      calibrationCount: thresholds.calibrationCount,
    });

    return {
      ...current,
      services: {
        ...current.services,
        [serviceName]: service,
      },
    };
  });
}

/**
 * Detect anomalies and notify if something is wrong
 */
export function detectAnomalies(
  serviceName: keyof SystemStateStore["services"],
  state: SystemStateStore,
): AnomalyDetection[] {
  const service = state.services[serviceName];
  const metrics = service.metrics;
  const thresholds = metrics.anomalyThresholds;
  const anomalies: AnomalyDetection[] = [];

  if (
    metrics.stateTimings.startup.lastTime &&
    metrics.stateTimings.startup.lastTime > thresholds.maxStartupTime
  ) {
    const excessPercent =
      (metrics.stateTimings.startup.lastTime / thresholds.maxStartupTime - 1) * 100;

    anomalies.push({
      type: "slow_startup",
      severity: excessPercent > 100 ? "critical" : excessPercent > 50 ? "high" : "medium",
      message: `Service ${String(serviceName)} startup is slower than expected`,
      details: {
        actual: `${metrics.stateTimings.startup.lastTime.toFixed(0)}ms`,
        threshold: `${thresholds.maxStartupTime.toFixed(0)}ms`,
        excess: `${excessPercent.toFixed(0)}%`,
      },
    });
  }

  if (
    metrics.stateTimings.shutdown.lastTime &&
    metrics.stateTimings.shutdown.lastTime > thresholds.maxShutdownTime
  ) {
    anomalies.push({
      type: "slow_shutdown",
      severity: "medium",
      message: `Service ${String(serviceName)} shutdown is slower than expected`,
      details: {
        actual: `${metrics.stateTimings.shutdown.lastTime.toFixed(0)}ms`,
        threshold: `${thresholds.maxShutdownTime.toFixed(0)}ms`,
      },
    });
  }

  if (metrics.consecutiveFailures >= thresholds.maxConsecutiveFailures) {
    anomalies.push({
      type: "consecutive_failures",
      severity:
        metrics.consecutiveFailures >= thresholds.maxConsecutiveFailures * 2 ? "critical" : "high",
      message: `Service ${String(serviceName)} has ${metrics.consecutiveFailures} consecutive failures`,
      details: {
        failures: metrics.consecutiveFailures,
        threshold: thresholds.maxConsecutiveFailures.toString(),
      },
    });
  }

  if (metrics.uptimePercentage < thresholds.minUptimePercentage) {
    anomalies.push({
      type: "low_uptime",
      severity: metrics.uptimePercentage < thresholds.minUptimePercentage * 0.8 ? "high" : "medium",
      message: `Service ${String(serviceName)} uptime is below threshold`,
      details: {
        uptime: `${metrics.uptimePercentage.toFixed(1)}%`,
        threshold: `${thresholds.minUptimePercentage}%`,
      },
    });
  }

  if (metrics.lastLatency && metrics.lastLatency > (thresholds.maxLatency || 50)) {
    const maxLat = thresholds.maxLatency || 50;
    const excessPercent = (metrics.lastLatency / maxLat - 1) * 100;

    anomalies.push({
      type: "slow_response",
      severity: excessPercent > 100 ? "high" : "medium",
      message: `Service ${String(serviceName)} response is slower than enterprise standards`,
      details: {
        actual: `${metrics.lastLatency.toFixed(1)}ms`,
        threshold: `${maxLat.toFixed(0)}ms`,
        excess: `${excessPercent.toFixed(0)}%`,
      },
    });
  }

  if (
    metrics.stateTimings.startup.trend === "degrading" &&
    metrics.stateTimings.startup.count > 10
  ) {
    anomalies.push({
      type: "degrading_performance",
      severity: "medium",
      message: `Service ${String(serviceName)} performance is degrading over time`,
      details: {
        trend: metrics.stateTimings.startup.trend,
        avgTime: `${metrics.stateTimings.startup.avgTime?.toFixed(0)}ms`,
        lastTime: `${metrics.stateTimings.startup.lastTime?.toFixed(0)}ms`,
      },
    });
  }

  if (anomalies.length > 0) {
    anomalies.forEach((anomaly) => {
      if (anomaly.severity === "critical" || anomaly.severity === "high") {
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
export function updateUptimeMetrics(
  serviceName: ServiceName,
  store: Writable<SystemStateStore>,
): void {
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
        [serviceName]: service,
      },
    };
  });
}

/**
 * Load historical metrics from the database and hydrate the store.
 *
 * Browser-safe no-op.
 * Persistent historical metrics must be loaded through a server-only endpoint/service.
 */
export async function loadHistoricalMetrics(_store: Writable<SystemStateStore>): Promise<void> {
  return;
}

/**
 * Save current performance metrics to the database.
 *
 * Browser-safe no-op.
 * Persistent metrics saving must happen through a server-only endpoint/service.
 */
export async function saveCurrentMetrics(_store: Writable<SystemStateStore>): Promise<void> {
  return;
}
