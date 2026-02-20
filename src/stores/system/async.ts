/**
 * @file src/stores/system/async.ts
 * @description Asynchronous utilities for waiting on system state.
 */

import { logger } from '@utils/logger';
import { DEFAULT_SYSTEM_READY_TIMEOUT, SERVICE_BASELINE_TIMES } from './config';
import { getSystemState, systemState } from './state';
import type { ServiceName } from './types';

interface WaitOptions {
	signal?: AbortSignal;
	timeoutMs?: number;
}

/**
 * Wait for the system to be ready (async with AbortSignal support)
 */
export async function waitForSystemReady(options: WaitOptions = {}): Promise<boolean> {
	const { timeoutMs = DEFAULT_SYSTEM_READY_TIMEOUT, signal } = options;

	if (signal?.aborted) {
		return Promise.reject(new DOMException('Aborted', 'AbortError'));
	}

	// Check initial state synchronously
	let currentState = getSystemState();
	if (currentState.overallState === 'READY' || currentState.overallState === 'DEGRADED') {
		return true;
	}
	if (currentState.overallState === 'FAILED') {
		return false;
	}

	return new Promise((resolve, reject) => {
		let timeoutId: NodeJS.Timeout | undefined;

		const cleanup = () => {
			clearTimeout(timeoutId);
			unsubscribe();
			signal?.removeEventListener('abort', onAbort);
		};

		const onAbort = () => {
			cleanup();
			reject(new DOMException('Aborted', 'AbortError'));
		};

		const unsubscribe = systemState.subscribe((state) => {
			if (state.overallState === 'READY' || state.overallState === 'DEGRADED') {
				cleanup();
				resolve(true);
			} else if (state.overallState === 'FAILED') {
				cleanup();
				resolve(false);
			}
		});

		signal?.addEventListener('abort', onAbort, { once: true });

		if (timeoutMs > 0) {
			timeoutId = setTimeout(() => {
				cleanup();
				currentState = getSystemState();
				logger.warn(`System ready timeout after ${timeoutMs}ms`, {
					state: currentState.overallState
				});
				resolve(false);
			}, timeoutMs);
		}
	});
}

/**
 * Calculate intelligent timeout for a service based on historical performance
 */
export function getServiceTimeout(serviceName: ServiceName, multiplier = 3): number {
	const state = getSystemState();
	const service = state.services[serviceName];
	const baseline = SERVICE_BASELINE_TIMES[serviceName];

	// If we have historical data, use average + buffer
	if (service.metrics.averageInitTime) {
		// Use 3x average or max time (whichever is larger) as timeout
		const calculated = Math.max(service.metrics.averageInitTime * multiplier, (service.metrics.maxInitTime ?? baseline) * 1.5);
		return Math.min(calculated, 30_000); // Cap at 30 seconds
	}

	// Fallback to baseline * multiplier
	return baseline * multiplier;
}

/**
 * Wait for a specific service to be healthy with AbortSignal support
 */
export async function waitForServiceHealthy(serviceName: ServiceName, options: WaitOptions = {}): Promise<boolean> {
	const { timeoutMs, signal } = options;
	const effectiveTimeout = timeoutMs ?? getServiceTimeout(serviceName);

	if (signal?.aborted) {
		return Promise.reject(new DOMException('Aborted', 'AbortError'));
	}

	// Check initial state synchronously
	let currentState = getSystemState();
	if (currentState.services[serviceName].status === 'healthy') {
		return true;
	}
	if (currentState.services[serviceName].status === 'unhealthy') {
		return false;
	}

	return new Promise((resolve, reject) => {
		let timeoutId: NodeJS.Timeout | undefined;

		const cleanup = () => {
			clearTimeout(timeoutId);
			unsubscribe();
			signal?.removeEventListener('abort', onAbort);
		};

		const onAbort = () => {
			cleanup();
			reject(new DOMException('Aborted', 'AbortError'));
		};

		const unsubscribe = systemState.subscribe((state) => {
			const service = state.services[serviceName];
			if (service.status === 'healthy') {
				cleanup();
				resolve(true);
			} else if (service.status === 'unhealthy') {
				cleanup();
				resolve(false);
			}
		});

		signal?.addEventListener('abort', onAbort, { once: true });

		if (effectiveTimeout > 0) {
			timeoutId = setTimeout(() => {
				cleanup();
				currentState = getSystemState();
				logger.warn(`Service ${serviceName} healthy timeout after ${effectiveTimeout}ms`, {
					status: currentState.services[serviceName].status
				});
				resolve(false);
			}, effectiveTimeout);
		}
	});
}
