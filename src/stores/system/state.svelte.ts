/**
 * @file src/stores/system/state.svelte.ts
 * @description Core state management for the SveltyCMS system.
 *
 * Features:
 * - Centralized state management for the SveltyCMS system
 * - Service health monitoring and state transitions
 * - Performance metrics tracking and anomaly detection
 * - Self-learning state machine with adaptive calibration
 * - Setup benchmarking and performance tracking
 * - 🚀 Hot-path caching: isSystemReady() result cached until state transitions
 */

import { logger } from "@utils/logger";
import type { Readable, Writable } from "svelte/store";
import { derived, writable } from "svelte/store";
import type {
  ServiceHealth,
  ServiceName,
  ServicePerformanceMetrics,
  ServiceStatus,
  SystemState,
  SystemStateStore,
} from "./types";
export type { ServiceName };

import { initialState, initialServiceMetrics } from "./config";
import {
  calibrateAnomalyThresholds,
  detectAnomalies,
  saveCurrentMetrics,
} from "./metrics";

// 🚀 MODULE-LEVEL STATE MIRROR: overallState stored as a primitive string.
// Eliminates getSystemState().overallState property chain on every gatekeeper check.
// Synchronized on setSystemState() and updateService() calls.
let _overallState: SystemState = "IDLE";

/** Returns the module-level overall state — zero overhead, no object access */
export function getOverallState(): SystemState {
  return _overallState;
}

/** Returns readiness — single string comparison, no function calls */
export function isSystemReady(): boolean {
  if (
    process.env.TEST_MODE === "true" &&
    process.env.SKIP_GATEKEEPER === "true"
  ) {
    return true;
  }
  const s = _overallState;
  return s === "READY" || s === "WARMED" || s === "WARMING" || s === "DEGRADED";
}

/** Synchronize module-level mirror after state changes */
function syncOverallState(newState: SystemState) {
  _overallState = newState;
}

// Svelte 5 Reactive Class for Enterprise Performance
class SystemStateContainer {
  #state = $state(initialState);

  get state() {
    return this.#state;
  }
  set state(val) {
    this.#state = val;
  }

  // $derived overall state for zero-tax computation
  get overall() {
    return deriveOverallState(this.#state.services);
  }

  // Backward compatibility for .subscribe()
  subscribe(fn: (v: SystemStateStore) => void) {
    return systemStateStore.subscribe(fn);
  }

  update(fn: (v: SystemStateStore) => SystemStateStore) {
    const next = fn(this.#state);
    this.set(next);
  }

  set(val: SystemStateStore) {
    this.#state = val;
    syncOverallState(this.#state.overallState);
    systemStateStore.set(this.#state);
  }

  // High-performance partial update
  patch(partial: Partial<SystemStateStore>) {
    Object.assign(this.#state, partial);
    this.#state.overallState = deriveOverallState(this.#state.services);
    syncOverallState(this.#state.overallState);
    systemStateStore.set(this.#state);
  }

  updateService(
    name: keyof SystemStateStore["services"],
    health: Partial<ServiceStatus>,
  ) {
    const current = this.#state.services[name] || {
      status: "initializing",
      message: "Starting...",
      lastChecked: Date.now(),
      metrics: { ...initialServiceMetrics },
    };
    this.#state.services[name] = {
      ...current,
      ...health,
      lastChecked: Date.now(),
    };
    // 🚀 OPTIMIZATION: Only recalculate overall state if a critical service changed.
    // Non-critical service changes (widgets, themeManager, contentSystem, cache, media, search)
    // cannot cause FAILED/INITIALIZING transitions — only database and auth can.
    const isCritical = name === "database" || name === "auth";
    if (isCritical || current.status !== health.status) {
      this.#state.overallState = deriveOverallState(this.#state.services);
      syncOverallState(this.#state.overallState);
    }
    systemStateStore.set(this.#state);
  }
}

export const system = new SystemStateContainer();

// Keep the legacy store for compatibility with old components
export const systemStateStore: Writable<SystemStateStore> =
  writable(initialState);

/**
 * Centralized helper for transitioning a service's state and updating metrics.
 * This reduces code duplication and ensures consistent state transitions.
 */
function transitionServiceState(
  state: SystemStateStore,
  serviceName: keyof SystemStateStore["services"],
  newStatus: ServiceHealth,
  message: string,
  error?: string,
): SystemStateStore {
  const now = Date.now();

  // 🚀 HARDENING: Defensive check for missing services
  if (!state.services[serviceName]) {
    state.services[serviceName] = {
      status: "initializing",
      message: "Auto-registered during transition",
      metrics: structuredClone(initialServiceMetrics),
    };
  }

  const service = state.services[serviceName];
  const metrics: ServicePerformanceMetrics = { ...service.metrics };

  // Log only on transition
  if (service.status !== newStatus) {
    const isQuiet =
      (typeof globalThis !== "undefined" &&
        (globalThis as any).__SVELTY_QUIET__) ||
      (typeof process !== "undefined" &&
        (process.env.QUIET === "true" || process.env.BENCHMARK === "true"));

    if (!isQuiet) {
      logger.debug(
        `[ServiceTransition] ${serviceName}: ${service.status} → ${newStatus} (${message})`,
      );
    }
  }

  // Track initialization completion
  if (
    newStatus === "healthy" &&
    service.status === "initializing" &&
    metrics.initializationStartedAt
  ) {
    const duration = now - metrics.initializationStartedAt;
    metrics.initializationCompletedAt = now;
    metrics.initializationDuration = duration;

    // Update running statistics with EMA (Exponential Moving Average)
    const alpha = 0.2; // Fixed smoothing factor for stable long-term behavior
    if (metrics.averageInitTime) {
      metrics.averageInitTime =
        alpha * duration + (1 - alpha) * metrics.averageInitTime;
      metrics.minInitTime = Math.min(metrics.minInitTime ?? duration, duration);
      metrics.maxInitTime = Math.max(metrics.maxInitTime ?? duration, duration);
    } else {
      metrics.averageInitTime = duration;
      metrics.minInitTime = duration;
      metrics.maxInitTime = duration;
    }

    logger.info(`✓ Service ${serviceName} initialized in ${duration}ms`, {
      average: metrics.averageInitTime.toFixed(2),
      min: metrics.minInitTime,
      max: metrics.maxInitTime,
    });

    metrics.consecutiveFailures = 0;
  }

  // Track failures - increment on every unhealthy status
  if (newStatus === "unhealthy") {
    metrics.consecutiveFailures++;
    metrics.failureCount++;

    // Log only on transition to unhealthy
    if (service.status !== "unhealthy") {
      metrics.lastFailureAt = now;
      logger.warn(
        `Service ${serviceName} became unhealthy (failure #${metrics.failureCount}, consecutive: ${metrics.consecutiveFailures})`,
        {
          error,
        },
      );
    }
  }

  // Track recovery
  if (newStatus === "healthy" && service.status === "unhealthy") {
    logger.info(`✓ Service ${serviceName} recovered from failure`);
    metrics.consecutiveFailures = 0;
  }

  // Update health check timestamp
  metrics.healthCheckCount++;
  metrics.lastHealthCheckAt = now;

  const updatedState: SystemStateStore = {
    ...state,
    services: {
      ...state.services,
      [serviceName]: {
        status: newStatus,
        message,
        lastChecked: now,
        ...(error && { error }),
        metrics,
      },
    },
    lastStateChange: now,
  };

  // Derive the new overall system state from the updated service statuses
  const derivedState = deriveOverallState(updatedState.services);
  updatedState.overallState = derivedState;

  // Track successful initialization if state auto-derived to READY from INITIALIZING
  if (
    derivedState === "READY" &&
    state.overallState === "INITIALIZING" &&
    state.performanceMetrics.totalInitializations > 0
  ) {
    const duration = state.initializationStartedAt
      ? now - state.initializationStartedAt
      : 0;
    updatedState.performanceMetrics = {
      ...state.performanceMetrics,
      successfulInitializations:
        state.performanceMetrics.successfulInitializations + 1,
      lastInitDuration: duration,
    };
    logger.info(
      `✓ System auto-transitioned to READY (initialization completed in ${duration}ms)`,
    );
  }

  return updatedState;
}

/**
 * Start tracking initialization for a service
 */
export function startServiceInitialization(
  serviceName: keyof SystemStateStore["services"],
): void {
  const now = Date.now();
  system.update((state) => {
    const service = state.services[serviceName];
    return {
      ...state,
      services: {
        ...state.services,
        [serviceName]: {
          ...service,
          status: "initializing" as ServiceHealth,
          metrics: {
            ...service.metrics,
            initializationStartedAt: now,
            restartCount:
              service.metrics.restartCount +
              (service.metrics.initializationStartedAt ? 1 : 0),
          },
        },
      },
    };
  });
}

/**
 * Update a specific service's health status with performance tracking
 */
export function updateServiceHealth(
  serviceName: keyof SystemStateStore["services"],
  status: ServiceHealth,
  message: string,
  error?: string,
): void {
  // Use the centralized transition helper
  system.update((state) => {
    const updatedState = transitionServiceState(
      state,
      serviceName,
      status,
      message,
      error,
    );

    // --- Post-transition side effects (now inside update for state consistency) ---

    // Update uptime metrics after state change
    const service = updatedState.services[serviceName];
    const metrics = service.metrics;

    // Calculate uptime percentage
    if (metrics.healthCheckCount > 0) {
      const healthyChecks = metrics.healthCheckCount - metrics.failureCount;
      metrics.uptimePercentage =
        (healthyChecks / metrics.healthCheckCount) * 100;
    }

    // Track state transition timing if status changed
    if (status === "healthy" && metrics.initializationDuration) {
      // We can't call store.update inside store.update, so we manually track the transition here
      // but for simplicity and consistency, let's just ensure the state is consistent.
    }

    return updatedState;
  });

  // Post-update side effects that need the store to be stable
  const state = getSystemState();
  const updatedService = state.services[serviceName];

  // Auto-calibrate thresholds periodically (every 10 health checks)
  const currentMetrics = updatedService.metrics;
  if (
    currentMetrics.healthCheckCount > 0 &&
    currentMetrics.healthCheckCount % 10 === 0
  ) {
    calibrateAnomalyThresholds(serviceName, systemStateStore);
    saveCurrentMetrics(systemStateStore);
  }

  // Detect and report anomalies (Only if system is fully ready/warmed to avoid false positives during setup)
  if (state.overallState !== "INITIALIZING" && state.overallState !== "SETUP") {
    const anomalies = detectAnomalies(serviceName, state);
    if (
      anomalies.some((a) => a.severity === "critical" || a.severity === "high")
    ) {
      logger.error(
        `🚨 ${anomalies.length} anomal${anomalies.length > 1 ? "ies" : "y"} detected for ${serviceName}`,
      );
    }
  }
}

/**
 * Update a service's latency metrics (Heartbeat) and check for performance anomalies.
 */
export function updateServiceLatency(
  serviceName: keyof SystemStateStore["services"],
  latency: number,
): void {
  system.update((state) => {
    const service = state.services[serviceName];
    if (!service) return state;

    const metrics = { ...service.metrics };
    metrics.lastLatency = latency;

    // Update average latency using EMA (Exponential Moving Average)
    const alpha = 0.1;
    if (metrics.averageLatency && metrics.averageLatency > 0) {
      metrics.averageLatency =
        alpha * latency + (1 - alpha) * metrics.averageLatency;
    } else {
      metrics.averageLatency = latency;
    }

    // Check against threshold
    const threshold = metrics.anomalyThresholds.maxLatency || 50;
    if (latency > threshold) {
      logger.warn(
        `⚠️ High latency detected for ${serviceName}: ${latency.toFixed(2)}ms (Threshold: ${threshold}ms)`,
      );
    }

    return {
      ...state,
      services: {
        ...state.services,
        [serviceName]: {
          ...service,
          metrics,
        },
      },
    };
  });
}

/**
 * Set the overall system state with transition tracking
 */
export function setSystemState(state: SystemState, reason?: string): void {
  const now = Date.now();

  system.update((current) => {
    const transition = {
      from: current.overallState,
      to: state,
      timestamp: now,
      ...(reason && { reason }),
    };

    // Keep last 50 transitions for analysis
    const stateTransitions = [
      ...current.performanceMetrics.stateTransitions,
      transition,
    ].slice(-50);

    // Track initialization metrics
    const performanceMetrics = {
      ...current.performanceMetrics,
      stateTransitions,
    };

    if (state === "INITIALIZING" && current.overallState !== "INITIALIZING") {
      performanceMetrics.totalInitializations++;
    }

    if (
      state === "READY" &&
      current.overallState !== "READY" &&
      performanceMetrics.totalInitializations > 0
    ) {
      const duration = current.initializationStartedAt
        ? now - current.initializationStartedAt
        : 0;
      performanceMetrics.successfulInitializations++;
      performanceMetrics.lastInitDuration = duration;

      // Update running statistics
      if (performanceMetrics.averageTotalInitTime) {
        const count = performanceMetrics.successfulInitializations;
        performanceMetrics.averageTotalInitTime =
          (performanceMetrics.averageTotalInitTime * (count - 1) + duration) /
          count;
        performanceMetrics.minTotalInitTime = Math.min(
          performanceMetrics.minTotalInitTime ?? duration,
          duration,
        );
        performanceMetrics.maxTotalInitTime = Math.max(
          performanceMetrics.maxTotalInitTime ?? duration,
          duration,
        );
      } else {
        performanceMetrics.averageTotalInitTime = duration;
        performanceMetrics.minTotalInitTime = duration;
        performanceMetrics.maxTotalInitTime = duration;
      }

      logger.info(`🚀 System initialization completed in ${duration}ms`, {
        average: performanceMetrics.averageTotalInitTime.toFixed(2),
        min: performanceMetrics.minTotalInitTime,
        max: performanceMetrics.maxTotalInitTime,
        successRate: `${((performanceMetrics.successfulInitializations / performanceMetrics.totalInitializations) * 100).toFixed(1)}%`,
      });
    }

    if (state === "FAILED" && current.overallState === "INITIALIZING") {
      performanceMetrics.failedInitializations++;
    }

    logger.info(`System state changed: ${current.overallState} → ${state}`, {
      reason,
    });

    return {
      ...current,
      overallState: state,
      lastStateChange: now,
      performanceMetrics,
      ...(state === "INITIALIZING" && { initializationStartedAt: now }),
      ...(state === "READY" &&
        current.initializationStartedAt && { initializationCompletedAt: now }),
    };
  });
  syncOverallState(state);
}

// Derive overall system state from individual service statuses
function deriveOverallState(
  services: SystemStateStore["services"],
): SystemState {
  const criticalServices = ["database", "auth"] as const;
  const allServices = Object.keys(services) as ServiceName[];

  // 1. Check for MAINTENANCE mode
  const anyMaintenance = allServices.some(
    (service) => services[service].status === "maintenance",
  );
  if (anyMaintenance) {
    return "MAINTENANCE";
  }

  // 2. Check for RECOVERY mode (Autonomous healing in progress)
  const anyRecovery = criticalServices.some(
    (service) =>
      services[service].status === "initializing" &&
      services[service].message.includes("recovery"),
  );
  if (anyRecovery) {
    return "RECOVERY";
  }

  // 3. Check if any critical service is unhealthy
  const criticalUnhealthy = criticalServices.some(
    (service) => services[service].status === "unhealthy",
  );
  if (criticalUnhealthy) {
    return "FAILED";
  }

  // 3. Check if any critical service is still initializing
  const criticalInitializing = criticalServices.some(
    (service) => services[service].status === "initializing",
  );
  if (criticalInitializing) {
    return "INITIALIZING";
  }

  // 4. Check for SETUP mode (Critical services healthy, but Widgets/Themes are skipped)
  // If critical services are ready, but we skipped widgets/themes (e.g. during setup), we are in SETUP mode
  const widgetsSkipped = services.widgets?.status === "skipped";
  const themeSkipped = services.themeManager?.status === "skipped";
  if (widgetsSkipped && themeSkipped) {
    return "SETUP";
  }

  // 5. Check if all services are healthy (WARMED)
  // Ignore 'skipped' services for this check unless ALL non-critical are skipped (which is handled by SETUP above)
  const allHealthy = allServices.every(
    (service) =>
      services[service]?.status === "healthy" ||
      services[service]?.status === "skipped",
  );
  if (allHealthy) {
    return "WARMED";
  }

  // 6. Check if some services are unhealthy (DEGRADED)
  const anyUnhealthy = allServices.some(
    (service) => services[service].status === "unhealthy",
  );
  if (anyUnhealthy) {
    return "DEGRADED";
  }

  // 7. If critical services are healthy but some non-critical services are still initializing (WARMING)
  const anyInitializing = allServices.some(
    (service) => services[service].status === "initializing",
  );
  if (anyInitializing) {
    return "WARMING";
  }

  return "READY";
}

// Get the current system state (synchronous)
export function getSystemState(): SystemStateStore {
  return system.state;
}

// isSystemReady() is defined at module level (see top of file) for zero-overhead access

// Check if a specific service is healthy (synchronous)
export function isServiceHealthy(serviceName: ServiceName): boolean {
  const state = getSystemState();
  return state.services[serviceName].status === "healthy";
}

// Reset system state to IDLE (used for shutdown or reinitialization)
export function resetSystemState(): void {
  logger.info("Resetting system state to IDLE");
  system.set({
    ...structuredClone(initialState),
    lastStateChange: Date.now(),
  });
}

// Get a readable store for the system state (for Svelte components)
export const systemState: Readable<SystemStateStore> = derived(
  systemStateStore,
  (state) => state,
);

// Get a readable store for just the overall state (for simple checks)
export const overallState: Readable<SystemState> = derived(
  systemStateStore,
  (state) => state.overallState,
);

// --- Granular Derived Stores for Improved Reactivity ---

/**
 * A derived store that returns true if the system is in a ready or degraded state.
 * Ideal for use in UI components to show/hide content based on system readiness.
 */
export const isReady: Readable<boolean> = derived(
  overallState,
  (s) => s === "READY" || s === "WARMED" || s === "WARMING" || s === "DEGRADED",
);

/**
 * A derived store that returns true if the system is currently initializing.
 */
export const isInitializing: Readable<boolean> = derived(
  overallState,
  (s) => s === "INITIALIZING",
);

/**
 * A derived store that returns true if the system is currently serving traffic (READY, WARMING, or WARMED).
 */
export const isServing: Readable<boolean> = derived(
  overallState,
  (s) => s === "WARMING" || s === "READY" || s === "WARMED",
);

/**
 * A derived store that returns true if the system is fully warmed up.
 */
export const isWarmed: Readable<boolean> = derived(
  overallState,
  (s) => s === "WARMED",
);

/**
 * A derived store that returns true if the system has failed.
 */
export const isFailed: Readable<boolean> = derived(
  overallState,
  (s) => s === "FAILED",
);

/**
 * A derived store that returns true if the system is in a degraded state.
 */
export const isDegraded: Readable<boolean> = derived(
  overallState,
  (s) => s === "DEGRADED",
);

/**
 * A derived store containing the status of all individual services.
 */
export const servicesStatus: Readable<SystemStateStore["services"]> = derived(
  systemState,
  (s) => s.services,
);

/**
 * Individual derived stores for each service's status.
 * This allows components to subscribe to only the service they care about.
 */
export const databaseStatus: Readable<ServiceStatus> = derived(
  servicesStatus,
  (s) => s.database,
);
export const authStatus: Readable<ServiceStatus> = derived(
  servicesStatus,
  (s) => s.auth,
);
export const cacheStatus: Readable<ServiceStatus> = derived(
  servicesStatus,
  (s) => s.cache,
);
export const contentSystemStatus: Readable<ServiceStatus> = derived(
  servicesStatus,
  (s) => s.contentSystem,
);
export const themeManagerStatus: Readable<ServiceStatus> = derived(
  servicesStatus,
  (s) => s.themeManager,
);
