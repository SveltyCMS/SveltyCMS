/**
 * @file tests/bun/utils/navigationManager.test.ts
 * @description Tests for navigationManager functions
 */
import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { navigationManager } from '@shared/utils/navigationManager';
import { globalLoadingStore } from '@shared/stores/loadingStore.svelte';
import { dataChangeStore } from '@shared/stores/store.svelte';
import { mode } from '@shared/stores/collectionStore.svelte';

// Mock $app/navigation
// Bun executes setup.ts which mocks the module.
// To spy on it, we might need to access the mock.
// Since we can't easily access the internal function created in setup.ts from here
// without some trickery, we'll rely on the behavior or re-mock if necessary.
// But simpler: we will verify the SIDE EFFECTS (stores reset, etc.)

// Mock logger to keep tests clean
mock.module('@shared/utils/logger', () => ({
	logger: {
		debug: mock(),
		warn: mock(),
		error: mock(),
		info: mock(),
		trace: mock()
	}
}));

// We need to spy on 'goto'.
// We can re-mock the module for this test content.
const mockGoto = mock(() => Promise.resolve());
mock.module('$app/navigation', () => ({
	goto: mockGoto,
	invalidateAll: mock(() => Promise.resolve())
}));

describe('NavigationManager', () => {
	beforeEach(() => {
		mockGoto.mockClear();
		dataChangeStore.reset();
		// Reset navigation lock if possible, but it's private.
		// We assume valid state at start of test.
	});

	it('should navigate to list view and clear state', async () => {
		// Setup
		dataChangeStore.setHasChanges(true);

		// Execute
		await navigationManager.navigateToList();

		// Assertions

		// 1. Should dispatch entrySaved event
		// (Hard to test document.dispatchEvent in bun test without happy-dom fully wired for events,
		// implies we should check if it didn't crash)

		// 2. Should reset stores
		expect(dataChangeStore.hasChanges).toBe(false);
		// Note: setMode('view') is called. We can check if mode store is 'view'
		// But mode store is a rune in setup.ts mock?
		// setup.ts: globalThis.$state ... returning object with getter/setter.
		// We can check mode.value
		expect(mode.value).toBe('view');

		// 3. Should call goto
		expect(mockGoto).toHaveBeenCalled();

		// Check arguments of goto
		// We expect it to go to pathname (strip params)
		// Mock page url in setup.ts is usually generic.
		// We can inspect the calls.
	});

	it('should prevent concurrent navigations', async () => {
		// Simulate a slow navigation
		mockGoto.mockImplementationOnce(() => new Promise((resolve) => setTimeout(resolve, 50)));

		const p1 = navigationManager.navigateToList();
		const p2 = navigationManager.navigateToList();

		await Promise.all([p1, p2]);

		// Should only call goto once ideally if locked?
		// NavigationManager uses 'isNavigating' check.
		// If p1 starts, sets lock. p2 sees lock, should return early.
		expect(mockGoto).toHaveBeenCalledTimes(1);
	});

	it('should set loading state during navigation', async () => {
		let loadingStateDuring = false;
		mockGoto.mockImplementationOnce(async () => {
			loadingStateDuring = globalLoadingStore.isLoading;
			return Promise.resolve();
		});

		await navigationManager.navigateToList();

		// We expect loading to have been true during the call
		expect(loadingStateDuring).toBe(true);
		// And false after
		expect(globalLoadingStore.isLoading).toBe(false);
	});
});
