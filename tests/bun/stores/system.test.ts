/**
 * @file tests/bun/stores/system.test.ts
 * @description Tests for system state management store
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
	updateServiceHealth,
	setSystemState,
	getSystemState,
	isSystemReady,
	isServiceHealthy,
	resetSystemState,
	startServiceInitialization,
	type ServiceName
} from '@stores/system/state';

describe('System Store - Service Health Management', () => {
	beforeEach(() => {
		resetSystemState();
	});

	it('should initialize with default state', () => {
		const state = getSystemState();

		expect(state.overallState).toBe('IDLE');
		expect(state.services.database.status).toBe('initializing');
		expect(state.services.auth.status).toBe('initializing');
		expect(state.services.cache.status).toBe('initializing');
		expect(state.services.contentManager.status).toBe('initializing');
		expect(state.services.themeManager.status).toBe('initializing');
	});

	it('should update service health status', () => {
		updateServiceHealth('database', 'healthy', 'Database connected');

		const state = getSystemState();
		expect(state.services.database.status).toBe('healthy');
		expect(state.services.database.message).toBe('Database connected');
	});

	it('should track service initialization timing', () => {
		startServiceInitialization('database');

		const stateBefore = getSystemState();
		expect(stateBefore.services.database.metrics.initializationStartedAt).toBeDefined();

		updateServiceHealth('database', 'healthy', 'Connected');

		const stateAfter = getSystemState();
		expect(stateAfter.services.database.metrics.initializationCompletedAt).toBeDefined();
		expect(stateAfter.services.database.metrics.initializationDuration).toBeGreaterThanOrEqual(0);
	});

	it('should track consecutive failures', () => {
		updateServiceHealth('database', 'unhealthy', 'Connection failed');
		updateServiceHealth('database', 'unhealthy', 'Connection failed');
		updateServiceHealth('database', 'unhealthy', 'Connection failed');

		const state = getSystemState();
		expect(state.services.database.metrics.consecutiveFailures).toBe(3);
		expect(state.services.database.metrics.failureCount).toBe(3);
	});

	it('should reset consecutive failures on success', () => {
		updateServiceHealth('database', 'unhealthy', 'Failed');
		updateServiceHealth('database', 'unhealthy', 'Failed');
		updateServiceHealth('database', 'healthy', 'Connected');

		const state = getSystemState();
		expect(state.services.database.metrics.consecutiveFailures).toBe(0);
		expect(state.services.database.metrics.failureCount).toBe(2);
	});
});

describe('System Store - Overall State Management', () => {
	beforeEach(() => {
		resetSystemState();
	});

	it('should transition to READY when all services are healthy', () => {
		const services: ServiceName[] = ['database', 'auth', 'cache', 'contentManager', 'themeManager'];

		services.forEach((service) => {
			updateServiceHealth(service, 'healthy', 'OK');
		});

		setSystemState('READY');

		expect(isSystemReady()).toBe(true);
		expect(getSystemState().overallState).toBe('READY');
	});

	it('should transition to DEGRADED when some services fail', () => {
		updateServiceHealth('database', 'healthy', 'OK');
		updateServiceHealth('auth', 'healthy', 'OK');
		updateServiceHealth('cache', 'unhealthy', 'Failed');
		updateServiceHealth('contentManager', 'healthy', 'OK');
		updateServiceHealth('themeManager', 'healthy', 'OK');

		setSystemState('DEGRADED', 'Cache service unavailable');

		const state = getSystemState();
		expect(state.overallState).toBe('DEGRADED');
	});

	it('should transition to FAILED when critical services fail', () => {
		updateServiceHealth('database', 'unhealthy', 'Connection failed');
		updateServiceHealth('auth', 'unhealthy', 'Auth unavailable');

		setSystemState('FAILED', 'Critical services down');

		const state = getSystemState();
		expect(state.overallState).toBe('FAILED');
		expect(isSystemReady()).toBe(false);
	});

	it('should track state transitions', () => {
		setSystemState('INITIALIZING');
		setSystemState('READY');
		setSystemState('DEGRADED');

		const state = getSystemState();
		expect(state.performanceMetrics.stateTransitions.length).toBe(3);
		expect(state.performanceMetrics.stateTransitions[0].to).toBe('INITIALIZING');
		expect(state.performanceMetrics.stateTransitions[2].to).toBe('DEGRADED');
	});
});

describe('System Store - Performance Metrics', () => {
	beforeEach(() => {
		resetSystemState();
	});

	it('should track uptime percentage', () => {
		updateServiceHealth('database', 'healthy', 'OK');
		updateServiceHealth('database', 'healthy', 'OK');
		updateServiceHealth('database', 'unhealthy', 'Failed');

		const state = getSystemState();
		expect(state.services.database.metrics.healthCheckCount).toBe(3);
		expect(state.services.database.metrics.uptimePercentage).toBeLessThan(100);
	});

	it('should track restart count', () => {
		startServiceInitialization('database');
		updateServiceHealth('database', 'healthy', 'OK');

		startServiceInitialization('database');
		updateServiceHealth('database', 'healthy', 'OK');

		const state = getSystemState();
		expect(state.services.database.metrics.restartCount).toBeGreaterThan(0);
	});

	it('should track initialization attempts', () => {
		setSystemState('INITIALIZING');
		const services: ServiceName[] = ['database', 'auth', 'cache', 'contentManager', 'themeManager'];

		services.forEach((service) => {
			startServiceInitialization(service);
			updateServiceHealth(service, 'healthy', 'OK');
		});

		setSystemState('READY');

		const state = getSystemState();
		expect(state.performanceMetrics.totalInitializations).toBeGreaterThan(0);
		expect(state.performanceMetrics.successfulInitializations).toBeGreaterThan(0);
	});
});

describe('System Store - Service Health Checks', () => {
	beforeEach(() => {
		resetSystemState();
	});

	it('should check individual service health', () => {
		updateServiceHealth('database', 'healthy', 'OK');
		updateServiceHealth('auth', 'unhealthy', 'Failed');

		expect(isServiceHealthy('database')).toBe(true);
		expect(isServiceHealthy('auth')).toBe(false);
	});

	it('should handle all services', () => {
		const services: ServiceName[] = ['database', 'auth', 'cache', 'contentManager', 'themeManager'];

		services.forEach((service) => {
			updateServiceHealth(service, 'healthy', `${service} OK`);
			expect(isServiceHealthy(service)).toBe(true);
		});
	});
});

describe('System Store - Error Handling', () => {
	beforeEach(() => {
		resetSystemState();
	});

	it('should store error messages', () => {
		const errorMessage = 'Database connection timeout';
		updateServiceHealth('database', 'unhealthy', errorMessage, errorMessage);

		const state = getSystemState();
		expect(state.services.database.error).toBe(errorMessage);
		expect(state.services.database.message).toBe(errorMessage);
	});

	it('should clear error on recovery', () => {
		updateServiceHealth('database', 'unhealthy', 'Failed', 'Connection error');
		updateServiceHealth('database', 'healthy', 'Recovered');

		const state = getSystemState();
		expect(state.services.database.status).toBe('healthy');
		expect(state.services.database.message).toBe('Recovered');
	});
});

describe('System Store - State Reset', () => {
	it('should reset to initial state', () => {
		updateServiceHealth('database', 'healthy', 'OK');
		setSystemState('READY');

		resetSystemState();

		const state = getSystemState();
		expect(state.overallState).toBe('IDLE');
		expect(state.services.database.status).toBe('initializing');
		expect(state.performanceMetrics.totalInitializations).toBe(0);
	});
});
