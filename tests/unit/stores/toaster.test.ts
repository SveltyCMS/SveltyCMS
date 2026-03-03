/**
 * @file tests/unit/stores/toaster.test.ts
 * @description Unit tests for the custom rune-based ToasterStore
 *
 * Tests:
 * - Initialization
 * - Adding toasts
 * - Removing toasts
 * - Auto-removal
 * - Custom durations
 * - Error handling
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { toast } from '@src/stores/toast.svelte.ts';

describe('ToasterStore', () => {
	beforeEach(() => {
		// Clear all toasts before each test
		toast.clear();
	});

	it('should initialize with an empty array of toasts', () => {
		expect(toast.toasts).toEqual([]);
	});

	it('should add a toast with default values', () => {
		const id = toast.show({ type: 'info', message: 'Test message' });

		expect(toast.toasts).toHaveLength(1);
		expect(toast.toasts[0]).toMatchObject({
			id,
			type: 'info',
			message: 'Test message',
			duration: 4000
		});
	});

	it('should add a success toast using helper method', () => {
		toast.success('Success message');

		expect(toast.toasts).toHaveLength(1);
		expect(toast.toasts[0].type).toBe('success');
		expect(toast.toasts[0].message).toBe('Success message');
	});

	it('should add an error toast using helper method', () => {
		toast.error({ title: 'Error', message: 'Failed operation' });

		expect(toast.toasts).toHaveLength(1);
		expect(toast.toasts[0].type).toBe('error');
		expect(toast.toasts[0].title).toBe('Error');
		expect(toast.toasts[0].message).toBe('Failed operation');
	});

	it('should add a warning toast using helper method', () => {
		toast.warning('Warning message');

		expect(toast.toasts).toHaveLength(1);
		expect(toast.toasts[0].type).toBe('warning');
	});

	it('should add an info toast using helper method', () => {
		toast.info('Info message');

		expect(toast.toasts).toHaveLength(1);
		expect(toast.toasts[0].type).toBe('info');
	});

	it('should remove a toast by id', () => {
		const id = toast.show({ type: 'info', message: 'To be removed' });
		expect(toast.toasts).toHaveLength(1);

		toast.close(id);
		expect(toast.toasts).toHaveLength(0);
	});

	it('should handle multiple toasts', () => {
		toast.show({ type: 'info', message: 'Toast 1' });
		toast.show({ type: 'info', message: 'Toast 2' });

		expect(toast.toasts).toHaveLength(2);
		expect(toast.toasts[0].message).toBe('Toast 1');
		expect(toast.toasts[1].message).toBe('Toast 2');
	});

	it('should auto-remove toast after duration', async () => {
		toast.show({ type: 'info', message: 'Auto-remove', duration: 100 });
		expect(toast.toasts).toHaveLength(1);

		// Wait for duration + small margin
		await new Promise((resolve) => setTimeout(resolve, 150));

		expect(toast.toasts).toHaveLength(0);
	});

	it('should not auto-remove if duration is Infinity', async () => {
		toast.show({ type: 'info', message: 'Persistent', duration: Infinity });
		expect(toast.toasts).toHaveLength(1);

		await new Promise((resolve) => setTimeout(resolve, 200));

		expect(toast.toasts).toHaveLength(1);
	});
});
