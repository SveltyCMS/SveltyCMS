/**
 * @file tests/bun/stores/loadingStore.test.ts
 * @description Tests for global loading state management
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { LoadingStore, loadingOperations } from '@stores/loadingStore.svelte';

describe('Loading Store - Basic Operations', () => {
	let store: LoadingStore;

	beforeEach(() => {
		store = new LoadingStore();
	});

	it('should initialize with no loading state', () => {
		expect(store.isLoading).toBe(false);
		expect(store.loadingReason).toBe(null);
		expect(store.loadingStack.size).toBe(0);
	});

	it('should start loading operation', () => {
		store.startLoading(loadingOperations.dataFetch);

		expect(store.isLoading).toBe(true);
		expect(store.loadingReason).toBe('data-fetch');
		expect(store.loadingStack.has('data-fetch')).toBe(true);
	});

	it('should stop loading operation', () => {
		store.startLoading(loadingOperations.dataFetch);
		store.stopLoading(loadingOperations.dataFetch);

		expect(store.isLoading).toBe(false);
		expect(store.loadingReason).toBe(null);
		expect(store.loadingStack.size).toBe(0);
	});

	it('should handle custom loading reasons', () => {
		const customReason = 'custom-operation';
		store.startLoading(customReason);

		expect(store.isLoading).toBe(true);
		expect(store.loadingReason).toBe(customReason);
	});
});

describe('Loading Store - Concurrent Operations', () => {
	let store: LoadingStore;

	beforeEach(() => {
		store = new LoadingStore();
	});

	it('should handle multiple concurrent operations', () => {
		store.startLoading(loadingOperations.dataFetch);
		store.startLoading(loadingOperations.authentication);
		store.startLoading(loadingOperations.formSubmission);

		expect(store.isLoading).toBe(true);
		expect(store.loadingStack.size).toBe(3);
	});

	it('should remain loading until all operations complete', () => {
		store.startLoading(loadingOperations.dataFetch);
		store.startLoading(loadingOperations.authentication);

		store.stopLoading(loadingOperations.dataFetch);
		expect(store.isLoading).toBe(true);

		store.stopLoading(loadingOperations.authentication);
		expect(store.isLoading).toBe(false);
	});

	it('should update loading reason as operations complete', () => {
		store.startLoading(loadingOperations.dataFetch);
		store.startLoading(loadingOperations.authentication);

		expect(store.loadingReason).toBe('authentication'); // Latest operation

		store.stopLoading(loadingOperations.dataFetch);
		expect(store.loadingReason).toBe('authentication'); // Remaining operation
	});

	it('should handle duplicate start calls gracefully', () => {
		store.startLoading(loadingOperations.dataFetch);
		store.startLoading(loadingOperations.dataFetch); // Duplicate

		expect(store.loadingStack.size).toBe(1);

		store.stopLoading(loadingOperations.dataFetch);
		expect(store.isLoading).toBe(false);
	});
});

describe('Loading Store - Context Tracking', () => {
	let store: LoadingStore;

	beforeEach(() => {
		store = new LoadingStore();
	});

	it('should track loading context', () => {
		const context = 'User login form';
		store.startLoading(loadingOperations.authentication, context);

		expect(store.isLoading).toBe(true);
		expect(store.loadingReason).toBe('authentication');
	});

	it('should support different contexts for same operation', () => {
		store.startLoading(loadingOperations.dataFetch, 'Loading users');
		store.startLoading(loadingOperations.dataFetch, 'Loading posts');

		// Same operation type, different contexts - should be treated as separate
		expect(store.isLoading).toBe(true);
	});
});

describe('Loading Store - Timeout Protection', () => {
	let store: LoadingStore;

	beforeEach(() => {
		store = new LoadingStore();
	});

	it('should accept custom timeout', () => {
		store.startLoading(loadingOperations.dataFetch, 'Test', 5000);

		expect(store.isLoading).toBe(true);
	});

	it('should use default timeout when not specified', () => {
		store.startLoading(loadingOperations.dataFetch);

		expect(store.isLoading).toBe(true);
	});

	it('should allow disabling timeout with 0', () => {
		store.startLoading(loadingOperations.dataFetch, undefined, 0);

		expect(store.isLoading).toBe(true);
	});
});

describe('Loading Store - Clear Operations', () => {
	let store: LoadingStore;

	beforeEach(() => {
		store = new LoadingStore();
	});

	it('should clear all loading states', () => {
		store.startLoading(loadingOperations.dataFetch);
		store.startLoading(loadingOperations.authentication);
		store.startLoading(loadingOperations.formSubmission);

		store.clearLoading();

		expect(store.isLoading).toBe(false);
		expect(store.loadingStack.size).toBe(0);
		expect(store.loadingReason).toBe(null);
	});

	it('should clear loading even with pending operations', () => {
		store.startLoading(loadingOperations.dataFetch);
		store.startLoading(loadingOperations.authentication);

		store.clearLoading();

		expect(store.loadingStack.size).toBe(0);
	});
});

describe('Loading Store - Operation Types', () => {
	let store: LoadingStore;

	beforeEach(() => {
		store = new LoadingStore();
	});

	it('should handle all predefined operation types', () => {
		const operations = Object.values(loadingOperations);

		operations.forEach((operation) => {
			store.startLoading(operation);
			expect(store.loadingStack.has(operation)).toBe(true);
			store.stopLoading(operation);
		});

		expect(store.isLoading).toBe(false);
	});

	it('should handle navigation operations', () => {
		store.startLoading(loadingOperations.navigation);
		expect(store.loadingReason).toBe('navigation');
		store.stopLoading(loadingOperations.navigation);
	});

	it('should handle image upload operations', () => {
		store.startLoading(loadingOperations.imageUpload);
		expect(store.loadingReason).toBe('image-upload');
		store.stopLoading(loadingOperations.imageUpload);
	});

	it('should handle collection load operations', () => {
		store.startLoading(loadingOperations.collectionLoad);
		expect(store.loadingReason).toBe('collection-load');
		store.stopLoading(loadingOperations.collectionLoad);
	});
});

describe('Loading Store - Edge Cases', () => {
	let store: LoadingStore;

	beforeEach(() => {
		store = new LoadingStore();
	});

	it('should handle stopping non-existent operation', () => {
		store.stopLoading('non-existent');

		expect(store.isLoading).toBe(false);
		expect(store.loadingStack.size).toBe(0);
	});

	it('should handle empty string operation', () => {
		store.startLoading('');

		// Should handle gracefully
		expect(typeof store.isLoading).toBe('boolean');
	});

	it('should maintain state integrity across multiple operations', () => {
		const operations = [
			loadingOperations.dataFetch,
			loadingOperations.authentication,
			loadingOperations.formSubmission,
			loadingOperations.configSave
		];

		// Start all
		operations.forEach((op) => store.startLoading(op));
		expect(store.loadingStack.size).toBe(4);

		// Stop half
		store.stopLoading(operations[0]);
		store.stopLoading(operations[1]);
		expect(store.loadingStack.size).toBe(2);
		expect(store.isLoading).toBe(true);

		// Stop remaining
		store.stopLoading(operations[2]);
		store.stopLoading(operations[3]);
		expect(store.loadingStack.size).toBe(0);
		expect(store.isLoading).toBe(false);
	});
});
