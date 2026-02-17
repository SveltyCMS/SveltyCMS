/**
 * @file tests/unit/stores/toaster.test.ts
 * @description Unit tests for the custom rune-based ToasterStore
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { toaster } from '@stores/toaster.svelte';

describe('ToasterStore', () => {
	beforeEach(() => {
		// Clear all toasts before each test
		toaster.toasts = [];
	});

	it('should initialize with an empty array of toasts', () => {
		expect(toaster.toasts).toEqual([]);
	});

	it('should add a toast with default values', () => {
		const id = toaster.add({ description: 'Test message' });

		expect(toaster.toasts).toHaveLength(1);
		expect(toaster.toasts[0]).toMatchObject({
			id,
			type: 'info',
			description: 'Test message',
			duration: 5000
		});
	});

	it('should add a success toast using helper method', () => {
		toaster.success('Success message');

		expect(toaster.toasts).toHaveLength(1);
		expect(toaster.toasts[0].type).toBe('success');
		expect(toaster.toasts[0].description).toBe('Success message');
	});

	it('should add an error toast using helper method', () => {
		toaster.error({ title: 'Error', description: 'Failed operation' });

		expect(toaster.toasts).toHaveLength(1);
		expect(toaster.toasts[0].type).toBe('error');
		expect(toaster.toasts[0].title).toBe('Error');
		expect(toaster.toasts[0].description).toBe('Failed operation');
	});

	it('should add a warning toast using helper method', () => {
		toaster.warning('Warning message');

		expect(toaster.toasts).toHaveLength(1);
		expect(toaster.toasts[0].type).toBe('warning');
	});

	it('should add an info toast using helper method', () => {
		toaster.info('Info message');

		expect(toaster.toasts).toHaveLength(1);
		expect(toaster.toasts[0].type).toBe('info');
	});

	it('should remove a toast by id', () => {
		const id = toaster.add({ description: 'To be removed' });
		expect(toaster.toasts).toHaveLength(1);

		toaster.close(id);
		expect(toaster.toasts).toHaveLength(0);
	});

	it('should handle multiple toasts', () => {
		toaster.add({ description: 'Toast 1' });
		toaster.add({ description: 'Toast 2' });

		expect(toaster.toasts).toHaveLength(2);
		expect(toaster.toasts[0].description).toBe('Toast 1');
		expect(toaster.toasts[1].description).toBe('Toast 2');
	});

	it('should auto-remove toast after duration', async () => {
		// Mock timers
		toaster.add({ description: 'Auto-remove', duration: 100 });
		expect(toaster.toasts).toHaveLength(1);

		// Wait for duration + small margin
		await new Promise((resolve) => setTimeout(resolve, 150));

		expect(toaster.toasts).toHaveLength(0);
	});

	it('should not auto-remove if duration is 0', async () => {
		toaster.add({ description: 'Persistent', duration: 0 });
		expect(toaster.toasts).toHaveLength(1);

		await new Promise((resolve) => setTimeout(resolve, 200));

		expect(toaster.toasts).toHaveLength(1);
	});
});
