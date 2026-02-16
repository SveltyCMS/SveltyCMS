/**
 * @file tests/unit/databases/DatabaseResilience.test.ts
 * @description Unit tests for the Database Resilience (Retry/Circuit Breaker) logic
 */

import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { getDatabaseResilience } from '@src/databases/DatabaseResilience';

describe('DatabaseResilience', () => {
	let resilience: any;

	beforeEach(() => {
		resilience = getDatabaseResilience({
			maxAttempts: 3,
			initialDelayMs: 10,
			backoffMultiplier: 1,
			jitterMs: 0
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
			if (calls < 3) return Promise.reject(new Error('Transient error'));
			return Promise.resolve('delayed success');
		});

		const result = await resilience.executeWithRetry(operation, 'Retry Test');

		expect(result).toBe('delayed success');
		expect(calls).toBe(3);
	});

	it('should fail after maximum attempts', async () => {
		const operation = mock(() => Promise.reject(new Error('Persistent error')));

		expect(resilience.executeWithRetry(operation, 'Fail Test')).rejects.toThrow('Persistent error');
		// Initial + 2 retries = 3
	});

	it('should track metrics correctly', () => {
		const metrics = resilience.getMetrics();
		expect(metrics).toHaveProperty('totalRetries');
		expect(metrics).toHaveProperty('successfulRetries');
	});
});
