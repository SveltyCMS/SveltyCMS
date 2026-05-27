/**
 * @file tests/unit/databases/database-resilience.test.ts
 * @description Unit tests for the Database Resilience (Retry/Circuit Breaker) logic
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { getDatabaseResilience, resetDatabaseResilience } from '@src/databases/database-resilience';

describe('DatabaseResilience', () => {
	let resilience: any;

	beforeEach(() => {
		resetDatabaseResilience();
		resilience = getDatabaseResilience({
			maxAttempts: 3,
			initialDelayMs: 10,
			backoffMultiplier: 1,
			jitterMs: 0,
			failureThreshold: 2, // Low threshold for testing
			cooldownMs: 50 // Short timeout for testing
		});
	});

	it('should execute successfully on first attempt', async () => {
		const operation = mock(() => Promise.resolve('success'));
		const result = await resilience.executeWithRetry(operation, 'Test Op');

		expect(result).toBe('success');
		expect(operation).toHaveBeenCalledTimes(1);
	});

	it('should retry on failure and eventually succeed', async () => {
		let calls = 0;
		const operation = mock(() => {
			calls++;
			if (calls < 3) {
				// 1st try + 1st retry fail
				return Promise.reject(new Error('Transient error'));
			}
			return Promise.resolve('delayed success'); // 2nd retry succeeds
		});

		const result = await resilience.executeWithRetry(operation, 'Retry Test');

		expect(result).toBe('delayed success');
		expect(calls).toBe(3);
	});

	it('should fail after maximum attempts', async () => {
		const operation = mock(() => Promise.reject(new Error('Persistent error')));

		try {
			await resilience.executeWithRetry(operation, 'Fail Test');
		} catch (e: any) {
			expect(e.message).toBe('Persistent error');
		}
	});

	describe('Circuit Breaker', () => {
		it('should trip to OPEN after threshold of failures', async () => {
			const operation = mock(() => Promise.reject(new Error('Error')));

			// Threshold is 2.
			// 1st executeWithRetry will try 3 times and fail -> consecutiveFailures = 1
			try {
				await resilience.executeWithRetry(operation, 'Trip Test 1');
			} catch (_e) {}
			expect(resilience.getMetrics().circuitState).toBe('CLOSED');

			// 2nd executeWithRetry will try 3 times and fail -> consecutiveFailures = 2 -> OPEN
			try {
				await resilience.executeWithRetry(operation, 'Trip Test 2');
			} catch (_e) {}
			expect(resilience.getMetrics().circuitState).toBe('OPEN');

			// Next call should fail-fast immediately without calling operation
			const fastOp = mock(() => Promise.resolve('should not call'));
			try {
				await resilience.executeWithRetry(fastOp, 'Fast Fail');
			} catch (e: any) {
				expect(e.message).toContain('Circuit breaker is OPEN');
			}
			expect(fastOp).toHaveBeenCalledTimes(0);
		});

		it('should move to HALF_OPEN after reset timeout', async () => {
			// Trip it first (needs 2 failed outer calls)
			const operation = mock(() => Promise.reject(new Error('Error')));
			try {
				await resilience.executeWithRetry(operation, 'Trip 1');
			} catch (_e) {}
			try {
				await resilience.executeWithRetry(operation, 'Trip 2');
			} catch (_e) {}
			expect(resilience.getMetrics().circuitState).toBe('OPEN');

			// Wait for reset timeout (50ms)
			await new Promise((resolve) => setTimeout(resolve, 100));

			// It should be moved to HALF_OPEN by the next call
			const probeOp = mock(() => Promise.resolve('recovered'));
			const result = await resilience.executeWithRetry(probeOp, 'Probe');

			expect(result).toBe('recovered');
			expect(resilience.getMetrics().circuitState).toBe('CLOSED');
		});

		it('should return to OPEN if HALF_OPEN probe fails', async () => {
			// Trip it
			const operation = mock(() => Promise.reject(new Error('Error')));
			try {
				await resilience.executeWithRetry(operation, 'Trip 1');
			} catch (_e) {}
			try {
				await resilience.executeWithRetry(operation, 'Trip 2');
			} catch (_e) {}
			expect(resilience.getMetrics().circuitState).toBe('OPEN');

			// Wait for reset
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Probe fails
			const failProbe = mock(() => Promise.reject(new Error('Still down')));
			try {
				await resilience.executeWithRetry(failProbe, 'Probe Fail');
			} catch (_e) {}

			expect(resilience.getMetrics().circuitState).toBe('OPEN');
		});
	});

	it('should track metrics correctly', () => {
		const metrics = resilience.getMetrics();
		expect(metrics).toHaveProperty('totalRetries');
		expect(metrics).toHaveProperty('successfulRetries');
		expect(metrics).toHaveProperty('circuitState');
	});
});
