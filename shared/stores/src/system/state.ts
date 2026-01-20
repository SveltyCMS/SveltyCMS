/**
 * @file shared/stores/src/system/state.ts
 * @description Core state management for the SveltyCMS system.
 */

import { writable, derived, get } from 'svelte/store';
import type { Writable, Readable } from 'svelte/store';
import { logger } from '@shared/utils/logger';
import type {
	SystemStateStore,
	SystemState,
	ServiceHealth,
	ServiceStatus,
	ServicePerformanceMetrics,
	SystemPerformanceMetrics,
	ServiceName,
	InitializationStage
} from './types';
import { initialState } from './config';
export { initialState };
import { updateUptimeMetrics, trackStateTransition, calibrateAnomalyThresholds, detectAnomalies } from './metrics';

// Create the writable store
export const systemStateStore: Writable<SystemStateStore> = writable(initialState);

// --- Event Bus ---
type SystemEventType =
	| 'SYSTEM:READY'
	| 'SYSTEM:FAILED'
	| 'SYSTEM:DEGRADED'
	| 'SERVICE:HEALTHY'
	| 'SERVICE:UNHEALTHY'
	| 'BREAKER:TRIPPED'
	| 'STAGE:CHANGED';
type SystemEventCallback = (detail: any) => void;

class SystemEventBus {
	private listeners: Map<SystemEventType, Set<SystemEventCallback>> = new Map();

	on(event: SystemEventType, callback: SystemEventCallback): () => void {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, new Set());
		}
		this.listeners.get(event)!.add(callback);
		return () => this.off(event, callback);
	}

	off(event: SystemEventType, callback: SystemEventCallback): void {
		this.listeners.get(event)?.delete(callback);
	}

	emit(event: SystemEventType, detail?: any): void {
		this.listeners.get(event)?.forEach((callback) => {
			try {
				callback(detail);
			} catch (err) {
				logger.error(`Error in system event listener for ${event}:`, err);
			}
		});
	}
}

export const systemEvents = new SystemEventBus();

/**
 * Centralized helper for transitioning a service's state and updating metrics.
 * This reduces code duplication and ensures consistent state transitions.
 */
function transitionServiceState(
	state: SystemStateStore,
	serviceName: keyof SystemStateStore['services'],
	newStatus: ServiceHealth,
	message: string,
	error?: string
): SystemStateStore {
	const now = Date.now();
	const service = state.services[serviceName];
	const metrics: ServicePerformanceMetrics = { ...service.metrics };

	// Track initialization completion
	if (newStatus === 'healthy' && service.status === 'initializing' && metrics.initializationStartedAt) {
		const duration = now - metrics.initializationStartedAt;
		metrics.initializationCompletedAt = now;
		metrics.initializationDuration = duration;

		// Update running statistics with EMA (Exponential Moving Average)
		const alpha = 2 / (metrics.healthCheckCount + 1); // Smoothing factor
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

	// Track failures - increment on every unhealthy status
	if (newStatus === 'unhealthy') {
		metrics.consecutiveFailures++;
		metrics.failureCount++;

		// Log only on transition to unhealthy
		if (service.status !== 'unhealthy') {
			metrics.lastFailureAt = now;
			logger.warn(`Service ${serviceName} became unhealthy (failure #${metrics.failureCount}, consecutive: ${metrics.consecutiveFailures})`, {
				error
			});
			systemEvents.emit('SERVICE:UNHEALTHY', { service: serviceName, error });
		}

		// --- Circuit Breaker Logic ---
		const threshold = metrics.anomalyThresholds.maxConsecutiveFailures || 5;
		if (metrics.consecutiveFailures >= threshold) {
			logger.error(`🚨 Circuit Breaker TRIPPED for ${serviceName} after ${metrics.consecutiveFailures} consecutive failures.`);
			newStatus = 'breaker_tripped';
			systemEvents.emit('BREAKER:TRIPPED', { service: serviceName });

			// Initialize circuit breaker state if missing
			if (!service.circuitBreaker) {
				// We can't easily mutate service here without it being in the store update cycle properly
				// But we are constructing `updatedState` below
			}
		}
	}

	// Track recovery
	if (newStatus === 'healthy' && (service.status === 'unhealthy' || service.status === 'breaker_tripped')) {
		logger.info(`✓ Service ${serviceName} recovered from failure`);
		metrics.consecutiveFailures = 0;
		systemEvents.emit('SERVICE:HEALTHY', { service: serviceName });
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
				// Update circuit breaker info if tripped
				...(newStatus === 'breaker_tripped' && {
					circuitBreaker: {
						failures: metrics.consecutiveFailures,
						lastFailure: now,
						nextRetry: now + 30000, // 30s cooldown
						isOpen: true
					}
				}),
				// Clear circuit breaker if healthy
				...(newStatus === 'healthy' && { circuitBreaker: undefined })
			}
		},
		lastStateChange: now
	};

	// Derive the new overall system state from the updated service statuses
	const derivedState = deriveOverallState(updatedState.services);
	updatedState.overallState = derivedState;

	// Track successful initialization if state auto-derived to READY from INITIALIZING
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

// Start tracking initialization for a service
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

// Update a specific service's health status with performance tracking
export function updateServiceHealth(serviceName: keyof SystemStateStore['services'], status: ServiceHealth, message: string, error?: string): void {
	// Use the centralized transition helper
	systemStateStore.update((state) => transitionServiceState(state, serviceName, status, message, error));

	// --- Post-transition side effects ---

	// Update uptime metrics after state change
	updateUptimeMetrics(serviceName, systemStateStore);

	// Track state transition timing if status changed
	const updatedService = getSystemState().services[serviceName];
	if (status === 'healthy' && updatedService.metrics.initializationDuration) {
		const duration = updatedService.metrics.initializationDuration;
		trackStateTransition(serviceName, 'initializing', 'healthy', duration, systemStateStore);
	}

	// Auto-calibrate thresholds periodically (every 10 health checks)
	const currentMetrics = updatedService.metrics;
	if (currentMetrics.healthCheckCount > 0 && currentMetrics.healthCheckCount % 10 === 0) {
		calibrateAnomalyThresholds(serviceName, systemStateStore);
	}

	// Detect and report anomalies
	const anomalies = detectAnomalies(serviceName, getSystemState());

	// You can integrate with notification system here
	if (anomalies.length > 0 && anomalies.some((a) => a.severity === 'critical' || a.severity === 'high')) {
		// TODO: Integrate with notification system (email, Slack, etc.)
		logger.error(`🚨 ${anomalies.length} anomal${anomalies.length > 1 ? 'ies' : 'y'} detected for ${serviceName}`);
	}
}

// Set the overall system state with transition tracking
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

		if (state === 'READY' && current.overallState !== 'READY' && performanceMetrics.totalInitializations > 0) {
			const duration = current.initializationStartedAt ? now - current.initializationStartedAt : 0;
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

		logger.info(`System state changed: ${current.overallState} → ${state}`, { reason });

		const updatedState = {
			...current,
			overallState: state,
			lastStateChange: now,
			performanceMetrics,
			...(state === 'INITIALIZING' && { initializationStartedAt: now }),
			...(state === 'READY' && current.initializationStartedAt && { initializationCompletedAt: now })
		};

		// Emit event
		if (state === 'READY') systemEvents.emit('SYSTEM:READY');
		if (state === 'FAILED') systemEvents.emit('SYSTEM:FAILED', { reason });
		if (state === 'DEGRADED') systemEvents.emit('SYSTEM:DEGRADED', { reason });

		return updatedState;
	});
}

// Update the granular initialization stage
export function setInitializationStage(stage: InitializationStage): void {
	systemStateStore.update((state) => {
		logger.debug(`[SystemState] Stage: ${state.initializationStage} -> ${stage}`);
		systemEvents.emit('STAGE:CHANGED', { from: state.initializationStage, to: stage });
		return { ...state, initializationStage: stage };
	});
}

// Reset a tripped circuit breaker for a service
export function resetCircuitBreaker(serviceName: keyof SystemStateStore['services']): void {
	logger.info(`Manual reset of circuit breaker for ${serviceName}`);
	systemStateStore.update((state) => {
		const service = state.services[serviceName];
		return {
			...state,
			services: {
				...state.services,
				[serviceName]: {
					...service,
					status: 'initializing' as ServiceHealth, // Reset to initializing to allow retry
					message: 'Circuit breaker reset - retrying...',
					metrics: {
						...service.metrics,
						consecutiveFailures: 0 // Reset failures to allow retry
					},
					circuitBreaker: undefined // Clear breaker
				}
			}
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

// Get the current system performance metrics (synchronous)
export function getSystemMetrics(): SystemPerformanceMetrics {
	return get(systemStateStore).performanceMetrics;
}

// Check if the system is ready (synchronous)
export function isSystemReady(): boolean {
	const state = getSystemState();
	return state.overallState === 'READY' || state.overallState === 'DEGRADED';
}

// Check if a specific service is healthy (synchronous)
export function isServiceHealthy(serviceName: ServiceName): boolean {
	const state = getSystemState();
	return state.services[serviceName].status === 'healthy';
}

// Reset system state to IDLE (used for shutdown or reinitialization)
export function resetSystemState(): void {
	logger.info('Resetting system state to IDLE');
	systemStateStore.set({
		...structuredClone(initialState),
		lastStateChange: Date.now()
	});
}

// Get a readable store for the system state (for Svelte components)
export const systemState: Readable<SystemStateStore> = derived(systemStateStore, ($state) => $state);

// Get a readable store for just the overall state (for simple checks)
export const overallState: Readable<SystemState> = derived(systemStateStore, ($state) => $state.overallState);

// --- Granular Derived Stores for Improved Reactivity ---

/**
 * A derived store that returns true if the system is in a ready or degraded state.
 * Ideal for use in UI components to show/hide content based on system readiness.
 */
export const isReady: Readable<boolean> = derived(overallState, ($s) => $s === 'READY' || $s === 'DEGRADED');

// A derived store that returns true if the system is currently initializing.
export const isInitializing: Readable<boolean> = derived(overallState, ($s) => $s === 'INITIALIZING');

// A derived store that returns true if the system has failed.
export const isFailed: Readable<boolean> = derived(overallState, ($s) => $s === 'FAILED');

// A derived store that returns true if the system is in a degraded state.
export const isDegraded: Readable<boolean> = derived(overallState, ($s) => $s === 'DEGRADED');

// A derived store containing the status of all individual services.
export const servicesStatus: Readable<SystemStateStore['services']> = derived(systemState, ($s) => $s.services);

/**
 * Individual derived stores for each service's status.
 * This allows components to subscribe to only the service they care about.
 */
export const databaseStatus: Readable<ServiceStatus> = derived(servicesStatus, ($s) => $s.database);
export const authStatus: Readable<ServiceStatus> = derived(servicesStatus, ($s) => $s.auth);
export const cacheStatus: Readable<ServiceStatus> = derived(servicesStatus, ($s) => $s.cache);
export const contentManagerStatus: Readable<ServiceStatus> = derived(servicesStatus, ($s) => $s.contentManager);
export const themeManagerStatus: Readable<ServiceStatus> = derived(servicesStatus, ($s) => $s.themeManager);
